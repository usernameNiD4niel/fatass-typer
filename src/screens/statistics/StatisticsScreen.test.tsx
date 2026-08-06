import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { MAP_1 } from '../../content';
import type { MapConfig, PlayerProfile } from '../../game-core/models';
import { createPlayerProfile } from '../../game-core/models';
import { StatisticsScreen } from './StatisticsScreen';

const MAP_2: MapConfig = {
  ...MAP_1,
  id: 'map-2',
  mapNumber: 2,
  name: 'Downtown Sprint',
  unlock: { requiresMapId: 'map-1', minimumAccuracy: 0.85 },
};

const MAPS: readonly MapConfig[] = [MAP_1, MAP_2];

function profileWith(overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  return { ...createPlayerProfile('2026-01-01T00:00:00.000Z', 'map-1'), ...overrides };
}

const PLAYED = profileWith({
  sustainablePeakWpm: 28.4,
  lifetimeCharacters: 4200,
  lifetimeCorrectCharacters: 3990,
  mapProgress: {
    'map-1': {
      completed: true,
      bestScore: 2410.6,
      bestAverageWpm: 24.2,
      bestPeakWpm: 33,
      bestAccuracy: 0.951,
      bestCompletionTimeMs: 51_000,
      attempts: 5,
      bestDistanceMeters: 0,
    },
  },
});

function setup(profile: PlayerProfile) {
  const onBack = vi.fn();
  render(<StatisticsScreen profile={profile} maps={MAPS} onBack={onBack} />);

  return { onBack, user: userEvent.setup() };
}

describe('StatisticsScreen', () => {
  it('leads with the sustainable peak and says what it means', () => {
    setup(PLAYED);

    expect(screen.getByText('28 WPM')).toBeInTheDocument();
    expect(screen.getByText(/not a burst/)).toBeInTheDocument();
  });

  /** The lifetime card, so figures repeated in the table are not ambiguous. */
  function lifetimeCard(): HTMLElement {
    const card = screen.getByRole('heading', { name: 'Lifetime' }).closest('section');
    if (card === null) throw new Error('the lifetime card lost its section');

    return card;
  }

  it('shows lifetime accuracy and volume', () => {
    setup(PLAYED);
    const card = within(lifetimeCard());

    expect(card.getByText('95%')).toBeInTheDocument();
    expect(card.getByText('4200')).toBeInTheDocument();
  });

  it('counts runs and completions across maps', () => {
    setup(PLAYED);
    const card = within(lifetimeCard());

    expect(card.getByText('5')).toBeInTheDocument();
    expect(card.getByText('1 of 2')).toBeInTheDocument();
  });

  it('says nothing has been played yet rather than showing zeroes', () => {
    setup(profileWith());

    expect(screen.getByText(/finish a run and this fills in/)).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('lists every map with its bests', () => {
    setup(PLAYED);
    const table = screen.getByRole('table');
    const rows = within(table).getAllByRole('row');

    // Header plus one row per map.
    expect(rows).toHaveLength(3);

    const mapRow = within(table).getByRole('row', { name: /Neighborhood Dash/ });

    expect(within(mapRow).getByText('2411')).toBeInTheDocument();
    expect(within(mapRow).getByText('95%')).toBeInTheDocument();
    expect(within(mapRow).getByText('24 WPM')).toBeInTheDocument();
  });

  it('marks a locked map and leaves its figures blank', () => {
    setup(PLAYED);
    const table = screen.getByRole('table');

    expect(within(table).getByText(/locked/)).toBeInTheDocument();
    // Never played is not the same as scored nothing.
    expect(within(table).getAllByText('—').length).toBeGreaterThanOrEqual(3);
  });

  it('goes back', async () => {
    const { user, onBack } = setup(PLAYED);

    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
