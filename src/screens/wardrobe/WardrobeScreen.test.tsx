import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SKINS } from '../../content/skins';
import { createPlayerProfile, type PlayerProfile } from '../../game-core/models';
import { equippedSkin } from '../../game-core/wardrobe';
import { WardrobeScreen } from './WardrobeScreen';

function profileWith(overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  return { ...createPlayerProfile('2026-01-01T00:00:00.000Z', 'map-1'), ...overrides };
}

function setup(profile: PlayerProfile = profileWith()) {
  const onChange = vi.fn();
  const onBack = vi.fn();
  render(<WardrobeScreen profile={profile} onChange={onChange} onBack={onBack} />);

  return { onChange, onBack, user: userEvent.setup() };
}

describe('WardrobeScreen', () => {
  it('says what is in the purse', () => {
    setup(profileWith({ credits: 640 }));

    expect(screen.getByText('640')).toBeInTheDocument();
  });

  it('says plainly that none of it makes you faster', () => {
    // The promise the whole feature rests on. If it stops being true, this test
    // is the reminder that the copy is now a lie.
    setup();

    expect(screen.getByText(/none of it makes you faster/i)).toBeInTheDocument();
  });

  it('buys a skin when there are credits for it, and wears it', () => {
    const profile = profileWith({ credits: 5_000 });
    const { onChange } = setup(profile);

    const paid = SKINS.find((skin) => skin.category === 'character' && skin.price > 0);
    expect(paid).toBeDefined();

    screen.getByRole('button', { name: `${String(paid?.price ?? 0)} cr` }).click();

    const next = onChange.mock.calls[0]?.[0] as PlayerProfile;
    expect(next.credits).toBe(5_000 - (paid?.price ?? 0));
    expect(equippedSkin(next, SKINS, 'character')?.id).toBe(paid?.id);
  });

  it('offers nothing it cannot pay for, and says why', () => {
    setup(profileWith({ credits: 0 }));

    const paid = SKINS.find((skin) => skin.category === 'character' && skin.price > 0);
    // Disabled *and* named: a greyed-out price with no explanation is a dead
    // control to anybody who cannot see the credit counter.
    const button = screen.getByRole('button', {
      name: `${paid?.name ?? ''} — ${String(paid?.price ?? 0)} credits, not enough`,
    });

    expect(button).toBeDisabled();
  });

  it('marks what is being worn in words, not only in colour', () => {
    setup();

    // Spec §12: the border says it too, but the border alone would not.
    expect(screen.getAllByText('Worn').length).toBeGreaterThan(0);
  });

  it('switches between the three kinds', async () => {
    const { user } = setup();

    await user.click(screen.getByRole('tab', { name: 'Shoes' }));

    expect(screen.getByRole('tab', { name: 'Shoes' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Seen from behind, every stride.')).toBeInTheDocument();
  });

  it('goes back', async () => {
    const { user, onBack } = setup();

    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
