import { describe, expect, it } from 'vitest';

import { isMapConfig, isObstacleDefinition, isPromptEntry } from '../game-core/models';
import { MAPS } from './maps';
import { findObstacle, OBSTACLES, obstaclesFor } from './obstacles';
import { STARTER_PROMPTS } from './prompts';

/**
 * Content is data, so the tests are validation: every entry has to satisfy the
 * same guards a corrupt save would be checked against, and the cross-references
 * between maps and obstacles have to resolve.
 */

describe('obstacle definitions', () => {
  it('defines all seven obstacles from the spec', () => {
    expect(OBSTACLES.map((obstacle) => obstacle.id).sort()).toEqual(
      [
        'crate',
        'hanging-sign',
        'low-barrier',
        'narrow-passage',
        'puddle',
        'roadwork-barrier',
        'trash-bin',
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

  it('matches the spec on how each one is avoided', () => {
    const actions = Object.fromEntries(OBSTACLES.map((o) => [o.id, o.action]));

    expect(actions).toMatchObject({
      crate: 'jump',
      'low-barrier': 'jump',
      puddle: 'jump',
      'roadwork-barrier': 'jump',
      'hanging-sign': 'slide',
      'trash-bin': 'sidestep',
    });
  });

  it('asks for a phrase only on the narrow passage', () => {
    const phrases = OBSTACLES.filter((o) => o.promptCategory.endsWith('phrase'));

    expect(phrases.map((o) => o.id)).toEqual(['narrow-passage']);
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
    expect(findObstacle('crate')?.label).toBe('Wooden crate');
    expect(findObstacle('not-real')).toBeUndefined();
    expect(obstaclesFor(['puddle', 'not-real']).map((o) => o.id)).toEqual(['puddle']);
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
        const available = STARTER_PROMPTS.filter(
          (prompt) => prompt.category === category && prompt.minimumMap <= map.mapNumber,
        );

        expect(available.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('prompts', () => {
  it('validates every prompt', () => {
    for (const prompt of STARTER_PROMPTS) {
      expect(isPromptEntry(prompt)).toBe(true);
    }
  });

  it('gives every prompt a unique id and unique text', () => {
    expect(new Set(STARTER_PROMPTS.map((p) => p.id)).size).toBe(STARTER_PROMPTS.length);
    expect(new Set(STARTER_PROMPTS.map((p) => p.text)).size).toBe(STARTER_PROMPTS.length);
  });

  it('has no ambiguous whitespace', () => {
    for (const prompt of STARTER_PROMPTS) {
      expect(prompt.text).toBe(prompt.text.trim());
      expect(prompt.text).not.toMatch(/\s{2,}/);
      expect(prompt.normalizedText).toBe(prompt.text.toLowerCase());
    }
  });
});
