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
