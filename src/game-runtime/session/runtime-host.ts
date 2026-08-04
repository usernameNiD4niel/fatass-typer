import type { GameCommand, GameEvent, GameHost, WorldSnapshot } from '../../game-bridge';
import {
  createWorldSnapshot,
  MAX_SNAPSHOT_COIN_UNITS,
  MAX_SNAPSHOT_COINS,
  MAX_SNAPSHOT_HAZARDS,
  MAX_SNAPSHOT_POPUPS,
  MAX_SNAPSHOT_POWERUPS,
} from '../../game-bridge';
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
import { distanceToCoins } from '../../game-core/pickups';
import { distanceToPowerup, hasMagnet, isFlying } from '../../game-core/powerups';
import { pursuitPressure } from '../../game-core/pursuit';
import { flowUrgency } from '../../game-core/flow';
import {
  activeCoin,
  activeFlowWord,
  activeObstacle,
  activePowerup,
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
  secretComplete,
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
  /** The map's secret, as words in order. Every prompt comes from here first. */
  readonly secretWords?: readonly PromptEntry[];
  /** Characters the player fumbles. The run's vocabulary leans toward them. */
  readonly weakCharacters?: readonly string[];
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

/**
 * Degrees of field of view a perfect clear kicks in, before it decays.
 *
 * Scaled by margin, so the size of the kick *is* the feedback: a scraped clear
 * barely moves the camera and a decisive one is unmistakable. Without that the
 * speed earned in 1.2 was visible only as a number on the HUD, which is not
 * somewhere a player is looking while a car is coming at them.
 */
const MAX_PUNCH_DEGREES = 9;

/** How quickly the punch decays, per second. Fast — it is a hit, not a state. */
const PUNCH_DECAY_PER_SECOND = 4.5;

/** A shake big enough to notice on a mistake, small enough not to obscure the word. */
const MISTAKE_SHAKE = 0.22;

/** How long a floating score label lives. */
const POPUP_LIFETIME_MS = 950;

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
  private punch = 0;
  /** Ring buffer over the snapshot's fixed popup pool. */
  private popupCursor = 0;
  private popupSequence = 0;

  constructor(options: RuntimeHostOptions) {
    this.options = options;
    this.now = options.now ?? (() => performance.now());
    this.session = createRunSession({
      map: options.map,
      pool: options.prompts,
      obstacles: options.obstacles ?? [],
      secretWords: options.secretWords ?? [],
      weakCharacters: options.weakCharacters ?? [],
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
      secretWords: this.options.secretWords ?? [],
      weakCharacters: this.options.weakCharacters ?? [],
      assistance: this.assistanceConfig,
      // A restart is a fresh run, not a replay: a new seed means new prompts.
      seed: `${this.options.seed}:${String(Math.round(this.now()))}`,
    });
    this.previousMeters = 0;
    this.shake = 0;
    this.punch = 0;
    this.clearPopups();

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
        case 'flowWordCompleted':
          // Every word that pays says what it paid, at the moment it pays it.
          if (event.points > 0) this.pushPopup(event.points, 'gain');
          break;

        case 'mistyped':
          // Charged at the end of the prompt, but shown now — a penalty
          // explained three seconds after the keystroke that caused it teaches
          // nothing about the keystroke.
          this.pushPopup(-event.penalty, 'loss');
          this.shake = Math.max(this.shake, MISTAKE_SHAKE);
          break;

        case 'obstacleCommitted':
          // The size of the kick is the reward. See `MAX_PUNCH_DEGREES`.
          this.punch = Math.max(this.punch, event.marginFraction * MAX_PUNCH_DEGREES);
          break;

        case 'flowWordMissed':
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
      distanceMeters: this.session.playerMeters,
      keyStats: this.session.keyStats,
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
      coinsCollected: this.session.coinsCollected,
      powerupsClaimed: this.session.powerupsClaimed,
      // Unlocked by finishing the sentence, not by finishing the map: a player
      // caught on the last hazard still typed every word of it.
      secretUnlocked: secretComplete(this.session),
      secretWordsTyped: this.session.secretIndex,
      secretWordCount: this.session.secretWords.length,
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

    let coinCount = 0;
    for (const coin of session.coins) {
      if (coinCount >= MAX_SNAPSHOT_COINS) break;

      const slot = world.coins[coinCount];
      if (slot === undefined) break;

      slot.instanceId = coin.instanceId;
      slot.distanceMeters = distanceToCoins(coin, world.playerMeters);
      slot.lane = coin.lane;
      slot.value = coin.value;
      slot.committed = coin.status === 'committed';
      slot.collected = coin.status === 'collected';

      let unitCount = 0;
      for (const unit of coin.units) {
        if (unitCount >= MAX_SNAPSHOT_COIN_UNITS) break;

        const unitSlot = slot.units[unitCount];
        if (unitSlot === undefined) break;

        unitSlot.offsetMeters = unit.offsetMeters;
        unitSlot.collected = unit.collected;
        unitSlot.passed = unit.passed;

        unitCount += 1;
      }
      slot.unitCount = unitCount;

      coinCount += 1;
    }
    world.coinCount = coinCount;

    let powerupCount = 0;
    for (const powerup of session.powerups) {
      if (powerupCount >= MAX_SNAPSHOT_POWERUPS) break;

      const slot = world.powerups[powerupCount];
      if (slot === undefined) break;

      slot.instanceId = powerup.instanceId;
      slot.kind = powerup.kind;
      slot.distanceMeters = distanceToPowerup(powerup, world.playerMeters);
      slot.lane = powerup.lane;
      slot.claimed = powerup.status === 'claimed';

      powerupCount += 1;
    }
    world.powerupCount = powerupCount;

    world.effects.flying = isFlying(session.effects);
    world.effects.flightRemainingMs = session.effects.flightRemainingMs;
    world.effects.magnet = hasMagnet(session.effects);
    world.effects.magnetRemainingMs = session.effects.magnetRemainingMs;
    world.effects.shields = session.effects.shields;

    world.challenge = this.buildChallenge();

    // Shake decays on wall-clock time, not simulation time, so the impact beat
    // still settles while the rules are frozen.
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - (frameDeltaMs / 1000) * SHAKE_DECAY_PER_SECOND);
    }
    if (this.punch > 0) {
      this.punch = Math.max(0, this.punch - (frameDeltaMs / 1000) * PUNCH_DECAY_PER_SECOND);
    }
    world.impulse.shake = this.shake;
    world.impulse.fovBias = fovBias(session);
    world.impulse.punch = this.punch;

    world.pursuit.gapMeters = session.pursuit.gapMeters;
    world.pursuit.pressure = pursuitPressure(session.pursuit);

    this.agePopups(frameDeltaMs);
  }

  /**
   * Ages the floating labels and drops the expired ones.
   *
   * Wall-clock, like the shake, so labels still finish their rise while the
   * rules are frozen on the impact beat — a run that ends on a mistake should
   * not leave its last penalty frozen mid-air.
   */
  private agePopups(frameDeltaMs: number): void {
    const popups = this.world.popups;
    let live = 0;

    for (let index = 0; index < MAX_SNAPSHOT_POPUPS; index += 1) {
      const popup = popups[index];
      if (popup === undefined || popup.id === '') continue;

      popup.ageMs += frameDeltaMs;
      if (popup.ageMs >= POPUP_LIFETIME_MS) {
        popup.id = '';
        continue;
      }
      live += 1;
    }

    // The scene reads the whole pool and skips empty slots, so this is a count
    // for the HUD's benefit rather than a bound on iteration.
    this.world.popupCount = live;
  }

  /**
   * Empties the label pool.
   *
   * A restart is a fresh run, and a label from the previous one hanging over the
   * new road is both wrong and confusing — it was seen doing exactly that. The
   * labels age on wall-clock time, so a run that ends leaves its last few frozen
   * mid-rise until something clears them.
   */
  private clearPopups(): void {
    for (const popup of this.world.popups) popup.id = '';
    this.world.popupCount = 0;
  }

  /**
   * Puts a floating score label over the road.
   *
   * The oldest slot is recycled rather than the label being dropped: mistyping
   * quickly can outrun the pool, and the newest number is the one the player
   * needs to see.
   */
  private pushPopup(points: number, kind: 'gain' | 'loss'): void {
    const popup = this.world.popups[this.popupCursor % MAX_SNAPSHOT_POPUPS];
    this.popupCursor += 1;
    if (popup === undefined) return;

    this.popupSequence += 1;
    popup.id = `popup-${String(this.popupSequence)}`;
    // Rounded here rather than in the scene. The score is carried as a float —
    // speed and accuracy bonuses are fractions — and a label reading
    // "+654.4791532272574" is not a number anybody can read at speed. The HUD
    // rounds the running total for the same reason; the two must agree.
    popup.points = Math.round(points);
    popup.kind = kind;
    popup.ageMs = 0;
    popup.lane = this.world.lanePosition;
  }

  private buildChallenge(): WorldSnapshot['challenge'] {
    const session = this.session;
    if (session.prompt === null) return null;

    const typed = {
      word: session.prompt.text,
      typedLength: session.typing.typed.length,
      firstErrorIndex: firstErrorIndex(
        session.typing.target,
        session.typing.typed,
        DEFAULT_TYPING_OPTIONS,
      ),
    };

    const obstacle = activeObstacle(session);
    if (obstacle !== null) {
      return {
        ...typed,
        kind: 'hazard',
        action: obstacle.definition.action,
        safeSide: obstacle.safeSide,
        safeLane: obstacle.safeLane,
        hazardId: obstacle.instanceId,
        optional: false,
        perfect: false,
        urgency: challengeUrgency(obstacle, session.elapsedMs),
      };
    }

    const flow = activeFlowWord(session);
    if (flow !== null) {
      return {
        ...typed,
        kind: 'flow',
        // A flow word points nowhere: there is nothing to avoid and nowhere to
        // be. The scene places it ahead of the player rather than tracking a
        // body, because it has none.
        action: 'lane-change',
        safeSide: null,
        safeLane: null,
        hazardId: flow.instanceId,
        optional: true,
        perfect: false,
        urgency: flowUrgency(flow, session.elapsedMs),
      };
    }

    const powerup = activePowerup(session);
    if (powerup !== null) {
      return {
        ...typed,
        kind: 'powerup',
        action: 'lane-change',
        safeSide: powerup.side,
        safeLane: powerup.lane,
        hazardId: powerup.instanceId,
        optional: true,
        perfect: true,
        urgency: spanUrgency(powerup.attachedAtMs, powerup.deadlineAtMs, session.elapsedMs),
      };
    }

    const coin = activeCoin(session);
    if (coin === null) return null;

    return {
      ...typed,
      kind: 'coin',
      // A coin word always points somewhere: it is only ever worth typing
      // because there is a lane to be in.
      action: 'lane-change',
      safeSide: coin.side,
      safeLane: coin.lane,
      hazardId: coin.instanceId,
      optional: true,
      perfect: false,
      urgency: spanUrgency(coin.attachedAtMs, coin.deadlineAtMs, session.elapsedMs),
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

/** How far through a deadline, 0..1, for anything that has one. */
function spanUrgency(startedAtMs: number | null, endsAtMs: number | null, nowMs: number): number {
  if (startedAtMs === null || endsAtMs === null || endsAtMs <= startedAtMs) return 0;

  return Math.min(1, Math.max(0, (nowMs - startedAtMs) / (endsAtMs - startedAtMs)));
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
