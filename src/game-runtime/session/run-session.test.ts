import { describe, expect, it } from 'vitest';

import { ALL_PROMPTS, MAP_1, SURGES } from '../../content';
import { isSettled, lanePosition, MARGIN_FLOOR_SHARE } from '../../game-core/motion';
import {
  activeCoin,
  advanceRunSession,
  applyRunInput,
  createRunSession,
  currentSpeed,
  IMPACT_BEAT_MS,
  isBoosting,
  isSurging,
  liveStats,
  pauseRun,
  playerLane,
  promptSuccessRate,
  type RunSession,
  resumeRun,
  runProgress,
  startRun,
} from './run-session';

/**
 * The run, end to end, with no pixels involved.
 *
 * This is the milestone the whole rework aimed at: the game is correct and
 * fully tested before anything is drawn. If a word is unfair, if a swerve lands
 * late, if a pause loses a player time — it shows up here, not in a playtest.
 *
 * Hazards are gone. What is left is a word in front of the player at all times,
 * a chaser behind them that every finished word pushes back, coins one lane
 * over, and a crate about once a minute.
 */

const STEP_MS = 16;

function newSession(seed = 'test-seed'): RunSession {
  return startRun(createRunSession({ map: MAP_1, pool: ALL_PROMPTS, surges: SURGES, seed }))
    .session;
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

/** Advances until any word is on screen. */
function untilChallenge(session: RunSession, limitMs = 90_000): RunSession {
  let current = session;

  for (let elapsed = 0; elapsed < limitMs; elapsed += STEP_MS) {
    if (current.challenge !== null || current.phase !== 'running') break;
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

/** Plays well: types whatever is on screen, for as long as asked. */
function playWell(session: RunSession, totalMs: number): RunSession {
  let current = session;

  for (let elapsed = 0; elapsed < totalMs; elapsed += STEP_MS) {
    if (current.phase !== 'running') break;
    current = typePrompt(advanceRunSession(current, STEP_MS).session);
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
    expect(second.prompt?.id).toBe(first.prompt?.id);
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
    expect(later).toBeLessThanOrEqual(MAP_1.speed.maxMetersPerSecond * MAP_1.boost.speedMultiplier);
  });

  it('reports progress toward the finish line', () => {
    const session = newSession();

    expect(runProgress(session)).toBe(0);
    expect(runProgress({ ...session, playerMeters: MAP_1.distanceMeters })).toBe(1);
    // Overshooting the line on the last step must not read as more than done.
    expect(runProgress({ ...session, playerMeters: MAP_1.distanceMeters * 2 })).toBe(1);
  });
});

describe('words', () => {
  it('puts one in front of the player straight away', () => {
    // The road is never silent. This is the thing gap words exist for, and with
    // hazards gone it is the whole of what the player reads.
    const session = untilChallenge(newSession('flow'));

    expect(session.prompt).not.toBeNull();
    expect(session.challenge).not.toBeNull();
  });

  it('replaces one the instant it is finished', () => {
    let session = untilChallenge(newSession('chain'));
    const first = session.prompt?.id;

    session = typePrompt(session);

    expect(session.prompt).not.toBeNull();
    expect(session.prompt?.id).not.toBe(first);
  });

  it('keeps a word on screen for nearly the whole run', () => {
    let session = newSession('occupancy');
    let withWord = 0;
    let steps = 0;

    for (let elapsed = 0; elapsed < 40_000; elapsed += STEP_MS) {
      if (session.phase !== 'running') break;
      session = typePrompt(advanceRunSession(session, STEP_MS).session);
      steps += 1;
      if (session.challenge !== null) withWord += 1;
    }

    expect(withWord / steps).toBeGreaterThan(0.9);
  });
});

describe('speed', () => {
  it('is earned by typing, and only by typing', () => {
    let session = untilChallenge(newSession('boost'));
    expect(isBoosting(session)).toBe(false);

    session = typePrompt(session);
    expect(isBoosting(session)).toBe(true);
    expect(currentSpeed(session)).toBeGreaterThan(MAP_1.baseSpeedMetersPerSecond);
  });

  it('pays more for finishing with more of the budget to spare', () => {
    // The same word, same seed, finished instantly versus finished at the last
    // moment. Without the margin curve these produce identical speed, which is
    // why there would be no reason to type faster than the deadline.
    const decisive = typePrompt(untilChallenge(newSession('margin')));

    let late = untilChallenge(newSession('margin'));
    const budgetMs = late.flow?.timing.availableMs ?? 0;
    late = typePrompt(advance(late, budgetMs * 0.8));

    expect(decisive.momentum).toBeGreaterThan(late.momentum);
    expect(currentSpeed(decisive)).toBeGreaterThan(currentSpeed(late));
    expect(decisive.momentum).toBeLessThanOrEqual(1);
  });

  it('pays every word at least the floor, so continuous typing never crawls', () => {
    // A player typing at exactly the map's speed is the audience it was written
    // for. Leaving them at base speed would make the map slower than its label.
    const session = playWell(newSession('floor'), 8_000);

    expect(session.momentum).toBeGreaterThanOrEqual(MARGIN_FLOOR_SHARE);
    expect(currentSpeed(session)).toBeGreaterThan(MAP_1.baseSpeedMetersPerSecond);
  });

  it('drains when nothing is typed', () => {
    const moving = typePrompt(untilChallenge(newSession('drain')));
    const idle = advance(moving, MAP_1.boost.durationMs * 2);

    expect(idle.momentum).toBeLessThan(moving.momentum);
  });
});

describe('the chaser', () => {
  it('falls back when words are finished well', () => {
    const start = newSession('chase').pursuit.gapMeters;
    const session = playWell(newSession('chase'), 30_000);

    expect(session.phase).toBe('running');
    expect(session.pursuit.gapMeters).toBeGreaterThanOrEqual(start);
  });

  it('closes on a player who types nothing, and ends the run', () => {
    const session = advance(newSession('doomed'), 300_000);

    expect(session.phase).toBe('gameOver');
    expect(session.failureReason).toBe('caught');
  });

  it('closes a little on every wrong character', () => {
    const session = untilChallenge(newSession('mistake'));
    const target = session.prompt?.text ?? '';
    const before = session.pursuit.gapMeters;

    const typed = applyRunInput(applyRunInput(session, target.slice(0, 1)).session, '#').session;

    expect(typed.pursuit.gapMeters).toBeLessThan(before);
    expect(typed.phase).toBe('running');
  });
});

describe('coins', () => {
  /** Advances until a coin line owns the word, typing everything on the way. */
  function untilCoinWord(session: RunSession, limitMs = 90_000): RunSession {
    let current = session;

    for (let elapsed = 0; elapsed < limitMs; elapsed += STEP_MS) {
      if (current.challenge?.kind === 'coin') break;
      if (current.phase !== 'running') break;
      if (current.challenge?.kind === 'flow') current = typePrompt(current);
      current = advanceRunSession(current, STEP_MS).session;
    }

    return current;
  }

  it('offers coins in a lane the player has to move to', () => {
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

  it('costs no score and no ground to decline', () => {
    // Coins are the only optional thing in the game, and that is only true
    // while declining them is free. The gap word that follows costs the combo
    // if it lapses — that is the flow word's price, not the coin's.
    let session = untilCoinWord(newSession('decline'));
    const before = { score: session.score.score, gap: session.pursuit.gapMeters };

    session = advanceRunSession(session, STEP_MS).session;
    while (session.challenge?.kind === 'coin' && session.phase === 'running') {
      session = advanceRunSession(session, STEP_MS).session;
    }

    expect(session.score.score).toBe(before.score);
    expect(session.pursuit.gapMeters).toBe(before.gap);
    expect(session.phase).toBe('running');
  });

  it('never lets a coin word and a gap word be on screen together', () => {
    let session = newSession('crowded');

    for (let elapsed = 0; elapsed < 40_000; elapsed += STEP_MS) {
      if (session.phase !== 'running') break;
      session = advanceRunSession(session, STEP_MS).session;

      const unanswered = session.coins.filter(
        (coin) => coin.status === 'approaching' || coin.status === 'active',
      );
      // One word, whatever is on the road: a live coin line owns the field.
      if (unanswered.length > 0) expect(session.challenge?.kind).not.toBe('flow');
    }
  });
});

describe('powerups', () => {
  /** Advances until a powerup sentence owns the field, typing everything else. */
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
  });

  it('costs nothing but the powerup', () => {
    let session = untilSentence(newSession('power'));
    const target = session.prompt?.text ?? '';
    const before = session.playerMeters;

    session = applyRunInput(session, `${target.slice(0, 2)}#`).session;

    expect(session.phase).toBe('running');
    expect(session.playerMeters).toBe(before);
  });
});

describe('the surge', () => {
  /** Advances until the long sentence owns the field, typing everything else. */
  function untilSurge(session: RunSession, limitMs = 120_000): RunSession {
    let current = session;

    for (let elapsed = 0; elapsed < limitMs; elapsed += STEP_MS) {
      if (current.challenge?.kind === 'surge') break;
      if (current.phase !== 'running') break;
      if (current.challenge !== null) current = typePrompt(current);
      current = advanceRunSession(current, STEP_MS).session;
    }

    return current;
  }

  it('arrives on its own clock, about half a minute in', () => {
    const session = untilSurge(newSession('surge'));

    expect(session.challenge?.kind).toBe('surge');
    expect(session.elapsedMs).toBeGreaterThan(25_000);
    expect(session.elapsedMs).toBeLessThan(60_000);
  });

  it('asks for a sentence, not a word', () => {
    const session = untilSurge(newSession('surge'));
    const words = (session.prompt?.text ?? '').split(' ');

    // Length is the mechanic: one slip ends it, so what is being tested is
    // whether a rhythm can be held rather than whether a word is known.
    expect(words.length).toBeGreaterThan(4);
  });

  it('carries a struggling player faster the further into it they get', () => {
    /*
     * A surge sets a *floor* under momentum rather than adding to it, so it
     * only lifts somebody who is not already at that pace — which is the point,
     * since it exists for whoever is behind. This starts from a standstill.
     */
    const found = untilSurge(newSession('surge'));
    const session: RunSession = { ...found, momentum: 0 };
    const target = session.prompt?.text ?? '';
    const atRest = currentSpeed(session);

    const halfway = applyRunInput(session, target.slice(0, Math.floor(target.length / 2))).session;

    // Paying for a surge merely being *on screen* handed free speed to somebody
    // typing nothing at all. What it pays for is holding the sentence.
    expect(currentSpeed(halfway)).toBeGreaterThan(atRest);
  });

  it('ends on a single wrong character, and takes the speed with it', () => {
    let session = untilSurge(newSession('surge'));
    const target = session.prompt?.text ?? '';

    session = applyRunInput(session, target.slice(0, 6)).session;
    const fast = currentSpeed(session);
    session = applyRunInput(session, `${target.slice(0, 6)}#`).session;

    expect(session.surge).toBeNull();
    expect(session.surgesBroken).toBe(1);
    expect(currentSpeed(session)).toBeLessThan(fast);
    // The run carries on. It is the surge that ended, not the player.
    expect(session.phase).toBe('running');
  });

  it('pays a lasting boost for the whole sentence, typed clean', () => {
    let session = untilSurge(newSession('surge'));

    session = typePrompt(session);

    expect(session.surgesCompleted).toBe(1);
    expect(session.surgesBroken).toBe(0);
    expect(session.surgeRewardUntilMs).toBeGreaterThan(session.elapsedMs);
    expect(isSurging(session)).toBe(true);
  });

  it('puts a word back on screen the moment it is over', () => {
    // The road is never silent, whatever happened to the sentence.
    let session = untilSurge(newSession('surge'));
    session = typePrompt(session);

    expect(session.challenge).not.toBeNull();
  });

  it('moves the opponents too', () => {
    /*
     * The half of the mechanic the player never sees. A surge only the player
     * got would turn a catch-up tool into a way to leave the field for good.
     */
    let session = newSession('surge');
    const before = session.race.racers.map((racer) => racer.meters);

    session = untilSurge(session);
    const after = session.race.racers.map((racer) => racer.meters);

    for (const [index, meters] of after.entries()) {
      expect(meters).toBeGreaterThan(before[index] ?? 0);
    }
  });

  it('costs ground when it lapses, like any other silence', () => {
    // A surge holds the field, so no gap word is up while it runs. Without a
    // cost, typing nothing through one was free.
    let session = untilSurge(newSession('surge'));
    const before = session.pursuit.gapMeters;

    session = advance(session, 30_000);

    expect(session.surgesBroken).toBeGreaterThan(0);
    expect(session.pursuit.gapMeters).toBeLessThan(before);
  });

  it('never runs two sentences at once', { timeout: 30_000 }, () => {
    let session = newSession('crowd');

    for (let elapsed = 0; elapsed < 150_000; elapsed += STEP_MS) {
      if (session.phase !== 'running') break;
      session = typePrompt(advanceRunSession(session, STEP_MS).session);

      const live = session.surge !== null && session.surge.status === 'active';
      if (live) expect(session.challenge?.kind).toBe('surge');
    }
  });
});

describe('what a powerup buys', () => {
  it('a shield throws the player clear of the chaser', () => {
    // With hazards gone this is what a life *is*: being caught is survivable
    // once, and the gap is reset to where the run started.
    let session: RunSession = {
      ...newSession('shielded'),
      effects: { flightRemainingMs: 0, magnetRemainingMs: 0, shields: 1 },
    };

    for (let elapsed = 0; elapsed < 300_000; elapsed += STEP_MS) {
      if (session.savedByShield > 0 || session.phase !== 'running') break;
      session = advanceRunSession(session, STEP_MS).session;
    }

    expect(session.savedByShield).toBe(1);
    expect(session.phase).toBe('running');
    expect(session.effects.shields).toBe(0);
    expect(session.pursuit.gapMeters).toBe(session.pursuitConfig.startMeters);
  });

  it('and being caught after that still ends the run', () => {
    const shielded: RunSession = {
      ...newSession('spent'),
      effects: { flightRemainingMs: 0, magnetRemainingMs: 0, shields: 1 },
    };

    const after = advance(shielded, 600_000);

    expect(after.savedByShield).toBe(1);
    expect(after.phase).toBe('gameOver');
  });

  it('the magnet takes coins without going to them', () => {
    // The one exception to "typing is how you get coins" — and it was bought
    // with a whole sentence typed clean.
    let session: RunSession = {
      ...newSession('magnet'),
      effects: { flightRemainingMs: 0, magnetRemainingMs: 120_000, shields: 0 },
    };

    session = playWell(session, 60_000);

    expect(session.coinsCollected).toBeGreaterThan(0);
  });
});

describe('failing', () => {
  it('holds the impact for a readable beat before ending', () => {
    let session = newSession('beat');

    for (let elapsed = 0; elapsed < 300_000; elapsed += STEP_MS) {
      session = advanceRunSession(session, STEP_MS).session;
      if (session.phase === 'impact') break;
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

  it('ignores input once the run is over', () => {
    const over = advance(newSession('over'), 300_000);

    expect(applyRunInput(over, 'x').session).toBe(over);
  });
});

describe('pausing', () => {
  it('freezes the world and the clock', () => {
    let session = untilChallenge(newSession('pause'));
    session = advanceRunSession(session, 100).session;

    const paused = pauseRun(session).session;
    const frozen = { ...paused };

    const later = advanceRunSession(paused, 5_000).session;

    expect(later.elapsedMs).toBe(frozen.elapsedMs);
    expect(later.playerMeters).toBe(frozen.playerMeters);
    expect(lanePosition(later.motion)).toBe(lanePosition(frozen.motion));
  });

  it('gives back exactly the deadline the player had', () => {
    let session = untilChallenge(newSession('deadline'));
    session = advanceRunSession(session, 200).session;

    const remaining = (session.flow?.deadlineAtMs ?? 0) - session.elapsedMs;

    const resumed = resumeRun(advanceRunSession(pauseRun(session).session, 30_000).session).session;

    expect((resumed.flow?.deadlineAtMs ?? 0) - resumed.elapsedMs).toBeCloseTo(remaining, 9);
  });

  it('only pauses a running run', () => {
    const ready = createRunSession({ map: MAP_1, pool: ALL_PROMPTS, seed: 'a' });

    expect(pauseRun(ready).session.phase).toBe('ready');
    expect(resumeRun(newSession()).session.phase).toBe('running');
  });
});

describe('reporting', () => {
  it('measures WPM over time spent typing, not over the whole run', () => {
    const session = playWell(newSession('wpm'), 10_000);
    const stats = liveStats(session);

    expect(session.activeTypingMs).toBeGreaterThan(0);
    expect(session.activeTypingMs).toBeLessThanOrEqual(session.elapsedMs);
    expect(stats.averageWpm).toBeGreaterThan(0);
  });

  it('reports speed, lane, and the map’s current target for the HUD', () => {
    const stats = liveStats(newSession());

    expect(stats.speedMetersPerSecond).toBeCloseTo(MAP_1.baseSpeedMetersPerSecond, 6);
    expect(stats.lanePosition).toBe(1);
    expect(stats.targetWpm).toBe(MAP_1.targetWpm);
  });

  it('counts a word success rate, and calls an empty run perfect', () => {
    expect(promptSuccessRate(newSession())).toBe(1);

    const session = playWell(newSession('rate'), 10_000);

    expect(promptSuccessRate(session)).toBe(1);
  });
});

describe('finishing', () => {
  it('reaches the finish line and stops exactly on it', { timeout: 30_000 }, () => {
    const session = playWell(newSession('finish'), 400_000);

    expect(session.phase).toBe('levelComplete');
    expect(session.playerMeters).toBe(MAP_1.distanceMeters);
  });

  it('does not keep simulating once it is over', { timeout: 30_000 }, () => {
    const finished = playWell(newSession('finish'), 400_000);

    expect(advanceRunSession(finished, 1_000).session).toBe(finished);
  });
});
