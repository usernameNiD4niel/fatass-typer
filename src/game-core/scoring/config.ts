/**
 * Scoring configuration (spec §8).
 *
 * Every number the scoring system uses lives here, so tuning is a data change
 * rather than a code change (CLAUDE.md §3, no magic numbers). Maps may override
 * this; the defaults are balanced around Map 1.
 */
export interface ScoringConfig {
  /* Per character. */
  readonly correctCharacterPoints: number;
  readonly incorrectCharacterPenalty: number;

  /* Per completed prompt. */
  readonly promptCompletionPoints: number;
  /** Extra for an obstacle prompt — it carried a deadline, so it was worth more. */
  readonly obstacleCompletionPoints: number;
  /** Maximum awarded for typing faster than the map's target speed. */
  readonly speedBonusMax: number;
  /** Maximum awarded for a clean prompt, scaled by that prompt's accuracy. */
  readonly accuracyBonusMax: number;
  /** Awarded per second left on an obstacle deadline. */
  readonly remainingTimeBonusPerSecond: number;

  /* Combo. */
  /** Completed prompts before the multiplier starts rising. */
  readonly comboStartsAt: number;
  /** Added to the multiplier per prompt past the start. */
  readonly comboStep: number;
  readonly comboMultiplierMax: number;

  /* Penalties. */
  readonly collisionPenalty: number;
  readonly missedPromptPenalty: number;
  /** Points per coin. Deliberately small: coins are a bonus, not the game. */
  readonly coinPoints: number;
  /** Charged once each time the dogs first reach the danger threshold. */
  readonly dangerZonePenalty: number;

  /* End of run. */
  readonly levelCompletionPoints: number;
  /** Maximum awarded for finishing with the dogs far behind. */
  readonly finishDistanceBonusMax: number;
  /** Maximum awarded for whole-run accuracy. */
  readonly runAccuracyBonusMax: number;
}

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  correctCharacterPoints: 10,
  incorrectCharacterPenalty: 5,

  promptCompletionPoints: 50,
  obstacleCompletionPoints: 100,
  speedBonusMax: 60,
  accuracyBonusMax: 40,
  remainingTimeBonusPerSecond: 20,

  comboStartsAt: 3,
  comboStep: 0.1,
  comboMultiplierMax: 3,

  collisionPenalty: 150,
  missedPromptPenalty: 75,
  coinPoints: 12,
  dangerZonePenalty: 100,

  levelCompletionPoints: 1_000,
  finishDistanceBonusMax: 500,
  runAccuracyBonusMax: 750,
};
