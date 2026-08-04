import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { MAP_1 } from '../../content';
import type { MapConfig, MapProgress, PlayerProfile, RunResult } from '../../game-core/models';
import { createPlayerProfile, emptyRunResult } from '../../game-core/models';
import { missedUnlockReason, newRecords, unlockedMap } from './run-summary';
import { RunResults } from './RunResults';

/** Map 2 arrives in F3; the unlock paths need something to unlock. */
const MAP_2: MapConfig = {
  ...MAP_1,
  id: 'map-2',
  mapNumber: 2,
  name: 'Downtown Sprint',
  targetWpm: 26,
  unlock: { requiresMapId: 'map-1', minimumAccuracy: 0.85 },
};

const MAPS: readonly MapConfig[] = [MAP_1, MAP_2];

function profileWith(overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  return { ...createPlayerProfile('2026-01-01T00:00:00.000Z', 'map-1'), ...overrides };
}

function progress(overrides: Partial<MapProgress> = {}): MapProgress {
  return {
    completed: false,
    bestScore: 0,
    bestAverageWpm: 0,
    bestPeakWpm: 0,
    bestAccuracy: 0,
    bestCompletionTimeMs: null,
    attempts: 0,
    ...overrides,
  };
}

function resultWith(overrides: Partial<RunResult> = {}): RunResult {
  return {
    ...emptyRunResult('run-1', 'map-1', '2026-01-01T00:00:00.000Z'),
    durationMs: 52_000,
    completed: true,
    score: 1840,
    averageWpm: 23,
    sustainablePeakWpm: 26,
    accuracy: 0.94,
    correctCharacters: 320,
    incorrectCharacters: 20,
    correctedErrors: 6,
    completedPrompts: 42,
    obstacleSuccessRate: 1,
    longestCombo: 12,
    ...overrides,
  };
}

describe('newRecords', () => {
  it('reports every figure that beat the previous best', () => {
    const records = newRecords(resultWith(), profileWith());

    expect(records.map((record) => record.kind)).toEqual([
      'score',
      'accuracy',
      'averageWpm',
      'sustainablePeak',
      'firstCompletion',
    ]);
  });

  it('does not call matching a best a new record', () => {
    const profile = profileWith({
      sustainablePeakWpm: 26,
      mapProgress: {
        'map-1': progress({
          completed: true,
          bestScore: 1840,
          bestAccuracy: 0.94,
          bestAverageWpm: 23,
        }),
      },
    });

    expect(newRecords(resultWith(), profile)).toHaveLength(0);
  });

  it('compares the sustainable peak against the player, not the map', () => {
    const profile = profileWith({ sustainablePeakWpm: 40 });
    const kinds = newRecords(resultWith(), profile).map((record) => record.kind);

    expect(kinds).not.toContain('sustainablePeak');
  });

  it('does not claim a first completion for a run that was not finished', () => {
    const kinds = newRecords(resultWith({ completed: false }), profileWith()).map(
      (record) => record.kind,
    );

    expect(kinds).not.toContain('firstCompletion');
  });
});

describe('unlockedMap', () => {
  it('unlocks the next map when the run was finished accurately enough', () => {
    expect(unlockedMap(resultWith(), profileWith(), MAPS)?.id).toBe('map-2');
  });

  it('unlocks nothing when the run was not finished', () => {
    expect(unlockedMap(resultWith({ completed: false }), profileWith(), MAPS)).toBeNull();
  });

  it('unlocks nothing when the accuracy gate was missed', () => {
    // Finishing scrappily is a win, not a promotion (spec §6).
    expect(unlockedMap(resultWith({ accuracy: 0.8 }), profileWith(), MAPS)).toBeNull();
  });

  it('unlocks nothing that is already unlocked', () => {
    const profile = profileWith({ unlockedMapIds: ['map-1', 'map-2'] });

    expect(unlockedMap(resultWith(), profile, MAPS)).toBeNull();
  });
});

describe('missedUnlockReason', () => {
  it('says what accuracy was needed and what the player had', () => {
    expect(missedUnlockReason(resultWith({ accuracy: 0.8 }), profileWith(), MAPS)).toBe(
      '85% accuracy unlocks Downtown Sprint — you had 80%',
    );
  });

  it('says to finish the map when the run ended early', () => {
    expect(missedUnlockReason(resultWith({ completed: false }), profileWith(), MAPS)).toBe(
      'Finish the map to unlock Downtown Sprint',
    );
  });

  it('says nothing when the unlock succeeded', () => {
    expect(missedUnlockReason(resultWith(), profileWith(), MAPS)).toBeNull();
  });

  it('says nothing when there is no next map', () => {
    expect(missedUnlockReason(resultWith(), profileWith(), [MAP_1])).toBeNull();
  });
});

describe('RunResults', () => {
  function setup(result: RunResult, profile: PlayerProfile = profileWith(), withNext = true) {
    const handlers = { onRetry: vi.fn(), onReturnToMaps: vi.fn(), onNextMap: vi.fn() };

    render(
      <RunResults
        result={result}
        map={MAP_1}
        profile={profile}
        maps={MAPS}
        onRetry={handlers.onRetry}
        onReturnToMaps={handlers.onReturnToMaps}
        {...(withNext ? { onNextMap: handlers.onNextMap } : {})}
      />,
    );

    return { ...handlers, user: userEvent.setup() };
  }

  it('reports a finished run', () => {
    setup(resultWith());

    expect(screen.getByText('Finished')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Neighborhood Dash' }),
    ).toBeInTheDocument();
  });

  /** The "This run" card, so a figure repeated under New records is not ambiguous. */
  function runCard(): HTMLElement {
    const heading = screen.getByRole('heading', { name: 'This run' });
    const card = heading.closest('section');
    if (card === null) throw new Error('the run card lost its section');

    return card;
  }

  it('reports a lost run without hiding the numbers', () => {
    setup(resultWith({ completed: false }));

    expect(screen.getByText('Crashed')).toBeInTheDocument();
    // A player who crashed gets the same detail as one who finished.
    expect(within(runCard()).getByText('1840')).toBeInTheDocument();
    expect(within(runCard()).getByText('94%')).toBeInTheDocument();
  });

  it('shows every figure the spec asks for', () => {
    setup(resultWith());
    const card = within(runCard());

    expect(card.getByText('1840')).toBeInTheDocument();
    expect(card.getByText('23 WPM')).toBeInTheDocument();
    expect(card.getByText('26 WPM')).toBeInTheDocument();
    expect(card.getByText('94%')).toBeInTheDocument();
    expect(card.getByText('12×')).toBeInTheDocument();
    expect(card.getByText('100%')).toBeInTheDocument();
    expect(card.getByText('20')).toBeInTheDocument();
    expect(card.getByText('42')).toBeInTheDocument();
  });

  it('separates corrections from mistakes, since accuracy does', () => {
    setup(resultWith());

    expect(screen.getByText('6 corrected')).toBeInTheDocument();
  });

  it('explains a missing sustainable peak instead of showing a bare dash', () => {
    setup(resultWith({ sustainablePeakWpm: 0 }));

    expect(screen.getByText('not enough typing yet')).toBeInTheDocument();
  });

  it('lists new records', () => {
    setup(resultWith());

    expect(screen.getByRole('heading', { name: 'New records' })).toBeInTheDocument();
    expect(screen.getByText('Best score')).toBeInTheDocument();
  });

  it('shows no records section when nothing was beaten', () => {
    const profile = profileWith({
      sustainablePeakWpm: 40,
      mapProgress: {
        'map-1': progress({
          completed: true,
          bestScore: 5000,
          bestAccuracy: 1,
          bestAverageWpm: 60,
        }),
      },
    });

    setup(resultWith(), profile);

    expect(screen.queryByRole('heading', { name: 'New records' })).not.toBeInTheDocument();
  });

  it('announces an unlock and leads with the next map', async () => {
    const { user, onNextMap } = setup(resultWith());

    expect(screen.getByText('Downtown Sprint unlocked')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next map' }));

    expect(onNextMap).toHaveBeenCalledTimes(1);
  });

  it('says what was needed when the unlock was missed', () => {
    setup(resultWith({ accuracy: 0.8 }));

    expect(screen.getByText(/85% accuracy unlocks Downtown Sprint/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next map' })).not.toBeInTheDocument();
  });

  it('offers Try again after a loss, and Run again after a win', () => {
    const view = render(
      <RunResults
        result={resultWith({ completed: false })}
        map={MAP_1}
        profile={profileWith()}
        maps={MAPS}
        onRetry={vi.fn()}
        onReturnToMaps={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    view.unmount();

    render(
      <RunResults
        result={resultWith()}
        map={MAP_1}
        profile={profileWith({ unlockedMapIds: ['map-1', 'map-2'] })}
        maps={MAPS}
        onRetry={vi.fn()}
        onReturnToMaps={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Run again' })).toBeInTheDocument();
  });

  it('raises retry and return', async () => {
    const { user, onRetry, onReturnToMaps } = setup(resultWith({ completed: false }));

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await user.click(screen.getByRole('button', { name: 'Return to maps' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onReturnToMaps).toHaveBeenCalledTimes(1);
  });
});
