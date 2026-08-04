import { describe, expect, it } from 'vitest';

import { ALL_PROMPTS, MAP_1, OBSTACLES } from '../../content';
import { isSettled, lanePosition } from '../../game-core/motion';
import {
  activeCoin,
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

/**
 * Advances until a *hazard* word is on screen, or gives up.
 *
 * Coins and powerups also hold the field, and a coin usually gets there first —
 * so waiting for "any word" would hand these tests the wrong encounter.
 */
function untilChallenge(session: RunSession, limitMs = 90_000): RunSession {
  let current = session;

  for (let elapsed = 0; elapsed < limitMs; elapsed += STEP_MS) {
    if (current.challenge?.kind === 'hazard' || current.phase !== 'running') break;
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

  // Long, densely-typed simulations: a word is on screen at almost every step
  // now, so these walk far more encounters than the default timeout allows.
  it('always leaves a car hazard a lane to escape into', { timeout: 30_000 }, () => {
    let session = newSession('lanes');

    for (let elapsed = 0; elapsed < 120_000; elapsed += STEP_MS) {
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

  it('hands the field back once the hazard is done', () => {
    let session = untilChallenge(newSession('clear'));
    const hazardId = session.challenge?.id;
    session = typePrompt(session);
    session = advance(session, 6_000);

    // The hazard no longer owns the word. What comes next is either quiet road
    // or a line of coins, but it is not this hazard.
    expect(session.challenge?.id).not.toBe(hazardId);
  });

  it('earns a boost for clearing a hazard', () => {
    let session = untilChallenge(newSession('boost'));
    expect(isBoosting(session)).toBe(false);

    session = typePrompt(session);
    expect(isBoosting(session)).toBe(true);
    expect(currentSpeed(session)).toBeGreaterThan(MAP_1.baseSpeedMetersPerSecond);
  });

  it('pays a bigger boost for clearing with more of the budget to spare', () => {
    // The same hazard, same seed, cleared instantly versus cleared at the
    // last moment. Before the margin curve these produced identical speed,
    // which is why there was no reason to type faster than the deadline.
    const decisive = typePrompt(untilChallenge(newSession('margin')));

    let late = untilChallenge(newSession('margin'));
    const hazard = late.obstacles.find((entry) => entry.status === 'active');
    const budgetMs = hazard?.timing.availableMs ?? 0;
    // Sit on it until almost nothing is left, then answer.
    late = typePrompt(advance(late, budgetMs * 0.9));

    expect(isBoosting(decisive)).toBe(true);
    expect(isBoosting(late)).toBe(true);
    expect(decisive.boostMultiplier).toBeGreaterThan(late.boostMultiplier);
    expect(currentSpeed(decisive)).toBeGreaterThan(currentSpeed(late));
    // And the ceiling is still the map's own number, because hazard placement
    // is measured against it.
    expect(decisive.boostMultiplier).toBeLessThanOrEqual(MAP_1.boost.speedMultiplier);
  });

  it('never lets a weak clear cancel the speed a strong one already earned', () => {
    let session = typePrompt(untilChallenge(newSession('margin')));
    const earned = session.boostMultiplier;

    session = typePrompt(untilChallenge(session));

    expect(session.boostMultiplier).toBeGreaterThanOrEqual(earned);
  });

  it('leaves the road quiet for a moment after a hazard', () => {
    let session = untilChallenge(newSession('recovery'));
    session = typePrompt(session);
    session = advance(session, 1_000);

    const quiet = session.obstacles.filter((entry) => entry.status === 'approaching');
    expect(quiet).toHaveLength(0);
  });
});

describe('coins', () => {
  /**
   * Advances until a coin line owns the word, clearing hazards on the way.
   *
   * Hazards have to be typed or the run ends before any coins appear — which is
   * itself the point: coins live in the gaps a competent player creates.
   */
  function untilCoinWord(session: RunSession, limitMs = 90_000): RunSession {
    let current = session;

    for (let elapsed = 0; elapsed < limitMs; elapsed += STEP_MS) {
      if (current.challenge?.kind === 'coin') break;
      if (current.phase !== 'running') break;
      if (current.challenge?.kind === 'hazard') current = typePrompt(current);
      current = advanceRunSession(current, STEP_MS).session;
    }

    return current;
  }

  it('offers coins in the gaps, in a lane the player has to move to', () => {
    const session = untilCoinWord(newSession('coins'));

    expect(session.challenge?.kind).toBe('coin');
    const coin = activeCoin(session);
    expect(coin).not.toBeNull();
    expect(coin?.lane).not.toBe(session.motion.lane);
  });

  it('collects them when the word is typed', () => {
    let session = untilCoinWord(newSession('coins'));
    const before = session.score.score;

    session = advance(typePrompt(session), 8_000);

    expect(session.coinsCollected).toBeGreaterThan(0);
    expect(session.score.score).toBeGreaterThan(before);
  });

  it('does not collect them when the word is ignored', () => {
    // The rule the whole feature turns on: driving past coins is not collecting
    // them. The player has to type.
    let session = untilCoinWord(newSession('coins'));
    const lane = session.motion.lane;

    session = advance(session, 8_000);

    expect(session.coinsCollected).toBe(0);
    expect(session.coinsMissed).toBeGreaterThan(0);
    // And they were not nudged into the lane for free either.
    expect(session.motion.lane).toBe(lane);
  });

  it('costs nothing to ignore', () => {
    // No hazards in this one, deliberately. Ignoring a coin line means ignoring
    // whatever comes after it too, and hazards now follow closely enough that
    // the crash — not the coins — would be what changed the score.
    let session = untilCoinWord(newSession('coins', false));
    const before = { score: session.score.score, combo: session.score.combo };

    session = advance(session, 8_000);

    expect(session.score.score).toBe(before.score);
    // Not even the combo. Declining is free, or it is not optional.
    expect(session.score.combo).toBe(before.combo);
    expect(session.phase).toBe('running');
  });

  it('never lets a coin word compete with a hazard word', { timeout: 30_000 }, () => {
    let session = newSession('crowded');

    for (let elapsed = 0; elapsed < 90_000; elapsed += STEP_MS) {
      if (session.phase !== 'running') break;
      session = typePrompt(advanceRunSession(session, STEP_MS).session);

      // One word, whatever is on the road. The hazard always wins the field.
      const unanswered = session.coins.filter(
        (coin) => coin.status === 'approaching' || coin.status === 'active',
      );
      const hazardOwnsField = session.challenge?.kind === 'hazard';
      if (hazardOwnsField) expect(unanswered).toHaveLength(0);
    }
  });

  it('gives a hazard right of way over a coin swerve already under way', () => {
    // A player mid-collection who types their way out of a car must actually
    // get out of the way. The hazard preempts the swerve.
    let session = untilCoinWord(newSession('coins'));
    session = typePrompt(session);
    expect(isSettled(session.motion)).toBe(false);

    session = advance(session, 90_000);

    // Whatever happened, it was not a collision caused by being busy.
    expect(session.failureReason).not.toBe('late-move');
  });
});

describe('powerups', () => {
  /** Advances until a powerup sentence owns the field, clearing everything else. */
  function untilSentence(session: RunSession, limitMs = 200_000): RunSession {
    let current = session;

    for (let elapsed = 0; elapsed < limitMs; elapsed += STEP_MS) {
      if (current.challenge?.kind === 'powerup') break;
      if (current.phase !== 'running') break;
      if (current.challenge !== null) current = typePrompt(current);
      current = advanceRunSession(current, STEP_MS).session;
    }

    return current;
  }

  it('offers a sentence, not a word', () => {
    const session = untilSentence(newSession('power'));

    expect(session.challenge?.kind).toBe('powerup');
    expect(session.prompt?.text ?? '').toContain(' ');
  });

  it('grants the powerup when the sentence is typed cleanly', () => {
    let session = untilSentence(newSession('power'));
    session = typePrompt(session);

    expect(session.powerupsClaimed).toBe(1);
    expect(session.powerupsLost).toBe(0);

    const carrying =
      session.effects.shields > 0 ||
      session.effects.flightRemainingMs > 0 ||
      session.effects.magnetRemainingMs > 0;
    expect(carrying).toBe(true);
  });

  it('forfeits it outright on a single mistake', () => {
    let session = untilSentence(newSession('power'));
    const target = session.prompt?.text ?? '';

    session = applyRunInput(session, target.slice(0, 3)).session;
    session = applyRunInput(session, `${target.slice(0, 3)}#`).session;

    // Gone. Not a shorter deadline, not a partial reward.
    expect(session.powerupsLost).toBe(1);
    expect(session.powerupsClaimed).toBe(0);
    expect(session.challenge).toBeNull();

    // And typing the rest of it perfectly afterwards changes nothing.
    session = typePrompt(session);
    expect(session.powerupsClaimed).toBe(0);
  });

  it('costs nothing but the powerup', () => {
    let session = untilSentence(newSession('power'));
    const target = session.prompt?.text ?? '';
    const before = session.playerMeters;

    session = applyRunInput(session, `${target.slice(0, 2)}#`).session;

    expect(session.phase).toBe('running');
    expect(session.collisions).toBe(0);
    expect(session.playerMeters).toBe(before);
  });

  it('is offered about once a minute', { timeout: 30_000 }, () => {
    let session = newSession('cadence');
    const offers: number[] = [];
    let seen: string | null = null;

    for (let elapsed = 0; elapsed < 180_000; elapsed += STEP_MS) {
      if (session.phase !== 'running') break;
      if (session.challenge !== null) session = typePrompt(session);
      session = advanceRunSession(session, STEP_MS).session;

      const id = session.challenge?.kind === 'powerup' ? session.challenge.id : null;
      if (id !== null && id !== seen) {
        seen = id;
        offers.push(session.elapsedMs);
      }
    }

    expect(offers.length).toBeGreaterThanOrEqual(1);
    for (let index = 1; index < offers.length; index += 1) {
      const gap = (offers[index] ?? 0) - (offers[index - 1] ?? 0);
      // Never faster than the interval; some slack for finding a clear road.
      expect(gap).toBeGreaterThan(50_000);
    }
  });
});

describe('what a powerup buys', () => {
  it('a shield turns a fatal crash into a survivable one', () => {
    // Nothing typed, so the first hazard is a crash. With a shield in hand the
    // run carries on, which is the whole point of carrying one.
    let session: RunSession = {
      ...newSession('shielded'),
      effects: { flightRemainingMs: 0, magnetRemainingMs: 0, shields: 1 },
    };

    for (let elapsed = 0; elapsed < 60_000; elapsed += STEP_MS) {
      if (session.savedByShield > 0 || session.phase !== 'running') break;
      session = advanceRunSession(session, STEP_MS).session;
    }

    expect(session.savedByShield).toBe(1);
    expect(session.collisions).toBe(0);
    expect(session.phase).toBe('running');
    expect(session.effects.shields).toBe(0);
  });

  it('and the next crash after that still ends the run', () => {
    const shielded: RunSession = {
      ...newSession('spent'),
      effects: { flightRemainingMs: 0, magnetRemainingMs: 0, shields: 1 },
    };

    const after = advance(shielded, 200_000);

    expect(after.savedByShield).toBe(1);
    expect(after.phase).toBe('gameOver');
  });

  it('flight carries the player over everything, typed or not', () => {
    const flying: RunSession = {
      ...newSession('flying'),
      effects: { flightRemainingMs: 30_000, magnetRemainingMs: 0, shields: 0 },
    };

    // Twenty seconds of hazards, none of them answered.
    const after = advance(flying, 20_000);

    // Hazards were met and none of them landed. They are not *cleared* — a
    // waived hazard never asked anything, so counting it as an avoidance would
    // inflate the obstacle success rate for a player who typed nothing.
    expect(after.obstaclesFaced).toBeGreaterThan(0);
    expect(after.collisions).toBe(0);
    expect(after.phase).toBe('running');
  });

  it('never arms a hazard the flying player was shown no word for', () => {
    // The bug this guards: while flying there is nothing to type, but hazards
    // used to go active and start a deadline anyway. When flight ran out, that
    // deadline expired on a word the player had never seen — the game killing
    // them for having taken a powerup. See `ObstacleAdvanceInput.suspended`.
    const flying: RunSession = {
      ...newSession('waived'),
      effects: { flightRemainingMs: 12_000, magnetRemainingMs: 0, shields: 0 },
    };

    const after = advance(flying, 12_000);

    expect(after.obstacles.every((entry) => entry.status !== 'active')).toBe(true);
    expect(after.collisions).toBe(0);
  });

  it('and stops carrying them once it runs out', () => {
    const flying: RunSession = {
      ...newSession('landing'),
      effects: { flightRemainingMs: 4_000, magnetRemainingMs: 0, shields: 0 },
    };

    const after = advance(flying, 120_000);

    expect(after.phase).toBe('gameOver');
  });

  it('the magnet takes coins without going to them', () => {
    // The one exception to "typing is how you get coins" — and it was bought
    // with a whole sentence typed clean.
    let session: RunSession = {
      ...newSession('magnet'),
      effects: { flightRemainingMs: 120_000, magnetRemainingMs: 120_000, shields: 0 },
    };

    session = advance(session, 60_000);

    expect(session.coinsCollected).toBeGreaterThan(0);
    expect(session.coinsMissed).toBe(0);
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
