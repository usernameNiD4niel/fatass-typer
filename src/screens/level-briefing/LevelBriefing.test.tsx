import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { MAP_1, obstaclesFor } from '../../content';
import type { PlayerProfile } from '../../game-core/models';
import { createPlayerProfile } from '../../game-core/models';
import { LevelBriefing } from './LevelBriefing';

function profileWith(overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  return { ...createPlayerProfile('2026-01-01T00:00:00.000Z', 'map-1'), ...overrides };
}

function setup(
  profile: PlayerProfile = profileWith(),
  obstacles = obstaclesFor(MAP_1.content.obstacleIds),
) {
  const onStart = vi.fn();
  const onBack = vi.fn();

  render(
    <LevelBriefing
      map={MAP_1}
      profile={profile}
      obstacles={obstacles}
      onStart={onStart}
      onBack={onBack}
    />,
  );

  return { onStart, onBack, user: userEvent.setup() };
}

describe('LevelBriefing', () => {
  it('names the map it is briefing', () => {
    setup();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Neighborhood Dash' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Map 1')).toBeInTheDocument();
  });

  it('states what the map asks of the player', () => {
    setup();

    expect(screen.getByText('20 WPM')).toBeInTheDocument();
    // Read from the map rather than written down here: the distance is tuning,
    // and a test that hard-codes it fails every time the map is retuned without
    // telling anyone anything useful.
    expect(screen.getByText(`${String(MAP_1.distanceMeters)} m`)).toBeInTheDocument();
    // A length, not a mystery.
    expect(screen.getByText(/^\d+ s$/)).toBeInTheDocument();
  });

  it('lists the obstacles and how to get past each one', () => {
    setup();

    expect(screen.getByText('Fallen crate')).toBeInTheDocument();
    expect(screen.getAllByText(/type the prompt to jump past it/).length).toBeGreaterThan(0);
  });

  it('says the map has no obstacles rather than showing an empty list', () => {
    setup(profileWith(), []);

    expect(screen.getByText('None')).toBeInTheDocument();
    expect(screen.queryByText('What you will meet')).not.toBeInTheDocument();
  });

  it('admits when the player has never run this map', () => {
    setup();

    expect(screen.getByText('You have not run this map yet.')).toBeInTheDocument();
  });

  it('shows previous bests once there are any', () => {
    setup(
      profileWith({
        mapProgress: {
          'map-1': {
            completed: true,
            bestScore: 2410.4,
            bestAverageWpm: 25,
            bestPeakWpm: 33,
            bestAccuracy: 0.912,
            bestCompletionTimeMs: 51_000,
            attempts: 4,
          },
        },
      }),
    );

    expect(screen.getByText('2410')).toBeInTheDocument();
    expect(screen.getByText('91%')).toBeInTheDocument();
    // Scoped: the obstacle count is also a small number, and an unscoped query
    // for it matches whichever the map happens to have that day.
    expect(screen.getByText('Attempts').nextElementSibling).toHaveTextContent('4');
    expect(screen.getByText('Yes')).toBeInTheDocument();
  });

  it('starts the run when the player is ready', async () => {
    const { user, onStart } = setup();

    await user.click(screen.getByRole('button', { name: 'Start run' }));

    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('goes back to the maps', async () => {
    const { user, onBack } = setup();

    await user.click(screen.getByRole('button', { name: 'Back to maps' }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('puts Start first in the tab order', async () => {
    const { user } = setup();

    await user.tab();

    expect(screen.getByRole('button', { name: 'Start run' })).toHaveFocus();
  });
});
