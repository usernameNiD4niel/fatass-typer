import { describe, expect, it } from 'vitest';

import { MAP_1, OBSTACLES, ALL_PROMPTS } from '../../content';
import {
  advanceRunSession,
  applyRunInput,
  createRunSession,
  obstacleSuccessRate,
  type RunSession,
  startRun,
} from './run-session';

/**
 * Map 1, played end to end by a simulated typist (step D5, spec §19 milestone 2).
 *
 * The map advertises 20 WPM. This plays it at exactly that speed — one character
 * every 600ms, no mistakes, no bursts — and asserts that such a player finishes.
 * If this test fails, Map 1 is lying about its difficulty, and no amount of
 * tuning elsewhere makes that acceptable (spec §6).
 *
 * A browser playtest cannot answer this question reliably: a throttled or
 * occluded tab runs the loop at a fraction of real time. The rules are pure, so
 * the honest place to ask is here.
 */

const STEP_MS = 16;

/** Milliseconds per character at a given speed. Five characters make a word. */
function msPerCharacter(wpm: number): number {
  return 60_000 / (wpm * 5);
}

interface PlaytestResult {
  readonly session: RunSession;
  readonly mistakes: number;
}

/**
 * Plays a whole run at a fixed typing speed.
 *
 * The typist is metronomic: they add one correct character every interval and
 * never look ahead. Obstacle prompts and boost prompts are treated identically,
 * which is what a real player does — they type what is on screen.
 */
function playAt(wpm: number, seed: string, maxSteps = 60_000): PlaytestResult {
  const interval = msPerCharacter(wpm);
  let session = startRun(
    createRunSession({ map: MAP_1, pool: ALL_PROMPTS, obstacles: OBSTACLES, seed }),
  ).session;

  let nextKeyAtMs = 0;
  let mistakes = 0;

  for (let step = 0; step < maxSteps && session.phase === 'running'; step += 1) {
    while (session.elapsedMs >= nextKeyAtMs && session.phase === 'running') {
      const target = session.prompt?.text ?? '';
      const typed = session.typing.typed;

      if (typed.length < target.length) {
        const before = session.typing.incorrectCharacters;
        session = applyRunInput(session, target.slice(0, typed.length + 1)).session;
        if (session.typing.incorrectCharacters > before) mistakes += 1;
      }

      nextKeyAtMs += interval;
    }

    session = advanceRunSession(session, STEP_MS).session;
  }

  return { session, mistakes };
}

describe('Map 1 at its advertised speed', () => {
  it('can be finished by a 20 WPM typist', () => {
    const { session } = playAt(MAP_1.targetWpm, 'playtest-1');

    expect(session.phase).toBe('levelComplete');
    expect(session.playerMeters).toBe(MAP_1.distanceMeters);
  });

  it('is finishable from several different seeds', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const { session } = playAt(MAP_1.targetWpm, seed);

      expect(session.phase).toBe('levelComplete');
    }
  });

  it('lets a 20 WPM typist clear the obstacles they meet', () => {
    const { session } = playAt(MAP_1.targetWpm, 'playtest-obstacles');

    expect(session.obstaclesFaced).toBeGreaterThan(0);
    expect(session.collisions).toBe(0);
    expect(obstacleSuccessRate(session)).toBe(1);
  });

  it('keeps the dogs behind a player typing at target speed', () => {
    const { session } = playAt(MAP_1.targetWpm, 'playtest-chase');

    expect(session.chase.caught).toBe(false);
    expect(session.chase.distanceMeters).toBeGreaterThan(0);
  });

  it('does not require perfection — the typist here never corrects anything', () => {
    const { mistakes } = playAt(MAP_1.targetWpm, 'playtest-1');

    expect(mistakes).toBe(0);
  });
});

describe('Map 1 below its advertised speed', () => {
  it('catches a player who is barely typing', () => {
    // A quarter of the target: the boosts come too rarely to hold the dogs off.
    const { session } = playAt(5, 'playtest-slow');

    expect(session.phase).toBe('gameOver');
  });

  it('currently still lets a 10 WPM typist through', () => {
    // Recorded, not endorsed. Map 1 is the tutorial map and is meant to be
    // forgiving, but *half* the advertised speed finishing comfortably means the
    // chase is doing less work than the 20 WPM label implies. Step F2 tunes
    // this; this test exists so the tuning has a starting measurement and so a
    // future change to the chase numbers cannot pass unnoticed.
    const { session } = playAt(10, 'playtest-slow');

    expect(session.phase).toBe('levelComplete');
  });

  it('is comfortable above the target', () => {
    const { session } = playAt(35, 'playtest-fast');

    expect(session.phase).toBe('levelComplete');
    expect(session.chase.distanceMeters).toBeGreaterThan(MAP_1.chase.dangerThresholdMeters);
  });
});

describe('the run a typist actually gets', () => {
  it('is a run of a reasonable length, not a marathon', () => {
    const { session } = playAt(MAP_1.targetWpm, 'playtest-1');

    expect(session.elapsedMs).toBeGreaterThan(20_000);
    expect(session.elapsedMs).toBeLessThan(90_000);
  });

  it('presents obstacles without burying the player in them', () => {
    const { session } = playAt(MAP_1.targetWpm, 'playtest-1');
    const secondsPerObstacle = session.elapsedMs / 1_000 / session.obstaclesFaced;

    expect(secondsPerObstacle).toBeGreaterThan(5);
  });
});
