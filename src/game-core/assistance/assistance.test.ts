import { describe, expect, it } from 'vitest';

import { MAP_1 } from '../../content/maps';
import type { AdaptiveAssistanceConfig } from '../models';
import { DEFAULT_ADAPTIVE_ASSISTANCE } from '../models';
import {
  assistanceDriftPercent,
  assistedMap,
  type AssistanceState,
  createAssistance,
  effectiveReactionBuffer,
  registerFailure,
  registerSuccess,
} from './assistance';

const CONFIG = DEFAULT_ADAPTIVE_ASSISTANCE;

/** Misses `count` obstacles in a row. */
function fail(state: AssistanceState, count: number, config = CONFIG): AssistanceState {
  let current = state;
  for (let index = 0; index < count; index += 1) current = registerFailure(current, config);

  return current;
}

/** Clears `count` obstacles in a row. */
function succeed(state: AssistanceState, count: number, config = CONFIG): AssistanceState {
  let current = state;
  for (let index = 0; index < count; index += 1) current = registerSuccess(current, config);

  return current;
}

describe('easing after failure', () => {
  it('does nothing for a single miss', () => {
    // One miss is ordinary. Reacting to it would make the game feel like it was
    // flinching every time the player made a mistake.
    expect(fail(createAssistance(), 1).bufferMultiplier).toBe(1);
  });

  it('does nothing until the failures are a pattern', () => {
    expect(fail(createAssistance(), CONFIG.failuresBeforeEasing - 1).bufferMultiplier).toBe(1);
  });

  it('eases once the pattern is established', () => {
    const state = fail(createAssistance(), CONFIG.failuresBeforeEasing);

    expect(state.bufferMultiplier).toBeCloseTo(1 + CONFIG.bufferStep);
    expect(state.easings).toBe(1);
  });

  it('paces the easing rather than compounding every miss', () => {
    // Six misses is two full patterns, not six steps.
    const state = fail(createAssistance(), CONFIG.failuresBeforeEasing * 2);

    expect(state.easings).toBe(2);
    expect(state.bufferMultiplier).toBeCloseTo(1 + CONFIG.bufferStep * 2);
  });

  it('stops at the ceiling however badly the run goes', () => {
    const state = fail(createAssistance(), 200);

    expect(state.bufferMultiplier).toBe(CONFIG.maximumBufferMultiplier);
  });

  it('resets the success run, so recovery has to be earned again', () => {
    const state = registerFailure(succeed(createAssistance(), 3));

    expect(state.consecutiveSuccesses).toBe(0);
  });
});

describe('tightening after success', () => {
  it('takes far more evidence than easing does', () => {
    // Being given help you did not need is a small unfairness; having it taken
    // away mid-recovery is a large one.
    expect(CONFIG.successesBeforeTightening).toBeGreaterThan(CONFIG.failuresBeforeEasing);

    const eased = fail(createAssistance(), CONFIG.failuresBeforeEasing);

    expect(succeed(eased, CONFIG.successesBeforeTightening - 1).bufferMultiplier).toBe(
      eased.bufferMultiplier,
    );
  });

  it('takes the help back once it is clearly not needed', () => {
    const eased = fail(createAssistance(), CONFIG.failuresBeforeEasing);
    const tightened = succeed(eased, CONFIG.successesBeforeTightening);

    expect(tightened.bufferMultiplier).toBeCloseTo(1);
    expect(tightened.tightenings).toBe(1);
  });

  it('stops at the floor however well the run goes', () => {
    const state = succeed(createAssistance(), 400);

    expect(state.bufferMultiplier).toBe(CONFIG.minimumBufferMultiplier);
  });

  it('resets the failure run', () => {
    const state = registerSuccess(fail(createAssistance(), 2));

    expect(state.consecutiveFailures).toBe(0);
  });
});

describe('when it is switched off', () => {
  const off: AdaptiveAssistanceConfig = { ...CONFIG, enabled: false };

  it('never moves, however the run goes', () => {
    expect(fail(createAssistance(), 50, off)).toEqual(createAssistance());
    expect(succeed(createAssistance(), 50, off)).toEqual(createAssistance());
  });
});

describe('what it is allowed to change', () => {
  it('moves the reaction buffer and nothing else', () => {
    const eased = fail(createAssistance(), CONFIG.failuresBeforeEasing);
    const adjusted = assistedMap(MAP_1, eased);

    expect(adjusted.timing.reactionBuffer).toBeGreaterThan(MAP_1.timing.reactionBuffer);

    // The target speed the player is shown, the road, and the scoring are all
    // untouched — spec §6 requires the displayed target to stay honest.
    expect(adjusted.targetWpm).toBe(MAP_1.targetWpm);
    expect(adjusted.motion).toEqual(MAP_1.motion);
    expect(adjusted.speed).toEqual(MAP_1.speed);
    expect(adjusted.boost).toEqual(MAP_1.boost);
    expect(adjusted.distanceMeters).toBe(MAP_1.distanceMeters);
    expect(adjusted.timing.fixedVisualLeadTimeMs).toBe(MAP_1.timing.fixedVisualLeadTimeMs);
  });

  it('returns the map untouched when nothing has been adjusted', () => {
    expect(assistedMap(MAP_1, createAssistance())).toBe(MAP_1);
  });

  it('keeps the whole adjustment within a fifth of the map as written', () => {
    // The player must never be able to feel the game changing difficulty
    // underneath them (spec §6).
    const easiest = fail(createAssistance(), 200);
    const hardest = succeed(createAssistance(), 400);

    expect(
      effectiveReactionBuffer(MAP_1, easiest) / MAP_1.timing.reactionBuffer,
    ).toBeLessThanOrEqual(1.25);
    expect(
      effectiveReactionBuffer(MAP_1, hardest) / MAP_1.timing.reactionBuffer,
    ).toBeGreaterThanOrEqual(0.9);
  });

  it('reports its drift for the dev overlay', () => {
    expect(assistanceDriftPercent(createAssistance())).toBe(0);
    expect(assistanceDriftPercent(fail(createAssistance(), 3))).toBe(5);
  });
});
