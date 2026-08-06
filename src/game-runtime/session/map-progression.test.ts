import { describe, expect, it } from 'vitest';

import { ALL_PROMPTS, MAPS } from '../../content';
import { flowBufferFor } from '../../game-core/flow';
import { finishRate, playtest, type PlaytestInput } from './playtest-harness';

/**
 * What each map is actually worth, measured rather than felt.
 *
 * Playtesting a typing game by hand measures the tester. A metronomic simulated
 * typist does not get tired, does not get lucky, and gives the same answer every
 * time — so "can a 20 WPM typist finish Map 1?" has an answer that does not
 * depend on who is asking.
 *
 * ## Why finish *rates* and not single runs
 *
 * Failure is binary now: one hazard missed and the run is over. Whether a
 * particular run survives therefore depends on which hazards it happened to
 * draw and in which order, and a single seed is an anecdote. Every assertion
 * below runs many seeds and asserts on the proportion.
 *
 * ## The three bars
 *
 * | Typist | Bar | Why |
 * |---|---|---|
 * | At the advertised speed | **100%** | Anything less means the map is lying about its number |
 * | At 85% of it | **100%** | The tolerance band: close enough still gets through |
 * | At 75% of it | **< 40%** | Below the band the map should turn you away |
 *
 * That last bar is the one that changed, and it changed because a player
 * finished a 20 WPM map while typing 15. A map that can be cleared 25% below
 * its own number is not asking for that number, and the label was decoration.
 *
 * There is deliberately no "realistic typist" bar any more. It used to sit at
 * ≥80% for someone hesitating and mistyping at target speed — and it was
 * precisely what let a 15 WPM run clear a 20 WPM map, because slack big enough
 * to absorb hesitation is slack big enough to absorb being slow.
 *
 * The two cannot both hold. `available` is `typing_at_target × buffer`, so the
 * buffer is simultaneously the hesitation allowance and the slowness allowance;
 * there is no dial that tells them apart. With 10–20 encounters a run and one
 * mistake fatal, a player who hesitates on every word will often not finish —
 * and shields, earned from powerups, are the intended way to survive that.
 */

const SEEDS = 24;

function base(map: (typeof MAPS)[number]): Omit<PlaytestInput, 'wpm' | 'seed'> {
  return { map, prompts: ALL_PROMPTS };
}

describe.each(MAPS.map((map) => [map.id, map] as const))('%s', (_id, map) => {
  it('is finished by a perfect typist at its advertised speed, every time', () => {
    expect(finishRate({ ...base(map), wpm: map.targetWpm }, SEEDS)).toBe(1);
  });

  it('still lets someone a little under its speed through', () => {
    // The tolerance band. A map that only ever accepted its exact number would
    // be a metronome test, not a game.
    const rate = finishRate({ ...base(map), wpm: Math.round(map.targetWpm * 0.85) }, SEEDS);

    expect(rate).toBeGreaterThanOrEqual(0.9);
  });

  it('turns away someone well under its speed', () => {
    // The bar that matters: a 20 WPM map must not be finishable at 15. This is
    // the assertion that stops the number on the card being decoration.
    const rate = finishRate({ ...base(map), wpm: Math.round(map.targetWpm * 0.75) }, SEEDS);

    expect(rate).toBeLessThan(0.4);
  });

  it('asks for a real number of words, not one or two', () => {
    const result = playtest({ ...base(map), wpm: map.targetWpm, seed: 'shape' });

    // Words are the encounters now. The slow maps sit at the bottom of this
    // range because a word at 20 WPM takes three times as long to type as the
    // same word at 50.
    expect(result.hazardsFaced).toBeGreaterThanOrEqual(15);
  });

  it('fills the gaps with coins, so there is almost always something to type', () => {
    const result = playtest({ ...base(map), wpm: map.targetWpm, seed: 'coins' });
    const { coinsCollected, coinsMissed } = result.session;

    // Coins are the only thing left on the road with a body, and the only
    // optional thing in the game. A run should offer a real number of them.
    expect(coinsCollected + coinsMissed).toBeGreaterThanOrEqual(4);
  });

  it('never loses a powerup to a typist who makes no mistakes', () => {
    const result = playtest({ ...base(map), wpm: map.targetWpm, seed: 'coins' });
    const { powerupsClaimed, powerupsLost } = result.session;

    // A crate waits for the coins to be done with the road, so *whether* one
    // appears inside a given run depends on the timing. What must never happen
    // is one appearing and being dropped by somebody typing perfectly.
    expect(powerupsLost).toBe(0);

    const interval = map.content.powerupIntervalSeconds * 1_000;
    if (result.elapsedMs > interval + 20_000) {
      expect(powerupsClaimed).toBeGreaterThanOrEqual(1);
    }
  });

  it('keeps a word in front of the player for most of the run', () => {
    const result = playtest({ ...base(map), wpm: map.targetWpm, seed: 'coins' });
    const occupancy = result.session.activeTypingMs / result.elapsedMs;

    /*
     * Near-total, and honestly so.
     *
     * With hazards gone the flow word is the default state of the field rather
     * than a filler for somebody else's tail: one is up from the first frame
     * and the next replaces it the instant it is finished. The missing sliver
     * is the road between a coin line being collected and the next word.
     */
    expect(occupancy).toBeGreaterThan(0.85);
  });

  it('asks for a real workout, not a dozen words', () => {
    const result = playtest({ ...base(map), wpm: map.targetWpm, seed: 'coins' });
    const { correctCharacters } = result.session.stats;

    /*
     * The number this whole design exists for.
     *
     * A run used to ask for 63 characters on Map 1 and 132 on Map 6 — thirteen
     * words in eighty seconds, about nine WPM of output on a map labelled
     * twenty. The floor below is half of what continuous typing at the map's
     * advertised speed would produce over the run.
     */
    const ceiling = ((map.targetWpm * 5) / 60_000) * result.elapsedMs;

    expect(correctCharacters).toBeGreaterThan(ceiling * 0.5);
    expect(correctCharacters).toBeGreaterThan(150);
  });

  it('is only ever ended by the chaser', () => {
    // Nothing on the road can hit anybody. A player far below the map's speed
    // lapses words, hands the chaser ground, and is caught — which is the whole
    // of how a run is lost now.
    const result = playtest({ ...base(map), wpm: Math.round(map.targetWpm * 0.5), seed: 'slow' });

    expect(result.failureReason).toBe('caught');
  });

  it('does not catch a slow typist in the first few seconds', () => {
    /*
     * Caught immediately is as wrong as never caught: the run has to be long
     * enough to feel like something the player lost rather than was denied.
     *
     * Eight seconds rather than twenty because the fast maps genuinely are
     * unforgiving — at 50 WPM a word lapses every second and a half, so a
     * typist 40% under Map 6's speed loses ground four times in the time a Map
     * 1 player loses it once. That is the ladder doing its job.
     */
    const result = playtest({ ...base(map), wpm: Math.round(map.targetWpm * 0.6), seed: 'slow' });

    expect(result.elapsedMs).toBeGreaterThan(8_000);
  });

  it('holds the gap roughly level for a typist inside the tolerance band', () => {
    // The direct test of the tuning model: `neutralMargin` is derived so that a
    // typist at the band's floor breaks even. If a retune breaks that, the
    // ladder stops gating and this is what says so.
    const result = playtest({ ...base(map), wpm: Math.round(map.targetWpm * 0.85), seed: 'band' });

    expect(result.finished).toBe(true);
    expect(result.session.pursuit.gapMeters).toBeGreaterThan(0);
  });

  it('lets a typist at its advertised speed take every coin offered', () => {
    // Coins ask for the map's speed with very little slack. Someone who has
    // earned the map should still get them all.
    const result = playtest({ ...base(map), wpm: map.targetWpm, seed: 'coins' });

    expect(result.session.coinsMissed).toBe(0);
    expect(result.session.coinsCollected).toBeGreaterThan(0);
  });

  it('is a run, not a marathon or a sprint', () => {
    const result = playtest({ ...base(map), wpm: map.targetWpm, seed: 'length' });

    // Two to three minutes. A run is an endurance test now: with a word on
    // screen at every moment, a 75-second map asked for about a hundred
    // characters, and a hundred characters is not typing practice.
    expect(result.elapsedMs).toBeGreaterThan(90_000);
    expect(result.elapsedMs).toBeLessThan(200_000);
  });

  it('finishes every word it offers when typed perfectly', () => {
    const result = playtest({ ...base(map), wpm: map.targetWpm, seed: 'clean' });

    expect(result.failureReason).toBe('none');
    expect(result.obstacleSuccessRate).toBe(1);
  });
});

describe('the ladder', () => {
  it('rises in advertised speed from first map to last', () => {
    const targets = MAPS.map((map) => map.targetWpm);

    for (let index = 1; index < targets.length; index += 1) {
      expect(targets[index]).toBeGreaterThan(targets[index - 1] ?? 0);
    }
  });

  it('tightens the word budget as it goes', () => {
    // The ladder lives here now: a flow word is the primary prompt, so the
    // buffer it is given is what decides whether a map gates.
    const buffers = MAPS.map((entry) => flowBufferFor(entry));

    expect(buffers[0]).toBeGreaterThan(buffers[buffers.length - 1] ?? 0);
  });

  it('tightens the reaction buffer as it goes', () => {
    const buffers = MAPS.map((map) => map.timing.reactionBuffer);

    expect(buffers[0]).toBeGreaterThan(buffers[buffers.length - 1] ?? 0);
    for (let index = 1; index < buffers.length; index += 1) {
      expect(buffers[index]).toBeLessThanOrEqual(buffers[index - 1] ?? 0);
    }
  });

  it('demands more absolute speed at the end than at the start', () => {
    // The ladder is in the numbers themselves: Map 6 asks for 50 WPM and Map 1
    // asks for 20, and both enforce it. Comparing finish rates at the *same
    // fraction* of each target measures the tuning noise between maps rather
    // than the ladder, which is why this asserts on the targets.
    const first = MAPS[0];
    const last = MAPS[MAPS.length - 1];
    if (first === undefined || last === undefined) throw new Error('no maps');

    expect(last.targetWpm).toBeGreaterThan(first.targetWpm * 2);
    expect(finishRate({ ...base(last), wpm: first.targetWpm }, SEEDS)).toBe(0);
  });
});

describe('the sentence', () => {
  it('is what every prompt of a run is drawn from', () => {
    const map = MAPS[0];
    if (map === undefined) throw new Error('no maps');

    const result = playtest({
      map,
      prompts: ALL_PROMPTS,
      wpm: map.targetWpm,
      seed: 'sentence',
    });

    // Words come from the map's secret in order, so the count only ever rises
    // and a run at the advertised speed gets a long way through it.
    expect(result.session.secretIndex).toBeGreaterThan(20);
    expect(result.session.secretWords.length).toBeGreaterThan(0);
  });

  it('is finished by a typist at the map speed, on every map', () => {
    for (const map of MAPS) {
      const result = playtest({
        map,
        prompts: ALL_PROMPTS,
        wpm: map.targetWpm,
        seed: 'secret',
      });

      // The reward for a clean run at the advertised speed is the map's secret.
      // A sentence nobody ever finishes is a sentence nobody ever reads.
      expect(result.session.secretIndex, map.id).toBe(result.session.secretWords.length);
    }
  });

  it('does not advance on a word the player never finished', () => {
    const map = MAPS[0];
    if (map === undefined) throw new Error('no maps');

    // Half speed: words lapse constantly. A lapsed word must come back rather
    // than leaving a hole, or declining a coin would cost the secret.
    const result = playtest({
      map,
      prompts: ALL_PROMPTS,
      wpm: Math.round(map.targetWpm * 0.5),
      seed: 'lapsed',
    });

    expect(result.session.secretIndex).toBeLessThanOrEqual(result.session.completedPrompts);
  });
});
