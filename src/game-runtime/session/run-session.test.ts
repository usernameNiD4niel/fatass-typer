import { describe, expect, it } from 'vitest';

import { MAP_1, ALL_PROMPTS } from '../../content';
import {
  advanceRunSession,
  applyRunInput,
  createRunSession,
  currentSpeed,
  isBoosting,
  liveStats,
  pauseRun,
  resumeRun,
  type RunSession,
  runProgress,
  startRun,
} from './run-session';

function newSession(seed = 'test-seed'): RunSession {
  return startRun(createRunSession({ map: MAP_1, pool: ALL_PROMPTS, seed })).session;
}

/** Runs the simulation forward in 16ms steps, as the loop would. */
function advance(session: RunSession, totalMs: number): RunSession {
  let current = session;

  for (let elapsed = 0; elapsed < totalMs && current.phase === 'running'; elapsed += 16) {
    current = advanceRunSession(current, 16).session;
  }

  return current;
}

/** Types the current prompt perfectly, one character at a time. */
function typePrompt(session: RunSession): RunSession {
  const target = session.prompt?.text ?? '';
  let current = session;

  for (let index = 1; index <= target.length; index += 1) {
    current = applyRunInput(current, target.slice(0, index)).session;
  }

  return current;
}

describe('run session setup', () => {
  it('starts with a prompt already drawn', () => {
    const session = createRunSession({ map: MAP_1, pool: ALL_PROMPTS, seed: 'a' });

    expect(session.prompt).not.toBeNull();
    expect(session.phase).toBe('ready');
  });

  it('is deterministic for a seed', () => {
    const first = newSession('same');
    const second = newSession('same');

    expect(first.prompt?.id).toBe(second.prompt?.id);
  });

  it('gives different seeds different runs', () => {
    const ids = new Set(['a', 'b', 'c', 'd'].map((seed) => newSession(seed).prompt?.id ?? 'none'));

    expect(ids.size).toBeGreaterThan(1);
  });

  it('only draws prompts the map allows', () => {
    let session = newSession();

    for (let round = 0; round < 12; round += 1) {
      const prompt = session.prompt;
      expect(prompt).not.toBeNull();
      expect(MAP_1.content.promptCategories).toContain(prompt?.category);
      expect(prompt?.minimumMap).toBeLessThanOrEqual(MAP_1.mapNumber);
      session = typePrompt(session);
    }
  });
});

describe('running', () => {
  it('moves the MC forward at the map speed', () => {
    const session = advance(newSession(), 1000);

    expect(session.playerMeters).toBeCloseTo(MAP_1.baseSpeedMetersPerSecond, 0);
  });

  it('does not move before the run starts', () => {
    const ready = createRunSession({ map: MAP_1, pool: ALL_PROMPTS, seed: 'a' });

    expect(advanceRunSession(ready, 500).session.playerMeters).toBe(0);
  });

  it('freezes while paused and continues on resume', () => {
    const running = advance(newSession(), 500);
    const paused = pauseRun(running).session;
    const stillPaused = advanceRunSession(paused, 5000).session;

    expect(stillPaused.playerMeters).toBe(running.playerMeters);
    expect(stillPaused.elapsedMs).toBe(running.elapsedMs);

    const resumed = advanceRunSession(resumeRun(stillPaused).session, 100).session;

    expect(resumed.playerMeters).toBeGreaterThan(running.playerMeters);
  });

  it('lets the dogs close in on a player who types nothing', () => {
    const session = advance(newSession(), 5000);

    expect(session.chase.distanceMeters).toBeLessThan(MAP_1.chase.startingDistanceMeters);
  });

  it('ends the run when the dogs catch up', () => {
    const session = advance(newSession(), 120_000);

    expect(session.phase).toBe('gameOver');
    expect(session.chase.caught).toBe(true);
  });

  it('stops simulating once the run is over', () => {
    const over = advance(newSession(), 120_000);
    const after = advanceRunSession(over, 1000).session;

    expect(after).toBe(over);
  });
});

describe('boost prompts', () => {
  it('grants a boost that visibly increases speed', () => {
    const session = typePrompt(newSession());

    expect(isBoosting(session)).toBe(true);
    expect(currentSpeed(session)).toBeCloseTo(
      MAP_1.baseSpeedMetersPerSecond * MAP_1.boost.speedMultiplier,
    );
  });

  it('covers more ground boosting than not', () => {
    const boosted = advance(typePrompt(newSession()), 2000);
    const plain = advance(newSession(), 2000);

    expect(boosted.playerMeters).toBeGreaterThan(plain.playerMeters);
  });

  it("expires after the map's boost duration", () => {
    const session = advance(typePrompt(newSession()), MAP_1.boost.durationMs + 100);

    expect(isBoosting(session)).toBe(false);
    expect(currentSpeed(session)).toBe(MAP_1.baseSpeedMetersPerSecond);
  });

  it('draws a new prompt on completion', () => {
    const session = newSession();
    const completed = typePrompt(session);

    expect(completed.prompt).not.toBeNull();
    expect(completed.completedPrompts).toBe(1);
    expect(completed.typing.typed).toBe('');
  });

  it('never repeats a prompt back to back', () => {
    let session = newSession();

    for (let round = 0; round < 15; round += 1) {
      const before = session.prompt?.id;
      session = typePrompt(session);

      expect(session.prompt?.id).not.toBe(before);
    }
  });

  it('scores a completed prompt and builds a combo', () => {
    const session = typePrompt(typePrompt(newSession()));

    expect(session.score.score).toBeGreaterThan(0);
    expect(session.score.combo).toBe(2);
  });

  it('opens the gap when clean prompts build a streak', () => {
    let clean = newSession();
    for (let round = 0; round < 4; round += 1) clean = typePrompt(clean);

    const idle = advance(newSession(), clean.elapsedMs + 1);

    expect(clean.chase.distanceMeters).toBeGreaterThan(idle.chase.distanceMeters);
  });
});

describe('typing', () => {
  it('records progress without completing a prompt', () => {
    const session = newSession();
    const target = session.prompt?.text ?? '';
    const partial = applyRunInput(session, target.slice(0, 1)).session;

    expect(partial.typing.typed).toBe(target.slice(0, 1));
    expect(partial.completedPrompts).toBe(0);
  });

  it('counts a mistake and breaks both streaks', () => {
    let session = newSession();
    for (let round = 0; round < 4; round += 1) session = typePrompt(session);

    const streakBefore = session.chase.streak;
    const mistyped = applyRunInput(session, 'zzz').session;

    expect(streakBefore).toBeGreaterThan(0);
    expect(mistyped.typing.incorrectCharacters).toBeGreaterThan(0);
    expect(mistyped.chase.streak).toBe(0);
    expect(mistyped.score.combo).toBe(0);
  });

  it('handles backspace by diffing the whole value', () => {
    const session = newSession();
    const target = session.prompt?.text ?? '';
    const typed = applyRunInput(session, `${target.slice(0, 2)}x`).session;
    const fixed = applyRunInput(typed, target.slice(0, 2)).session;

    expect(fixed.typing.correctedErrors).toBeGreaterThan(0);
    expect(fixed.typing.typed).toBe(target.slice(0, 2));
  });

  it('ignores input when the run is not running', () => {
    const ready = createRunSession({ map: MAP_1, pool: ALL_PROMPTS, seed: 'a' });

    expect(applyRunInput(ready, 'run').session).toBe(ready);
  });
});

describe('finishing', () => {
  it('reaches the finish line and stops exactly there', () => {
    let session = newSession();

    // Type continuously so the boost keeps the dogs behind.
    for (let round = 0; round < 400 && session.phase === 'running'; round += 1) {
      session = typePrompt(session);
      session = advance(session, 500);
    }

    expect(session.phase).toBe('levelComplete');
    expect(session.playerMeters).toBe(MAP_1.distanceMeters);
    expect(runProgress(session)).toBe(1);
  });
});

describe('live stats', () => {
  it('reports a full gap and no score at the start', () => {
    const stats = liveStats(newSession());

    expect(stats.dogDistanceNormalized).toBe(1);
    expect(stats.score).toBe(0);
    expect(stats.progress).toBe(0);
    expect(stats.accuracy).toBe(1);
  });

  it('tracks progress, score, and the closing gap', () => {
    // Inside the live-WPM window: the reading is a rolling three seconds, so a
    // longer gap here would correctly report zero.
    const session = advance(typePrompt(newSession()), 1000);
    const stats = liveStats(session);

    expect(stats.progress).toBeGreaterThan(0);
    expect(stats.score).toBeGreaterThan(0);
    expect(stats.currentWpm).toBeGreaterThan(0);
    // Still at a full gap: a boost outruns the pack, and the meter is capped at
    // the map's starting distance.
    expect(stats.dogDistanceNormalized).toBe(1);
    // Without typing, the same second closes it.
    expect(liveStats(advance(newSession(), 1000)).dogDistanceNormalized).toBeLessThan(1);
  });
});
