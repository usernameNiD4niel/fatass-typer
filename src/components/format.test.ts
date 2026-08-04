import { describe, expect, it } from 'vitest';

import { formatDistance } from './format';

describe('formatDistance', () => {
  it('uses whole metres below a kilometre', () => {
    // The difference between 380 and 390 is a real difference to somebody
    // chasing their own best, and "0.4 km" throws it away.
    expect(formatDistance(384.6)).toBe('385 m');
    expect(formatDistance(0)).toBe('0 m');
  });

  it('switches to kilometres once the metres stop mattering', () => {
    expect(formatDistance(1_000)).toBe('1.00 km');
    expect(formatDistance(12_345)).toBe('12.35 km');
  });

  it('refuses to render nonsense as a distance', () => {
    // It is fed a stored number, and a stored number can be anything.
    expect(formatDistance(Number.NaN)).toBe('0 m');
    expect(formatDistance(-50)).toBe('0 m');
    expect(formatDistance(Number.POSITIVE_INFINITY)).toBe('0 m');
  });
});
