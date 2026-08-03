export {
  boostDurationMs,
  MAX_BOOST_SCALE,
  MIN_BOOST_SCALE,
  REFERENCE_PROMPT_CHARACTERS,
} from './boost-duration';
export {
  computePromptTiming,
  CRITICAL_THRESHOLD,
  deadlinePressure,
  deadlineProgress,
  expectedTypingMs,
  isPromptFeasible,
  obstaclePromptTiming,
  requiredWpm,
  spawnDistanceMeters,
  timeToImpactMs,
  WARNING_THRESHOLD,
} from './prompt-timing';
export type { DeadlinePressure, PromptTiming, PromptTimingInput } from './prompt-timing';
