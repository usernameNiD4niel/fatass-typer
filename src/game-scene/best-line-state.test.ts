import { describe, expect, it } from 'vitest';

import { bestLineState, TRAIL_METERS, VISIBLE_AHEAD_METERS } from './best-line-state';

/**
 * The best-distance gate (plan 2.2).
 *
 * The endless mode's entire content is beating a number, and this is where that
 * number stops being a number and becomes a thing on the road. Whether it is on
 * screen and whether it has been passed are decisions, so they are tested here
 * rather than left inside a render loop.
 */

describe('the best-distance gate', () => {
  it('is not drawn at all on a first run', () => {
    // No best yet, and a gate at zero metres would sit under the player's feet
    // on the start line.
    expect(bestLineState(0, 0).visible).toBe(false);
    expect(bestLineState(0, 500).visible).toBe(false);
  });

  it('stays out of sight until it is worth looking at', () => {
    expect(bestLineState(1_000, 0).visible).toBe(false);
    expect(bestLineState(1_000, 1_000 - VISIBLE_AHEAD_METERS + 1).visible).toBe(true);
  });

  it('is ahead of the player until they reach it', () => {
    const approaching = bestLineState(1_000, 900);

    expect(approaching.aheadMeters).toBe(100);
    expect(approaching.beaten).toBe(false);
  });

  it('reads as beaten the moment it is behind them', () => {
    // Not at some margin past it. They crossed it; saying so late would be
    // describing a different event.
    expect(bestLineState(1_000, 1_000).beaten).toBe(true);
    expect(bestLineState(1_000, 1_000.5).beaten).toBe(true);
  });

  it('stays on screen for a while after being passed', () => {
    // The reward is watching it recede. Deleting it at the moment of crossing
    // would throw away the only evidence the run is going well.
    expect(bestLineState(1_000, 1_020).visible).toBe(true);
    expect(bestLineState(1_000, 1_000 + TRAIL_METERS + 1).visible).toBe(false);
  });
});
