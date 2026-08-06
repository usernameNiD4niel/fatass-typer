import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { MAP_1 } from '../../content';
import type { MapConfig, PlayerProfile } from '../../game-core/models';
import { createPlayerProfile, EMPTY_MAP_PROGRESS } from '../../game-core/models';
import { mapCardLabel, mapCardModel, unlockRequirementText } from './map-card-model';
import { MapSelection } from './MapSelection';

/** Map 2 does not exist until step F3, so the locked cases use a stand-in. */
const MAP_2: MapConfig = {
  ...MAP_1,
  id: 'map-2',
  mapNumber: 2,
  name: 'Forest Valley',
  theme: 'forest-valley',
  targetWpm: 26,
  unlock: { requiresMapId: 'map-1', minimumAccuracy: 0.85 },
};

const MAPS: readonly MapConfig[] = [MAP_1, MAP_2];

function profileWith(overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  return { ...createPlayerProfile('2026-01-01T00:00:00.000Z', 'map-1'), ...overrides };
}

const PLAYED = {
  completed: true,
  bestScore: 1840.6,
  bestAverageWpm: 24,
  bestPeakWpm: 31,
  bestAccuracy: 0.937,
  bestCompletionTimeMs: 48_000,
  attempts: 3,
  bestDistanceMeters: 0,
};

function setup(profile: PlayerProfile = profileWith()) {
  const onSelect = vi.fn();
  const onBack = vi.fn();
  render(<MapSelection maps={MAPS} profile={profile} onSelect={onSelect} onBack={onBack} />);

  return { onSelect, onBack, user: userEvent.setup() };
}

describe('unlockRequirementText', () => {
  it('is null for a map that needs nothing', () => {
    expect(unlockRequirementText(MAP_1, MAPS)).toBeNull();
  });

  it('names the map to beat and the accuracy needed', () => {
    expect(unlockRequirementText(MAP_2, MAPS)).toBe(
      'Finish Neighborhood Dash with 85% accuracy to unlock',
    );
  });

  it('drops the accuracy clause when there is no accuracy gate', () => {
    const noGate: MapConfig = { ...MAP_2, unlock: { requiresMapId: 'map-1', minimumAccuracy: 0 } };

    expect(unlockRequirementText(noGate, MAPS)).toBe('Finish Neighborhood Dash to unlock');
  });

  it('copes with a prerequisite that is not in the list', () => {
    const dangling: MapConfig = {
      ...MAP_2,
      unlock: { requiresMapId: 'map-99', minimumAccuracy: 0.9 },
    };

    expect(unlockRequirementText(dangling, MAPS)).toContain('the previous map');
  });
});

describe('mapCardLabel', () => {
  it('says everything a locked card shows', () => {
    const model = mapCardModel(MAP_2, profileWith(), MAPS);

    expect(mapCardLabel(model)).toBe(
      'Map 2: Forest Valley, target 26 WPM, Finish Neighborhood Dash with 85% accuracy to unlock',
    );
  });

  it('reports completion and bests for a played map', () => {
    const model = mapCardModel(MAP_1, profileWith({ mapProgress: { 'map-1': PLAYED } }), MAPS);
    const label = mapCardLabel(model);

    expect(label).toContain('completed');
    expect(label).toContain('best score 1841');
    expect(label).toContain('best accuracy 94%');
  });

  it('says so plainly when a map has not been finished', () => {
    expect(mapCardLabel(mapCardModel(MAP_1, profileWith(), MAPS))).toContain('not completed yet');
  });
});

describe('MapSelection', () => {
  it('lists every map, locked ones included', () => {
    setup();

    expect(screen.getByRole('heading', { name: 'Neighborhood Dash' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Forest Valley' })).toBeInTheDocument();
  });

  it('shows each map’s target speed and theme', () => {
    setup();

    expect(screen.getByText('20 WPM')).toBeInTheDocument();
    expect(screen.getByText('neighborhood')).toBeInTheDocument();
    expect(screen.getByText('forest valley')).toBeInTheDocument();
  });

  it('chooses an unlocked map', async () => {
    const { user, onSelect } = setup();

    await user.click(screen.getByRole('button', { name: /Map 1: Neighborhood Dash/ }));

    expect(onSelect).toHaveBeenCalledWith('map-1');
  });

  it('will not start a locked map', async () => {
    const { user, onSelect } = setup();
    const locked = screen.getByRole('button', { name: /Map 2: Forest Valley/ });

    // Announced as unavailable but still focusable: the unlock requirement is
    // written on this card, and `disabled` would take it out of the tab order
    // for the very players who most need to read it (spec §12).
    expect(locked).toHaveAttribute('aria-disabled', 'true');
    await user.click(locked);

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('lets a keyboard user reach a locked map to read why it is locked', async () => {
    const { user } = setup();

    await user.tab();
    await user.tab();

    expect(screen.getByRole('button', { name: /Map 2: Forest Valley/ })).toHaveFocus();
  });

  it('says what would unlock a locked map, in words', () => {
    setup();

    expect(
      screen.getByText('Finish Neighborhood Dash with 85% accuracy to unlock'),
    ).toBeInTheDocument();
    // "Locked" as a word, not only a colour or an icon.
    expect(screen.getByText('Locked')).toBeInTheDocument();
  });

  it('shows bests once a map has been played, and says so when it has not', () => {
    setup(profileWith({ mapProgress: { 'map-1': PLAYED } }));

    expect(screen.getByText('Best 1841')).toBeInTheDocument();
    expect(screen.getByText('94% accuracy')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('says a map is unplayed rather than showing a zero best', () => {
    setup();

    expect(screen.getByText('Not played yet')).toBeInTheDocument();
    expect(screen.queryByText('Best 0')).not.toBeInTheDocument();
  });

  it('goes back', async () => {
    const { user, onBack } = setup();

    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('reaches the first playable map by keyboard', async () => {
    const { user } = setup();

    await user.tab();

    expect(screen.getByRole('button', { name: /Map 1: Neighborhood Dash/ })).toHaveFocus();
  });
});

describe('the endless map', () => {
  it('shows distance rather than a map number and a completion badge', () => {
    const endless: MapConfig = { ...MAP_1, id: 'endless', name: 'Endless', distanceMeters: 0 };
    const profile = profileWith({
      unlockedMapIds: ['map-1', 'endless'],
      mapProgress: {
        endless: {
          ...EMPTY_MAP_PROGRESS,
          attempts: 3,
          bestAccuracy: 0.9,
          bestDistanceMeters: 2_450,
        },
      },
    });

    render(
      <MapSelection
        maps={[MAP_1, endless]}
        profile={profile}
        onSelect={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    // "Map 7" would be a lie about the progression, and "Completed" is not
    // something that can happen to a map with no finish line.
    expect(screen.getByText('No finish line')).toBeInTheDocument();
    expect(screen.getByText('Furthest 2.45 km')).toBeInTheDocument();
  });
});
