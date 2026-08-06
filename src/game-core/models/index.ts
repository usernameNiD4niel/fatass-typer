export {
  isCount,
  isFiniteNumber,
  isIntegerAtLeast,
  isMemberOf,
  isNonEmptyString,
  isPositiveNumber,
  isRatio,
  isRecord,
  isStringArray,
} from './guards';

export { isId, isIsoTimestamp } from './ids';
export type { IsoTimestamp, MapId, ObstacleId, PromptId, RunId } from './ids';

export {
  checkSchema,
  CURRENT_SCHEMA_VERSION,
  isVersioned,
  MINIMUM_SUPPORTED_SCHEMA_VERSION,
} from './schema';
export type { SchemaCompatibility, Versioned } from './schema';

export {
  effectiveCharacterCount,
  hasConsistentNormalization,
  isPromptCategory,
  isPromptEntry,
  normalizePromptText,
  PROMPT_CATEGORIES,
} from './prompt';
export type { PromptCategory, PromptEntry, PromptUsage } from './prompt';

export {
  adjacentLanes,
  CENTRE_LANE,
  isLaneIndex,
  isLaneSide,
  LANE_COUNT,
  LANE_INDICES,
  LANE_SIDES,
  laneOffset,
  laneToward,
  sideBetween,
} from './lane';
export type { LaneIndex, LaneSide } from './lane';

export { isMotionProfile, jumpDurationMs, timeToClearanceMs } from './motion';
export type { MotionProfile } from './motion';

export { DEFAULT_ADAPTIVE_ASSISTANCE, isMapConfig, MAP_THEMES } from './map';
export type {
  AdaptiveAssistanceConfig,
  BoostProfile,
  ContentProfile,
  EscalationProfile,
  MapConfig,
  MapTheme,
  SpeedProfile,
  TimingProfile,
  UnlockRule,
} from './map';

export {
  coerceSettings,
  DEFAULT_SETTINGS,
  isGameSettings,
  MISTAKE_BEHAVIORS,
  PROMPT_TEXT_SIZES,
  THEME_PREFERENCES,
} from './settings';
export type { GameSettings, MistakeBehavior, PromptTextSize, ThemePreference } from './settings';

export { EMPTY_LIVE_STATS, emptyRunResult, isRunResult } from './run';
export type { FailureReason, LiveRunStats, RivalStanding, RunResult } from './run';

export {
  coercePlayerProfile,
  createPlayerProfile,
  EMPTY_MAP_PROGRESS,
  coerceMapProgress,
  isMapProgress,
  isMapUnlocked,
  isPlayerProfile,
  lifetimeAccuracy,
  progressFor,
} from './profile';
export type { MapProgress, PlayerProfile } from './profile';
