import { describe, expect, it } from 'vitest';

import {
  BOOSTING_THRESHOLD,
  COASTING_FLOOR,
  decayMomentum,
  MISTAKE_COST,
  MARGIN_BAND_CEILING,
  MARGIN_FLOOR_SHARE,
  momentumMultiplier,
  momentumShare,
  penaliseMomentum,
  topUpMomentum,
} from './momentum';

describe('momentumShare', () => {
  it('pays a floor even for a word finished by a hair', () => {
    // The map's own audience is a typist at exactly its speed. Leaving them at
    // base speed would make the map slower than its label.
    expect(momentumShare(0)).toBeCloseTo(MARGIN_FLOOR_SHARE);
  });

  it('pays everything at the top of the band, and no more above it', () => {
    expect(momentumShare(MARGIN_BAND_CEILING)).toBeCloseTo(1);
    expect(momentumShare(0.95)).toBeCloseTo(1);
  });

  it('rewards typing faster than the deadline demands', () => {
    expect(momentumShare(0.5)).toBeGreaterThan(momentumShare(0.25));
  });
});

describe('decayMomentum', () => {
  it('falls back toward the coasting floor, not toward nothing', () => {
    // Speed is kept, not leaked: a player who stops typing coasts at the pace
    // the map's own audience holds rather than watching the road sag.
    expect(decayMomentum(1, 3_000, 3_000)).toBe(COASTING_FLOOR);
    expect(decayMomentum(1, 1_500, 3_000)).toBeCloseTo(0.5);
  });

  it('never falls below the floor, however long the pause', () => {
    expect(decayMomentum(0.9, 10_000, 3_000)).toBe(COASTING_FLOOR);
    expect(decayMomentum(COASTING_FLOOR, 10_000, 3_000)).toBe(COASTING_FLOOR);
  });

  it('never hands the floor to somebody who has not earned it', () => {
    // A run opens at base speed. Raising momentum to the floor here would give
    // every player a free boost for doing nothing.
    expect(decayMomentum(0, 1_000, 3_000)).toBe(0);
    expect(decayMomentum(0.1, 1_000, 3_000)).toBe(0.1);
  });
});

describe('penaliseMomentum', () => {
  it('costs a wrong character a little speed', () => {
    expect(penaliseMomentum(0.8)).toBeCloseTo(0.8 - MISTAKE_COST);
  });

  it('is a dip, not a punishment', () => {
    // A mistake already breaks the combo and hands the chaser ground. One
    // should be felt; a single one should not undo a good stretch of typing.
    expect(penaliseMomentum(1) - penaliseMomentum(1) * 0).toBeGreaterThan(0.85);
  });

  it('never drives momentum negative', () => {
    expect(penaliseMomentum(0.01)).toBe(0);
  });
});

describe('topUpMomentum', () => {
  it('takes the better of what is held and what was earned', () => {
    expect(topUpMomentum(0.8, 0.4)).toBeCloseTo(0.8);
    expect(topUpMomentum(0.4, 0.8)).toBeCloseTo(0.8);
  });

  it('does not bank speed past full', () => {
    // Adding rather than taking the better would let a run of easy words buy
    // speed that outlives the typing that earned it.
    expect(topUpMomentum(0.9, 1)).toBe(1);
  });
});

describe('momentumMultiplier', () => {
  it('is base speed at nothing and the map ceiling at full', () => {
    expect(momentumMultiplier(0, 1.5)).toBe(1);
    expect(momentumMultiplier(1, 1.5)).toBeCloseTo(1.5);
  });

  it('never exceeds the map ceiling, whatever it is handed', () => {
    // Placement is measured against that ceiling; exceeding it would let the
    // player arrive early at a deadline that assumed they could not.
    expect(momentumMultiplier(4, 1.5)).toBeCloseTo(1.5);
  });
});

describe('BOOSTING_THRESHOLD', () => {
  it('leaves an edge for the boost events to fire on', () => {
    expect(BOOSTING_THRESHOLD).toBeGreaterThan(0);
    expect(BOOSTING_THRESHOLD).toBeLessThan(MARGIN_FLOOR_SHARE);
  });
});
