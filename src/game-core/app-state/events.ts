/**
 * Every event that can move the application between states.
 *
 * Events describe **what happened**, never what should happen next. The
 * transition table owns the destination — that is what keeps the graph in one
 * readable place instead of scattered across screens.
 */
export const APP_EVENTS = [
  /* Boot */
  'BOOT_COMPLETE',

  /* Navigation */
  'OPEN_MAP_SELECTION',
  'OPEN_SETTINGS',
  'CLOSE_SETTINGS',
  'OPEN_STATISTICS',
  'OPEN_WARDROBE',
  'BACK',
  'RETURN_TO_MENU',
  'RETURN_TO_MAPS',

  /* Run lifecycle */
  'SELECT_MAP',
  'COUNTDOWN_COMPLETE',
  'PAUSE',
  'RESUME',
  'RESTART_RUN',
  'QUIT_RUN',

  /* Gameplay outcomes */
  'HIT_OBSTACLE',
  'RECOVER',
  'REACH_FINISH',
  'CAUGHT_BY_DOGS',

  /* Post-run */
  'SHOW_RESULTS',
  'RETRY',
  'NEXT_MAP',
] as const;

export type AppEventType = (typeof APP_EVENTS)[number];

const APP_EVENT_LOOKUP: ReadonlySet<string> = new Set(APP_EVENTS);

export function isAppEventType(value: unknown): value is AppEventType {
  return typeof value === 'string' && APP_EVENT_LOOKUP.has(value);
}

/**
 * Events carry no payload yet. Run configuration (which map, which seed) is
 * threaded through the run model in phase B/C rather than through navigation,
 * so this stays a plain tagged object.
 */
export interface AppEvent {
  readonly type: AppEventType;
}

export function appEvent(type: AppEventType): AppEvent {
  return { type };
}
