import type { GameCommand, GameEvent, GameHost, WorldSnapshot } from '../../game-bridge';
import { createWorldSnapshot, MAX_SNAPSHOT_HAZARDS } from '../../game-bridge';
import type {
  AdaptiveAssistanceConfig,
  MapConfig,
  ObstacleDefinition,
  PromptEntry,
  RunResult,
} from '../../game-core/models';
import { CURRENT_SCHEMA_VERSION, DEFAULT_ADAPTIVE_ASSISTANCE } from '../../game-core/models';
import { crouchDepth, jumpHeightMeters, lanePosition } from '../../game-core/motion';
import {
  type ActiveObstacle,
  distanceToImpact,
  obstacleProgress,
  obstaclePressure,
  remainingMs,
  timeToImpact,
} from '../../game-core/obstacles';
import { sustainablePeakWpm } from '../../game-core/stats';
import { DEFAULT_TYPING_OPTIONS, firstErrorIndex } from '../../game-core/typing';
import type { DeadlinePressure } from '../../game-core/timing';
import { FixedStepDriver } from '../loop';
import {
  activeObstacle,
  advanceRunSession,
  applyRunInput,
  createRunSession,
  currentSpeed,
  isBoosting,
  liveStats,
  obstacleSuccessRate,
  pauseRun,
  type RunSession,
  resumeRun,
  runProgress,
  type SessionEvent,
  startRun,
} from './run-session';

/**
 * The runtime side of the bridge (spec §13).
 *
 * Owns the simulation and translates between the bridge's commands and events
 * and the rules. It no longer owns a canvas, a renderer, or a frame loop:
 * `game-scene` draws, and React Three Fiber's `useFrame` decides when a frame
 * happened. The host is told how much time passed and answers with a world.
 *
 * Two channels out, for two different rates. Events go through the bridge's
 * throttle at ~10Hz because React re-renders on them. The snapshot is read every
 * frame by the scene and never touches React at all.
 */

/** What the host needs from the outside world. All injectable, so tests can drive it. */
export interface RuntimeHostOptions {
  readonly map: MapConfig;
  readonly prompts: readonly PromptEntry[];
  readonly obstacles?: readonly ObstacleDefinition[];
  readonly seed: string;
  readonly emit: (event: GameEvent) => void;
  /** Offers a stats sample; the bridge decides whether it leaves. */
  readonly publishStats: (session: RunSession, nowMs: number) => void;
  /** Offers the active hazard deadline, if any. Also throttled by the bridge. */
  readonly publishDeadline?: (
    remainingMs: number | null,
    pressure: DeadlinePressure,
    nowMs: number,
  ) => void;
  /** Monotonic wall clock, for throttling. Injected so tests can control it. */
  readonly now?: () => number;
}

/** How quickly a camera shake impulse decays, per second. */
const SHAKE_DECAY_PER_SECOND = 3.2;

/** Degrees of extra field of view at the top of the speed range. */
const MAX_FOV_BIAS_DEGREES = 6;

export class RuntimeHost implements GameHost {
  private readonly options: RuntimeHostOptions;
  private readonly driver: FixedStepDriver;
  private readonly now: () => number;

  private session: RunSession;
  /** Applied to the *next* run, so a run's rules never change under way. */
  private assistanceConfig: AdaptiveAssistanceConfig = DEFAULT_ADAPTIVE_ASSISTANCE;

  /** One object, mutated in place. See `game-bridge/snapshot.ts`. */
  private readonly world: WorldSnapshot = createWorldSnapshot();

  /** Position at the last completed step, for render interpolation. */
  private previousMeters = 0;
  private shake = 0;

  constructor(options: RuntimeHostOptions) {
    this.options = options;
    this.now = options.now ?? (() => performance.now());
    this.session = createRunSession({
      map: options.map,
      pool: options.prompts,
      obstacles: options.obstacles ?? [],
      seed: options.seed,
    });

    this.driver = new FixedStepDriver({
      update: (deltaMs) => {
        this.step(deltaMs);
      },
    });

    this.refreshSnapshot(1, 0);
  }

  get currentSession(): RunSession {
    return this.session;
  }

  /** The world as of the last `advance`. Read it, do not retain it. */
  get snapshot(): WorldSnapshot {
    return this.world;
  }

  handle(command: GameCommand, emit: (event: GameEvent) => void): void {
    switch (command.type) {
      case 'initialize':
        emit({ type: 'ready' });
        emit({ type: 'stateChanged', state: 'ready' });
        this.emitPrompt(this.session.prompt, emit);

        return;

      case 'startRun':
        this.apply(startRun(this.session), emit);
        this.driver.start();

        return;

      case 'pause':
        this.apply(pauseRun(this.session), emit);
        this.driver.pause();

        return;

      case 'resume':
        this.apply(resumeRun(this.session), emit);
        this.driver.resume();

        return;

      case 'restart':
        this.restart(emit);

        return;

      case 'submitInput':
        this.apply(applyRunInput(this.session, command.value), emit);

        return;

      case 'destroy':
        this.destroy();

        return;

      case 'setSettings':
        // Only the settings that change the rules are read here. Theme, prompt
        // size, and volumes belong to the UI and never reach the simulation.
        this.assistanceConfig = {
          ...DEFAULT_ADAPTIVE_ASSISTANCE,
          enabled: command.settings.adaptiveAssistanceEnabled,
        };
        // A run already under way keeps the configuration it started with:
        // changing the rules mid-run would make the result incomparable.
        return;

      // Which map to run is chosen before the runtime is built (the screen
      // rebuilds it), so this is accepted and ignored rather than reported as
      // an error — the UI is right to send it.
      case 'loadMap':
        return;
    }
  }

  destroy(): void {
    this.driver.stop();
  }

  /**
   * Advances the simulation by one frame's worth of time and refreshes the world.
   *
   * Called from the scene's `useFrame` at priority `-1`, so the snapshot is
   * current before any mesh reads it.
   */
  advance(frameDeltaMs: number): void {
    const result = this.driver.advance(frameDeltaMs);

    this.refreshSnapshot(result.alpha, frameDeltaMs);
  }

  private restart(emit: (event: GameEvent) => void): void {
    this.driver.reset();
    this.session = createRunSession({
      map: this.options.map,
      pool: this.options.prompts,
      obstacles: this.options.obstacles ?? [],
      assistance: this.assistanceConfig,
      // A restart is a fresh run, not a replay: a new seed means new prompts.
      seed: `${this.options.seed}:${String(Math.round(this.now()))}`,
    });
    this.previousMeters = 0;
    this.shake = 0;

    emit({ type: 'stateChanged', state: 'ready' });
    this.emitPrompt(this.session.prompt, emit);

    this.apply(startRun(this.session), emit);
    this.driver.start();
    this.refreshSnapshot(1, 0);
  }

  private emitPrompt(prompt: PromptEntry | null, emit: (event: GameEvent) => void): void {
    const obstacle = activeObstacle(this.session);

    emit({
      type: 'promptChanged',
      prompt:
        prompt === null
          ? null
          : {
              promptId: prompt.id,
              text: prompt.text,
              typedLength: this.session.typing.correctCharacters,
              mistakeCount: this.session.typing.incorrectCharacters,
              kind: 'obstacle',
              remainingMs: obstacle === null ? null : obstacle.timing.availableMs,
            },
    });
  }

  /** Commits a session result and turns its events into bridge events. */
  private apply(
    result: { session: RunSession; events: readonly SessionEvent[] },
    emit: (event: GameEvent) => void,
  ): void {
    this.session = result.session;

    for (const event of result.events) {
      switch (event.type) {
        case 'promptChanged':
          this.emitPrompt(event.prompt, emit);
          break;

        case 'obstacleWarning':
          emit({
            type: 'obstacleWarning',
            obstacle: {
              obstacleId: event.obstacle.definition.id,
              action: event.obstacle.definition.action,
              promptText: event.obstacle.prompt.text,
              secondsUntilImpact:
                timeToImpact(
                  event.obstacle,
                  this.session.playerMeters,
                  currentSpeed(this.session),
                ) / 1_000,
            },
          });
          break;

        case 'obstacleResolved':
          if (event.outcome !== 'avoided') {
            // Brief, readable, and spent within a few frames (spec §18).
            this.shake = 1;
            emit({ type: 'playerHit', reason: event.failureReason ?? 'collision' });
          }
          break;

        case 'phaseChanged':
          this.onPhaseChanged(emit);
          break;

        case 'boostStarted':
          emit({ type: 'boostStarted' });
          break;

        case 'promptCompleted':
        case 'obstacleCommitted':
        case 'obstacleSpawned':
        case 'obstacleAttached':
        case 'boostEnded':
          break;
      }
    }
  }

  private onPhaseChanged(emit: (event: GameEvent) => void): void {
    const phase = this.session.phase;

    if (phase === 'levelComplete') {
      this.driver.stop();
      emit({ type: 'stateChanged', state: 'levelComplete' });
      emit({ type: 'levelCompleted', result: this.buildResult(true) });

      return;
    }

    if (phase === 'gameOver') {
      this.driver.stop();
      emit({ type: 'stateChanged', state: 'gameOver' });
      emit({ type: 'gameOver', result: this.buildResult(false) });

      return;
    }

    if (phase === 'impact') {
      // The run is over but still on screen. `playerHit` is what the UI reacts
      // to; the state stays `running` so the scene keeps drawing the beat.
      return;
    }

    emit({ type: 'stateChanged', state: phase === 'paused' ? 'paused' : 'running' });
  }

  private buildResult(completed: boolean): RunResult {
    const stats = liveStats(this.session);

    return {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      runId: `run-${String(Math.round(this.session.elapsedMs))}`,
      mapId: this.session.map.id,
      startedAt: new Date().toISOString(),
      durationMs: this.session.elapsedMs,
      completed,
      score: stats.score,
      averageWpm: stats.averageWpm,
      // The headline lifetime figure (spec §7): a rolling window with minimum
      // characters, minimum accuracy, and a maximum idle gap, so a one-second
      // burst can never become the record.
      sustainablePeakWpm: sustainablePeakWpm(this.session.stats),
      rawPeakWpm: this.session.stats.rawPeakWpm,
      accuracy: stats.accuracy,
      correctCharacters: this.session.stats.correctCharacters,
      incorrectCharacters: this.session.stats.incorrectCharacters,
      correctedErrors: this.session.stats.correctedErrors,
      completedPrompts: this.session.completedPrompts,
      missedPrompts: this.session.collisions,
      obstacleSuccessRate: obstacleSuccessRate(this.session),
      longestCombo: this.session.score.longestCombo,
    };
  }

  /**
   * One fixed simulation step.
   *
   * The publish timestamp is wall clock, not run time: a restart puts run time
   * back to zero, and a throttle fed a clock that jumps backwards stops emitting
   * for the length of the previous run.
   */
  private step(deltaMs: number): void {
    this.previousMeters = this.session.playerMeters;
    this.apply(advanceRunSession(this.session, deltaMs), this.options.emit);

    const nowMs = this.now();
    this.options.publishStats(this.session, nowMs);

    const obstacle = activeObstacle(this.session);
    this.options.publishDeadline?.(
      obstacle === null ? null : remainingMs(obstacle, this.session.elapsedMs),
      obstacle === null ? 'safe' : obstaclePressure(obstacle, this.session.elapsedMs),
      nowMs,
    );
  }

  /**
   * Rewrites the world in place.
   *
   * No allocation beyond the challenge object, which only changes when a hazard
   * does. Called once per frame, so anything allocated here is allocated sixty
   * times a second (spec §20).
   */
  private refreshSnapshot(alpha: number, frameDeltaMs: number): void {
    const world = this.world;
    const session = this.session;
    const running = session.phase === 'running';

    world.phase = toGameState(session.phase);
    world.playerMeters =
      this.previousMeters + (session.playerMeters - this.previousMeters) * Math.min(1, alpha);
    world.speedMetersPerSecond = running ? currentSpeed(session) : 0;
    world.lanePosition = lanePosition(session.motion);
    world.jumpHeightMeters = jumpHeightMeters(session.motion);
    world.crouch = crouchDepth(session.motion);
    world.boosting = isBoosting(session);

    let count = 0;
    for (const obstacle of session.obstacles) {
      if (count >= MAX_SNAPSHOT_HAZARDS) break;

      const slot = world.hazards[count];
      if (slot === undefined) break;

      slot.instanceId = obstacle.instanceId;
      slot.action = obstacle.definition.action;
      slot.distanceMeters = distanceToImpact(obstacle, world.playerMeters);
      slot.blockedLanes.length = 0;
      slot.blockedLanes.push(...obstacle.blockedLanes);
      slot.safeLane = obstacle.safeLane;
      slot.safeSide = obstacle.safeSide;
      slot.committed = obstacle.status === 'committed';
      slot.resolved = obstacle.status === 'resolved' || obstacle.status === 'missed';

      count += 1;
    }
    world.hazardCount = count;

    world.challenge = this.buildChallenge();

    // Shake decays on wall-clock time, not simulation time, so the impact beat
    // still settles while the rules are frozen.
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - (frameDeltaMs / 1000) * SHAKE_DECAY_PER_SECOND);
    }
    world.impulse.shake = this.shake;
    world.impulse.fovBias = fovBias(session);
  }

  private buildChallenge(): WorldSnapshot['challenge'] {
    const session = this.session;
    const obstacle = activeObstacle(session);
    if (obstacle === null || session.prompt === null) return null;

    return {
      word: session.prompt.text,
      typedLength: session.typing.typed.length,
      firstErrorIndex: firstErrorIndex(
        session.typing.target,
        session.typing.typed,
        DEFAULT_TYPING_OPTIONS,
      ),
      action: obstacle.definition.action,
      safeSide: obstacle.safeSide,
      safeLane: obstacle.safeLane,
      hazardId: obstacle.instanceId,
      urgency: challengeUrgency(obstacle, session.elapsedMs),
    };
  }

  /** Diagnostics for the dev overlay and tests. */
  get debug(): { progress: number; tick: number; hazards: number } {
    return {
      progress: runProgress(this.session),
      tick: this.driver.stats.tick,
      hazards: this.session.obstacles.length,
    };
  }
}

/** Deadline pressure as a smooth 0..1, for the prompt's urgency pulse. */
function challengeUrgency(obstacle: ActiveObstacle, elapsedMs: number): number {
  return obstacleProgress(obstacle, elapsedMs);
}

/** Extra field of view from speed (spec §12). Subtle by design. */
function fovBias(session: RunSession): number {
  const base = session.map.baseSpeedMetersPerSecond;
  const ceiling = session.map.speed.maxMetersPerSecond * session.map.boost.speedMultiplier;
  if (ceiling <= base) return 0;

  const excess = (currentSpeed(session) - base) / (ceiling - base);

  return Math.min(1, Math.max(0, excess)) * MAX_FOV_BIAS_DEGREES;
}

/** The run phase, in the bridge's vocabulary. */
function toGameState(phase: RunSession['phase']): WorldSnapshot['phase'] {
  switch (phase) {
    case 'ready':
      return 'ready';
    case 'running':
      return 'running';
    case 'impact':
      return 'playerHit';
    case 'paused':
      return 'paused';
    case 'levelComplete':
      return 'levelComplete';
    case 'gameOver':
      return 'gameOver';
  }
}
