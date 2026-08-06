import { describe, expect, it } from 'vitest';

import { createPlayerProfile, type PlayerProfile } from '../models';
import {
  buySkin,
  canAfford,
  creditsFor,
  equippedSkin,
  equipSkin,
  owns,
  refusalFor,
  type Skin,
} from './wardrobe';

const FREE: Skin = {
  id: 'shoes-default',
  category: 'shoes',
  name: 'Worn trainers',
  description: '',
  price: 0,
  colors: { primary: '#000000' },
};

const PAID: Skin = {
  id: 'shoes-gold',
  category: 'shoes',
  name: 'Gold pair',
  description: '',
  price: 900,
  colors: { primary: '#e8b53a' },
};

const CATALOGUE = [FREE, PAID];

function profileWith(credits: number, overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  return { ...createPlayerProfile('2026-01-01T00:00:00.000Z', 'map-1'), credits, ...overrides };
}

describe('owning', () => {
  it('gives everybody the free skins', () => {
    // A save that had to *record* the free items would be a save that could
    // lose them.
    expect(owns(profileWith(0), FREE)).toBe(true);
    expect(owns(profileWith(0), PAID)).toBe(false);
  });
});

describe('buying', () => {
  it('charges the price and hands over the skin', () => {
    const bought = buySkin(profileWith(1_000), PAID);

    expect(bought.credits).toBe(100);
    expect(owns(bought, PAID)).toBe(true);
  });

  it('wears what was just bought', () => {
    // Nobody spends nine hundred credits on gold shoes in order to keep
    // wearing the old ones.
    const bought = buySkin(profileWith(1_000), PAID);

    expect(equippedSkin(bought, CATALOGUE, 'shoes')?.id).toBe(PAID.id);
  });

  it('refuses what cannot be afforded, and changes nothing', () => {
    const poor = profileWith(100);

    expect(refusalFor(poor, PAID)).toBe('too-expensive');
    expect(buySkin(poor, PAID)).toBe(poor);
  });

  it('cannot be charged twice for the same thing', () => {
    // A double-click is one purchase.
    const once = buySkin(profileWith(2_000), PAID);
    const twice = buySkin(once, PAID);

    expect(twice.credits).toBe(once.credits);
    expect(refusalFor(once, PAID)).toBe('already-owned');
  });

  it('never spends more than is in the purse', () => {
    expect(canAfford(profileWith(899), PAID)).toBe(false);
    expect(canAfford(profileWith(900), PAID)).toBe(true);
  });
});

describe('wearing', () => {
  it('refuses to equip something unowned', () => {
    const poor = profileWith(0);

    expect(equipSkin(poor, PAID)).toBe(poor);
  });

  it('falls back to the free skin when the profile names a stranger', () => {
    // A renamed or retired skin leaves a profile pointing at nothing, and the
    // fix for that is a default rather than a crash.
    const odd = profileWith(0, { equippedSkinIds: { shoes: 'shoes-that-never-existed' } });

    expect(equippedSkin(odd, CATALOGUE, 'shoes')?.id).toBe(FREE.id);
  });

  it('falls back when the profile names something it does not own', () => {
    const cheeky = profileWith(0, { equippedSkinIds: { shoes: PAID.id } });

    expect(equippedSkin(cheeky, CATALOGUE, 'shoes')?.id).toBe(FREE.id);
  });
});

describe('earning', () => {
  it('pays for the place and for the coins', () => {
    const earned = creditsFor({ placement: 1, coinsCollected: 10, completed: true });

    expect(earned.placement).toBeGreaterThan(0);
    expect(earned.coins).toBeGreaterThan(0);
    expect(earned.total).toBe(earned.placement + earned.coins);
  });

  it('pays a beaten player something, so the wardrobe is not only for winners', () => {
    const third = creditsFor({ placement: 3, coinsCollected: 4, completed: true });

    expect(third.total).toBeGreaterThan(0);
  });

  it('pays more for winning than for coming third', () => {
    const first = creditsFor({ placement: 1, coinsCollected: 0, completed: true });
    const third = creditsFor({ placement: 3, coinsCollected: 0, completed: true });

    expect(first.total).toBeGreaterThan(third.total);
  });

  it('pays nothing for a run the chaser ended', () => {
    // Otherwise the shortest possible run is the most efficient way to earn.
    expect(creditsFor({ placement: 1, coinsCollected: 20, completed: false }).total).toBe(0);
  });
});
