import { describe, expect, it } from 'vitest';

import { MAP_1 } from '../../content/maps';
import { findObstacle } from '../../content/obstacles';
import { ALL_PROMPTS } from '../../content/prompts';
import type { ObstacleDefinition, PromptEntry } from '../models';
import {
  advanceMotion,
  beginJump,
  beginLaneChange,
  createPlayerMotion,
  type PlayerMotion,
} from '../motion';
import { motionReserveMs } from '../timing';
import { applyInput, createTypingState, type TypingState } from '../typing';
import { type ActiveObstacle, commitObstacle, placeObstacle } from './active-obstacle';
import type { LaneAssignment } from './lane-assignment';
import {
  clearsHazard,
  expireObstacle,
  isResolvable,
  moveForOutcome,
  resolveAtImpact,
  typedFraction,
} from './resolution';

/**
 * Two gates, and what happens between them.
 *
 * Typing the word commits the player; the collision plane decides whether they
 * got clear. In practice the reserve makes a committed player always clear —
 * these tests check both that this is true and that the check would catch it if
 * it ever stopped being true.
 */

const CRATE = findObstacle('crate') as ObstacleDefinition;
const SEDAN = findObstacle('sedan') as ObstacleDefinition;
const PROMPT = ALL_PROMPTS.find((entry) => entry.text === 'gate') as PromptEntry;

const JUMP_LANES: LaneAssignment = { blockedLanes: [1], safeLane: null, safeSide: null };
const CAR_LANES: LaneAssignment = { blockedLanes: [1], safeLane: 2, safeSide: 'right' };

function place(definition: ObstacleDefinition, assignment: LaneAssignment): ActiveObstacle {
  return placeObstacle({
    instanceId: 'obstacle-1',
    definition,
    prompt: PROMPT,
    map: MAP_1,
    playerMeters: 0,
    elapsedMs: 0,
    assignment,
  });
}

/** Brings a hazard to the moment its prompt is attached. */
function attached(obstacle: ActiveObstacle): ActiveObstacle {
  return {
    ...obstacle,
    status: 'active',
    attachedAtMs: 1_000,
    deadlineAtMs: 1_000 + obstacle.timing.availableMs,
  };
}

function typed(text: string): TypingState {
  return applyInput(createTypingState(PROMPT.text), text);
}

const COMPLETE = typed(PROMPT.text);
const HALF = typed(PROMPT.text.slice(0, 2));
const NOTHING = createTypingState(PROMPT.text);

function airborneMotion(): PlayerMotion {
  return advanceMotion(
    beginJump(createPlayerMotion(), MAP_1.motion),
    MAP_1.motion.jumpAnticipationMs + MAP_1.motion.jumpAirborneMs / 2,
  );
}

describe('clearing a hazard', () => {
  it('needs a jump above clearance, not merely a jump in progress', () => {
    const obstacle = attached(place(CRATE, JUMP_LANES));

    const crouching = beginJump(createPlayerMotion(), MAP_1.motion);
    expect(clearsHazard(obstacle, crouching, MAP_1)).toBe(false);

    const airborne = advanceMotion(crouching, motionReserveMs('jump', MAP_1.motion));
    expect(clearsHazard(obstacle, airborne, MAP_1)).toBe(true);
  });

  it('needs a lane change to have landed, not to be halfway across', () => {
    const obstacle = attached(place(SEDAN, CAR_LANES));

    const moving = beginLaneChange(createPlayerMotion(), 2, MAP_1.motion);
    // Clipping a car with your back half is a collision in any game worth the
    // name.
    expect(
      clearsHazard(obstacle, advanceMotion(moving, MAP_1.motion.laneChangeMs / 2), MAP_1),
    ).toBe(false);
    expect(clearsHazard(obstacle, advanceMotion(moving, MAP_1.motion.laneChangeMs), MAP_1)).toBe(
      true,
    );
  });

  it('rejects standing still in the blocked lane', () => {
    expect(clearsHazard(attached(place(SEDAN, CAR_LANES)), createPlayerMotion(1), MAP_1)).toBe(
      false,
    );
    expect(clearsHazard(attached(place(CRATE, JUMP_LANES)), createPlayerMotion(1), MAP_1)).toBe(
      false,
    );
  });

  it('rejects the wrong safe lane', () => {
    // Lane 0 is open, but it is not the lane the challenge pointed at.
    expect(clearsHazard(attached(place(SEDAN, CAR_LANES)), createPlayerMotion(0), MAP_1)).toBe(
      false,
    );
  });
});

describe('at the collision plane', () => {
  it('clears a committed jump', () => {
    const obstacle = commitObstacle(attached(place(CRATE, JUMP_LANES)), 1_200);

    const result = resolveAtImpact({
      obstacle,
      motion: airborneMotion(),
      map: MAP_1,
      typing: COMPLETE,
      elapsedMs: 2_000,
    });

    expect(result.resolved?.outcome).toBe('avoided');
    expect(result.resolved?.failureReason).toBeNull();
    expect(result.obstacle.status).toBe('resolved');
  });

  it('clears a committed lane change', () => {
    const obstacle = commitObstacle(attached(place(SEDAN, CAR_LANES)), 1_200);
    const motion = advanceMotion(
      beginLaneChange(createPlayerMotion(), 2, MAP_1.motion),
      MAP_1.motion.laneChangeMs,
    );

    const result = resolveAtImpact({
      obstacle,
      motion,
      map: MAP_1,
      typing: COMPLETE,
      elapsedMs: 2_000,
    });

    expect(result.resolved?.outcome).toBe('avoided');
  });

  it('calls an uncommitted arrival a collision', () => {
    const result = resolveAtImpact({
      obstacle: attached(place(CRATE, JUMP_LANES)),
      motion: createPlayerMotion(),
      map: MAP_1,
      typing: HALF,
      elapsedMs: 2_000,
    });

    expect(result.resolved?.outcome).toBe('hit');
    expect(result.resolved?.failureReason).toBe('collision');
    expect(result.obstacle.status).toBe('missed');
  });

  it('tells a late move apart from never having typed the word', () => {
    // The same failure on screen, completely different meanings for the tuning:
    // one says the player was too slow, the other says the map was.
    const obstacle = commitObstacle(attached(place(SEDAN, CAR_LANES)), 1_900);
    const barelyMoving = advanceMotion(beginLaneChange(createPlayerMotion(), 2, MAP_1.motion), 40);

    const result = resolveAtImpact({
      obstacle,
      motion: barelyMoving,
      map: MAP_1,
      typing: COMPLETE,
      elapsedMs: 2_000,
    });

    expect(result.resolved?.outcome).toBe('hit');
    expect(result.resolved?.failureReason).toBe('late-move');
  });

  it('resolves once and only once', () => {
    const obstacle = commitObstacle(attached(place(CRATE, JUMP_LANES)), 1_200);
    const first = resolveAtImpact({
      obstacle,
      motion: airborneMotion(),
      map: MAP_1,
      typing: COMPLETE,
      elapsedMs: 2_000,
    });

    const second = resolveAtImpact({
      obstacle: first.obstacle,
      motion: airborneMotion(),
      map: MAP_1,
      typing: COMPLETE,
      elapsedMs: 2_100,
    });

    expect(second.resolved).toBeNull();
    expect(second.obstacle).toBe(first.obstacle);
  });

  it('credits the time left at the moment of commitment, not at impact', () => {
    // The player earned the bonus when they finished typing. Charging them for
    // the travel afterwards would make a fast finish worth less on a long road.
    const obstacle = commitObstacle(attached(place(CRATE, JUMP_LANES)), 1_500);

    const result = resolveAtImpact({
      obstacle,
      motion: airborneMotion(),
      map: MAP_1,
      typing: COMPLETE,
      elapsedMs: 9_999,
    });

    expect(result.resolved?.remainingMs).toBeCloseTo((obstacle.deadlineAtMs ?? 0) - 1_500, 6);
  });
});

describe('the deadline', () => {
  it('ends the run before the hazard is even reached', () => {
    const result = expireObstacle(attached(place(CRATE, JUMP_LANES)), HALF, 5_000);

    expect(result.resolved?.outcome).toBe('hit');
    expect(result.resolved?.failureReason).toBe('timeout');
    expect(result.obstacle.status).toBe('missed');
  });

  it('cannot expire a hazard already committed', () => {
    const obstacle = commitObstacle(attached(place(CRATE, JUMP_LANES)), 1_200);

    expect(expireObstacle(obstacle, COMPLETE, 5_000).resolved).toBeNull();
  });

  it('cannot expire a hazard twice', () => {
    const first = expireObstacle(attached(place(CRATE, JUMP_LANES)), NOTHING, 5_000);

    expect(expireObstacle(first.obstacle, NOTHING, 5_100).resolved).toBeNull();
  });
});

describe('guards and reporting', () => {
  it('treats approaching and finished hazards as unresolvable', () => {
    const obstacle = place(CRATE, JUMP_LANES);

    expect(isResolvable(obstacle)).toBe(false);
    expect(isResolvable(attached(obstacle))).toBe(true);
    expect(isResolvable(commitObstacle(attached(obstacle), 1))).toBe(true);
    expect(isResolvable({ ...obstacle, status: 'resolved' })).toBe(false);
    expect(isResolvable({ ...obstacle, status: 'missed' })).toBe(false);
  });

  it('reports how much was typed', () => {
    expect(typedFraction(COMPLETE)).toBe(1);
    expect(typedFraction(NOTHING)).toBe(0);
    expect(typedFraction(HALF)).toBeCloseTo(0.5);
    expect(typedFraction(createTypingState(''))).toBe(1);
  });

  it('plays the hazard’s own move on success and an impact on failure', () => {
    expect(moveForOutcome('avoided', 'jump')).toBe('jump');
    expect(moveForOutcome('avoided', 'lane-change')).toBe('lane-change');
    expect(moveForOutcome('hit', 'jump')).toBe('impact');
    expect(moveForOutcome('hit', 'lane-change')).toBe('impact');
  });
});
