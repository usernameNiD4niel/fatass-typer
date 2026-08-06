import { describe, expect, it } from 'vitest';

import { effectiveCharacterCount, isPromptEntry } from '../game-core/models';
import { pickSurge, SURGE_MAX_MS } from '../game-core/surge';
import { requiredWpm } from '../game-core/timing';
import { MAPS } from './maps';
import { SURGES } from './surges';

/**
 * The surge sentences, against every map.
 *
 * The one thing that has to be true of all of them: a typist at the map's own
 * advertised speed can finish the sentence that map hands them, inside the cap.
 * An unfinishable reward is a punishment wearing a reward's clothes.
 */

describe('surge sentences', () => {
  it('are all well-formed prompts', () => {
    for (const surge of SURGES) expect(isPromptEntry(surge)).toBe(true);
  });

  it('give every map one its own audience can finish in time', () => {
    for (const map of MAPS) {
      const picked = pickSurge(SURGES, map, 0);
      expect(picked, map.id).toBeDefined();
      if (picked === undefined) continue;

      const demanded = requiredWpm(effectiveCharacterCount(picked), SURGE_MAX_MS);
      expect(demanded, `${map.id}: ${picked.normalizedText}`).toBeLessThanOrEqual(map.targetWpm);
    }
  });

  it('ask the fast maps for more than the slow ones', () => {
    const first = MAPS[0];
    const last = MAPS[MAPS.length - 1];
    if (first === undefined || last === undefined) throw new Error('no maps');

    const early = pickSurge(SURGES, first, 0);
    const late = pickSurge(SURGES, last, 0);
    if (early === undefined || late === undefined) throw new Error('no surge for a map');

    expect(effectiveCharacterCount(late)).toBeGreaterThan(effectiveCharacterCount(early));
  });

  it('rotate rather than repeating the same sentence every minute', () => {
    const map = MAPS[MAPS.length - 1];
    if (map === undefined) throw new Error('no map');

    expect(pickSurge(SURGES, map, 0)?.id).not.toBe(pickSurge(SURGES, map, 1)?.id);
  });
});
