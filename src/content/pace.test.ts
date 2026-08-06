import { describe, expect, it } from 'vitest';

import { flowBufferFor } from '../game-core/flow';
import { effectiveCharacterCount } from '../game-core/models';
import { neutralMarginFor, NEUTRAL_TYPIST_SHARE } from '../game-core/pursuit';
import { computePromptTiming, requiredWpm } from '../game-core/timing';
import { MAPS } from './maps';
import { promptsForMap } from './prompts';

/**
 * Every map against every word it can produce.
 *
 * This replaces `fairness.test.ts`, which proved the same kind of thing about
 * hazards: that the budget covered the typing, and that no map demanded more
 * than it advertised. Hazards are gone; the promise is not.
 *
 * A playtest samples. This is a table, so a map cannot be unfair on a word the
 * simulated typist happened not to draw.
 */

const FLOW_LEAD_MS = 160;

describe.each(MAPS.map((map) => [map.id, map] as const))('%s', (_id, map) => {
  const prompts = promptsForMap(map.mapNumber).filter((prompt) =>
    map.content.promptCategories.includes(prompt.category),
  );

  it('gives every word it can ask for enough time to type', () => {
    for (const prompt of prompts) {
      const timing = computePromptTiming({
        characterCount: effectiveCharacterCount(prompt),
        targetWpm: map.targetWpm,
        timing: {
          reactionBuffer: flowBufferFor(map),
          fixedVisualLeadTimeMs: FLOW_LEAD_MS,
        },
      });

      expect(timing.spareMs, prompt.normalizedText).toBeGreaterThan(0);
    }
  });

  it('never demands more than the speed on its own card', () => {
    for (const prompt of prompts) {
      const timing = computePromptTiming({
        characterCount: effectiveCharacterCount(prompt),
        targetWpm: map.targetWpm,
        timing: {
          reactionBuffer: flowBufferFor(map),
          fixedVisualLeadTimeMs: FLOW_LEAD_MS,
        },
      });
      const demanded = requiredWpm(effectiveCharacterCount(prompt), timing.availableMs);

      expect(demanded, prompt.normalizedText).toBeLessThanOrEqual(map.targetWpm);
    }
  });

  it('breaks even for a typist inside the tolerance band, and only there', () => {
    // The whole tuning model in one assertion. `neutralMargin` is derived from
    // the map's own buffer, so a typist at the band's floor holds the chaser
    // level; anyone at the advertised speed pushes it back.
    const neutral = neutralMarginFor(map);
    const atTarget = 1 - 1 / flowBufferFor(map);

    expect(neutral).toBeGreaterThan(0);
    expect(neutral).toBeLessThan(atTarget);
    expect(neutral).toBeCloseTo(1 - 1 / NEUTRAL_TYPIST_SHARE / flowBufferFor(map), 6);
  });

  it('leaves a slow typist no budget at all', () => {
    // Below the band the words themselves start lapsing, which is what makes
    // the gate crisp rather than a slow drift: the buffer is smaller than the
    // extra time a typist a quarter under the map's speed needs.
    expect(flowBufferFor(map)).toBeLessThan(1 / 0.75);
  });
});

describe('the ladder', () => {
  it('gives less slack with every map', () => {
    const buffers = MAPS.map((map) => flowBufferFor(map));

    expect(buffers[0]).toBeGreaterThan(buffers[buffers.length - 1] ?? 0);
  });

  it('keeps every map inside the band it advertises', () => {
    // Above 1/0.85 nobody in the tolerance band ever lapses a word; below
    // 1/0.75 somebody at three quarters speed lapses all of them. Every map
    // sits between the two, which is what the band *is*.
    for (const map of MAPS) {
      expect(flowBufferFor(map), map.id).toBeGreaterThan(1 / 0.85);
      expect(flowBufferFor(map), map.id).toBeLessThan(1 / 0.75);
    }
  });
});
