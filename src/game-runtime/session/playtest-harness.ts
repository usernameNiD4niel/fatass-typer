import type { MapConfig, ObstacleDefinition, PromptEntry } from '../../game-core/models';
import {
  advanceRunSession,
  applyRunInput,
  createRunSession,
  obstacleSuccessRate,
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
  readonly obstacles: readonly ObstacleDefinition[];
  readonly wpm: number;
  readonly seed: string;
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
  readonly caught: boolean;
  readonly elapsedMs: number;
  /** Closest the dogs ever got, as a fraction of the starting gap. */
  readonly closestApproach: number;
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

  let session = startRun(
    createRunSession({
      map: input.map,
      pool: input.prompts,
      obstacles: input.obstacles,
      seed: input.seed,
    }),
  ).session;

  let nextKeyAtMs = 0;
  let keystroke = 0;
  let mistakes = 0;
  let closest = 1;
  let pendingCorrection = false;

  for (let step = 0; step < (input.maxSteps ?? 60_000) && session.phase === 'running'; step += 1) {
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

    const gap = session.chase.distanceMeters / input.map.chase.startingDistanceMeters;
    closest = Math.min(closest, gap);
  }

  return {
    session,
    finished: session.phase === 'levelComplete',
    caught: session.phase === 'gameOver',
    elapsedMs: session.elapsedMs,
    closestApproach: closest,
    obstacleSuccessRate: obstacleSuccessRate(session),
    mistakes,
  };
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
