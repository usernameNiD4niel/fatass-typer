import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { MAP_1 } from '../../content';
import type { MapConfig, PlayerProfile } from '../../game-core/models';
import { createPlayerProfile, EMPTY_MAP_PROGRESS } from '../../game-core/models';
import { mapCardLabel, mapCardModel, openingIndex, unlockRequirementText } from './map-card-model';
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

describe('the carousel', () => {
  const MAP_3: MapConfig = {
    ...MAP_1,
    id: 'map-3',
    mapNumber: 3,
    name: 'Desert Canyon',
    theme: 'desert-canyon',
    targetWpm: 30,
    unlock: { requiresMapId: 'map-2', minimumAccuracy: 0.87 },
  };
  const THREE: readonly MapConfig[] = [MAP_1, MAP_2, MAP_3];

  function carousel(unlocked: readonly string[]) {
    const onSelect = vi.fn();
    render(
      <MapSelection
        maps={THREE}
        profile={profileWith({ unlockedMapIds: unlocked })}
        onSelect={onSelect}
        onBack={vi.fn()}
      />,
    );

    return { onSelect, user: userEvent.setup() };
  }

  const centred = (): HTMLElement => screen.getByRole('button', { pressed: true });

  it('opens on the furthest map the player has unlocked', () => {
    // Not Map 1 every time. A player who has reached Map 3 should not have to
    // press Right twice to get back to where they left off.
    carousel(['map-1', 'map-2', 'map-3']);

    expect(centred()).toHaveAccessibleName(/Map 3: Desert Canyon/);
  });

  it('opens on the first map for a new profile', () => {
    carousel(['map-1']);

    expect(centred()).toHaveAccessibleName(/Map 1: Neighborhood Dash/);
  });

  it('highlights exactly one card at a time', () => {
    carousel(['map-1']);

    expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(1);
  });

  /*
   * The carousel's own affordance. Focus and the centre are the same thing
   * here, so this asserts both: pressing Right must move the highlight *and*
   * take the keyboard with it, or the screen would show one card while Enter
   * started another.
   */
  it('moves along the row with the arrow keys, and takes focus with it', async () => {
    const { user } = carousel(['map-1']);

    await user.tab();
    expect(centred()).toHaveAccessibleName(/Map 1: Neighborhood Dash/);

    await user.keyboard('{ArrowRight}');

    expect(centred()).toHaveAccessibleName(/Map 2: Forest Valley/);
    expect(centred()).toHaveFocus();

    await user.keyboard('{ArrowLeft}');

    expect(centred()).toHaveAccessibleName(/Map 1: Neighborhood Dash/);
    expect(centred()).toHaveFocus();
  });

  it('stops at both ends rather than wrapping', async () => {
    const { user } = carousel(['map-1']);

    await user.tab();
    await user.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}');
    expect(centred()).toHaveAccessibleName(/Map 1: Neighborhood Dash/);

    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}');
    expect(centred()).toHaveAccessibleName(/Map 3: Desert Canyon/);
  });

  it('disables the arrow that would go nowhere', async () => {
    const { user } = carousel(['map-1']);

    expect(screen.getByRole('button', { name: 'Previous map' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next map' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Next map' }));
    await user.click(screen.getByRole('button', { name: 'Next map' }));

    expect(screen.getByRole('button', { name: 'Next map' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous map' })).toBeEnabled();
  });

  /*
   * Tab still walks every card — this carousel deliberately does not use a
   * roving tabindex, because a locked card carries the unlock requirement and
   * spec §12 says a keyboard user has to be able to reach and read it.
   * Centring on focus is what stops that leaving an off-screen card selected.
   */
  it('centres whichever card the keyboard reaches', async () => {
    const { user } = carousel(['map-1']);

    await user.tab();
    await user.tab();

    expect(centred()).toHaveAccessibleName(/Map 2: Forest Valley/);
  });

  it('says where you are in the row, in words', async () => {
    const { user } = carousel(['map-1']);

    expect(screen.getByText(/Neighborhood Dash — 1 of 3/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next map' }));

    expect(screen.getByText(/Forest Valley — 2 of 3/)).toBeInTheDocument();
  });

  it('starts the centred map when it is chosen', async () => {
    const { user, onSelect } = carousel(['map-1', 'map-2']);

    await user.click(centred());

    expect(onSelect).toHaveBeenCalledWith('map-2');
  });
});

describe('openingIndex', () => {
  it('is the last unlocked entry, not the last entry', () => {
    const models = [MAP_1, MAP_2].map((map) =>
      mapCardModel(map, profileWith({ unlockedMapIds: ['map-1'] }), [MAP_1, MAP_2]),
    );

    expect(openingIndex(models)).toBe(0);
  });

  it('falls back to the first card when nothing is unlocked', () => {
    // Should not happen — Map 1 is always unlocked — but a corrupt profile that
    // was repaired field by field could produce it, and opening on nothing is
    // worse than opening on a locked card the player can at least read.
    const models = [MAP_1, MAP_2].map((map) =>
      mapCardModel(map, profileWith({ unlockedMapIds: [] }), [MAP_1, MAP_2]),
    );

    expect(openingIndex(models)).toBe(0);
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
