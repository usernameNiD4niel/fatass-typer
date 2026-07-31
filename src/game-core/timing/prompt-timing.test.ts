import { describe, expect, it } from 'vitest';
import type { TimingProfile } from '../models/map';
import { normalizePromptText } from '../models/prompt';
import type { PromptEntry } from '../models/prompt';
import { effectiveCharacterCount } from '../models/prompt';
import {
  computePromptTiming,
  deadlinePressure,
  deadlineProgress,
  expectedTypingMs,
  isPromptFeasible,
  requiredWpm,
  spawnDistanceMeters,
  timeToImpactMs,
} from './prompt-timing';

/** The six reaction buffers from spec §6, Map 1 through Map 6. */
const REACTION_BUFFERS = [1.7, 1.55, 1.4, 1.28, 1.18, 1.08] as const;
const TARGET_WPM = [20, 25, 30, 35, 40, 50] as const;

const MAP_1_TIMING: TimingProfile = { reactionBuffer: 1.7, fixedVisualLeadTimeMs: 600 };
const MAP_6_TIMING: TimingProfile = { reactionBuffer: 1.08, fixedVisualLeadTimeMs: 400 };

function prompt(text: string): PromptEntry {
  return {
    id: `p-${text}`,
    text,
    normalizedText: normalizePromptText(text),
    difficulty: 0.3,
    category: 'short-word',
    minimumMap: 1,
    usage: 'obstacle',
    tags: [],
  };
}

describe('expected typing time — spec §6 formula', () => {
  it('matches the formula worked by hand', () => {
    // 5 characters / 5 / 20 wpm * 60 = 3 seconds.
    expect(expectedTypingMs(5, 20)).toBe(3_000);
    // 25 characters / 5 / 50 wpm * 60 = 6 seconds.
    expect(expectedTypingMs(25, 50)).toBe(6_000);
  });

  it('scales linearly with length and inversely with speed', () => {
    expect(expectedTypingMs(10, 20)).toBe(expectedTypingMs(5, 20) * 2);
    expect(expectedTypingMs(10, 40)).toBe(expectedTypingMs(10, 20) / 2);
  });

  it('charges for spaces and punctuation', () => {
    const word = prompt('crate');
    const phrase = prompt('run, fat man!');

    expect(effectiveCharacterCount(word)).toBe(5);
    expect(effectiveCharacterCount(phrase)).toBe(13);
    expect(expectedTypingMs(effectiveCharacterCount(phrase), 20)).toBeGreaterThan(
      expectedTypingMs(effectiveCharacterCount(word), 20),
    );
  });

  it('does not charge for whitespace the player never types', () => {
    // Normalization collapses the double space, so it costs nothing.
    expect(effectiveCharacterCount(prompt('run  fast'))).toBe(8);
  });
});

describe('available time — spec §6 formula', () => {
  it('matches the formula worked by hand for Map 1', () => {
    // 3000ms typing * 1.70 buffer + 600ms visual lead = 5700ms.
    const timing = computePromptTiming({
      characterCount: 5,
      targetWpm: 20,
      timing: MAP_1_TIMING,
    });

    expect(timing.expectedTypingMs).toBe(3_000);
    expect(timing.availableMs).toBeCloseTo(5_700, 6);
    expect(timing.spareMs).toBeCloseTo(2_700, 6);
  });

  it('adds the obstacle reaction allowance on top', () => {
    const timing = computePromptTiming({
      characterCount: 5,
      targetWpm: 20,
      timing: MAP_1_TIMING,
      extraReactionMs: 400,
    });

    expect(timing.availableMs).toBeCloseTo(6_100, 6);
  });

  it('multiplies typing time but adds visual lead flat', () => {
    const short = computePromptTiming({ characterCount: 5, targetWpm: 20, timing: MAP_1_TIMING });
    const long = computePromptTiming({ characterCount: 10, targetWpm: 20, timing: MAP_1_TIMING });

    // Typing time doubles; the flat lead does not.
    expect(long.availableMs - short.availableMs).toBeCloseTo(3_000 * 1.7, 6);
  });

  it('gives a fair player slack at every map buffer', () => {
    for (const reactionBuffer of REACTION_BUFFERS) {
      const timing = computePromptTiming({
        characterCount: 12,
        targetWpm: 20,
        timing: { reactionBuffer, fixedVisualLeadTimeMs: 500 },
      });

      expect(isPromptFeasible(timing)).toBe(true);
    }
  });

  it('tightens monotonically from Map 1 to Map 6', () => {
    const spare = REACTION_BUFFERS.map(
      (reactionBuffer) =>
        computePromptTiming({
          characterCount: 12,
          targetWpm: 20,
          timing: { reactionBuffer, fixedVisualLeadTimeMs: 500 },
        }).spareMs,
    );

    for (let index = 1; index < spare.length; index += 1) {
      expect(spare[index]).toBeLessThan(spare[index - 1] ?? 0);
    }
  });
});

describe('required speed — the honesty check', () => {
  it('never exceeds the map target on Map 1', () => {
    const timing = computePromptTiming({
      characterCount: 8,
      targetWpm: 20,
      timing: MAP_1_TIMING,
    });

    expect(requiredWpm(8, timing.availableMs)).toBeLessThan(20);
  });

  it('never exceeds the map target on any map in the progression', () => {
    // Every map must be beatable by a player typing at its advertised speed.
    TARGET_WPM.forEach((targetWpm, index) => {
      const reactionBuffer = REACTION_BUFFERS[index] ?? 1;

      for (const characterCount of [4, 8, 15, 25, 40]) {
        const timing = computePromptTiming({
          characterCount,
          targetWpm,
          timing: { reactionBuffer, fixedVisualLeadTimeMs: 450 },
        });

        expect(requiredWpm(characterCount, timing.availableMs)).toBeLessThanOrEqual(targetWpm);
      }
    });
  });

  it('reports zero for nonsense input', () => {
    expect(requiredWpm(0, 5_000)).toBe(0);
    expect(requiredWpm(10, 0)).toBe(0);
  });

  it('rises as the buffer tightens', () => {
    const easy = computePromptTiming({ characterCount: 15, targetWpm: 30, timing: MAP_1_TIMING });
    const hard = computePromptTiming({ characterCount: 15, targetWpm: 30, timing: MAP_6_TIMING });

    expect(requiredWpm(15, hard.availableMs)).toBeGreaterThan(requiredWpm(15, easy.availableMs));
  });
});

describe('placing the obstacle in the world', () => {
  it('spawns far enough ahead to give the full budget', () => {
    // 5.7 seconds at 6 m/s is 34.2 meters.
    expect(spawnDistanceMeters(5_700, 6)).toBeCloseTo(34.2, 6);
  });

  it('round-trips against time to impact', () => {
    const distance = spawnDistanceMeters(5_700, 6);

    expect(timeToImpactMs(distance, 6)).toBeCloseTo(5_700, 6);
  });

  it('needs more room at higher speeds', () => {
    expect(spawnDistanceMeters(5_000, 9)).toBeGreaterThan(spawnDistanceMeters(5_000, 6));
  });

  it('handles a stopped player without dividing by zero', () => {
    expect(timeToImpactMs(10, 0)).toBe(Number.POSITIVE_INFINITY);
    expect(spawnDistanceMeters(5_000, 0)).toBe(0);
  });

  it('reports no time remaining once the obstacle is reached', () => {
    expect(timeToImpactMs(0, 6)).toBe(0);
    expect(timeToImpactMs(-2, 6)).toBe(0);
  });
});

describe('deadline pressure for the HUD', () => {
  it('escalates as the deadline approaches', () => {
    expect(deadlinePressure(5_000, 6_000)).toBe('safe');
    expect(deadlinePressure(3_000, 6_000)).toBe('warning');
    expect(deadlinePressure(1_500, 6_000)).toBe('critical');
    expect(deadlinePressure(0, 6_000)).toBe('expired');
  });

  it('treats a passed deadline as expired', () => {
    expect(deadlinePressure(-100, 6_000)).toBe('expired');
  });

  it('reports progress through the budget', () => {
    expect(deadlineProgress(0, 6_000)).toBe(0);
    expect(deadlineProgress(3_000, 6_000)).toBe(0.5);
    expect(deadlineProgress(6_000, 6_000)).toBe(1);
  });

  it('clamps progress so a late frame cannot overfill the meter', () => {
    expect(deadlineProgress(9_000, 6_000)).toBe(1);
    expect(deadlineProgress(-500, 6_000)).toBe(0);
  });
});

describe('end-to-end: a 20 WPM player on Map 1', () => {
  it('finishes a typical obstacle prompt with time to spare', () => {
    const text = prompt('trash bin');
    const characters = effectiveCharacterCount(text);
    const timing = computePromptTiming({
      characterCount: characters,
      targetWpm: 20,
      timing: MAP_1_TIMING,
      extraReactionMs: 400,
    });

    // What the player actually needs, typing at exactly 20 WPM.
    const actualTypingMs = expectedTypingMs(characters, 20);

    expect(actualTypingMs).toBeLessThan(timing.availableMs);
    expect(timing.availableMs - actualTypingMs).toBeGreaterThan(1_000);
  });

  it('would not survive the same prompt under Map 6 timing', () => {
    const text = prompt('trash bin');
    const characters = effectiveCharacterCount(text);
    const timing = computePromptTiming({
      characterCount: characters,
      targetWpm: 50,
      timing: MAP_6_TIMING,
      extraReactionMs: 250,
    });

    // Map 6 budgets for a 50 WPM typist; a 20 WPM typist runs out of time.
    expect(expectedTypingMs(characters, 20)).toBeGreaterThan(timing.availableMs);
  });
});
