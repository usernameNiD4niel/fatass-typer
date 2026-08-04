import { accuracyOf } from '../stats/wpm';
import { DEFAULT_SCORING_CONFIG } from './config';
import type { ScoringConfig } from './config';

/**
 * Scoring and combo (spec §8).
 *
 * The model, kept close to the spec's own wording:
 *
 *     base_prompt_score
 *     + speed_bonus
 *     + accuracy_bonus
 *     + remaining_time_bonus
 *     * combo_multiplier
 *     - collision_penalty
 *
 * The multiplier applies to what the player *earned*, never to penalties: a
 * long combo should not make a collision hurt more, and a combo is broken by
 * the collision anyway.
 *
 * The score never goes below zero (spec §8). A struggling player finishes with
 * nothing, which reads as "no score" rather than as a debt.
 */

export interface ScoreState {
  readonly score: number;
  /** Consecutive prompts completed without a mistake. */
  readonly combo: number;
  readonly longestCombo: number;
  /** True once the dogs have been in the danger zone, so it is charged once. */
  readonly dangerCharged: boolean;
}

export const EMPTY_SCORE_STATE: ScoreState = {
  score: 0,
  combo: 0,
  longestCombo: 0,
  dangerCharged: false,
};

export function createScoreState(): ScoreState {
  return EMPTY_SCORE_STATE;
}

/** Score can never fall below zero. */
function withScore(state: ScoreState, score: number): ScoreState {
  return { ...state, score: Math.max(0, score) };
}

/**
 * Multiplier for the current combo.
 *
 * Flat at 1 until `comboStartsAt`, then rises by `comboStep` per prompt up to
 * the cap. A short streak is not yet an achievement.
 */
export function comboMultiplier(
  combo: number,
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
): number {
  if (combo < config.comboStartsAt) return 1;

  const steps = combo - config.comboStartsAt + 1;

  return Math.min(config.comboMultiplierMax, 1 + steps * config.comboStep);
}

/** Everything known about a prompt the player just finished. */
export interface PromptOutcome {
  readonly correctCharacters: number;
  readonly incorrectCharacters: number;
  /** True when the prompt was attached to an obstacle. */
  readonly isObstacle: boolean;
  /** Time the map's target speed allowed for it. */
  readonly expectedTypingMs: number;
  /** Time the player actually took. */
  readonly actualTypingMs: number;
  /**
   * Milliseconds left on the obstacle deadline at completion. Zero for boost
   * prompts, which carry no deadline.
   */
  readonly remainingMs: number;
  /**
   * Fraction of the obstacle's whole budget still unspent, 0..1.
   *
   * Not the same thing as `remainingMs`, and the difference is the point.
   * `remainingMs` is absolute, so a long word on a slow map pays more for the
   * same *quality* of clear than a short word on a fast one. The margin is
   * normalised against the budget the hazard actually gave, so it asks "how
   * decisively did you beat this deadline" rather than "how big was it".
   *
   * Zero for anything without a deadline.
   */
  readonly marginFraction: number;
}

/** Breakdown of a single prompt's award. Surfaced on the results screen. */
export interface PromptScoreBreakdown {
  readonly base: number;
  readonly characters: number;
  readonly speedBonus: number;
  readonly accuracyBonus: number;
  readonly remainingTimeBonus: number;
  readonly marginBonus: number;
  readonly multiplier: number;
  readonly penalty: number;
  readonly total: number;
}

/**
 * Scores one completed prompt.
 *
 * Character penalties sit outside the multiplier for the same reason collisions
 * do — a combo should never amplify what the player did wrong.
 */
export function scorePrompt(
  outcome: PromptOutcome,
  combo: number,
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
): PromptScoreBreakdown {
  const base = outcome.isObstacle ? config.obstacleCompletionPoints : config.promptCompletionPoints;
  const characters = outcome.correctCharacters * config.correctCharacterPoints;
  const penalty = outcome.incorrectCharacters * config.incorrectCharacterPenalty;

  // Typing faster than the map's target speed, as a fraction of the time saved.
  const savedFraction =
    outcome.expectedTypingMs > 0
      ? (outcome.expectedTypingMs - outcome.actualTypingMs) / outcome.expectedTypingMs
      : 0;
  const speedBonus = Math.max(0, Math.min(1, savedFraction)) * config.speedBonusMax;

  const promptAccuracy = accuracyOf(outcome.correctCharacters, outcome.incorrectCharacters);
  const accuracyBonus = promptAccuracy * config.accuracyBonusMax;

  const remainingTimeBonus =
    Math.max(0, outcome.remainingMs / 1_000) * config.remainingTimeBonusPerSecond;

  /*
   * Squared, deliberately.
   *
   * A linear reward for beating a deadline pays a scraped clear nearly as well
   * as a decisive one, and the game already had that in `remainingTimeBonus`.
   * Squaring means the last fraction of margin is worth far more than the
   * first: clearing with 80% of the budget spare pays four times what 40% does,
   * not twice. That is the shape a player has to feel before typing faster
   * looks worth doing, given clearing at all is already a pass.
   */
  const margin = Math.max(0, Math.min(1, outcome.marginFraction));
  const marginBonus = margin * margin * config.marginBonusMax;

  const multiplier = comboMultiplier(combo, config);
  const earned =
    (base + characters + speedBonus + accuracyBonus + remainingTimeBonus + marginBonus) *
    multiplier;

  return {
    base,
    characters,
    speedBonus,
    accuracyBonus,
    remainingTimeBonus,
    marginBonus,
    multiplier,
    penalty,
    total: earned - penalty,
  };
}

/** Applies a completed prompt, advancing the combo first so it counts itself. */
export function registerPromptCompleted(
  state: ScoreState,
  outcome: PromptOutcome,
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
): ScoreState {
  const combo = state.combo + 1;
  const breakdown = scorePrompt(outcome, combo, config);

  return withScore(
    { ...state, combo, longestCombo: Math.max(state.longestCombo, combo) },
    state.score + breakdown.total,
  );
}

/** The MC hit an obstacle: the largest penalty, and the combo is gone. */
export function registerCollision(
  state: ScoreState,
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
): ScoreState {
  return withScore({ ...state, combo: 0 }, state.score - config.collisionPenalty);
}

/**
 * A line of coins was collected.
 *
 * Flat points per coin, and no combo involvement in either direction. Coins are
 * optional, so letting them build the combo would make the optional thing
 * mandatory for anyone chasing a score — and letting a missed one break it would
 * punish declining, which is the one thing declining must never do.
 */
export function awardCoins(
  state: ScoreState,
  coins: number,
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
): ScoreState {
  if (coins <= 0) return state;

  return withScore(state, state.score + coins * config.coinPoints);
}

/** An obstacle prompt expired unfinished. */
export function registerMissedPrompt(
  state: ScoreState,
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
): ScoreState {
  return withScore({ ...state, combo: 0 }, state.score - config.missedPromptPenalty);
}

/** A mistyped character breaks the combo without a separate score penalty. */
export function breakCombo(state: ScoreState): ScoreState {
  return state.combo === 0 ? state : { ...state, combo: 0 };
}

/**
 * The dogs reached the danger threshold. Charged once per run: an ongoing drain
 * while the player is already struggling would only deepen the hole.
 */
export function registerDangerZone(
  state: ScoreState,
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
): ScoreState {
  if (state.dangerCharged) return state;

  return withScore({ ...state, dangerCharged: true }, state.score - config.dangerZonePenalty);
}

/* -------------------------------------------------------------------------- */
/* End of run                                                                 */
/* -------------------------------------------------------------------------- */

export interface RunOutcome {
  /** True only when the finish line was reached. */
  readonly completed: boolean;
  /** Whole-run accuracy, 0..1. */
  readonly accuracy: number;
  /** Remaining dog gap as 0..1 at the moment the run ended. */
  readonly normalizedDogDistance: number;
}

export interface FinalScoreBreakdown {
  readonly duringRun: number;
  readonly completionBonus: number;
  readonly accuracyBonus: number;
  readonly distanceBonus: number;
  readonly total: number;
}

/**
 * Adds the end-of-run bonuses.
 *
 * Completion bonuses are only paid for reaching the finish line. Accuracy is
 * rewarded either way — a careful player who was caught still typed well, and
 * spec §8 rewards accuracy in its own right.
 */
export function finalizeScore(
  state: ScoreState,
  outcome: RunOutcome,
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
): FinalScoreBreakdown {
  const completionBonus = outcome.completed ? config.levelCompletionPoints : 0;
  const distanceBonus = outcome.completed
    ? Math.max(0, Math.min(1, outcome.normalizedDogDistance)) * config.finishDistanceBonusMax
    : 0;
  const accuracyBonus = Math.max(0, Math.min(1, outcome.accuracy)) * config.runAccuracyBonusMax;

  return {
    duringRun: state.score,
    completionBonus,
    accuracyBonus,
    distanceBonus,
    total: Math.max(0, state.score + completionBonus + accuracyBonus + distanceBonus),
  };
}
