import { describe, expect, it } from 'vitest';
import { normalizePromptText } from '../models/prompt';
import type { PromptEntry } from '../models/prompt';
import { createRng } from '../random/rng';
import { createPromptSelector, filterPrompts, nextPrompt, nextPrompts } from './prompt-selection';
import type { PromptCriteria, PromptSelector } from './prompt-selection';

function makePrompt(id: string, overrides: Partial<Omit<PromptEntry, 'id'>> = {}): PromptEntry {
  const text = overrides.text ?? id;

  return {
    id,
    text,
    normalizedText: normalizePromptText(text),
    difficulty: overrides.difficulty ?? 0.3,
    category: overrides.category ?? 'short-word',
    minimumMap: overrides.minimumMap ?? 1,
    usage: overrides.usage ?? 'both',
    tags: overrides.tags ?? [],
  };
}

const POOL: readonly PromptEntry[] = [
  makePrompt('run'),
  makePrompt('jump'),
  makePrompt('dodge'),
  makePrompt('sprint'),
  makePrompt('vault'),
  makePrompt('scramble', { category: 'medium-word', difficulty: 0.6 }),
  makePrompt('perpendicular', { category: 'long-word', difficulty: 0.9, minimumMap: 4 }),
  makePrompt('boost-only', { usage: 'boost' }),
  makePrompt('obstacle-only', { usage: 'obstacle' }),
  makePrompt('market stall', { category: 'short-phrase', tags: ['market-district'] }),
];

const MAP_1: PromptCriteria = {
  mapNumber: 1,
  categories: ['short-word'],
  usage: 'obstacle',
};

/** Draws `count` prompts, returning their ids. */
function drawIds(selector: PromptSelector, count: number, criteria = MAP_1): string[] {
  const result = nextPrompts(selector, POOL, criteria, count);

  return result.prompts.map((prompt) => prompt.id);
}

describe('filtering', () => {
  it('excludes prompts above the current map', () => {
    const ids = filterPrompts(POOL, { ...MAP_1, categories: [] }).map((prompt) => prompt.id);

    expect(ids).not.toContain('perpendicular');
    expect(filterPrompts(POOL, { ...MAP_1, categories: [], mapNumber: 4 })).toContainEqual(
      expect.objectContaining({ id: 'perpendicular' }),
    );
  });

  it('respects intended use, and treats "both" as usable either way', () => {
    const obstacle = filterPrompts(POOL, { ...MAP_1, categories: [] }).map((p) => p.id);

    expect(obstacle).toContain('obstacle-only');
    expect(obstacle).not.toContain('boost-only');
    // A "both" prompt qualifies for either.
    expect(obstacle).toContain('run');
  });

  it('respects categories, and treats an empty list as no restriction', () => {
    expect(filterPrompts(POOL, MAP_1).map((p) => p.id)).not.toContain('scramble');
    expect(filterPrompts(POOL, { ...MAP_1, categories: ['medium-word'] }).map((p) => p.id)).toEqual(
      ['scramble'],
    );
    expect(filterPrompts(POOL, { ...MAP_1, categories: [] }).length).toBeGreaterThan(5);
  });

  it('respects a difficulty band', () => {
    const easy = filterPrompts(POOL, {
      ...MAP_1,
      categories: [],
      maxDifficulty: 0.4,
    });

    expect(easy.every((prompt) => prompt.difficulty <= 0.4)).toBe(true);
    expect(easy.map((p) => p.id)).not.toContain('scramble');
  });

  it('returns nothing when the filters exclude everything', () => {
    expect(filterPrompts(POOL, { ...MAP_1, categories: ['number'] })).toEqual([]);
  });
});

describe('selection — determinism', () => {
  it('produces the same sequence for the same seed', () => {
    const a = drawIds(createPromptSelector(createRng(1234)), 25);
    const b = drawIds(createPromptSelector(createRng(1234)), 25);

    expect(a).toEqual(b);
  });

  it('produces a different sequence for a different seed', () => {
    const a = drawIds(createPromptSelector(createRng(1)), 25);
    const b = drawIds(createPromptSelector(createRng(999)), 25);

    expect(a).not.toEqual(b);
  });

  it('never mutates the selector it is given', () => {
    const selector = createPromptSelector(createRng(5));
    const snapshot = { ...selector, recentIds: [...selector.recentIds] };

    nextPrompt(selector, POOL, MAP_1);

    expect(selector).toEqual(snapshot);
  });
});

describe('selection — no immediate repetition', () => {
  it('never issues the same prompt twice in a row', () => {
    const ids = drawIds(createPromptSelector(createRng(77)), 200);

    for (let index = 1; index < ids.length; index += 1) {
      expect(ids[index]).not.toBe(ids[index - 1]);
    }
  });

  it('avoids the whole recent history while it can', () => {
    // Five candidates, history of three: no id may recur within three draws.
    const ids = drawIds(createPromptSelector(createRng(3), 3), 60);

    for (let index = 3; index < ids.length; index += 1) {
      expect(ids.slice(index - 3, index)).not.toContain(ids[index]);
    }
  });

  it('still produces prompts when the pool is smaller than the history', () => {
    // One eligible prompt, history of five. It must repeat — but it must not
    // stall or return null.
    const criteria: PromptCriteria = { ...MAP_1, categories: ['medium-word'], usage: 'boost' };
    const ids = drawIds(createPromptSelector(createRng(9), 5), 10, criteria);

    expect(ids).toHaveLength(10);
    expect(new Set(ids)).toEqual(new Set(['scramble']));
  });

  it('avoids back-to-back repeats even when the history cannot be satisfied', () => {
    // Two eligible prompts, history of five. Alternating is the only option.
    const pool = [makePrompt('a'), makePrompt('b')];
    let selector = createPromptSelector(createRng(21), 5);
    const ids: string[] = [];

    for (let index = 0; index < 20; index += 1) {
      const result = nextPrompt(selector, pool, MAP_1);
      selector = result.selector;
      if (result.prompt !== null) ids.push(result.prompt.id);
    }

    for (let index = 1; index < ids.length; index += 1) {
      expect(ids[index]).not.toBe(ids[index - 1]);
    }
  });

  it('honors a history size of zero', () => {
    const selector = createPromptSelector(createRng(1), 0);
    const result = nextPrompt(selector, POOL, MAP_1);

    expect(result.selector.recentIds).toEqual([]);
  });
});

describe('selection — coverage and preferences', () => {
  it('eventually issues every eligible prompt', () => {
    const ids = new Set(drawIds(createPromptSelector(createRng(64)), 300));
    const eligible = filterPrompts(POOL, MAP_1).map((prompt) => prompt.id);

    expect(ids).toEqual(new Set(eligible));
  });

  it('prefers themed vocabulary when it exists', () => {
    const criteria: PromptCriteria = {
      mapNumber: 3,
      categories: ['short-word', 'short-phrase'],
      usage: 'obstacle',
      preferredTags: ['market-district'],
    };
    const ids = drawIds(createPromptSelector(createRng(2)), 12, criteria);

    expect(ids).toContain('market stall');
  });

  it('falls back to untagged prompts rather than starving', () => {
    const criteria: PromptCriteria = {
      ...MAP_1,
      preferredTags: ['nonexistent-theme'],
    };
    const ids = drawIds(createPromptSelector(createRng(2)), 10, criteria);

    expect(ids).toHaveLength(10);
  });
});

describe('selection — empty results', () => {
  it('returns null when nothing satisfies the filters', () => {
    const result = nextPrompt(createPromptSelector(createRng(1)), POOL, {
      ...MAP_1,
      categories: ['number'],
    });

    expect(result.prompt).toBeNull();
  });

  it('returns null for an empty pool without advancing the generator', () => {
    const selector = createPromptSelector(createRng(1));
    const result = nextPrompt(selector, [], MAP_1);

    expect(result.prompt).toBeNull();
    expect(result.selector).toBe(selector);
  });

  it('stops early rather than padding a batch it cannot fill', () => {
    const result = nextPrompts(createPromptSelector(createRng(1)), [], MAP_1, 5);

    expect(result.prompts).toEqual([]);
  });
});
