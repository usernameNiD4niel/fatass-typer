import { describe, expect, it } from 'vitest';

import { MAP_1 } from '../../content/maps';
import { findObstacle } from '../../content/obstacles';
import { ALL_PROMPTS } from '../../content/prompts';
import type { ObstacleDefinition, PromptEntry } from '../models';
import { applyInput, createTypingState, type TypingState } from '../typing';
import { type ActiveObstacle, placeObstacle } from './active-obstacle';
import {
  expireObstacle,
  isResolvable,
  moveForOutcome,
  outcomeForExpiry,
  resolveAvoided,
  STUMBLE_PROGRESS_THRESHOLD,
  typedFraction,
} from './resolution';

const CRATE = findObstacle('crate') as ObstacleDefinition;
const PROMPT = ALL_PROMPTS.find((entry) => entry.text === 'street') as PromptEntry;

/** An obstacle with its prompt attached and a deadline running. */
function attached(overrides: Partial<ActiveObstacle> = {}): ActiveObstacle {
  const placed = placeObstacle({
    instanceId: 'obstacle-1',
    definition: CRATE,
    prompt: PROMPT,
    map: MAP_1,
    playerMeters: 0,
    elapsedMs: 0,
  });

  return {
    ...placed,
    status: 'active',
    attachedAtMs: 1_000,
    deadlineAtMs: 1_000 + placed.timing.availableMs,
    warned: true,
    ...overrides,
  };
}

/** Types `count` correct characters of the prompt. */
function typed(count: number): TypingState {
  let state = createTypingState(PROMPT.text);

  for (let index = 1; index <= count; index += 1) {
    state = applyInput(state, PROMPT.text.slice(0, index));
  }

  return state;
}

const COMPLETE = typed(PROMPT.text.length);
const NOTHING = typed(0);

describe('typedFraction', () => {
  it('measures how much of the prompt is correct', () => {
    expect(typedFraction(NOTHING)).toBe(0);
    expect(typedFraction(typed(3))).toBeCloseTo(3 / PROMPT.text.length);
    expect(typedFraction(COMPLETE)).toBe(1);
  });

  it('treats an empty prompt as finished rather than dividing by zero', () => {
    expect(typedFraction(createTypingState(''))).toBe(1);
  });

  it('does not count wrong characters as progress', () => {
    const wrong = applyInput(createTypingState(PROMPT.text), 'zzz');

    expect(typedFraction(wrong)).toBe(0);
  });
});

describe('outcomeForExpiry', () => {
  it('is a stumble when the player was most of the way through', () => {
    const most = typed(Math.ceil(PROMPT.text.length * STUMBLE_PROGRESS_THRESHOLD));

    expect(outcomeForExpiry(most)).toBe('stumbled');
  });

  it('is a hit when nothing was typed', () => {
    expect(outcomeForExpiry(NOTHING)).toBe('hit');
  });

  it('is a hit when barely started', () => {
    expect(outcomeForExpiry(typed(1))).toBe('hit');
  });
});

describe('resolving by completing the prompt', () => {
  it('marks the obstacle avoided', () => {
    const result = resolveAvoided(attached(), COMPLETE, 2_000);

    expect(result.obstacle.status).toBe('resolved');
    expect(result.resolved?.outcome).toBe('avoided');
    expect(result.resolved?.typedFraction).toBe(1);
  });

  it('reports the time left, which D4 turns into a bonus', () => {
    const obstacle = attached();
    const result = resolveAvoided(obstacle, COMPLETE, 1_500);

    expect(result.resolved?.remainingMs).toBeCloseTo((obstacle.deadlineAtMs ?? 0) - 1_500);
  });

  it('does not rescue an obstacle whose deadline has already passed', () => {
    const obstacle = attached();
    const late = (obstacle.deadlineAtMs ?? 0) + 1;
    const result = resolveAvoided(obstacle, COMPLETE, late);

    // Completing it a moment too late is still a miss — and a generous one,
    // since a fully typed prompt earns the stumble rather than the collision.
    expect(result.resolved?.outcome).toBe('stumbled');
    expect(result.obstacle.status).toBe('missed');
  });
});

describe('resolving by running out of time', () => {
  it('marks the obstacle missed and picks the outcome', () => {
    const result = expireObstacle(attached(), NOTHING, 9_999);

    expect(result.obstacle.status).toBe('missed');
    expect(result.resolved?.outcome).toBe('hit');
    expect(result.resolved?.remainingMs).toBe(0);
  });

  it('is kinder to a player who nearly made it', () => {
    const nearly = typed(PROMPT.text.length - 1);
    const result = expireObstacle(attached(), nearly, 9_999);

    expect(result.resolved?.outcome).toBe('stumbled');
    expect(result.resolved?.typedFraction).toBeGreaterThan(STUMBLE_PROGRESS_THRESHOLD);
  });
});

describe('the double-resolution guard', () => {
  it('only counts an obstacle as resolvable while it is active', () => {
    expect(isResolvable(attached())).toBe(true);
    expect(isResolvable(attached({ status: 'approaching' }))).toBe(false);
    expect(isResolvable(attached({ status: 'resolved' }))).toBe(false);
    expect(isResolvable(attached({ status: 'missed' }))).toBe(false);
  });

  it('ignores a second completion', () => {
    const first = resolveAvoided(attached(), COMPLETE, 2_000);
    const second = resolveAvoided(first.obstacle, COMPLETE, 2_100);

    expect(first.resolved).not.toBeNull();
    expect(second.resolved).toBeNull();
    expect(second.obstacle).toBe(first.obstacle);
  });

  it('ignores a second expiry', () => {
    const first = expireObstacle(attached(), NOTHING, 9_999);
    const second = expireObstacle(first.obstacle, NOTHING, 10_000);

    expect(second.resolved).toBeNull();
  });

  it('never charges a collision for an obstacle already avoided', () => {
    const avoided = resolveAvoided(attached(), COMPLETE, 2_000).obstacle;
    const late = expireObstacle(avoided, NOTHING, 99_999);

    expect(late.resolved).toBeNull();
    expect(late.obstacle.status).toBe('resolved');
  });

  it('never awards an avoidance for an obstacle already missed', () => {
    const missed = expireObstacle(attached(), NOTHING, 9_999).obstacle;
    const late = resolveAvoided(missed, COMPLETE, 10_000);

    expect(late.resolved).toBeNull();
    expect(late.obstacle.status).toBe('missed');
  });

  it('cannot resolve an obstacle whose prompt has not attached yet', () => {
    const approaching = attached({ status: 'approaching', deadlineAtMs: null });

    expect(resolveAvoided(approaching, COMPLETE, 500).resolved).toBeNull();
    expect(expireObstacle(approaching, NOTHING, 500).resolved).toBeNull();
  });
});

describe('moveForOutcome', () => {
  it('plays the obstacle’s own avoidance move on success', () => {
    expect(moveForOutcome('avoided', 'jump')).toBe('jump');
    expect(moveForOutcome('avoided', 'slide')).toBe('slide');
    expect(moveForOutcome('avoided', 'sidestep')).toBe('sidestep');
  });

  it('plays a stumble or an impact on failure, whatever the obstacle was', () => {
    expect(moveForOutcome('stumbled', 'slide')).toBe('stumble');
    expect(moveForOutcome('hit', 'sidestep')).toBe('impact');
  });
});
