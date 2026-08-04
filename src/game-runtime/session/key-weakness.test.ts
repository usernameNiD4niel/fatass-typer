import { describe, expect, it } from 'vitest';

import { ALL_PROMPTS, MAP_1, OBSTACLES } from '../../content';
import { weakCharacters, weakestKeys } from '../../game-core/keystats';
import { advanceRunSession, applyRunInput, createRunSession, startRun } from './run-session';
import type { RunSession } from './run-session';

/**
 * Per-key weakness tracking, end to end (plan 2.4).
 *
 * The unit tests in `game-core/keystats` cover the table. These cover the two
 * things that make it worth having: that a real run fills it in, and that the
 * run's own vocabulary leans toward what it says.
 */

function newSession(seed: string, weak: readonly string[] = []): RunSession {
  return startRun(
    createRunSession({
      map: MAP_1,
      pool: ALL_PROMPTS,
      obstacles: OBSTACLES,
      weakCharacters: weak,
      /*
       * No secret sentence, deliberately.
       *
       * While a map's sentence is running it supplies *every* prompt, in order,
       * so the selector is never consulted and weakness weighting cannot apply
       * — see `drawPrompt`. Steering therefore only operates on the fallback
       * vocabulary: after the sentence is finished, and on the endless map,
       * which has none. That is the honest scope of the feature and this is the
       * condition that exercises it.
       */
      secretWords: [],
      seed,
    }),
  ).session;
}

/** Advances until a word is on screen. */
function untilWord(session: RunSession): RunSession {
  let current = session;
  for (let elapsed = 0; elapsed < 60_000; elapsed += 16) {
    if ((current.prompt?.text.length ?? 0) > 0) return current;
    current = advanceRunSession(current, 16).session;
  }

  return current;
}

describe('recording weaknesses during a run', () => {
  it('counts the character the prompt asked for, not the one that was typed', () => {
    // The distinction the whole feature rests on. Typing `q` where the prompt
    // wanted `e` is evidence about `e` — recording `q` would build a table of
    // the keys the player *reaches for* by accident, which teaches nothing.
    let session = untilWord(newSession('weak-record'));
    const target = session.prompt?.text ?? '';
    expect(target.length).toBeGreaterThan(0);

    const expected = target[0] ?? '';
    const wrong = expected === 'q' ? 'z' : 'q';
    session = applyRunInput(session, wrong).session;

    expect(session.keyStats[expected.toLowerCase()]).toEqual({ attempts: 1, misses: 1 });
    expect(session.keyStats[wrong]).toBeUndefined();
  });

  it('counts a correct keystroke too, so a rate means something', () => {
    let session = untilWord(newSession('weak-correct'));
    const target = session.prompt?.text ?? '';
    const first = (target[0] ?? '').toLowerCase();

    session = applyRunInput(session, target.slice(0, 1)).session;

    expect(session.keyStats[first]?.attempts).toBe(1);
    expect(session.keyStats[first]?.misses).toBe(0);
  });

  it('leaves the table empty for a run nobody has typed in', () => {
    expect(Object.keys(newSession('weak-empty').keyStats)).toEqual([]);
  });
});

describe('steering the vocabulary', () => {
  /**
   * Fraction of the prompts a run *serves* that contain `character`.
   *
   * Every occurrence, not every distinct word. Counting unique words was the
   * first version of this and it measures nothing: weighting changes how often
   * a word comes up, not which words exist, so the set of distinct prompts a
   * long run eventually shows converges on the pool either way.
   */
  function share(seed: string, weak: readonly string[], character: string): number {
    let session = newSession(seed, weak);
    let served = 0;
    let matched = 0;
    let last = '';

    for (let step = 0; step < 8_000 && session.phase === 'running'; step += 1) {
      const text = session.prompt?.text ?? '';
      if (text.length > 0 && text !== last) {
        last = text;
        served += 1;
        if (text.toLowerCase().includes(character)) matched += 1;
      }

      // Answer it immediately, so the run keeps producing prompts rather than
      // measuring how fast the simulated typist is.
      if (text.length > 0) session = applyRunInput(session, text).session;
      session = advanceRunSession(session, 16).session;
    }

    return served === 0 ? 0 : matched / served;
  }

  it('offers words with a weak character more often than chance would', () => {
    // The point of the whole feature: the game practises what you are bad at
    // without you having to choose to.
    // `k` appears in about an eighth of the pool — common enough to draw and
    // rare enough that a difference shows. (`q` and `z` are in none of it.)
    const targeted = share('steer', ['k'], 'k');
    const untargeted = share('steer', [], 'k');

    // Measured at roughly 9% untargeted and 29% targeted. The bar is set well
    // below that so a vocabulary change cannot make this fail spuriously.
    expect(targeted).toBeGreaterThan(untargeted * 1.5);
  });

  it('still draws other words, so a run is not a drill', () => {
    // A run made entirely of one letter would stop being a game in about a
    // minute. The weighting is a preference, never a filter.
    expect(share('steer-variety', ['e'], 'e')).toBeLessThan(1);
  });
});

describe('what the player is shown', () => {
  it('names only keys with enough evidence behind them', () => {
    const stats = { e: { attempts: 40, misses: 12 }, q: { attempts: 2, misses: 1 } };

    // `q` has the higher miss rate and is the wrong answer: one accident is
    // not a weakness.
    expect(weakestKeys(stats).map((entry) => entry.key)).toEqual(['e']);
    expect(weakCharacters(stats)).toEqual(['e']);
  });
});
