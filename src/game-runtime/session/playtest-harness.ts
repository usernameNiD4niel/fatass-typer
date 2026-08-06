import { findSecret, secretPrompts } from '../../content';
import type { AdaptiveAssistanceConfig, MapConfig, PromptEntry } from '../../game-core/models';
import type { FailureReason } from '../../game-core/models';
import {
  advanceRunSession,
  applyRunInput,
  createRunSession,
  promptSuccessRate,
  type RunSession,
  startRun,
} from './run-session';

/**
 * A simulated typist, for tuning maps (step F2).
 *
 * Playtesting a typing game by hand measures the tester, not the map. This
 * plays a whole run at an exact, metronomic speed, so "can a 20 WPM typist
 * finish Map 1?" has an answer that does not depend on who is asking.
 *
 * It is a test helper rather than shipped code, but it lives in `src` because
 * the tuning tests are the map's real specification.
 */

const STEP_MS = 16;

/** Milliseconds per character at a given speed. Five characters make a word. */
export function msPerCharacter(wpm: number): number {
  return 60_000 / (wpm * 5);
}

export interface PlaytestInput {
  readonly map: MapConfig;
  readonly prompts: readonly PromptEntry[];
  /** Defaults to the map's own secret. Pass `[]` to run without a sentence. */
  readonly secretWords?: readonly PromptEntry[];
  readonly wpm: number;
  readonly seed: string;
  /** Adaptive assistance. Defaults to the game's own configuration. */
  readonly assistance?: AdaptiveAssistanceConfig;
  /**
   * How long the typist takes to *notice* a new prompt before typing it.
   *
   * Zero by default, which is a perfect machine and the right baseline for
   * tuning. A real player has this lag, and it is the only thing that makes an
   * obstacle deadline missable — without it, the timing budget guarantees every
   * prompt is finished in time and no obstacle is ever missed.
   */
  readonly reactionDelayMs?: number;
  /**
   * Fraction of characters typed wrong, 0..1. A perfect typist is not a
   * realistic one, and a map tuned only against perfection is tuned wrong.
   */
  readonly errorRate?: number;
  readonly maxSteps?: number;
}

export interface PlaytestResult {
  readonly session: RunSession;
  readonly finished: boolean;
  /** Why the run ended, or `'none'` when it reached the finish line. */
  readonly failureReason: FailureReason | 'none';
  readonly elapsedMs: number;
  readonly hazardsFaced: number;
  readonly hazardsCleared: number;
  readonly obstacleSuccessRate: number;
  readonly mistakes: number;
}

/**
 * Plays a run at a fixed speed.
 *
 * The typist adds one character per interval and types whatever is on screen —
 * boost prompts and obstacle prompts alike, which is what a real player does.
 * With an error rate they mistype at a steady rate and immediately correct,
 * costing the time a real correction costs.
 */
export function playtest(input: PlaytestInput): PlaytestResult {
  const interval = msPerCharacter(input.wpm);
  const errorRate = input.errorRate ?? 0;

  // The map's own secret, unless the caller supplied one. Tuning has to be
  // measured against the words the player will actually meet, and since the
  // sentence supplies every prompt those are the words.
  const secret = findSecret(input.map.id);

  let session = startRun(
    createRunSession({
      map: input.map,
      pool: input.prompts,
      secretWords: input.secretWords ?? (secret === undefined ? [] : secretPrompts(secret)),
      seed: input.seed,
      ...(input.assistance === undefined ? {} : { assistance: input.assistance }),
    }),
  ).session;

  let nextKeyAtMs = 0;
  let keystroke = 0;
  let mistakes = 0;
  let pendingCorrection = false;
  let seenPromptId = session.prompt?.id ?? null;
  const reactionDelayMs = input.reactionDelayMs ?? 0;

  // `impact` still advances — it is the beat before the run ends — so the loop
  // runs until the session is genuinely finished rather than stopping on the hit.
  const isLive = (phase: RunSession['phase']): boolean => phase === 'running' || phase === 'impact';

  for (let step = 0; step < (input.maxSteps ?? 60_000) && isLive(session.phase); step += 1) {
    // A new prompt has to be noticed before it can be typed.
    const promptId = session.prompt?.id ?? null;
    if (promptId !== seenPromptId) {
      seenPromptId = promptId;
      nextKeyAtMs = Math.max(nextKeyAtMs, session.elapsedMs + reactionDelayMs);
    }

    while (session.elapsedMs >= nextKeyAtMs && session.phase === 'running') {
      const target = session.prompt?.text ?? '';
      const typed = session.typing.typed;

      if (pendingCorrection) {
        // The correction costs a keystroke, exactly as it would for a person.
        session = applyRunInput(session, typed.slice(0, -1)).session;
        pendingCorrection = false;
      } else if (typed.length < target.length) {
        keystroke += 1;
        const shouldMistype = errorRate > 0 && keystroke % Math.round(1 / errorRate) === 0;

        if (shouldMistype) {
          const wrong = target[typed.length] === 'x' ? 'q' : 'x';
          session = applyRunInput(session, typed + wrong).session;
          mistakes += 1;
          pendingCorrection = true;
        } else {
          session = applyRunInput(session, target.slice(0, typed.length + 1)).session;
        }
      }

      nextKeyAtMs += interval;
    }

    session = advanceRunSession(session, STEP_MS).session;
  }

  return {
    session,
    finished: session.phase === 'levelComplete',
    failureReason: session.phase === 'levelComplete' ? 'none' : (session.failureReason ?? 'none'),
    elapsedMs: session.elapsedMs,
    hazardsFaced: session.completedPrompts + session.flowWordsMissed,
    hazardsCleared: session.completedPrompts,
    obstacleSuccessRate: promptSuccessRate(session),
    mistakes,
  };
}

/**
 * Fraction of seeds that finish the map, 0..1.
 *
 * With failure now binary, one seed is an anecdote: whether a run survives
 * depends on which hazards it happened to draw and in which order. A finish rate
 * over many seeds is the only honest way to ask whether a map is fair.
 */
export function finishRate(input: Omit<PlaytestInput, 'seed'>, seeds: number): number {
  if (seeds <= 0) return 0;

  let finished = 0;
  for (let index = 0; index < seeds; index += 1) {
    if (playtest({ ...input, seed: `finish-rate-${String(index)}` }).finished) finished += 1;
  }

  return finished / seeds;
}

/** The slowest speed, in whole WPM, that still finishes the map. */
export function survivalThreshold(
  input: Omit<PlaytestInput, 'wpm'>,
  range: { from: number; to: number } = { from: 5, to: 40 },
): number | null {
  for (let wpm = range.from; wpm <= range.to; wpm += 1) {
    if (playtest({ ...input, wpm }).finished) return wpm;
  }

  return null;
}
