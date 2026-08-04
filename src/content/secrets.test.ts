import { describe, expect, it } from 'vitest';

import { normalizePromptText } from '../game-core/models';
import { MAPS } from './maps';
import { findSecret, MAP_SECRETS, secretPrompts, secretWordCount } from './secrets';

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
