import { describe, expect, it } from 'vitest';
import { appEvent } from './events';
import type { AppEventType } from './events';
import { canTransition, INITIAL_CONTEXT, legalEvents, TRANSITIONS, transition } from './machine';
import type { MachineContext } from './machine';
import { APP_STATES, isAppState, isRunActive, isRunConcluded, isSimulationTicking } from './states';
import type { AppState } from './states';

/** Applies a sequence of events, asserting each one is accepted. */
function run(events: readonly AppEventType[], from: MachineContext = INITIAL_CONTEXT): AppState {
  return events.reduce<MachineContext>((context, type) => {
    const result = transition(context, appEvent(type));

    expect(result.status, `${type} rejected in ${context.state}`).toBe('accepted');

    return result.context;
  }, from).state;
}

function contextAt(state: AppState, settingsOrigin: AppState | null = null): MachineContext {
  return { state, settingsOrigin };
}

describe('app state machine — spec §4 transitions', () => {
  it.each([
    ['MainMenu -> MapSelection', ['BOOT_COMPLETE', 'OPEN_MAP_SELECTION'], 'MapSelection'],
    [
      'MapSelection -> PreRunCountdown',
      ['BOOT_COMPLETE', 'OPEN_MAP_SELECTION', 'SELECT_MAP'],
      'PreRunCountdown',
    ],
    [
      'PreRunCountdown -> Running',
      ['BOOT_COMPLETE', 'OPEN_MAP_SELECTION', 'SELECT_MAP', 'COUNTDOWN_COMPLETE'],
      'Running',
    ],
    [
      'Running -> Paused',
      ['BOOT_COMPLETE', 'OPEN_MAP_SELECTION', 'SELECT_MAP', 'COUNTDOWN_COMPLETE', 'PAUSE'],
      'Paused',
    ],
    [
      'Running -> PlayerHit',
      ['BOOT_COMPLETE', 'OPEN_MAP_SELECTION', 'SELECT_MAP', 'COUNTDOWN_COMPLETE', 'HIT_OBSTACLE'],
      'PlayerHit',
    ],
    [
      'PlayerHit -> Running',
      [
        'BOOT_COMPLETE',
        'OPEN_MAP_SELECTION',
        'SELECT_MAP',
        'COUNTDOWN_COMPLETE',
        'HIT_OBSTACLE',
        'RECOVER',
      ],
      'Running',
    ],
    [
      'Running -> LevelComplete',
      ['BOOT_COMPLETE', 'OPEN_MAP_SELECTION', 'SELECT_MAP', 'COUNTDOWN_COMPLETE', 'REACH_FINISH'],
      'LevelComplete',
    ],
    [
      'Running -> GameOver',
      ['BOOT_COMPLETE', 'OPEN_MAP_SELECTION', 'SELECT_MAP', 'COUNTDOWN_COMPLETE', 'CAUGHT_BY_DOGS'],
      'GameOver',
    ],
    [
      'LevelComplete -> Results',
      [
        'BOOT_COMPLETE',
        'OPEN_MAP_SELECTION',
        'SELECT_MAP',
        'COUNTDOWN_COMPLETE',
        'REACH_FINISH',
        'SHOW_RESULTS',
      ],
      'Results',
    ],
    [
      'GameOver -> Results',
      [
        'BOOT_COMPLETE',
        'OPEN_MAP_SELECTION',
        'SELECT_MAP',
        'COUNTDOWN_COMPLETE',
        'CAUGHT_BY_DOGS',
        'SHOW_RESULTS',
      ],
      'Results',
    ],
  ] as const)('%s', (_label, events, expected) => {
    expect(run(events)).toBe(expected);
  });
});

describe('app state machine — rejection', () => {
  it('rejects an event that is not legal in the current state', () => {
    const result = transition(INITIAL_CONTEXT, appEvent('PAUSE'));

    expect(result.status).toBe('rejected');
    expect(result.context).toEqual(INITIAL_CONTEXT);
    if (result.status === 'rejected') {
      expect(result.reason).toBe('PAUSE is not legal in Boot');
    }
  });

  it('cannot start a run without picking a map', () => {
    expect(canTransition(contextAt('MainMenu'), appEvent('COUNTDOWN_COMPLETE'))).toBe(false);
  });

  it('cannot resume a run that is not paused', () => {
    expect(canTransition(contextAt('Running'), appEvent('RESUME'))).toBe(false);
  });

  it('cannot pause a finished run', () => {
    expect(canTransition(contextAt('GameOver'), appEvent('PAUSE'))).toBe(false);
    expect(canTransition(contextAt('Results'), appEvent('PAUSE'))).toBe(false);
  });

  it('never mutates the context it is given', () => {
    const before = contextAt('Running');
    const snapshot = { ...before };

    transition(before, appEvent('PAUSE'));
    transition(before, appEvent('NOPE' as AppEventType));

    expect(before).toEqual(snapshot);
  });

  it('is deterministic — the same input always yields the same output', () => {
    const context = contextAt('Running');

    expect(transition(context, appEvent('PAUSE'))).toEqual(transition(context, appEvent('PAUSE')));
  });
});

describe('app state machine — Settings returns to where it was opened', () => {
  it('returns to the main menu', () => {
    const opened = transition(contextAt('MainMenu'), appEvent('OPEN_SETTINGS'));
    expect(opened.context.state).toBe('Settings');
    expect(opened.context.settingsOrigin).toBe('MainMenu');

    const closed = transition(opened.context, appEvent('CLOSE_SETTINGS'));
    expect(closed.status).toBe('accepted');
    expect(closed.context.state).toBe('MainMenu');
    expect(closed.context.settingsOrigin).toBeNull();
  });

  it('returns to a paused run rather than abandoning it', () => {
    const opened = transition(contextAt('Paused'), appEvent('OPEN_SETTINGS'));
    const closed = transition(opened.context, appEvent('CLOSE_SETTINGS'));

    expect(closed.context.state).toBe('Paused');
  });

  it('returns to map selection', () => {
    const opened = transition(contextAt('MapSelection'), appEvent('OPEN_SETTINGS'));
    const closed = transition(opened.context, appEvent('CLOSE_SETTINGS'));

    expect(closed.context.state).toBe('MapSelection');
  });

  it('rejects closing Settings with no recorded origin', () => {
    const result = transition(contextAt('Settings', null), appEvent('CLOSE_SETTINGS'));

    expect(result.status).toBe('rejected');
  });

  it('clears the origin once the player moves elsewhere', () => {
    const opened = transition(contextAt('Paused'), appEvent('OPEN_SETTINGS'));
    const closed = transition(opened.context, appEvent('CLOSE_SETTINGS'));
    const quit = transition(closed.context, appEvent('QUIT_RUN'));

    expect(quit.context.state).toBe('MapSelection');
    expect(quit.context.settingsOrigin).toBeNull();
  });

  it('lists CLOSE_SETTINGS as legal only when an origin exists', () => {
    expect(legalEvents(contextAt('Settings', 'MainMenu'))).toContain('CLOSE_SETTINGS');
    expect(legalEvents(contextAt('Settings', null))).not.toContain('CLOSE_SETTINGS');
  });
});

describe('app state machine — graph integrity', () => {
  it('covers every declared state in the transition table', () => {
    expect(Object.keys(TRANSITIONS).sort()).toEqual([...APP_STATES].sort());
  });

  it('reaches every state from Boot', () => {
    const seen = new Set<AppState>([INITIAL_CONTEXT.state]);
    const queue: MachineContext[] = [INITIAL_CONTEXT];

    while (queue.length > 0) {
      const context = queue.shift();
      if (context === undefined) break;

      for (const type of legalEvents(context)) {
        const result = transition(context, appEvent(type));
        if (result.status !== 'accepted') continue;

        // Explore Settings from each origin so CLOSE_SETTINGS paths are covered.
        const key = result.context.state;
        if (!seen.has(key)) {
          seen.add(key);
          queue.push(result.context);
        }
      }
    }

    expect([...seen].sort()).toEqual([...APP_STATES].sort());
  });

  it('has no dead ends — every state can be left', () => {
    for (const state of APP_STATES) {
      const context = contextAt(state, state === 'Settings' ? 'MainMenu' : null);

      expect(legalEvents(context).length, `${state} is a dead end`).toBeGreaterThan(0);
    }
  });

  it('only ever names real states as destinations', () => {
    for (const destinations of Object.values(TRANSITIONS)) {
      for (const destination of Object.values(destinations)) {
        expect(isAppState(destination)).toBe(true);
      }
    }
  });
});

describe('app state predicates', () => {
  it('treats a paused run as active but not ticking', () => {
    expect(isRunActive('Paused')).toBe(true);
    expect(isSimulationTicking('Paused')).toBe(false);
  });

  it('ticks only while running or recovering from a hit', () => {
    expect(isSimulationTicking('Running')).toBe(true);
    expect(isSimulationTicking('PlayerHit')).toBe(true);
    expect(isSimulationTicking('MainMenu')).toBe(false);
    expect(isSimulationTicking('PreRunCountdown')).toBe(false);
  });

  it('does not treat menus as an active run', () => {
    expect(isRunActive('MainMenu')).toBe(false);
    expect(isRunActive('Results')).toBe(false);
  });

  it('recognises concluded runs', () => {
    expect(isRunConcluded('LevelComplete')).toBe(true);
    expect(isRunConcluded('GameOver')).toBe(true);
    expect(isRunConcluded('Results')).toBe(true);
    expect(isRunConcluded('Running')).toBe(false);
  });

  it('validates untrusted strings', () => {
    expect(isAppState('Running')).toBe(true);
    expect(isAppState('running')).toBe(false);
    expect(isAppState(null)).toBe(false);
    expect(isAppState(42)).toBe(false);
  });
});
