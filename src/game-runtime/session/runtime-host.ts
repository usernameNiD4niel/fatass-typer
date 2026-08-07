import type { GameCommand, GameEvent, GameHost, WorldSnapshot } from '../../game-bridge';
import {
  createWorldSnapshot,
  MAX_SNAPSHOT_COIN_UNITS,
  MAX_SNAPSHOT_COINS,
  MAX_SNAPSHOT_POPUPS,
  MAX_SNAPSHOT_RACERS,
  MAX_SNAPSHOT_POWERUPS,
} from '../../game-bridge';
import type {
  AdaptiveAssistanceConfig,
  MapConfig,
  PromptEntry,
  RunResult,
} from '../../game-core/models';
import { CURRENT_SCHEMA_VERSION, DEFAULT_ADAPTIVE_ASSISTANCE } from '../../game-core/models';
import { crouchDepth, jumpHeightMeters, lanePosition } from '../../game-core/motion';
import { sustainablePeakWpm } from '../../game-core/stats';
import { DEFAULT_TYPING_OPTIONS, firstErrorIndex } from '../../game-core/typing';
import { type DeadlinePressure, deadlinePressure } from '../../game-core/timing';
import { FixedStepDriver } from '../loop';
import { distanceToCoins } from '../../game-core/pickups';
import { distanceToPowerup, hasMagnet, isFlying } from '../../game-core/powerups';
import { pursuitPressure } from '../../game-core/pursuit';
import { flowRemainingMs, flowUrgency } from '../../game-core/flow';
import { surgeProgress } from '../../game-core/surge';
import {
  activeCoin,
  activeFlowWord,
  activeSurge,
  activePowerup,
  advanceRunSession,
  applyRunInput,
  createRunSession,
  currentSpeed,
  isBoosting,
  liveStats,
  nextPromptPreview,
  promptSuccessRate,
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
  /** The map's secret, as words in order. Every prompt comes from here first. */
  readonly secretWords?: readonly PromptEntry[];
  /** Which of the map's secrets this run drew. Recorded on the result. */
  readonly secretId?: string;
  /** Long sentences for the surge (`content/surges.ts`). */
  readonly surges?: readonly PromptEntry[];
  /** Characters the player fumbles. The run's vocabulary leans toward them. */
  readonly weakCharacters?: readonly string[];
  readonly seed: string;
  readonly emit: (event: GameEvent) => void;
  /** Offers a stats sample; the bridge decides whether it leaves. */
  readonly publishStats: (session: RunSession, nowMs: number) => void;
  /** Offers the current word's deadline, if any. Also throttled by the bridge. */
  readonly publishDeadline?: (
    remainingMs: number | null,
    pressure: DeadlinePressure,
    nowMs: number,
  ) => void;
  /** Monotonic wall clock, for throttling. Injected so tests can control it. */
  readonly now?: () => number;
}

/**
 * What finishing in front is worth.
 *
 * Paid on the run's score, so it flows into the same total everything else
 * does — the race is a way of scoring a run rather than a second currency
 * bolted beside it.
 *
 * Only paid on a run that *reached the finish line*. A player caught by the
 * chaser in first place did not win a race, they lost a run; paying them for
 * the standing they held at the moment they died would make being caught early
 * while leading worth more than being caught late while second.
 */
export function placementBonus(placement: number, completed: boolean): number {
  if (!completed) return 0;

  return PLACEMENT_BONUS[placement - 1] ?? 0;
}

/** First, second, third. Third is not zero: turning up and finishing is worth something. */
const PLACEMENT_BONUS = [1_200, 600, 200] as const;

/** How quickly a camera shake impulse decays, per second. */
const SHAKE_DECAY_PER_SECOND = 3.2;

/**
 * Degrees of field of view a finished word kicks in, before it decays.
 *
 * Smaller than the old hazard kick, and unscaled. A hazard was cleared every
 * ten seconds and the kick was scaled by margin, so it read as an event. A word
 * is finished every second or two; the same size of kick that many times would
 * be a camera that never stops moving, which spec §12 rules out.
 */
const COMPLETION_PUNCH_DEGREES = 2.2;

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
      secretWords: options.secretWords ?? [],
      surges: options.surges ?? [],
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
        /*
         * The word the scene is drawing has just changed, so republish it now
         * rather than at the next frame.
         *
         * ## The bug this fixes
         *
         * Keystrokes arrive from the keyboard; the snapshot was only rebuilt
         * from `advance()`. So between two frames the snapshot described a word
         * with *fewer characters typed than the player had actually typed* —
         * and anything that repainted in that window drew the stale count.
         *
         * The visible result was characters that had gone green turning grey
         * again, intermittently: a repaint landing before the next frame
         * redrew the word as the last frame had left it. It looked like input
         * being dropped, and it was really the display running a frame behind
         * the rules. Completing a word made it near-certain, because completion
         * emits `promptChanged`, which repaints immediately — reading a
         * snapshot that still held the *previous* word at its old count.
         *
         * Only the challenge is rebuilt. A whole `refreshSnapshot` would also
         * re-interpolate the player's position with an alpha that belongs to
         * the frame loop rather than to a keystroke, which would jitter the
         * runner in time with the typing.
         */
        this.world.challenge = this.buildChallenge();

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
      secretWords: this.options.secretWords ?? [],
      // A restart is a fresh run in every respect, surges included. Leaving
      // this out gave a restarted run no surges at all, which is the kind of
      // difference nobody would think to look for.
      surges: this.options.surges ?? [],
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
              kind: 'flow',
              remainingMs: activeFlowWord(this.session)?.timing.availableMs ?? null,
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
          // The kick used to come from committing to a hazard, scaled by the
          // margin. The word is still the moment worth punctuating; there is
          // simply no hazard behind it any more.
          this.punch = Math.max(this.punch, COMPLETION_PUNCH_DEGREES);
          break;

        case 'mistyped':
          // Charged at the end of the prompt, but shown now — a penalty
          // explained three seconds after the keystroke that caused it teaches
          // nothing about the keystroke.
          this.pushPopup(-event.penalty, 'loss');
          this.shake = Math.max(this.shake, MISTAKE_SHAKE);
          break;

        case 'flowWordMissed':
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
      score: stats.score + placementBonus(stats.placement, completed),
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
      missedPrompts: this.session.flowWordsMissed,
      obstacleSuccessRate: promptSuccessRate(this.session),
      placement: stats.placement,
      ...(this.options.secretId === undefined ? {} : { secretId: this.options.secretId }),
      coinsStolen: this.session.coinsStolen,
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

    /*
     * The deadline belongs to whatever word is on screen. It used to be the
     * hazard's, because a hazard's was the only one that could end a run; with
     * hazards gone the flow word is the one carrying the pressure.
     */
    const flow = activeFlowWord(this.session);
    this.options.publishDeadline?.(
      flow === null ? null : flowRemainingMs(flow, this.session.elapsedMs),
      flow === null
        ? 'safe'
        : deadlinePressure(flowRemainingMs(flow, this.session.elapsedMs), flow.timing.availableMs),
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

    let racerCount = 0;
    for (const racer of session.race.racers) {
      if (racerCount >= MAX_SNAPSHOT_RACERS) break;

      const slot = world.racers[racerCount];
      if (slot === undefined) break;

      slot.instanceId = racer.id;
      // Relative to the player, like everything else the scene draws: the
      // player is pinned at the origin and the world moves past them.
      slot.aheadMeters = racer.meters - world.playerMeters;
      slot.lane = racer.lane;
      slot.finished = racer.finished;

      racerCount += 1;
    }
    world.racerCount = racerCount;

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
      // Read-ahead, so the player never waits to find out what is next. Derived
      // from the sentence rather than queued — see `nextPromptPreview`.
      nextWord: nextPromptPreview(session)?.text ?? '',
      typedLength: session.typing.typed.length,
      firstErrorIndex: firstErrorIndex(
        session.typing.target,
        session.typing.typed,
        DEFAULT_TYPING_OPTIONS,
      ),
    };

    /*
     * The surge first: it is the longest and most valuable thing on screen, and
     * while one is running nothing else holds the field.
     */
    const surge = activeSurge(session);
    if (surge !== null) {
      return {
        ...typed,
        kind: 'surge',
        safeSide: null,
        safeLane: null,
        hazardId: surge.instanceId,
        // Not optional in the sense that matters: losing it costs the speed it
        // was giving. But ignoring it never ends a run.
        optional: true,
        // One wrong character ends it, which is exactly what `perfect` means.
        perfect: true,
        urgency: surgeProgress(surge, session.elapsedMs),
      };
    }

    const flow = activeFlowWord(session);
    if (flow !== null) {
      return {
        ...typed,
        kind: 'flow',
        // A flow word points nowhere: there is nothing to reach and nowhere to
        // be. The scene places it ahead of the player rather than tracking a
        // body, because it has none.
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
      hazards: 0,
    };
  }
}

/** How far through a deadline, 0..1, for anything that has one. */
function spanUrgency(startedAtMs: number | null, endsAtMs: number | null, nowMs: number): number {
  if (startedAtMs === null || endsAtMs === null || endsAtMs <= startedAtMs) return 0;

  return Math.min(1, Math.max(0, (nowMs - startedAtMs) / (endsAtMs - startedAtMs)));
}

/** Deadline pressure as a smooth 0..1, for the prompt's urgency pulse. */

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
