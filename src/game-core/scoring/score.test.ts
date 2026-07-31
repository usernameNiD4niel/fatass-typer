import { describe, expect, it } from 'vitest';
import { DEFAULT_SCORING_CONFIG } from './config';
import type { ScoringConfig } from './config';
import {
  breakCombo,
  comboMultiplier,
  createScoreState,
  finalizeScore,
  registerCollision,
  registerDangerZone,
  registerMissedPrompt,
  registerPromptCompleted,
  scorePrompt,
} from './score';
import type { PromptOutcome, ScoreState } from './score';

const CONFIG = DEFAULT_SCORING_CONFIG;

/** A clean, on-pace obstacle prompt. */
const CLEAN_OBSTACLE: PromptOutcome = {
  correctCharacters: 10,
  incorrectCharacters: 0,
  isObstacle: true,
  expectedTypingMs: 3_000,
  actualTypingMs: 3_000,
  remainingMs: 2_000,
};

const CLEAN_BOOST: PromptOutcome = {
  correctCharacters: 10,
  incorrectCharacters: 0,
  isObstacle: false,
  expectedTypingMs: 3_000,
  actualTypingMs: 3_000,
  remainingMs: 0,
};

/** Completes `count` identical prompts in a row. */
function complete(state: ScoreState, count: number, outcome = CLEAN_BOOST): ScoreState {
  let next = state;

  for (let index = 0; index < count; index += 1) {
    next = registerPromptCompleted(next, outcome, CONFIG);
  }

  return next;
}

describe('combo multiplier', () => {
  it('stays flat until the combo is worth something', () => {
    expect(comboMultiplier(0, CONFIG)).toBe(1);
    expect(comboMultiplier(1, CONFIG)).toBe(1);
    expect(comboMultiplier(2, CONFIG)).toBe(1);
  });

  it('starts rising at the configured threshold', () => {
    expect(comboMultiplier(3, CONFIG)).toBeCloseTo(1.1, 6);
    expect(comboMultiplier(4, CONFIG)).toBeCloseTo(1.2, 6);
    expect(comboMultiplier(10, CONFIG)).toBeCloseTo(1.8, 6);
  });

  it('is capped', () => {
    expect(comboMultiplier(1_000, CONFIG)).toBe(CONFIG.comboMultiplierMax);
  });

  it('rises monotonically', () => {
    for (let combo = 1; combo < 40; combo += 1) {
      expect(comboMultiplier(combo, CONFIG)).toBeGreaterThanOrEqual(
        comboMultiplier(combo - 1, CONFIG),
      );
    }
  });
});

describe('scoring one prompt — spec §8 model', () => {
  it('adds up exactly as the model describes', () => {
    const breakdown = scorePrompt(CLEAN_OBSTACLE, 1, CONFIG);

    expect(breakdown.base).toBe(100);
    expect(breakdown.characters).toBe(100);
    // Typed exactly on pace, so nothing for speed.
    expect(breakdown.speedBonus).toBe(0);
    expect(breakdown.accuracyBonus).toBe(40);
    expect(breakdown.remainingTimeBonus).toBe(40);
    expect(breakdown.multiplier).toBe(1);
    expect(breakdown.penalty).toBe(0);
    expect(breakdown.total).toBe(280);
  });

  it('pays more for an obstacle than for a boost prompt', () => {
    const obstacle = scorePrompt({ ...CLEAN_OBSTACLE, remainingMs: 0 }, 1, CONFIG);
    const boost = scorePrompt(CLEAN_BOOST, 1, CONFIG);

    expect(obstacle.total).toBeGreaterThan(boost.total);
  });

  it('rewards typing faster than the map target', () => {
    const onPace = scorePrompt(CLEAN_BOOST, 1, CONFIG);
    const fast = scorePrompt({ ...CLEAN_BOOST, actualTypingMs: 1_500 }, 1, CONFIG);

    expect(fast.speedBonus).toBeCloseTo(CONFIG.speedBonusMax / 2, 6);
    expect(fast.total).toBeGreaterThan(onPace.total);
  });

  it('pays nothing extra for being slower than target, and never goes negative', () => {
    const slow = scorePrompt({ ...CLEAN_BOOST, actualTypingMs: 9_000 }, 1, CONFIG);

    expect(slow.speedBonus).toBe(0);
  });

  it('caps the speed bonus for an impossibly fast prompt', () => {
    const instant = scorePrompt({ ...CLEAN_BOOST, actualTypingMs: 0 }, 1, CONFIG);

    expect(instant.speedBonus).toBe(CONFIG.speedBonusMax);
  });

  it('rewards finishing an obstacle early', () => {
    const late = scorePrompt({ ...CLEAN_OBSTACLE, remainingMs: 200 }, 1, CONFIG);
    const early = scorePrompt({ ...CLEAN_OBSTACLE, remainingMs: 3_000 }, 1, CONFIG);

    expect(early.total).toBeGreaterThan(late.total);
  });

  it('charges for mistyped characters', () => {
    const messy = scorePrompt(
      { ...CLEAN_BOOST, correctCharacters: 8, incorrectCharacters: 4 },
      1,
      CONFIG,
    );

    expect(messy.penalty).toBe(20);
    expect(messy.accuracyBonus).toBeLessThan(CONFIG.accuracyBonusMax);
    expect(messy.total).toBeLessThan(scorePrompt(CLEAN_BOOST, 1, CONFIG).total);
  });

  it('never lets the combo multiplier amplify a penalty', () => {
    const messy = { ...CLEAN_BOOST, correctCharacters: 0, incorrectCharacters: 10 };
    const low = scorePrompt(messy, 1, CONFIG);
    const high = scorePrompt(messy, 20, CONFIG);

    expect(low.penalty).toBe(high.penalty);
  });
});

describe('scoring a run', () => {
  it('starts at zero', () => {
    const state = createScoreState();

    expect(state.score).toBe(0);
    expect(state.combo).toBe(0);
  });

  it('accumulates across prompts', () => {
    const state = complete(createScoreState(), 3);

    expect(state.score).toBeGreaterThan(0);
    expect(state.combo).toBe(3);
    expect(state.longestCombo).toBe(3);
  });

  it('pays more for the same prompt once a combo is running', () => {
    const early = registerPromptCompleted(createScoreState(), CLEAN_BOOST, CONFIG);
    const streaking = registerPromptCompleted(complete(createScoreState(), 9), CLEAN_BOOST, CONFIG);

    const firstAward = early.score;
    const laterAward = streaking.score - complete(createScoreState(), 9).score;

    expect(laterAward).toBeGreaterThan(firstAward);
  });

  it('charges for a collision and destroys the combo', () => {
    const streaking = complete(createScoreState(), 6);
    const hit = registerCollision(streaking, CONFIG);

    expect(hit.score).toBe(streaking.score - CONFIG.collisionPenalty);
    expect(hit.combo).toBe(0);
    // The record of what was achieved survives.
    expect(hit.longestCombo).toBe(6);
  });

  it('charges less for a missed prompt than for a collision', () => {
    const streaking = complete(createScoreState(), 6);

    expect(registerMissedPrompt(streaking, CONFIG).score).toBeGreaterThan(
      registerCollision(streaking, CONFIG).score,
    );
  });

  it('breaks the combo on a mistyped character without charging for it', () => {
    const streaking = complete(createScoreState(), 6);
    const broken = breakCombo(streaking);

    expect(broken.combo).toBe(0);
    expect(broken.score).toBe(streaking.score);
  });

  it('charges the danger zone only once', () => {
    const state = complete(createScoreState(), 8);
    const first = registerDangerZone(state, CONFIG);
    const second = registerDangerZone(first, CONFIG);

    expect(first.score).toBe(state.score - CONFIG.dangerZonePenalty);
    expect(second).toBe(first);
  });

  it('never goes negative — spec §8', () => {
    let state = createScoreState();
    for (let index = 0; index < 10; index += 1) {
      state = registerCollision(state, CONFIG);
    }

    expect(state.score).toBe(0);
  });

  it('never mutates the state it is given', () => {
    const state = complete(createScoreState(), 4);
    const snapshot = { ...state };

    registerCollision(state, CONFIG);
    registerPromptCompleted(state, CLEAN_BOOST, CONFIG);

    expect(state).toEqual(snapshot);
  });
});

describe('end of run', () => {
  const scored = complete(createScoreState(), 5);

  it('pays completion and distance bonuses for reaching the finish', () => {
    const final = finalizeScore(
      scored,
      { completed: true, accuracy: 1, normalizedDogDistance: 1 },
      CONFIG,
    );

    expect(final.completionBonus).toBe(CONFIG.levelCompletionPoints);
    expect(final.distanceBonus).toBe(CONFIG.finishDistanceBonusMax);
    expect(final.accuracyBonus).toBe(CONFIG.runAccuracyBonusMax);
    expect(final.total).toBe(
      scored.score +
        CONFIG.levelCompletionPoints +
        CONFIG.finishDistanceBonusMax +
        CONFIG.runAccuracyBonusMax,
    );
  });

  it('pays no completion or distance bonus for a run that ended in a catch', () => {
    const final = finalizeScore(
      scored,
      { completed: false, accuracy: 0.95, normalizedDogDistance: 0 },
      CONFIG,
    );

    expect(final.completionBonus).toBe(0);
    expect(final.distanceBonus).toBe(0);
  });

  it('still rewards accuracy on a lost run', () => {
    const careful = finalizeScore(
      scored,
      { completed: false, accuracy: 0.98, normalizedDogDistance: 0 },
      CONFIG,
    );
    const sloppy = finalizeScore(
      scored,
      { completed: false, accuracy: 0.5, normalizedDogDistance: 0 },
      CONFIG,
    );

    expect(careful.total).toBeGreaterThan(sloppy.total);
  });

  it('pays more for finishing with the dogs far behind', () => {
    const comfortable = finalizeScore(
      scored,
      { completed: true, accuracy: 0.9, normalizedDogDistance: 0.9 },
      CONFIG,
    );
    const narrow = finalizeScore(
      scored,
      { completed: true, accuracy: 0.9, normalizedDogDistance: 0.05 },
      CONFIG,
    );

    expect(comfortable.total).toBeGreaterThan(narrow.total);
  });

  it('clamps out-of-range inputs', () => {
    const final = finalizeScore(
      scored,
      { completed: true, accuracy: 5, normalizedDogDistance: -3 },
      CONFIG,
    );

    expect(final.accuracyBonus).toBe(CONFIG.runAccuracyBonusMax);
    expect(final.distanceBonus).toBe(0);
  });

  it('never returns a negative total', () => {
    const wrecked = registerCollision(createScoreState(), CONFIG);
    const final = finalizeScore(
      wrecked,
      { completed: false, accuracy: 0, normalizedDogDistance: 0 },
      CONFIG,
    );

    expect(final.total).toBe(0);
  });
});

describe('scoring is data-driven', () => {
  it('honors a custom configuration', () => {
    const generous: ScoringConfig = { ...CONFIG, promptCompletionPoints: 500 };

    expect(scorePrompt(CLEAN_BOOST, 1, generous).total).toBeGreaterThan(
      scorePrompt(CLEAN_BOOST, 1, CONFIG).total,
    );
  });

  it('is deterministic', () => {
    expect(complete(createScoreState(), 12)).toEqual(complete(createScoreState(), 12));
  });

  it('rewards a good run over a bad one, end to end', () => {
    const good = finalizeScore(
      complete(createScoreState(), 12, CLEAN_OBSTACLE),
      { completed: true, accuracy: 0.98, normalizedDogDistance: 0.8 },
      CONFIG,
    );

    let bad = complete(createScoreState(), 4, {
      ...CLEAN_OBSTACLE,
      correctCharacters: 6,
      incorrectCharacters: 6,
      actualTypingMs: 6_000,
      remainingMs: 100,
    });
    bad = registerCollision(bad, CONFIG);
    bad = registerMissedPrompt(bad, CONFIG);
    bad = registerDangerZone(bad, CONFIG);

    const badFinal = finalizeScore(
      bad,
      { completed: false, accuracy: 0.5, normalizedDogDistance: 0 },
      CONFIG,
    );

    expect(good.total).toBeGreaterThan(badFinal.total * 3);
  });
});
