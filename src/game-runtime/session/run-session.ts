import {
  advanceChase,
  type ChaseState,
  chaseThreat,
  createChaseState,
  normalizedDistance,
  registerPromptCompleted as chasePromptCompleted,
  breakStreak,
} from '../../game-core/chase';
import { createPromptSelector, nextPrompt, type PromptSelector } from '../../game-core/content';
import type { LiveRunStats, MapConfig, PromptEntry } from '../../game-core/models';
import { createRngFromString } from '../../game-core/random';
import {
  breakCombo,
  createScoreState,
  type PromptOutcome,
  registerPromptCompleted as scorePromptCompleted,
  type ScoreState,
} from '../../game-core/scoring';
import {
  averageWpm,
  createRunStats,
  currentWpm,
  recordTypingDelta,
  runAccuracy,
  type RunStats,
} from '../../game-core/stats';
import { expectedTypingMs } from '../../game-core/timing';
import { applyInput, createTypingState, type TypingState } from '../../game-core/typing';

/**
 * One run, as rules (spec §19 milestone 1).
 *
 * Pure and deterministic: no clock, no canvas, no React. Time arrives as
 * deltas, randomness comes from a seed, and every call returns a new session
 * plus the events it produced. That is what lets the whole slice be tested
 * without rendering a frame — and what keeps a Rust reimplementation possible.
 *
 * The slice covers boost prompts, the finish line, and being caught. Obstacles
 * are phase D, and nothing here assumes their absence: obstacle prompts simply
 * have not been added to the prompt queue yet.
 */

export type RunPhase = 'ready' | 'running' | 'paused' | 'levelComplete' | 'gameOver';

export interface RunSession {
  readonly map: MapConfig;
  readonly pool: readonly PromptEntry[];
  readonly phase: RunPhase;

  /** Distance covered, in meters. */
  readonly playerMeters: number;
  /** Milliseconds of *simulated* time. A paused run does not advance it. */
  readonly elapsedMs: number;
  /** Milliseconds of boost left, or 0. */
  readonly boostRemainingMs: number;

  readonly prompt: PromptEntry | null;
  readonly typing: TypingState;
  /** When the current prompt was first shown, in run time. */
  readonly promptStartedMs: number;

  readonly selector: PromptSelector;
  readonly chase: ChaseState;
  readonly stats: RunStats;
  readonly score: ScoreState;

  readonly completedPrompts: number;
}

export type SessionEvent =
  | { readonly type: 'promptChanged'; readonly prompt: PromptEntry | null }
  | { readonly type: 'promptCompleted'; readonly prompt: PromptEntry; readonly points: number }
  | { readonly type: 'boostStarted' }
  | { readonly type: 'boostEnded' }
  | { readonly type: 'phaseChanged'; readonly phase: RunPhase };

export interface RunSessionResult {
  readonly session: RunSession;
  readonly events: readonly SessionEvent[];
}

/** Draws the next prompt and resets the typing state onto it. */
function withNextPrompt(session: RunSession): RunSessionResult {
  const { prompt, selector } = nextPrompt(session.selector, session.pool, {
    mapNumber: session.map.mapNumber,
    categories: session.map.content.promptCategories,
    usage: 'boost',
    preferredTags: session.map.content.themeTags,
  });

  return {
    session: {
      ...session,
      selector,
      prompt,
      typing: createTypingState(prompt?.text ?? ''),
      promptStartedMs: session.elapsedMs,
    },
    events: [{ type: 'promptChanged', prompt }],
  };
}

export interface CreateRunSessionInput {
  readonly map: MapConfig;
  readonly pool: readonly PromptEntry[];
  /** Same seed, same run — the property the whole test suite leans on. */
  readonly seed: string;
}

export function createRunSession(input: CreateRunSessionInput): RunSession {
  const base: RunSession = {
    map: input.map,
    pool: input.pool,
    phase: 'ready',
    playerMeters: 0,
    elapsedMs: 0,
    boostRemainingMs: 0,
    prompt: null,
    typing: createTypingState(''),
    promptStartedMs: 0,
    selector: createPromptSelector(createRngFromString(input.seed)),
    chase: createChaseState(input.map.chase),
    stats: createRunStats(),
    score: createScoreState(),
    completedPrompts: 0,
  };

  return withNextPrompt(base).session;
}

/** The MC's speed right now, in meters per second. */
export function currentSpeed(session: RunSession): number {
  const base = session.map.baseSpeedMetersPerSecond;

  return session.boostRemainingMs > 0 ? base * session.map.boost.speedMultiplier : base;
}

export function isBoosting(session: RunSession): boolean {
  return session.boostRemainingMs > 0;
}

/** Progress to the finish line, 0..1. */
export function runProgress(session: RunSession): number {
  if (session.map.distanceMeters <= 0) return 1;

  return Math.min(1, session.playerMeters / session.map.distanceMeters);
}

function toPhase(session: RunSession, phase: RunPhase): RunSessionResult {
  if (session.phase === phase) return { session, events: [] };

  return { session: { ...session, phase }, events: [{ type: 'phaseChanged', phase }] };
}

export function startRun(session: RunSession): RunSessionResult {
  return session.phase === 'ready' ? toPhase(session, 'running') : { session, events: [] };
}

export function pauseRun(session: RunSession): RunSessionResult {
  return session.phase === 'running' ? toPhase(session, 'paused') : { session, events: [] };
}

export function resumeRun(session: RunSession): RunSessionResult {
  return session.phase === 'paused' ? toPhase(session, 'running') : { session, events: [] };
}

/**
 * Advances the simulation by one fixed step.
 *
 * Only `running` advances. A paused or finished run is frozen, so the elapsed
 * clock that every statistic derives from cannot drift while nobody is playing.
 */
export function advanceRunSession(session: RunSession, deltaMs: number): RunSessionResult {
  if (session.phase !== 'running' || deltaMs <= 0) return { session, events: [] };

  const events: SessionEvent[] = [];
  const seconds = deltaMs / 1000;
  const speed = currentSpeed(session);

  const boostRemainingMs = Math.max(0, session.boostRemainingMs - deltaMs);
  if (session.boostRemainingMs > 0 && boostRemainingMs === 0) events.push({ type: 'boostEnded' });

  const advanced: RunSession = {
    ...session,
    elapsedMs: session.elapsedMs + deltaMs,
    playerMeters: session.playerMeters + speed * seconds,
    boostRemainingMs,
    chase: advanceChase(session.chase, session.map.chase, deltaMs, {
      playerSpeedMetersPerSecond: speed,
      baseSpeedMetersPerSecond: session.map.baseSpeedMetersPerSecond,
    }),
  };

  // Finishing wins ties. Crossing the line and being caught on the same step is
  // vanishingly rare, but the player who reached the finish earned it.
  if (advanced.playerMeters >= advanced.map.distanceMeters) {
    const finished = toPhase(
      { ...advanced, playerMeters: advanced.map.distanceMeters },
      'levelComplete',
    );

    return { session: finished.session, events: [...events, ...finished.events] };
  }

  if (advanced.chase.caught) {
    const over = toPhase(advanced, 'gameOver');

    return { session: over.session, events: [...events, ...over.events] };
  }

  return { session: advanced, events };
}

/**
 * Applies the typing field's current value.
 *
 * The whole value, not a keystroke — insertions, backspace, and paste all go
 * through the same diff (CLAUDE.md §3).
 */
export function applyRunInput(session: RunSession, value: string): RunSessionResult {
  if (session.phase !== 'running' || session.prompt === null) return { session, events: [] };

  const typing = applyInput(session.typing, value);
  if (typing === session.typing) return { session, events: [] };

  const stats = recordTypingDelta(session.stats, session.typing, typing, session.elapsedMs);

  const typed: RunSession = { ...session, typing, stats };

  if (!typing.complete) {
    // A mistake breaks both streaks the moment it happens, so recovery and the
    // combo have to be re-earned rather than surviving a sloppy prompt.
    const mistyped = typing.incorrectCharacters > session.typing.incorrectCharacters;

    return {
      session: mistyped
        ? { ...typed, chase: breakStreak(typed.chase), score: breakCombo(typed.score) }
        : typed,
      events: [],
    };
  }

  return completePrompt(typed);
}

/** Everything that happens when a prompt is finished. */
function completePrompt(session: RunSession): RunSessionResult {
  const prompt = session.prompt;
  if (prompt === null) return { session, events: [] };

  const outcome: PromptOutcome = {
    correctCharacters: session.typing.correctCharacters,
    incorrectCharacters: session.typing.incorrectCharacters,
    isObstacle: false,
    expectedTypingMs: expectedTypingMs(prompt.normalizedText.length, session.map.targetWpm),
    actualTypingMs: session.elapsedMs - session.promptStartedMs,
    // Boost prompts carry no deadline (spec §5), so there is no time bonus.
    remainingMs: 0,
  };

  const score = scorePromptCompleted(session.score, outcome);
  const points = score.score - session.score.score;
  const perfect = session.typing.incorrectCharacters === 0;

  const rewarded: RunSession = {
    ...session,
    score,
    // Only a clean prompt buys ground back — otherwise the dogs would be a
    // formality for anyone typing quickly but badly.
    chase: perfect ? chasePromptCompleted(session.chase, session.map.chase) : session.chase,
    boostRemainingMs: session.map.boost.durationMs,
    completedPrompts: session.completedPrompts + 1,
  };

  const next = withNextPrompt(rewarded);

  return {
    session: next.session,
    events: [{ type: 'promptCompleted', prompt, points }, { type: 'boostStarted' }, ...next.events],
  };
}

/** The snapshot the HUD renders, built on demand rather than tracked. */
export function liveStats(session: RunSession): LiveRunStats {
  return {
    currentWpm: currentWpm(session.stats, session.elapsedMs),
    averageWpm: averageWpm(session.stats, session.elapsedMs),
    accuracy: runAccuracy(session.stats),
    combo: session.score.combo,
    score: session.score.score,
    progress: runProgress(session),
    dogDistanceNormalized: normalizedDistance(session.chase, session.map.chase),
    elapsedMs: session.elapsedMs,
  };
}

export function sessionThreat(session: RunSession): ReturnType<typeof chaseThreat> {
  return chaseThreat(session.chase, session.map.chase);
}
