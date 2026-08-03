import type { GameCommand, GameEvent, GameHost } from '../../game-bridge';
import type {
  AdaptiveAssistanceConfig,
  MapConfig,
  ObstacleDefinition,
  PromptEntry,
  RunResult,
} from '../../game-core/models';
import { CURRENT_SCHEMA_VERSION, DEFAULT_ADAPTIVE_ASSISTANCE } from '../../game-core/models';
import {
  advanceDogPack,
  advanceMcAnimation,
  animationForMove,
  createDogPack,
  createMcAnimation,
  type DogPackState,
  drawObstacleCourse,
  drawPack,
  drawRunner,
  locomotionFor,
  type McAnimation,
  play,
  setLocomotion,
} from '../actors';
import { GameLoop, type LoopScheduler } from '../loop';
import { type Canvas2D, CanvasRenderer, type SurfaceSize } from '../render';
import { chaseThreat, normalizedDistance } from '../../game-core/chase';
import { obstaclePressure, remainingMs, timeToImpact } from '../../game-core/obstacles';
import { sustainablePeakWpm } from '../../game-core/stats';
import type { DeadlinePressure } from '../../game-core/timing';
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
  sessionThreat,
  startRun,
} from './run-session';

/**
 * The runtime side of the bridge (spec §13, §19 milestone 1).
 *
 * Owns the loop, the renderer, and the session, and translates between the
 * bridge's commands and events and the rules. It is the only place where the
 * pure simulation meets a canvas and a clock.
 *
 * Everything it publishes goes through the bridge's throttle, so nothing here
 * can accidentally push per-frame data into React.
 */

/** What the host needs from the outside world. All injectable, so tests can drive it. */
export interface RuntimeHostOptions {
  readonly canvas: HTMLCanvasElement | null;
  readonly context: Canvas2D | null;
  readonly map: MapConfig;
  readonly prompts: readonly PromptEntry[];
  readonly obstacles?: readonly ObstacleDefinition[];
  readonly seed: string;
  readonly viewport: SurfaceSize;
  /**
   * Holds the background still (spec §12). The run itself still scrolls — that
   * is the game — but the decorative parallax stops swimming.
   */
  readonly reducedMotion?: boolean;
  readonly scheduler?: LoopScheduler;
  readonly emit: (event: GameEvent) => void;
  /** Offers a stats sample; the bridge decides whether it leaves. */
  readonly publishStats: (session: RunSession, nowMs: number) => void;
  /** Offers the active obstacle deadline, if any. Also throttled by the bridge. */
  readonly publishDeadline?: (
    remainingMs: number | null,
    pressure: DeadlinePressure,
    nowMs: number,
  ) => void;
  /** Monotonic wall clock, for throttling. Injected so tests can control it. */
  readonly now?: () => number;
}

export class RuntimeHost implements GameHost {
  private readonly options: RuntimeHostOptions;
  private readonly loop: GameLoop;
  private readonly now: () => number;

  private renderer: CanvasRenderer | null = null;
  private session: RunSession;
  /** Applied to the *next* run, so a run's rules never change under way. */
  private assistanceConfig: AdaptiveAssistanceConfig = DEFAULT_ADAPTIVE_ASSISTANCE;
  private mc: McAnimation = createMcAnimation();
  private dogs: DogPackState = createDogPack();

  /** Position at the last completed step, for render interpolation. */
  private previousMeters = 0;

  constructor(options: RuntimeHostOptions) {
    this.options = options;
    this.now = options.now ?? (() => performance.now());
    this.session = createRunSession({
      map: options.map,
      pool: options.prompts,
      obstacles: options.obstacles ?? [],
      seed: options.seed,
    });

    this.loop = new GameLoop({
      ...(options.scheduler ? { scheduler: options.scheduler } : {}),
      update: (context) => {
        this.step(context.fixedDeltaMs);
      },
      render: (context) => {
        this.draw(context.alpha, context.frameDeltaMs);
      },
    });
  }

  get currentSession(): RunSession {
    return this.session;
  }

  handle(command: GameCommand, emit: (event: GameEvent) => void): void {
    switch (command.type) {
      case 'initialize':
        this.initialize(emit);

        return;

      case 'startRun':
        this.apply(startRun(this.session), emit);
        this.loop.start();

        return;

      case 'pause':
        this.apply(pauseRun(this.session), emit);
        this.loop.pause();

        return;

      case 'resume':
        this.apply(resumeRun(this.session), emit);
        this.loop.resume();

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

  /** Stops the loop and drops the canvas. Called on unmount. */
  destroy(): void {
    this.loop.stop();
    this.renderer = null;
  }

  /** Re-sizes the surface. The camera follows in the same call. */
  resize(size: SurfaceSize): void {
    this.renderer?.resize(size);
  }

  private initialize(emit: (event: GameEvent) => void): void {
    const { canvas, context } = this.options;

    if (!canvas || !context) {
      // jsdom and a few locked-down browsers have no 2D context. Reporting it is
      // the honest answer; the screen shows a message instead of a blank box.
      emit({ type: 'fatalError', message: 'This browser did not provide a 2D canvas context.' });

      return;
    }

    this.renderer = new CanvasRenderer({
      canvas,
      context,
      worldLengthMeters: this.options.map.distanceMeters,
      viewport: this.options.viewport,
      theme: this.options.map.theme,
      ...(this.options.reducedMotion === undefined
        ? {}
        : { reducedMotion: this.options.reducedMotion }),
    });

    emit({ type: 'ready' });
    emit({ type: 'stateChanged', state: 'ready' });
    this.emitPrompt(this.session.prompt, emit);
  }

  private restart(emit: (event: GameEvent) => void): void {
    this.loop.stop();
    this.session = createRunSession({
      map: this.options.map,
      pool: this.options.prompts,
      obstacles: this.options.obstacles ?? [],
      assistance: this.assistanceConfig,
      // A restart is a fresh run, not a replay: a new seed means new prompts.
      seed: `${this.options.seed}:${String(Math.round(this.now()))}`,
    });
    this.mc = createMcAnimation();
    this.dogs = createDogPack();
    this.previousMeters = 0;

    emit({ type: 'stateChanged', state: 'ready' });
    this.emitPrompt(this.session.prompt, emit);

    this.apply(startRun(this.session), emit);
    this.loop.start();
  }

  private emitPrompt(prompt: PromptEntry | null, emit: (event: GameEvent) => void): void {
    const obstacle = activeObstacle(this.session);
    // An obstacle prompt is mandatory and carries a deadline; a boost prompt is
    // optional speed. The HUD styles them differently, so the kind is not
    // cosmetic.
    const attached = obstacle !== null && obstacle.prompt.id === prompt?.id;

    emit({
      type: 'promptChanged',
      prompt:
        prompt === null
          ? null
          : {
              promptId: prompt.id,
              text: prompt.text,
              typedLength: 0,
              mistakeCount: 0,
              kind: attached ? 'obstacle' : 'boost',
              remainingMs: attached ? obstacle.timing.availableMs : null,
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

        case 'promptCompleted':
          this.mc = play(this.mc, 'boosting');
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
          // The pose comes from the rules' own verdict, so what the player sees
          // can never disagree with what they were charged.
          this.mc = play(this.mc, animationForMove(event.move));
          if (event.outcome !== 'avoided') {
            emit({ type: 'playerHit', reason: event.outcome });
          }
          break;

        case 'phaseChanged':
          this.onPhaseChanged(emit);
          break;

        case 'obstacleSpawned':
        case 'obstacleAttached':
        case 'boostStarted':
        case 'boostEnded':
          break;
      }
    }
  }

  private onPhaseChanged(emit: (event: GameEvent) => void): void {
    const phase = this.session.phase;

    if (phase === 'levelComplete') {
      this.mc = play(this.mc, 'victory');
      this.loop.stop();
      emit({ type: 'stateChanged', state: 'levelComplete' });
      emit({ type: 'levelCompleted', result: this.buildResult(true) });

      return;
    }

    if (phase === 'gameOver') {
      this.mc = play(this.mc, 'caught');
      this.loop.stop();
      emit({ type: 'stateChanged', state: 'gameOver' });
      emit({ type: 'gameOver', result: this.buildResult(false) });

      return;
    }

    emit({ type: 'stateChanged', state: phase === 'paused' ? 'paused' : 'running' });
  }

  /**
   * The run result.
   *
   * Deliberately partial: sustainable peak, obstacle rate, and run history are
   * phase D/F work. The fields that exist are honest, and the ones that do not
   * apply yet report zero rather than a guess.
   */
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
      missedPrompts: this.session.stumbles + this.session.collisions,
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

  /** One rendered frame. `alpha` smooths between the last two simulation steps. */
  private draw(alpha: number, frameDeltaMs: number): void {
    const renderer = this.renderer;
    if (!renderer) return;

    const meters =
      this.previousMeters + (this.session.playerMeters - this.previousMeters) * Math.min(1, alpha);
    const speed = this.session.phase === 'running' ? currentSpeed(this.session) : 0;

    this.mc = setLocomotion(
      advanceMcAnimation(this.mc, { deltaMs: frameDeltaMs, speedMetersPerSecond: speed }),
      locomotionFor(speed, isBoosting(this.session)),
    );
    this.dogs = advanceDogPack(this.dogs, {
      deltaMs: frameDeltaMs,
      speedMetersPerSecond: speed,
    });

    renderer.draw(meters);

    const view = renderer.view;
    const context = this.options.context;
    if (!context) return;

    // Back to front, which is the only depth sorting a 2D canvas offers:
    // obstacles down the track, then the pack behind the runner, then him.
    drawObstacleCourse(context, {
      view,
      obstacles: this.session.obstacles,
      playerMeters: meters,
    });

    drawPack(context, {
      view,
      normalizedGap: normalizedDistance(this.session.chase, this.session.map.chase),
      threat: chaseThreat(this.session.chase, this.session.map.chase),
      cyclePhase: this.dogs.cyclePhase,
    });

    drawRunner(context, { view, animation: this.mc });
  }

  /** Diagnostics for the dev overlay and tests. */
  get debug(): { progress: number; threat: string; fps: number } {
    return {
      progress: runProgress(this.session),
      threat: sessionThreat(this.session),
      fps: this.loop.stats.fps,
    };
  }
}
