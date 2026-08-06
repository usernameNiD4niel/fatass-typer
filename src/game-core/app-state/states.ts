/**
 * The application states from spec §4.
 *
 * This union is the only place a "where am I" value comes from. Nothing in the
 * codebase may track screen or run status with its own boolean (CLAUDE.md §3).
 *
 * `Statistics` is not in the spec's list but the main menu it describes has an
 * entry for it (spec §9). A screen the player can open is a state; the
 * alternative was a menu entry that leads nowhere.
 */
export const APP_STATES = [
  'Boot',
  'MainMenu',
  'MapSelection',
  'PreRunCountdown',
  'Running',
  'Paused',
  'PlayerHit',
  'LevelComplete',
  'GameOver',
  'Results',
  'Settings',
  'Statistics',
  /**
   * The wardrobe (plan: the race).
   *
   * Same reasoning as `Statistics`: a screen the player can open is a state,
   * and the alternative was a menu entry that leads nowhere.
   */
  'Wardrobe',
] as const;

export type AppState = (typeof APP_STATES)[number];

const APP_STATE_LOOKUP: ReadonlySet<string> = new Set(APP_STATES);

/** Narrows an untrusted string — used when validating messages at the bridge. */
export function isAppState(value: unknown): value is AppState {
  return typeof value === 'string' && APP_STATE_LOOKUP.has(value);
}

/**
 * States where a run is in progress and its simulation clock is meaningful.
 * `Paused` is deliberately excluded: the run exists but time is not advancing.
 */
const IN_RUN_STATES: ReadonlySet<AppState> = new Set<AppState>([
  'PreRunCountdown',
  'Running',
  'Paused',
  'PlayerHit',
]);

/** True while a run exists, whether or not it is currently ticking. */
export function isRunActive(state: AppState): boolean {
  return IN_RUN_STATES.has(state);
}

/** True only when the simulation should be advancing. */
export function isSimulationTicking(state: AppState): boolean {
  return state === 'Running' || state === 'PlayerHit';
}

/** True once a run has ended and its outcome is known. */
export function isRunConcluded(state: AppState): boolean {
  return state === 'LevelComplete' || state === 'GameOver' || state === 'Results';
}
