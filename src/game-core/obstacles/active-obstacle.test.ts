import { describe, expect, it } from 'vitest';

import { MAP_1 } from '../../content/maps';
import { findObstacle } from '../../content/obstacles';
import { ALL_PROMPTS } from '../../content/prompts';
import type { MapConfig, ObstacleDefinition, PromptEntry } from '../models';
import { motionReserveMs, requiredWpm } from '../timing';
import {
  type ActiveObstacle,
  advanceObstacle,
  advanceObstacles,
  distanceToImpact,
  isFair,
  obstaclePressure,
  obstacleProgress,
  placeObstacle,
  remainingMs,
  timeToImpact,
  WARNING_LEAD_FACTOR,
} from './active-obstacle';

const CRATE = findObstacle('crate') as ObstacleDefinition;
const PROMPT = ALL_PROMPTS.find((entry) => entry.text === 'gate') as PromptEntry;
const BASE_SPEED = MAP_1.baseSpeedMetersPerSecond;

/** A jump hazard blocks the lane the player is in; there is no safe lane. */
const JUMP_ASSIGNMENT = { blockedLanes: [1] as const, safeLane: null, safeSide: null };

function place(overrides: Partial<Parameters<typeof placeObstacle>[0]> = {}): ActiveObstacle {
  return placeObstacle({
    instanceId: 'obstacle-1',
    definition: CRATE,
    prompt: PROMPT,
    map: MAP_1,
    playerMeters: 100,
    elapsedMs: 5_000,
    assignment: JUMP_ASSIGNMENT,
    ...overrides,
  });
}

/**
 * Runs the MC toward an obstacle in 100ms steps at a fixed speed, collecting
 * every event on the way. Mirrors what the simulation step will do in D3.
 */
function approach(
  obstacle: ActiveObstacle,
  options: { speed?: number; startMeters?: number; startMs?: number; steps?: number } = {},
) {
  const speed = options.speed ?? BASE_SPEED;
  let current = obstacle;
  let meters = options.startMeters ?? 100;
  let elapsedMs = options.startMs ?? 5_000;
  const events: string[] = [];

  for (let step = 0; step < (options.steps ?? 400); step += 1) {
    meters += speed * 0.1;
    elapsedMs += 100;

    const result = advanceObstacle(current, {
      playerMeters: meters,
      speedMetersPerSecond: speed,
      elapsedMs,
    });

    current = result.obstacle;
    events.push(...result.events.map((event) => event.type));
  }

  return { obstacle: current, events, meters, elapsedMs };
}

describe('placing an obstacle', () => {
  it('adds the avoidance move to the budget, not just the typing time', () => {
    const obstacle = place();
    const budgetMeters = (obstacle.timing.availableMs / 1_000) * BASE_SPEED;
    const reserveMeters = (motionReserveMs(CRATE.action, MAP_1.motion) / 1_000) * BASE_SPEED;

    expect(obstacle.impactMeters).toBeGreaterThan(100);
    // The reserve is road, not slack: the player's deadline is unchanged, but
    // the hazard sits far enough away for the jump to reach clearance first.
    expect(distanceToImpact(obstacle, 100)).toBeCloseTo(
      (budgetMeters + reserveMeters) * WARNING_LEAD_FACTOR,
      5,
    );
    expect(distanceToImpact(obstacle, 100)).toBeGreaterThan(budgetMeters * WARNING_LEAD_FACTOR);
  });

  it('starts with no prompt attached and no deadline', () => {
    const obstacle = place();

    expect(obstacle.status).toBe('approaching');
    expect(obstacle.attachedAtMs).toBeNull();
    expect(obstacle.deadlineAtMs).toBeNull();
    expect(remainingMs(obstacle, 5_000)).toBeNull();
  });

  it('uses base speed, so an obstacle placed during a boost is not short-changed', () => {
    // Placement never sees the boosted speed — the same map always places the
    // same obstacle at the same distance.
    const first = place();
    const second = place();

    expect(second.impactMeters).toBe(first.impactMeters);
  });

  it('gives a longer prompt a longer run-up', () => {
    const phrase = ALL_PROMPTS.find((entry) => entry.text === 'down the road') as PromptEntry;

    expect(place({ prompt: phrase }).impactMeters).toBeGreaterThan(place().impactMeters);
  });

  it('accounts for the obstacle-specific reaction allowance', () => {
    const truck = findObstacle('box-truck') as ObstacleDefinition;
    const withTruck = place({ definition: truck });

    // Harder to notice, so more lead time even for the same prompt.
    expect(withTruck.timing.availableMs).toBeGreaterThan(place().timing.availableMs);
  });
});

describe('the fairness promise', () => {
  it('leaves slack above the expected typing time', () => {
    const obstacle = place();

    expect(isFair(obstacle)).toBe(true);
    expect(obstacle.timing.spareMs).toBeGreaterThan(0);
  });

  it('never demands more than the map advertises, for anything Map 1 can spawn', () => {
    for (const id of MAP_1.content.obstacleIds) {
      const definition = findObstacle(id) as ObstacleDefinition;

      for (const prompt of ALL_PROMPTS) {
        if (!MAP_1.content.promptCategories.includes(prompt.category)) continue;

        const obstacle = place({ definition, prompt });
        const demanded = requiredWpm(prompt.normalizedText.length, obstacle.timing.availableMs);

        // The whole point of deriving placement from the timing budget: the
        // stated 20 WPM has to be enough.
        expect(demanded).toBeLessThanOrEqual(MAP_1.targetWpm);
        expect(isFair(obstacle)).toBe(true);
      }
    }
  });
});

describe('approaching', () => {
  it('warns before the prompt attaches', () => {
    const { events } = approach(place());

    expect(events[0]).toBe('obstacleWarning');
    expect(events.indexOf('obstacleWarning')).toBeLessThan(events.indexOf('promptAttached'));
  });

  it('warns exactly once', () => {
    const { events } = approach(place());

    expect(events.filter((event) => event === 'obstacleWarning')).toHaveLength(1);
  });

  it('attaches the prompt exactly once, at the budget', () => {
    let current = place();
    let meters = 100;
    let elapsedMs = 5_000;
    let attachedAt: number | null = null;

    for (let step = 0; step < 200 && current.status === 'approaching'; step += 1) {
      meters += BASE_SPEED * 0.1;
      elapsedMs += 100;
      const result = advanceObstacle(current, {
        playerMeters: meters,
        speedMetersPerSecond: BASE_SPEED,
        elapsedMs,
      });
      current = result.obstacle;
      if (result.events.some((event) => event.type === 'promptAttached')) attachedAt = elapsedMs;
    }

    expect(current.status).toBe('active');
    expect(attachedAt).toBe(current.attachedAtMs);
    // The prompt attaches a reserve *before* the budget would put it, so the
    // deadline lands a move's worth of road in front of the collision plane
    // rather than on top of it. The player's own budget is unchanged.
    const attachedWith = current.timing.availableMs + current.reserveMs;
    expect(timeToImpact(current, meters, BASE_SPEED)).toBeLessThanOrEqual(attachedWith);
    expect(timeToImpact(current, meters, BASE_SPEED)).toBeGreaterThan(
      attachedWith - BASE_SPEED * 0.1 * 200,
    );
    expect(current.deadlineAtMs).toBe((current.attachedAtMs ?? 0) + current.timing.availableMs);
  });

  it('freezes the deadline at attachment, so speeding up cannot shorten it', () => {
    const attached = approach(place(), { steps: 60 }).obstacle;
    expect(attached.status).toBe('active');

    const deadline = attached.deadlineAtMs;
    const boosted = advanceObstacle(attached, {
      playerMeters: 200,
      speedMetersPerSecond: BASE_SPEED * 2,
      elapsedMs: (attached.attachedAtMs ?? 0) + 100,
    });

    expect(boosted.obstacle.deadlineAtMs).toBe(deadline);
  });

  it('counts the deadline down', () => {
    const attached = approach(place(), { steps: 60 }).obstacle;
    const attachedAt = attached.attachedAtMs ?? 0;

    expect(remainingMs(attached, attachedAt)).toBeCloseTo(attached.timing.availableMs, 5);
    expect(remainingMs(attached, attachedAt + 200)).toBeCloseTo(
      attached.timing.availableMs - 200,
      5,
    );
    expect(remainingMs(attached, attachedAt + 999_999)).toBe(0);
  });

  it('reports the deadline once when the prompt is never finished', () => {
    const { obstacle, events } = approach(place());

    expect(obstacle.expired).toBe(true);
    // The status stays `active` — `resolution.ts` owns what an expiry costs.
    expect(obstacle.status).toBe('active');
    expect(events.filter((event) => event === 'deadlineExpired')).toHaveLength(1);
  });

  it('goes quiet once it has expired', () => {
    const missed = approach(place()).obstacle;
    const later = advanceObstacle(missed, {
      playerMeters: 10_000,
      speedMetersPerSecond: BASE_SPEED,
      elapsedMs: 999_999,
    });

    expect(later.events).toHaveLength(0);
    expect(later.obstacle).toBe(missed);
  });

  it('never fires anything for a resolved obstacle', () => {
    const attached = approach(place(), { steps: 60 }).obstacle;
    const resolved: ActiveObstacle = { ...attached, status: 'resolved' };

    const result = advanceObstacle(resolved, {
      playerMeters: 999,
      speedMetersPerSecond: BASE_SPEED,
      elapsedMs: 999_999,
    });

    expect(result.events).toHaveLength(0);
  });

  it('does not fire a burst when a long frame crosses both thresholds', () => {
    const obstacle = place();
    // One 4-second frame, from placement to well past attachment.
    const result = advanceObstacle(obstacle, {
      playerMeters: obstacle.impactMeters - 1,
      speedMetersPerSecond: BASE_SPEED,
      elapsedMs: 9_000,
    });

    expect(result.events.map((event) => event.type)).toEqual(['obstacleWarning', 'promptAttached']);
  });
});

describe('pressure reporting', () => {
  it('reads safe while still approaching', () => {
    expect(obstaclePressure(place(), 5_000)).toBe('safe');
    expect(obstacleProgress(place(), 5_000)).toBe(0);
  });

  it('escalates as the deadline closes', () => {
    const attached = approach(place(), { steps: 60 }).obstacle;
    const attachedAt = attached.attachedAtMs ?? 0;
    const budget = attached.timing.availableMs;

    expect(obstaclePressure(attached, attachedAt)).toBe('safe');
    expect(obstaclePressure(attached, attachedAt + budget * 0.6)).toBe('warning');
    expect(obstaclePressure(attached, attachedAt + budget * 0.8)).toBe('critical');
    expect(obstaclePressure(attached, attachedAt + budget)).toBe('expired');
  });

  it('fills the pressure meter across the budget', () => {
    const attached = approach(place(), { steps: 60 }).obstacle;
    const attachedAt = attached.attachedAtMs ?? 0;

    expect(obstacleProgress(attached, attachedAt)).toBe(0);
    expect(obstacleProgress(attached, attachedAt + attached.timing.availableMs / 2)).toBeCloseTo(
      0.5,
      5,
    );
    expect(obstacleProgress(attached, attachedAt + 999_999)).toBe(1);
  });

  it('stops pressuring a resolved obstacle', () => {
    const attached = approach(place(), { steps: 60 }).obstacle;
    const resolved: ActiveObstacle = { ...attached, status: 'resolved' };

    expect(obstaclePressure(resolved, (attached.attachedAtMs ?? 0) + 999_999)).toBe('safe');
  });
});

describe('advancing a list', () => {
  it('advances every obstacle and collects their events', () => {
    const map: MapConfig = MAP_1;
    const first = place({ instanceId: 'a' });
    const second = place({ instanceId: 'b', playerMeters: 140 });

    const result = advanceObstacles([first, second], {
      playerMeters: 120,
      speedMetersPerSecond: map.baseSpeedMetersPerSecond,
      elapsedMs: 6_000,
    });

    expect(result.obstacles).toHaveLength(2);
    expect(result.events.filter((event) => event.type === 'obstacleWarning')).toHaveLength(2);
  });

  it('forgets obstacles the MC has run well past', () => {
    const obstacle = place();

    const result = advanceObstacles([obstacle], {
      playerMeters: obstacle.impactMeters + 50,
      speedMetersPerSecond: BASE_SPEED,
      elapsedMs: 60_000,
    });

    expect(result.obstacles).toHaveLength(0);
  });

  it('keeps an obstacle that is only just behind, so D3 can still resolve it', () => {
    const obstacle = place();

    const result = advanceObstacles([obstacle], {
      playerMeters: obstacle.impactMeters + 1,
      speedMetersPerSecond: BASE_SPEED,
      elapsedMs: 20_000,
    });

    expect(result.obstacles).toHaveLength(1);
  });

  it('leaves the input array untouched', () => {
    const obstacle = place();
    const list = [obstacle];

    advanceObstacles(list, {
      playerMeters: 200,
      speedMetersPerSecond: BASE_SPEED,
      elapsedMs: 9_000,
    });

    expect(list).toEqual([obstacle]);
  });
});
