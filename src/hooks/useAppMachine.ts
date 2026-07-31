import { useCallback, useMemo, useReducer } from 'react';
import {
  appEvent,
  canTransition,
  INITIAL_CONTEXT,
  legalEvents,
  transition,
} from '../game-core/app-state';
import type { AppEvent, AppEventType, AppState, MachineContext } from '../game-core/app-state';

/**
 * React binding for the app state machine.
 *
 * The machine itself lives in `game-core` and knows nothing about React. This
 * hook is the only place the two meet, so screens never track navigation with
 * their own booleans (CLAUDE.md §3).
 */

function reducer(context: MachineContext, event: AppEvent): MachineContext {
  const result = transition(context, event);

  if (result.status === 'rejected' && import.meta.env.DEV) {
    // Loud in development, harmless in production. A rejected transition is
    // almost always a wiring bug — a control offered where it is not legal.
    console.warn(`[app-state] ${result.reason}`);
  }

  return result.context;
}

export interface AppMachine {
  /** The current application state. */
  readonly state: AppState;
  /** Full machine context, including where Settings was opened from. */
  readonly context: MachineContext;
  /** Dispatches an event. Illegal events are rejected and leave state untouched. */
  readonly send: (type: AppEventType) => void;
  /** Whether an event would be accepted right now — use it to disable controls. */
  readonly can: (type: AppEventType) => boolean;
  /** Every event legal from the current state. */
  readonly available: readonly AppEventType[];
}

export function useAppMachine(initial: MachineContext = INITIAL_CONTEXT): AppMachine {
  const [context, dispatch] = useReducer(reducer, initial);

  const send = useCallback((type: AppEventType) => {
    dispatch(appEvent(type));
  }, []);

  const can = useCallback(
    (type: AppEventType) => canTransition(context, appEvent(type)),
    [context],
  );

  const available = useMemo(() => legalEvents(context), [context]);

  return { state: context.state, context, send, can, available };
}
