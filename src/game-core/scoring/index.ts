export { DEFAULT_SCORING_CONFIG } from './config';
export type { ScoringConfig } from './config';

export {
  awardCoins,
  breakCombo,
  comboMultiplier,
  createScoreState,
  EMPTY_SCORE_STATE,
  finalizeScore,
  registerCollision,
  registerDangerZone,
  registerMissedPrompt,
  registerPromptCompleted,
  scorePrompt,
} from './score';
export type {
  FinalScoreBreakdown,
  PromptOutcome,
  PromptScoreBreakdown,
  RunOutcome,
  ScoreState,
} from './score';
