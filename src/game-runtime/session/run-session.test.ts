import { describe, expect, it } from 'vitest';

import { ALL_PROMPTS, MAP_1, OBSTACLES } from '../../content';
import { isSettled, lanePosition } from '../../game-core/motion';
import {
  activeObstacle,
  advanceRunSession,
  applyRunInput,
  createRunSession,
  currentSpeed,
  IMPACT_BEAT_MS,
  isBoosting,
  liveStats,
  obstacleSuccessRate,
  pauseRun,
  playerLane,
  type RunSession,
  resumeRun,
  runProgress,
  startRun,
} from './run-session';

/**
 * The run, end to end, with no pixels involved.
 *
 * This is the milestone the whole rework aimed at: the game is correct and
 * fully tested before anything is drawn. If a hazard is unfair, if a lane change
 * lands late, if a pause loses a player time — it shows up here, not in a
 * playtest.
 */

const STEP_MS = 16;

function newSession(seed = 'test-seed', withHazards = true): RunSession {
  return startRun(
    createRunSession({
      map: MAP_1,
      pool: ALL_PROMPTS,
      obstacles: withHazards ? OBSTACLES : [],
      seed,
    }),
  ).session;
}

/** Runs the simulation forward, as the loop would. Stops when the run ends. */
function advance(session: RunSession, totalMs: number): RunSession {
  let current = session;

  for (let elapsed = 0; elapsed < totalMs; elapsed += STEP_MS) {
    if (current.phase !== 'running' && current.phase !== 'impact') break;
    current = advanceRunSession(current, STEP_MS).session;
  }

  return current;
}

/** Advances until a challenge is on screen, or gives up. */
function untilChallenge(session: RunSession, limitMs = 60_000): RunSession {
  let current = session;

  for (let elapsed = 0; elapsed < limitMs; elapsed += STEP_MS) {
    if (current.prompt !== null || current.phase !== 'running') break;
    current = advanceRunSession(current, STEP_MS).session;
  }

  return current;
}

/** Types the current word perfectly, one character at a time. */
function typePrompt(session: RunSession): RunSession {
  const target = session.prompt?.text ?? '';
  let current = session;

  for (let index = 1; index <= target.length; index += 1) {
    current = applyRunInput(current, target.slice(0, index)).session;
  }

  return current;
}

describe('setting up a run', () => {
  it('starts settled in the centre lane with nothing to type', () => {
    const session = createRunSession({ map: MAP_1, pool: ALL_PROMPTS, seed: 'a' });

    expect(session.phase).toBe('ready');
    expect(session.prompt).toBeNull();
    expect(playerLane(session)).toBe(1);
    expect(isSettled(session.motion)).toBe(true);
    expect(session.failureReason).toBeNull();
  });

  it('does not move until it is started', () => {
    const ready = createRunSession({ map: MAP_1, pool: ALL_PROMPTS, seed: 'a' });

    expect(advanceRunSession(ready, 1_000).session.playerMeters).toBe(0);
  });

  it('is reproducible from its seed', () => {
    const first = advance(newSession('same'), 20_000);
    const second = advance(newSession('same'), 20_000);

    expect(second.playerMeters).toBeCloseTo(first.playerMeters, 9);
    expect(second.obstacles.map((entry) => entry.definition.id)).toEqual(
      first.obstacles.map((entry) => entry.definition.id),
    );
  });
});

describe('the road', () => {
  it('carries the player forward at the map’s speed', () => {
    const session = advanceRunSession(newSession(), 1_000).session;

    expect(session.playerMeters).toBeCloseTo(MAP_1.baseSpeedMetersPerSecond, 6);
  });

  it('speeds up as the run goes on, up to the map’s ceiling', () => {
    const early = currentSpeed(newSession());
    const later = currentSpeed({ ...newSession(), elapsedMs: 90_000 });

    expect(later).toBeGreaterThan(early);
    expect(later).toBeLessThanOrEqual(MAP_1.speed.maxMetersPerSecond);
  });

  it('reports progress toward the finish line', () => {
    const session = newSession();

    expect(runProgress(session)).toBe(0);
    expect(runProgress({ ...session, playerMeters: MAP_1.distanceMeters })).toBe(1);
    // Overshooting the line on the last step must not read as more than done.
    expect(runProgress({ ...session, playerMeters: MAP_1.distanceMeters * 2 })).toBe(1);
  });
});

describe('hazards', () => {
  it('brings a hazard with a word to type', () => {
    const session = untilChallenge(newSession());

    expect(session.prompt).not.toBeNull();
    expect(activeObstacle(session)).not.toBeNull();
  });

  it('only ever has one unresolved hazard on the road', () => {
    let session = newSession('crowd');

    for (let elapsed = 0; elapsed < 120_000; elapsed += STEP_MS) {
      if (session.phase !== 'running') break;
      session = advanceRunSession(session, STEP_MS).session;

      const live = session.obstacles.filter(
        (entry) =>
          entry.status === 'approaching' ||
          entry.status === 'active' ||
          entry.status === 'committed',
      );
      expect(live.length).toBeLessThanOrEqual(1);
    }
  });

  it('always leaves a car hazard a lane to escape into', () => {
    let session = newSession('lanes');

    for (let elapsed = 0; elapsed < 200_000; elapsed += STEP_MS) {
      if (session.phase !== 'running') break;
      session = typePrompt(advanceRunSession(session, STEP_MS).session);

      for (const hazard of session.obstacles) {
        expect(hazard.blockedLanes.length).toBeLessThan(3);
        if (hazard.definition.action === 'lane-change') {
          expect(hazard.safeLane).not.toBeNull();
          expect(hazard.blockedLanes).not.toContain(hazard.safeLane);
        }
      }
    }
  });

  it('starts the move the hazard asks for when the word is finished', () => {
    let session = untilChallenge(newSession('move'));
    const hazard = activeObstacle(session);
    expect(hazard).not.toBeNull();

    session = typePrompt(session);

    const committed = session.obstacles.find((entry) => entry.instanceId === hazard?.instanceId);
    expect(committed?.status).toBe('committed');

    if (hazard?.definition.action === 'lane-change') {
      // A lane change starts at once: moving early is only ever safer.
      expect(isSettled(session.motion)).toBe(false);
      expect(session.motion.transition?.toLane).toBe(hazard.safeLane);
    } else {
      // A jump waits. Started here it would land again before the obstacle
      // arrived — the PDF asks for a jump synchronised to the collision point.
      expect(session.motion.jump).toBeNull();
      expect(committed?.moveStarted).toBe(false);

      const airborne = advance(session, 10_000);
      expect(airborne.obstaclesAvoided).toBeGreaterThan(0);
    }
  });

  it('clears the hazard when the word was typed in time', () => {
    let session = untilChallenge(newSession('clear'));
    session = typePrompt(session);
    session = advance(session, 10_000);

    expect(session.obstaclesAvoided).toBeGreaterThan(0);
    expect(session.collisions).toBe(0);
  });

  it('clears the word from the field once the hazard is done', () => {
    let session = untilChallenge(newSession('clear'));
    session = typePrompt(session);
    session = advance(session, 6_000);

    // Between hazards there is nothing to type. The old game always had a boost
    // prompt on screen; this one is quiet until the next car appears.
    expect(session.promptObstacleId).toBeNull();
  });

  it('earns a boost for clearing a hazard', () => {
    let session = untilChallenge(newSession('boost'));
    expect(isBoosting(session)).toBe(false);

    session = typePrompt(session);
    expect(isBoosting(session)).toBe(true);
    expect(currentSpeed(session)).toBeGreaterThan(MAP_1.baseSpeedMetersPerSecond);
  });

  it('leaves the road quiet for a moment after a hazard', () => {
    let session = untilChallenge(newSession('recovery'));
    session = typePrompt(session);
    session = advance(session, 1_000);

    const quiet = session.obstacles.filter((entry) => entry.status === 'approaching');
    expect(quiet).toHaveLength(0);
  });
});

describe('failing', () => {
  it('ends the run when a hazard is not answered', () => {
    // Never type anything. The first hazard is the last thing that happens.
    const session = advance(newSession('doomed'), 120_000);

    expect(session.phase).toBe('gameOver');
    expect(session.collisions).toBe(1);
    expect(session.failureReason).not.toBeNull();
  });

  it('holds the impact for a readable beat before ending', () => {
    let session = newSession('beat');

    for (let elapsed = 0; elapsed < 120_000; elapsed += STEP_MS) {
      const next = advanceRunSession(session, STEP_MS).session;
      if (next.phase === 'impact') {
        session = next;
        break;
      }
      session = next;
    }

    expect(session.phase).toBe('impact');
    expect(session.impactRemainingMs).toBeGreaterThan(0);

    // Still running down during the beat, then over.
    const midway = advanceRunSession(session, IMPACT_BEAT_MS / 2).session;
    expect(midway.phase).toBe('impact');
    expect(advanceRunSession(midway, IMPACT_BEAT_MS).session.phase).toBe('gameOver');
  });

  it('does not move the player during the impact beat', () => {
    let session = newSession('frozen');
    while (session.phase === 'running') session = advanceRunSession(session, STEP_MS).session;

    const meters = session.playerMeters;
    expect(advanceRunSession(session, 100).session.playerMeters).toBe(meters);
  });
});

describe('typing', () => {
  it('is forgiving — a mistake costs the combo, not the run', () => {
    let session = untilChallenge(newSession('forgiving'));
    const target = session.prompt?.text ?? '';

    session = applyRunInput(session, target.slice(0, 2)).session;
    session = applyRunInput(session, `${target.slice(0, 2)}#`).session;

    expect(session.phase).toBe('running');
    expect(session.score.combo).toBe(0);
    expect(session.typing.incorrectCharacters).toBeGreaterThan(0);

    // And it can still be corrected and finished.
    session = typePrompt(applyRunInput(session, target.slice(0, 2)).session);
    expect(session.completedPrompts).toBe(1);
  });

  it('ignores input when there is nothing to type', () => {
    const session = newSession();
    expect(session.prompt).toBeNull();

    expect(applyRunInput(session, 'anything').session).toBe(session);
  });

  it('ignores input once the run is over', () => {
    const over = advance(newSession('over'), 120_000);

    expect(applyRunInput(over, 'x').session).toBe(over);
  });
});

describe('pausing', () => {
  it('freezes the world, the clock, and any move in flight', () => {
    let session = untilChallenge(newSession('pause'));
    session = typePrompt(session);
    session = advanceRunSession(session, 100).session;

    const paused = pauseRun(session).session;
    const frozen = { ...paused };

    const later = advanceRunSession(paused, 5_000).session;

    expect(later.elapsedMs).toBe(frozen.elapsedMs);
    expect(later.playerMeters).toBe(frozen.playerMeters);
    expect(lanePosition(later.motion)).toBe(lanePosition(frozen.motion));
    expect(later.motion.transition?.elapsedMs).toBe(frozen.motion.transition?.elapsedMs);
  });

  it('gives back exactly the deadline the player had', () => {
    let session = untilChallenge(newSession('deadline'));
    session = advanceRunSession(session, 200).session;

    const hazard = activeObstacle(session);
    const remaining = (hazard?.deadlineAtMs ?? 0) - session.elapsedMs;

    const resumed = resumeRun(advanceRunSession(pauseRun(session).session, 30_000).session).session;
    const after = activeObstacle(resumed);

    expect((after?.deadlineAtMs ?? 0) - resumed.elapsedMs).toBeCloseTo(remaining, 9);
  });

  it('only pauses a running run', () => {
    const ready = createRunSession({ map: MAP_1, pool: ALL_PROMPTS, seed: 'a' });

    expect(pauseRun(ready).session.phase).toBe('ready');
    expect(resumeRun(newSession()).session.phase).toBe('running');
  });
});

describe('reporting', () => {
  it('measures WPM over time spent typing, not over the whole run', () => {
    let session = untilChallenge(newSession('wpm'));
    session = typePrompt(session);
    // A long quiet stretch between hazards.
    session = advance(session, 4_000);

    const stats = liveStats(session);

    expect(session.activeTypingMs).toBeGreaterThan(0);
    expect(session.activeTypingMs).toBeLessThan(session.elapsedMs);
    // Divided by run time this would read a fraction of the real speed.
    expect(stats.averageWpm).toBeGreaterThan(0);
  });

  it('reports speed and lane for the HUD and the scene', () => {
    const stats = liveStats(newSession());

    expect(stats.speedMetersPerSecond).toBeCloseTo(MAP_1.baseSpeedMetersPerSecond, 6);
    expect(stats.lanePosition).toBe(1);
  });

  it('counts a hazard success rate, and calls an empty run perfect', () => {
    expect(obstacleSuccessRate(newSession())).toBe(1);

    let session = untilChallenge(newSession('rate'));
    session = advance(typePrompt(session), 8_000);

    expect(obstacleSuccessRate(session)).toBe(1);
  });
});

describe('finishing', () => {
  it('reaches the finish line and stops exactly on it', () => {
    let session = newSession('finish', false);
    session = advance(session, 200_000);

    expect(session.phase).toBe('levelComplete');
    expect(session.playerMeters).toBe(MAP_1.distanceMeters);
  });

  it('does not keep simulating once it is over', () => {
    const finished = advance(newSession('finish', false), 200_000);

    expect(advanceRunSession(finished, 1_000).session).toBe(finished);
  });
});
