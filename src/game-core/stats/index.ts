export {
  accuracyOf,
  charactersAtWpm,
  CHARACTERS_PER_WORD,
  CURRENT_WPM_WINDOW_MS,
  grossWpm,
  millisecondsToType,
  RAW_PEAK_WINDOW_MS,
} from './wpm';

export {
  averageWpm,
  createRunStats,
  currentWpm,
  EMPTY_RUN_STATS,
  idleMs,
  recordSample,
  recordTypingDelta,
  runAccuracy,
  totalCharacters,
} from './run-stats';
export type { RunStats, TypingSample } from './run-stats';

export {
  bestSustainableWindow,
  DEFAULT_SUSTAINABLE_PEAK_CONFIG,
  explainMissingPeak,
  sustainablePeakWpm,
  updateLifetimePeak,
} from './sustainable-peak';
export type {
  SustainablePeakConfig,
  SustainablePeakWindow,
  WindowRejection,
} from './sustainable-peak';
