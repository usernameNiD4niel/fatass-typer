import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { MAPS } from '../../content';
import { createPlayerProfile, type PlayerProfile } from '../../game-core/models';
import { MainMenu } from './MainMenu';
import { hasProgress, highestUnlockedMap } from './menu-progress';

const NOW = '2026-01-01T00:00:00.000Z';

function profileWith(overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  return { ...createPlayerProfile(NOW, 'map-1'), ...overrides };
}

function setup(profile: PlayerProfile, props: Partial<Parameters<typeof MainMenu>[0]> = {}) {
  const handlers = {
    onStart: vi.fn(),
    onMaps: vi.fn(),
    onStatistics: vi.fn(),
    onSettings: vi.fn(),
  };

  render(<MainMenu profile={profile} maps={MAPS} {...handlers} {...props} />);

  return { ...handlers, user: userEvent.setup() };
}

describe('highestUnlockedMap', () => {
  it('is the first map for a fresh profile', () => {
    expect(highestUnlockedMap(profileWith(), MAPS)?.mapNumber).toBe(1);
  });

  it('is the furthest unlocked, not the last one listed', () => {
    const profile = profileWith({ unlockedMapIds: ['map-1'] });

    expect(highestUnlockedMap(profile, MAPS)?.id).toBe('map-1');
  });

  it('handles an empty map list rather than throwing', () => {
    expect(highestUnlockedMap(profileWith(), [])).toBeNull();
  });
});

describe('hasProgress', () => {
  it('is false for a profile that has never played', () => {
    expect(hasProgress(profileWith(), MAPS)).toBe(false);
  });

  it('is true once a map has been attempted', () => {
    const profile = profileWith({
      mapProgress: {
        'map-1': {
          completed: false,
          bestScore: 0,
          bestAverageWpm: 0,
          bestPeakWpm: 0,
          bestAccuracy: 0,
          bestCompletionTimeMs: null,
          attempts: 1,
          bestDistanceMeters: 0,
        },
      },
    });

    expect(hasProgress(profile, MAPS)).toBe(true);
  });

  it('is true once a second map is unlocked', () => {
    expect(hasProgress(profileWith({ unlockedMapIds: ['map-1', 'map-2'] }), MAPS)).toBe(true);
  });
});

describe('MainMenu', () => {
  it('shows the title and the menu actions', () => {
    setup(profileWith());

    expect(screen.getByRole('heading', { level: 1, name: 'Typing Chase' })).toBeInTheDocument();
    for (const name of ['Start', 'Maps', 'Statistics', 'Settings']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('offers no Continue when there is nothing to continue', () => {
    setup(profileWith());

    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
  });

  it('leads with Continue when progress exists', async () => {
    const onContinue = vi.fn();
    const { user } = setup(profileWith({ unlockedMapIds: ['map-1', 'map-2'] }), { onContinue });

    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(onContinue).toHaveBeenCalledTimes(1);
    // Start becomes the secondary action rather than disappearing.
    expect(screen.getByRole('button', { name: 'New run' })).toBeInTheDocument();
  });

  it('raises each action', async () => {
    const { user, onStart, onMaps, onStatistics, onSettings } = setup(profileWith());

    await user.click(screen.getByRole('button', { name: 'Start' }));
    await user.click(screen.getByRole('button', { name: 'Maps' }));
    await user.click(screen.getByRole('button', { name: 'Statistics' }));
    await user.click(screen.getByRole('button', { name: 'Settings' }));

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onMaps).toHaveBeenCalledTimes(1);
    expect(onStatistics).toHaveBeenCalledTimes(1);
    expect(onSettings).toHaveBeenCalledTimes(1);
  });

  it('shows Statistics as unavailable rather than hiding it', () => {
    render(
      <MainMenu
        profile={profileWith()}
        maps={MAPS}
        onStart={vi.fn()}
        onMaps={vi.fn()}
        onSettings={vi.fn()}
      />,
    );

    // Disabled and labelled, so the menu does not silently grow an entry later.
    expect(screen.getByRole('button', { name: 'Statistics — not available yet' })).toBeDisabled();
  });

  it('shows the furthest map with its target speed', () => {
    setup(profileWith());

    expect(screen.getByText('1. Neighborhood Dash')).toBeInTheDocument();
    expect(screen.getByText('Target 20 WPM')).toBeInTheDocument();
  });

  it('shows the sustainable peak, and says what it means', () => {
    setup(profileWith({ sustainablePeakWpm: 34.6 }));

    expect(screen.getByText('35 WPM')).toBeInTheDocument();
    expect(screen.getByText(/not a burst/)).toBeInTheDocument();
  });

  it('does not invent a peak for a player who has never typed', () => {
    setup(profileWith());

    // A dash, not "0 WPM": no peak exists yet, and reporting one would be a lie.
    expect(screen.queryByText('0 WPM')).not.toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('shows lifetime accuracy once something has been typed', () => {
    setup(profileWith({ lifetimeCharacters: 200, lifetimeCorrectCharacters: 186 }));

    expect(screen.getByText('93%')).toBeInTheDocument();
  });

  it('is fully reachable by keyboard', async () => {
    const { user } = setup(profileWith());

    await user.tab();

    expect(screen.getByRole('button', { name: 'Start' })).toHaveFocus();
  });
});
