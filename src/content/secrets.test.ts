import { describe, expect, it } from 'vitest';

import { normalizePromptText } from '../game-core/models';
import { MAPS } from './maps';
import {
  findSecret,
  findSecretById,
  MAP_SECRETS,
  pickSecret,
  secretIdOf,
  secretPrompts,
  secretsFor,
  secretWordCount,
} from './secrets';

/**
 * The sentence every run assembles.
 *
 * Content rules, checked rather than trusted: a sentence with a comma in it or
 * a word Map 1 has no business asking for would not fail anywhere else until a
 * player met it.
 */

describe('map secrets', () => {
  it('gives every map one', () => {
    for (const map of MAPS) {
      expect(findSecret(map.id), map.id).toBeDefined();
    }
  });

  it('carries no punctuation and no capitals', () => {
    // Map 1 ships no punctuation prompts on purpose. A sentence that spans every
    // map cannot carry commas on one and not another.
    for (const secret of MAP_SECRETS) {
      expect(secret.sentence, secret.mapId).toMatch(/^[a-z ]+$/);
      expect(secret.sentence).toBe(normalizePromptText(secret.sentence));
    }
  });

  it('is long enough to last a run and short enough to finish one', () => {
    for (const secret of MAP_SECRETS) {
      const words = secretWordCount(secret);

      /*
       * Below this the sentence is done in the first minute; above it, nobody
       * ever reads the ending.
       *
       * The ceiling is set by how much a run can *carry*, and that is a function
       * of the map's speed rather than of taste: Map 1 asks for 20 WPM, so a run
       * of it is about forty words long however the sentence is written, while
       * Map 6 at 50 WPM carries half as many again. `map-progression.test.ts`
       * checks each sentence against its own map.
       */
      expect(words, secret.mapId).toBeGreaterThanOrEqual(34);
      expect(words, secret.mapId).toBeLessThanOrEqual(70);
    }
  });

  it('gives every word its own identity', () => {
    // "the" appears eleven times in Map 1's sentence. Ids key repeat-avoidance
    // and the sentence's own progress, so they carry the position, not the text.
    for (const secret of MAP_SECRETS) {
      const prompts = secretPrompts(secret);
      const ids = new Set(prompts.map((prompt) => prompt.id));

      expect(ids.size, secret.mapId).toBe(prompts.length);
    }
  });

  it('produces prompts that are consistent with themselves', () => {
    for (const secret of MAP_SECRETS) {
      for (const prompt of secretPrompts(secret)) {
        expect(prompt.normalizedText).toBe(normalizePromptText(prompt.text));
        expect(prompt.normalizedText.length).toBeGreaterThan(0);
        expect(prompt.minimumMap).toBe(1);
      }
    }
  });

  it('says something worth unlocking', () => {
    for (const secret of MAP_SECRETS) {
      expect(secret.title.length, secret.mapId).toBeGreaterThan(3);
      expect(secret.lore.length, secret.mapId).toBeGreaterThan(120);
    }
  });
});

describe('choosing one', () => {
  it('gives every map more than one, so a replay is not the same run', () => {
    /*
     * The whole reason this exists. Every prompt in a run is the next word of
     * the map's sentence, so one sentence per map means the identical words in
     * the identical order however many times it is played.
     */
    for (const map of MAPS) {
      expect(secretsFor(map.id).length, map.id).toBeGreaterThan(1);
    }
  });

  it('picks a different one for different runs', () => {
    const map = MAPS[0];
    if (map === undefined) throw new Error('no map');

    const drawn = new Set(
      Array.from({ length: 40 }, (_, index) => pickSecret(map.id, `run-${String(index)}`)?.title),
    );

    expect(drawn.size).toBeGreaterThan(1);
  });

  it('picks the same one for the same seed', () => {
    // Seeded rather than random: a run has to be reproducible from its seed,
    // and the sentence is most of what a run is.
    const map = MAPS[0];
    if (map === undefined) throw new Error('no map');

    expect(pickSecret(map.id, 'fixed')?.title).toBe(pickSecret(map.id, 'fixed')?.title);
  });

  it('resolves a played secret by its own id', () => {
    for (const secret of MAP_SECRETS) {
      expect(findSecretById(secretIdOf(secret))?.title).toBe(secret.title);
    }
  });

  it('gives every secret a distinct id', () => {
    const ids = new Set(MAP_SECRETS.map(secretIdOf));

    expect(ids.size).toBe(MAP_SECRETS.length);
  });
});
