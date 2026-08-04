import { describe, expect, it } from 'vitest';

import {
  isMapConfig,
  isObstacleDefinition,
  isPromptEntry,
  MAP_THEMES,
  PROMPT_CATEGORIES,
} from '../game-core/models';
import { MAPS } from './maps';
import { findObstacle, OBSTACLES, obstaclesFor } from './obstacles';
import {
  ALL_PROMPTS,
  NUMBERS,
  promptsForMap,
  promptsInCategory,
  PUNCTUATION,
  THEMED_WORDS,
} from './prompts';

/**
 * Content is data, so the tests are validation: every entry has to satisfy the
 * same guards a corrupt save would be checked against, and the cross-references
 * between maps and obstacles have to resolve.
 */

describe('obstacle definitions', () => {
  it('defines five jump hazards and three cars', () => {
    expect(OBSTACLES.map((obstacle) => obstacle.id).sort()).toEqual(
      [
        'rock',
        'crate',
        'low-barrier',
        'cone-beam',
        'roadwork-barrier',
        'sedan',
        'van',
        'box-truck',
      ].sort(),
    );
  });

  it('validates every definition', () => {
    for (const obstacle of OBSTACLES) {
      expect(isObstacleDefinition(obstacle)).toBe(true);
    }
  });

  it('gives every obstacle a unique id', () => {
    expect(new Set(OBSTACLES.map((obstacle) => obstacle.id)).size).toBe(OBSTACLES.length);
  });

  it('gives every hazard one of the two verbs', () => {
    const actions = Object.fromEntries(OBSTACLES.map((o) => [o.id, o.action]));

    expect(actions).toMatchObject({
      rock: 'jump',
      crate: 'jump',
      'low-barrier': 'jump',
      'cone-beam': 'jump',
      'roadwork-barrier': 'jump',
      sedan: 'lane-change',
      van: 'lane-change',
      'box-truck': 'lane-change',
    });
  });

  it('asks for a word, never a phrase', () => {
    // A phrase inside the seconds a hazard gives you is a different game. Words
    // only, and the length of the word is the difficulty dial.
    const phrases = OBSTACLES.filter((o) => o.promptCategory.endsWith('phrase'));

    expect(phrases).toEqual([]);
  });

  it('keeps the harder obstacles off the early maps', () => {
    for (const obstacle of OBSTACLES) {
      if (obstacle.difficultyWeight >= 0.5) expect(obstacle.minimumMap).toBeGreaterThan(1);
    }
  });

  it('gives every obstacle a reaction allowance', () => {
    for (const obstacle of OBSTACLES) {
      expect(obstacle.baseReactionTimeMs).toBeGreaterThan(0);
    }
  });

  it('resolves ids to definitions and skips unknown ones', () => {
    expect(findObstacle('crate')?.label).toBe('Fallen crate');
    expect(findObstacle('not-real')).toBeUndefined();
    expect(obstaclesFor(['sedan', 'not-real']).map((o) => o.id)).toEqual(['sedan']);
  });
});

describe('maps', () => {
  it('validates every map config', () => {
    for (const map of MAPS) {
      expect(isMapConfig(map)).toBe(true);
    }
  });

  it('only references obstacles that exist and are allowed on it', () => {
    for (const map of MAPS) {
      for (const id of map.content.obstacleIds) {
        const obstacle = findObstacle(id);

        expect(obstacle).toBeDefined();
        expect(obstacle?.minimumMap).toBeLessThanOrEqual(map.mapNumber);
      }
    }
  });

  it('has prompts available for every category a map draws from', () => {
    for (const map of MAPS) {
      for (const category of map.content.promptCategories) {
        const available = ALL_PROMPTS.filter(
          (prompt) => prompt.category === category && prompt.minimumMap <= map.mapNumber,
        );

        expect(available.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('prompts', () => {
  it('validates every prompt', () => {
    for (const prompt of ALL_PROMPTS) {
      expect(isPromptEntry(prompt)).toBe(true);
    }
  });

  it('gives every prompt a unique id and unique text', () => {
    expect(new Set(ALL_PROMPTS.map((p) => p.id)).size).toBe(ALL_PROMPTS.length);
    expect(new Set(ALL_PROMPTS.map((p) => p.text)).size).toBe(ALL_PROMPTS.length);
  });

  it('has no ambiguous whitespace', () => {
    for (const prompt of ALL_PROMPTS) {
      expect(prompt.text).toBe(prompt.text.trim());
      expect(prompt.text).not.toMatch(/\s{2,}/);
      expect(prompt.normalizedText).toBe(prompt.text.toLowerCase());
      // A tab or a newline in a prompt is untypeable in a single-line field.
      expect(prompt.text).not.toMatch(/[\t\n\r]/);
    }
  });

  it('uses only characters a physical keyboard produces directly', () => {
    // Smart quotes and non-breaking spaces look identical to their plain
    // counterparts and are impossible to type — a prompt containing one would
    // be unwinnable and the player would never know why.
    for (const prompt of ALL_PROMPTS) {
      expect(prompt.text).toMatch(/^[a-zA-Z0-9 ,.;:'"!?—\-()]+$/);
      expect(prompt.text).not.toMatch(/[\u2018\u2019\u201C\u201D\u00A0]/);
    }
  });

  it('fills every category', () => {
    for (const category of PROMPT_CATEGORIES) {
      expect(promptsInCategory(category).length).toBeGreaterThan(5);
    }
  });

  it('keeps every prompt inside its category’s length band', () => {
    const bands: Readonly<Record<string, readonly [number, number]>> = {
      'short-word': [3, 5],
      'medium-word': [6, 8],
      'long-word': [9, 13],
      'short-phrase': [8, 14],
      'medium-phrase': [15, 30],
    };

    for (const prompt of ALL_PROMPTS) {
      const band = bands[prompt.category];
      if (band === undefined) continue;

      expect(prompt.normalizedText.length).toBeGreaterThanOrEqual(band[0]);
      expect(prompt.normalizedText.length).toBeLessThanOrEqual(band[1]);
    }
  });

  it('derives difficulty from length within the category', () => {
    const shortWords = [...promptsInCategory('short-word')].sort(
      (a, b) => a.normalizedText.length - b.normalizedText.length,
    );
    const shortest = shortWords[0];
    const longest = shortWords[shortWords.length - 1];

    expect(shortest?.difficulty).toBeLessThan(longest?.difficulty ?? 1);
  });

  it('keeps the awkward categories off the beginner maps', () => {
    // Punctuation, numbers, and long words are what break a beginner's rhythm.
    for (const prompt of ALL_PROMPTS) {
      if (['punctuation', 'number', 'long-word'].includes(prompt.category)) {
        expect(prompt.minimumMap).toBeGreaterThan(1);
      }
    }
  });

  it('gives Map 1 a pool that is short, plain, and big enough', () => {
    const mapOne = promptsForMap(1);

    expect(mapOne.length).toBeGreaterThan(40);
    for (const prompt of mapOne) {
      // Nothing on Map 1 should take a 20 WPM typist more than a few seconds.
      expect(prompt.normalizedText.length).toBeLessThanOrEqual(14);
    }
  });

  it('grows the pool as the maps go on', () => {
    const sizes = [1, 2, 3, 4, 5, 6].map((mapNumber) => promptsForMap(mapNumber).length);

    for (let index = 1; index < sizes.length; index += 1) {
      expect(sizes[index]).toBeGreaterThanOrEqual(sizes[index - 1] ?? 0);
    }
    expect(sizes[5]).toBeGreaterThan(sizes[0] ?? 0);
  });

  it('tags themed vocabulary for every map theme', () => {
    for (const theme of MAP_THEMES) {
      const tagged = THEMED_WORDS.filter((prompt) => prompt.tags.includes(theme));

      expect(tagged.length).toBeGreaterThan(0);
    }
  });

  it('makes punctuation prompts intentional rather than symbol soup', () => {
    for (const prompt of PUNCTUATION) {
      // Every one contains a letter: these are contractions, hyphenated words,
      // and real clauses, not decorative strings of marks.
      expect(prompt.text).toMatch(/[a-z]/i);
    }
  });

  it('keeps numbers short, since the digit row is its own motion', () => {
    for (const prompt of NUMBERS) {
      expect(prompt.normalizedText.length).toBeLessThanOrEqual(8);
      expect(prompt.text).toMatch(/\d/);
    }
  });
});
