import { describe, expect, it } from 'vitest';

import { MAP_1, OBSTACLES, ALL_PROMPTS } from '../../content';
import {
  activeObstacle,
  advanceRunSession,
  applyRunInput,
  createRunSession,
  obstacleSuccessRate,
  type RunSession,
  type SessionEvent,
  startRun,
} from './run-session';

/**
 * Obstacles inside a real run (step D4).
 *
 * The whole simulation is pure, so a full run — spawn, warning, attachment,
 * resolution, consequences — plays out here without a canvas or a clock.
 */

function newSession(seed = 'obstacle-seed'): RunSession {
  return startRun(
    createRunSession({
      map: MAP_1,
      pool: ALL_PROMPTS,
      obstacles: OBSTACLES,
      seed,
    }),
  ).session;
}

/** Types whatever prompt is on screen, one character at a time. */
function typeCurrentPrompt(session: RunSession): { session: RunSession; events: SessionEvent[] } {
  const target = session.prompt?.text ?? '';
  let current = session;
  const events: SessionEvent[] = [];

  for (let index = 1; index <= target.length; index += 1) {
    const result = applyRunInput(current, target.slice(0, index));
    current = result.session;
    events.push(...result.events);
  }

  return { session: current, events };
}

/**
 * Steps forward without touching the keyboard.
 *
 * Only safe for short stretches: a player who types nothing is caught by the
 * dogs in about seventeen seconds, which is the whole point of the chase.
 */
function idle(session: RunSession, totalMs: number) {
  let current = session;
  const events: SessionEvent[] = [];

  for (let elapsed = 0; elapsed < totalMs && current.phase === 'running'; elapsed += 16) {
    const result = advanceRunSession(current, 16);
    current = result.session;
    events.push(...result.events);
  }

  return { session: current, events };
}

/**
 * Plays properly: clears every boost prompt while running, so the boosts keep
 * the dogs off and the run survives long enough for obstacles to appear.
 * Obstacle prompts are deliberately left alone — the tests decide what to do
 * with those.
 */
function playUntil(session: RunSession, done: (session: RunSession) => boolean, maxSteps = 6_000) {
  let current = session;
  const events: SessionEvent[] = [];

  for (let step = 0; step < maxSteps && current.phase === 'running'; step += 1) {
    if (current.promptObstacleId === null) {
      const typed = typeCurrentPrompt(current);
      current = typed.session;
      events.push(...typed.events);
    }

    if (done(current)) break;

    const result = advanceRunSession(current, 16);
    current = result.session;
    events.push(...result.events);

    if (done(current)) break;
  }

  return { session: current, events };
}

/** Runs, playing well, until an obstacle prompt takes the field. */
function runToAttachedObstacle(session: RunSession) {
  return playUntil(session, (current) => current.promptObstacleId !== null);
}

describe('spawning into a run', () => {
  it('spawns obstacles from the map once the schedule comes due', () => {
    const { events } = runToAttachedObstacle(newSession());

    expect(events.filter((event) => event.type === 'obstacleSpawned').length).toBeGreaterThan(0);
  });

  it('only spawns obstacles the map allows', () => {
    const { events } = playUntil(newSession(), (session) => session.obstaclesFaced >= 3);

    for (const event of events) {
      if (event.type !== 'obstacleSpawned') continue;

      expect(MAP_1.content.obstacleIds).toContain(event.obstacle.definition.id);
    }
  });

  it('gives every obstacle a prompt from its own category', () => {
    const { events } = playUntil(newSession(), (session) => session.obstaclesFaced >= 3);
    const spawned = events.filter((event) => event.type === 'obstacleSpawned');

    expect(spawned.length).toBeGreaterThan(0);
    for (const event of spawned) {
      expect(event.obstacle.prompt.category).toBe(event.obstacle.definition.promptCategory);
    }
  });

  it('spawns nothing when the run has no obstacle definitions', () => {
    const bare = startRun(
      createRunSession({ map: MAP_1, pool: ALL_PROMPTS, seed: 'bare' }),
    ).session;

    // Played well, this run reaches the finish line — and never sees an
    // obstacle on the way.
    const { session, events } = playUntil(bare, (current) => current.phase !== 'running');

    expect(session.phase).toBe('levelComplete');
    expect(events.filter((event) => event.type === 'obstacleSpawned')).toHaveLength(0);
  });

  it('warns before it attaches the prompt', () => {
    const { events } = runToAttachedObstacle(newSession());
    const warning = events.findIndex((event) => event.type === 'obstacleWarning');
    const attached = events.findIndex((event) => event.type === 'obstacleAttached');

    expect(warning).toBeGreaterThanOrEqual(0);
    expect(attached).toBeGreaterThan(warning);
  });
});

describe('taking over the typing field', () => {
  it('hands the field to the obstacle when its prompt attaches', () => {
    const { session } = runToAttachedObstacle(newSession());
    const obstacle = activeObstacle(session);

    expect(obstacle).not.toBeNull();
    expect(session.prompt?.text).toBe(obstacle?.prompt.text);
    expect(session.typing.typed).toBe('');
  });

  it('returns to boost prompts once the obstacle is dealt with', () => {
    const attachedRun = runToAttachedObstacle(newSession());
    const { session } = typeCurrentPrompt(attachedRun.session);

    expect(session.promptObstacleId).toBeNull();
    expect(session.prompt).not.toBeNull();
  });
});

describe('clearing an obstacle', () => {
  it('scores it, boosts, and counts it as avoided', () => {
    const attachedRun = runToAttachedObstacle(newSession());
    const before = attachedRun.session;
    const { session, events } = typeCurrentPrompt(before);

    const resolved = events.find((event) => event.type === 'obstacleResolved');

    expect(resolved?.outcome).toBe('avoided');
    expect(session.score.score).toBeGreaterThan(before.score.score);
    expect(session.obstaclesAvoided).toBe(1);
    expect(session.boostRemainingMs).toBeGreaterThan(0);
  });

  it('plays the avoidance move the obstacle calls for', () => {
    const attachedRun = runToAttachedObstacle(newSession());
    const obstacle = activeObstacle(attachedRun.session);
    const { events } = typeCurrentPrompt(attachedRun.session);

    const resolved = events.find((event) => event.type === 'obstacleResolved');

    expect(resolved?.move).toBe(obstacle?.definition.action);
  });

  it('does not cost the player any ground', () => {
    const attachedRun = runToAttachedObstacle(newSession());
    const before = attachedRun.session.chase.distanceMeters;
    const { session } = typeCurrentPrompt(attachedRun.session);

    expect(session.chase.distanceMeters).toBeGreaterThanOrEqual(before);
  });

  it('removes the obstacle from the world', () => {
    const attachedRun = runToAttachedObstacle(newSession());
    const instanceId = attachedRun.session.promptObstacleId;
    const { session } = typeCurrentPrompt(attachedRun.session);

    expect(session.obstacles.some((entry) => entry.instanceId === instanceId)).toBe(false);
  });
});

describe('missing an obstacle', () => {
  /** Runs past the deadline without typing anything. */
  function missOne(session: RunSession) {
    const attachedRun = runToAttachedObstacle(session);
    const obstacle = activeObstacle(attachedRun.session);
    const budget = obstacle?.timing.availableMs ?? 0;

    return { before: attachedRun.session, ...idle(attachedRun.session, budget + 500) };
  }

  it('charges a collision when nothing was typed', () => {
    const { before, session, events } = missOne(newSession());
    const resolved = events.find((event) => event.type === 'obstacleResolved');

    expect(resolved?.outcome).toBe('hit');
    expect(resolved?.move).toBe('impact');
    expect(session.collisions).toBe(1);
    expect(session.chase.distanceMeters).toBeLessThan(before.chase.distanceMeters);
  });

  it('costs the map’s collision penalty', () => {
    const { before, session } = missOne(newSession());
    const lost = before.chase.distanceMeters - session.chase.distanceMeters;

    // Everything above the penalty is the ordinary catch-up over those seconds.
    expect(lost).toBeGreaterThanOrEqual(MAP_1.chase.collisionPenaltyMeters);
  });

  it('breaks the combo', () => {
    const attachedRun = runToAttachedObstacle(newSession());
    const obstacle = activeObstacle(attachedRun.session);

    // The boost prompts cleared on the way here have built a combo.
    expect(attachedRun.session.score.combo).toBeGreaterThan(0);

    const missed = idle(attachedRun.session, (obstacle?.timing.availableMs ?? 0) + 500).session;

    expect(missed.score.combo).toBe(0);
  });

  it('is gentler when the player nearly finished the prompt', () => {
    const attachedRun = runToAttachedObstacle(newSession());
    const obstacle = activeObstacle(attachedRun.session);
    const target = obstacle?.prompt.text ?? '';
    // Everything but the last character: past the stumble threshold for any
    // prompt of two characters or more, and never accidentally the whole word.
    const nearly = applyRunInput(attachedRun.session, target.slice(0, -1)).session;

    expect(nearly.typing.complete).toBe(false);

    const { session, events } = idle(nearly, (obstacle?.timing.availableMs ?? 0) + 500);
    const resolved = events.find((event) => event.type === 'obstacleResolved');

    expect(resolved?.outcome).toBe('stumbled');
    expect(resolved?.move).toBe('stumble');
    expect(session.stumbles).toBe(1);
    expect(session.collisions).toBe(0);

    // The same obstacle, the same seconds, but nothing typed: a collision. The
    // stumble has to leave the player better off, or the near-miss is pointless.
    const wait = (obstacle?.timing.availableMs ?? 0) + 500;
    const collided = idle(attachedRun.session, wait).session;

    expect(collided.collisions).toBe(1);
    expect(session.chase.distanceMeters).toBeGreaterThan(collided.chase.distanceMeters);
  });

  it('gives the field back so the run can continue', () => {
    const { session } = missOne(newSession());

    expect(session.promptObstacleId).toBeNull();
    expect(session.prompt).not.toBeNull();
  });
});

describe('the double-resolution guard, end to end', () => {
  it('charges a missed obstacle exactly once however long the run continues', () => {
    const { session, events } = (() => {
      const attachedRun = runToAttachedObstacle(newSession());
      const obstacle = activeObstacle(attachedRun.session);

      return idle(attachedRun.session, (obstacle?.timing.availableMs ?? 0) + 20_000);
    })();

    const resolutions = events.filter((event) => event.type === 'obstacleResolved');
    const forTheFirst = resolutions.filter((event) => event.obstacle.instanceId === 'obstacle-1');

    expect(forTheFirst).toHaveLength(1);
    expect(session.collisions + session.stumbles).toBe(resolutions.length);
  });

  it('ignores input arriving for an obstacle that has already resolved', () => {
    const attachedRun = runToAttachedObstacle(newSession());
    const target = attachedRun.session.prompt?.text ?? '';
    const cleared = typeCurrentPrompt(attachedRun.session).session;
    const scoreAfter = cleared.score.score;

    // The old prompt's text arriving late must not resolve anything twice.
    const late = applyRunInput(cleared, target).session;

    expect(late.obstaclesAvoided).toBe(1);
    expect(late.score.score).toBeLessThanOrEqual(scoreAfter + 1_000);
  });
});

describe('run statistics', () => {
  it('reports a perfect rate when nothing was faced', () => {
    expect(obstacleSuccessRate(newSession())).toBe(1);
  });

  it('tracks the success rate across a run', () => {
    const attachedRun = runToAttachedObstacle(newSession());
    const cleared = typeCurrentPrompt(attachedRun.session).session;

    expect(obstacleSuccessRate(cleared)).toBe(1);

    const next = runToAttachedObstacle(cleared);
    const obstacle = activeObstacle(next.session);
    const missed = idle(next.session, (obstacle?.timing.availableMs ?? 0) + 500).session;

    expect(missed.obstaclesAvoided).toBe(1);
    expect(missed.collisions + missed.stumbles).toBe(1);
    expect(obstacleSuccessRate(missed)).toBeCloseTo(0.5);
  });

  it('counts every obstacle it faced', () => {
    const { session } = playUntil(newSession(), (current) => current.obstaclesFaced >= 3);

    expect(session.obstaclesFaced).toBeGreaterThan(0);
    expect(session.obstaclesFaced).toBeGreaterThanOrEqual(
      session.obstaclesAvoided + session.stumbles + session.collisions,
    );
  });
});

describe('determinism with obstacles', () => {
  it('produces the same run for the same seed', () => {
    const target = (session: RunSession) => session.obstaclesFaced >= 3;
    const first = playUntil(newSession('fixed'), target).session;
    const second = playUntil(newSession('fixed'), target).session;

    expect(second.obstaclesFaced).toBe(first.obstaclesFaced);
    expect(second.collisions).toBe(first.collisions);
    expect(second.chase.distanceMeters).toBeCloseTo(first.chase.distanceMeters);
  });
});
