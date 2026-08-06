import { describe, expect, it } from 'vitest';

import { MAP_1, MAP_6, MAPS } from '../../content/maps';
import { flowBufferFor } from '../flow';
import { DEFAULT_PURSUIT } from './pursuit';
import { neutralMarginFor, NEUTRAL_TYPIST_SHARE, pursuitConfigFor } from './tuning';

describe('neutralMarginFor', () => {
  it('is the margin a typist at the band floor actually produces', () => {
    const expected = 1 - 1 / NEUTRAL_TYPIST_SHARE / flowBufferFor(MAP_1);

    expect(neutralMarginFor(MAP_1)).toBeCloseTo(expected, 9);
  });

  it('falls as the ladder tightens, because there is less budget to spare', () => {
    /*
     * Worth stating, because it reads backwards at first: the later maps have a
     * *lower* break-even margin, not a higher one.
     *
     * Margin is the fraction of the budget left over, and a tighter buffer
     * leaves less of it over for everybody. What makes Map 6 hard is not the
     * break-even point — it is that the same fraction has to be earned at 50
     * WPM instead of 20, and that its buffer is small enough for a slow typist
     * to start lapsing words outright.
     */
    expect(neutralMarginFor(MAP_6)).toBeLessThan(neutralMarginFor(MAP_1));
  });

  it('leaves every map somewhere a run can actually reach', () => {
    for (const map of MAPS) {
      const neutral = neutralMarginFor(map);

      expect(neutral, map.id).toBeGreaterThan(0);
      // Above the margin a typist at the advertised speed produces, and the map
      // would be unwinnable at its own number.
      expect(neutral, map.id).toBeLessThan(1 - 1 / flowBufferFor(map));
    }
  });
});

describe('pursuitConfigFor', () => {
  it('changes the break-even point and nothing else', () => {
    const config = pursuitConfigFor(MAP_1);

    expect(config.neutralMargin).toBeCloseTo(neutralMarginFor(MAP_1), 9);
    expect(config.startMeters).toBe(DEFAULT_PURSUIT.startMeters);
    expect(config.metersPerMargin).toBe(DEFAULT_PURSUIT.metersPerMargin);
    expect(config.flowMissMeters).toBe(DEFAULT_PURSUIT.flowMissMeters);
  });
});
