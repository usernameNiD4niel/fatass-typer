import type { AppEvent, AppEventType } from './events';
import type { AppState } from './states';

/**
 * The application state machine (spec §4).
 *
 * One table, one pure transition function. Transitions are total and explicit:
 * an event with no entry for the current state is *rejected*, not silently
 * ignored, so illegal navigation shows up in tests instead of in gameplay.
 */

/** Destination for each event that is legal in a given state. */
type StateTransitions = Partial<Readonly<Record<AppEventType, AppState>>>;

/**
 * `Settings` is the one state whose exit depends on where it was entered from,
 * so `CLOSE_SETTINGS` is resolved from context rather than from this table.
 */
export const TRANSITIONS: Readonly<Record<AppState, StateTransitions>> = {
  Boot: {
    BOOT_COMPLETE: 'MainMenu',
  },

  MainMenu: {
    OPEN_MAP_SELECTION: 'MapSelection',
    OPEN_SETTINGS: 'Settings',
    OPEN_STATISTICS: 'Statistics',
  },

  Statistics: {
    BACK: 'MainMenu',
    RETURN_TO_MENU: 'MainMenu',
  },

  MapSelection: {
    SELECT_MAP: 'PreRunCountdown',
    OPEN_SETTINGS: 'Settings',
    BACK: 'MainMenu',
    RETURN_TO_MENU: 'MainMenu',
  },

  PreRunCountdown: {
    COUNTDOWN_COMPLETE: 'Running',
    // Backing out during the countdown must be possible; the run has not started.
    BACK: 'MapSelection',
    QUIT_RUN: 'MapSelection',
  },

  Running: {
    PAUSE: 'Paused',
    HIT_OBSTACLE: 'PlayerHit',
    REACH_FINISH: 'LevelComplete',
    CAUGHT_BY_DOGS: 'GameOver',
  },

  Paused: {
    RESUME: 'Running',
    RESTART_RUN: 'PreRunCountdown',
    QUIT_RUN: 'MapSelection',
    OPEN_SETTINGS: 'Settings',
    RETURN_TO_MENU: 'MainMenu',
  },

  PlayerHit: {
    RECOVER: 'Running',
    // A collision can be the one that lets the dogs close the gap completely.
    CAUGHT_BY_DOGS: 'GameOver',
    PAUSE: 'Paused',
  },

  LevelComplete: {
    SHOW_RESULTS: 'Results',
  },

  GameOver: {
    SHOW_RESULTS: 'Results',
  },

  Results: {
    RETRY: 'PreRunCountdown',
    NEXT_MAP: 'PreRunCountdown',
    RETURN_TO_MAPS: 'MapSelection',
    RETURN_TO_MENU: 'MainMenu',
  },

  Settings: {
    // CLOSE_SETTINGS is resolved from context.settingsOrigin.
  },
};

/**
 * The machine's full state. `settingsOrigin` remembers where Settings was opened
 * from so closing it returns there — opening Settings from a paused run must not
 * abandon the run.
 */
export interface MachineContext {
  readonly state: AppState;
  readonly settingsOrigin: AppState | null;
}

export const INITIAL_CONTEXT: MachineContext = {
  state: 'Boot',
  settingsOrigin: null,
};

export type TransitionResult =
  | { readonly status: 'accepted'; readonly context: MachineContext }
  | { readonly status: 'rejected'; readonly context: MachineContext; readonly reason: string };

/**
 * Applies an event. Always returns a usable context: on rejection the context is
 * the unchanged input, so callers can use `result.context` without branching.
 */
export function transition(context: MachineContext, event: AppEvent): TransitionResult {
  const { state } = context;

  if (state === 'Settings' && event.type === 'CLOSE_SETTINGS') {
    if (context.settingsOrigin === null) {
      return {
        status: 'rejected',
        context,
        reason: 'CLOSE_SETTINGS with no recorded origin',
      };
    }

    return {
      status: 'accepted',
      context: { state: context.settingsOrigin, settingsOrigin: null },
    };
  }

  const next = TRANSITIONS[state][event.type];

  if (next === undefined) {
    return {
      status: 'rejected',
      context,
      reason: `${event.type} is not legal in ${state}`,
    };
  }

  return {
    status: 'accepted',
    context: {
      state: next,
      // Record the origin on the way in; clear it on any other move so a stale
      // origin can never send the player somewhere unexpected later.
      settingsOrigin: next === 'Settings' ? state : null,
    },
  };
}

/** True when the event would be accepted. Use for enabling and disabling controls. */
export function canTransition(context: MachineContext, event: AppEvent): boolean {
  return transition(context, event).status === 'accepted';
}

/** Events currently legal from this context. Used by tests and dev tooling. */
export function legalEvents(context: MachineContext): readonly AppEventType[] {
  const fromTable = Object.keys(TRANSITIONS[context.state]) as AppEventType[];

  if (context.state === 'Settings' && context.settingsOrigin !== null) {
    return [...fromTable, 'CLOSE_SETTINGS'];
  }

  return fromTable;
}
