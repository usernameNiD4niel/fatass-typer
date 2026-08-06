import { describe, expect, it } from 'vitest';

import { MAP_1, MAP_6 } from '../../content/maps';
import { SHORT_WORDS } from '../../content/prompts/words';
import type { PromptEntry } from '../models';
import { requiredWpm } from '../timing';
import {
  completeFlowWord,
  expireFlowWord,
  flowBufferFor,
  flowExpired,
  flowRemainingMs,
  flowUrgency,
  isFlowLive,
  placeFlowWord,
} from './flow-word';

function word(): PromptEntry {
  const first = SHORT_WORDS[0];
  if (first === undefined) throw new Error('no prompts');

  return first;
}

describe('flow words', () => {
  it('is on screen the moment it is created', () => {
    // The whole point. Everything else in the game approaches; a flow word is
    // simply there, because the gap it fills is measured in fractions of a
    // second and an approach would be the gap all over again.
    const flow = placeFlowWord({
      instanceId: 'flow-1',
      prompt: word(),
      map: MAP_1,
      elapsedMs: 5_000,
    });

    expect(flow.status).toBe('active');
    expect(flow.attachedAtMs).toBe(5_000);
    expect(flow.deadlineAtMs).toBeGreaterThan(5_000);
    expect(isFlowLive(flow)).toBe(true);
  });

  it('never asks for more than the map advertises', () => {
    // The same honesty rule the hazards live under: if a flow word demanded 24
    // WPM on a 20 WPM map, the number on the card would be decoration.
    for (const map of [MAP_1, MAP_6]) {
      for (const prompt of SHORT_WORDS) {
        const flow = placeFlowWord({ instanceId: 'flow', prompt, map, elapsedMs: 0 });
        const demanded = requiredWpm(prompt.normalizedText.length, flow.timing.availableMs);

        expect(demanded).toBeLessThanOrEqual(map.targetWpm);
        expect(flow.timing.spareMs).toBeGreaterThan(0);
      }
    }
  });

  it('tightens as the ladder climbs', () => {
    // The ladder has to live somewhere. It used to live in the hazard budget;
    // with flow words the primary prompt, this is where it lives now, and a
    // constant here would flatten all six maps into one.
    expect(flowBufferFor(MAP_6)).toBeLessThan(flowBufferFor(MAP_1));
  });

  it('covers the map, plus the tolerance the map names', () => {
    expect(flowBufferFor(MAP_1)).toBeCloseTo(
      MAP_1.timing.reactionBuffer + MAP_1.content.flowTolerance,
    );
  });

  it('expires when the budget runs out, and only then', () => {
    const flow = placeFlowWord({ instanceId: 'flow-1', prompt: word(), map: MAP_1, elapsedMs: 0 });

    expect(flowExpired(flow, flow.deadlineAtMs - 1)).toBe(false);
    expect(flowExpired(flow, flow.deadlineAtMs)).toBe(true);
    expect(flowRemainingMs(flow, flow.deadlineAtMs + 500)).toBe(0);
  });

  it('reports its urgency across the budget', () => {
    const flow = placeFlowWord({ instanceId: 'flow-1', prompt: word(), map: MAP_1, elapsedMs: 0 });

    expect(flowUrgency(flow, 0)).toBe(0);
    expect(flowUrgency(flow, flow.deadlineAtMs / 2)).toBeCloseTo(0.5, 2);
    expect(flowUrgency(flow, flow.deadlineAtMs * 2)).toBe(1);
  });

  it('settles once, whichever way it goes', () => {
    // The same guard hazards have: a word that has already ended must not end
    // again, or a late keystroke pays out twice.
    const flow = placeFlowWord({ instanceId: 'flow-1', prompt: word(), map: MAP_1, elapsedMs: 0 });

    const done = completeFlowWord(flow);
    expect(done.status).toBe('completed');
    expect(expireFlowWord(done).status).toBe('completed');
    expect(completeFlowWord(expireFlowWord(flow)).status).toBe('missed');
    expect(isFlowLive(done)).toBe(false);
  });
});
