import { describe, expect, it } from 'vitest';

import { MAP_1 } from '../../content/maps';
import { ALL_PROMPTS } from '../../content/prompts';
import { adjacentLanes, type LaneIndex } from '../models/lane';
import type { PromptEntry } from '../models/prompt';
import { createRngFromString } from '../random';
import {
  type ActiveCoin,
  advanceCoin,
  coinRemainingMs,
  collectsCoins,
  commitCoin,
  distanceToCoins,
  isCoinLive,
  placeCoin,
  resolveCoin,
} from './coin';

/**
 * The one rule coins have: you get them by typing, or you do not get them.
 *
 * Everything else about them is deliberately toothless. There is no penalty
 * anywhere in this file, and that absence is the point — a coin the player is
 * punished for declining is not optional, it is a hazard wearing gold.
 */

const PROMPT = ALL_PROMPTS.find((entry) => entry.text === 'gate') as PromptEntry;

function place(playerLane: LaneIndex = 1, seed = 'coins'): ActiveCoin {
  return placeCoin({
    instanceId: 'coin-1',
    prompt: PROMPT,
    map: MAP_1,
    playerLane,
    playerMeters: 0,
    elapsedMs: 0,
    speedMetersPerSecond: MAP_1.baseSpeedMetersPerSecond,
    rng: createRngFromString(seed),
  }).coin;
}

/** Brings a coin line to the moment its word appears. */
function attached(coin: ActiveCoin): ActiveCoin {
  return {
    ...coin,
    status: 'active',
    attachedAtMs: 1_000,
    deadlineAtMs: 1_000 + coin.timing.availableMs,
  };
}

describe('placing coins', () => {
  it('puts them in a lane the player has to move to reach', () => {
    for (const lane of [0, 1, 2] as const) {
      const coin = place(lane);

      expect(coin.lane).not.toBe(lane);
      expect(adjacentLanes(lane)).toContain(coin.lane);
    }
  });

  it('names the side they are on, for the world cue', () => {
    const coin = place(0);

    expect(coin.lane).toBe(1);
    expect(coin.side).toBe('right');
  });

  it('places them ahead, with a word budget of their own', () => {
    const coin = place();

    expect(distanceToCoins(coin, 0)).toBeGreaterThan(0);
    expect(coin.timing.availableMs).toBeGreaterThan(0);
  });

  it('asks for more speed than a hazard does', () => {
    // Missing coins costs nothing, so they can ask for the map's advertised
    // speed and very little more. That is what makes collecting them an
    // achievement rather than a gift.
    const coin = place();
    const hazardBudget =
      (PROMPT.normalizedText.length / 5 / MAP_1.targetWpm) * 60_000 * MAP_1.timing.reactionBuffer +
      MAP_1.timing.fixedVisualLeadTimeMs;

    expect(coin.timing.availableMs).toBeLessThan(hazardBudget);
  });

  it('is deterministic from its seed', () => {
    expect(place(1, 'same').lane).toBe(place(1, 'same').lane);
  });
});

describe('the coin word', () => {
  it('appears as the coins come into range, once', () => {
    let coin = place();
    const events: string[] = [];
    let meters = 0;

    for (let step = 0; step < 200 && coin.status === 'approaching'; step += 1) {
      meters += MAP_1.baseSpeedMetersPerSecond * 0.05;
      const result = advanceCoin(coin, {
        playerMeters: meters,
        speedMetersPerSecond: MAP_1.baseSpeedMetersPerSecond,
        elapsedMs: step * 50,
      });
      coin = result.coin;
      events.push(...result.events.map((event) => event.type));
    }

    expect(coin.status).toBe('active');
    expect(events.filter((type) => type === 'coinWordAttached')).toHaveLength(1);
    expect(coinRemainingMs(coin, coin.attachedAtMs ?? 0)).toBeCloseTo(coin.timing.availableMs, 6);
  });

  it('expires without ceremony when it is not typed', () => {
    const coin = attached(place());
    const result = advanceCoin(coin, {
      playerMeters: 0,
      speedMetersPerSecond: MAP_1.baseSpeedMetersPerSecond,
      elapsedMs: (coin.deadlineAtMs ?? 0) + 1,
    });

    expect(result.coin.status).toBe('missed');
    expect(result.events.map((event) => event.type)).toEqual(['coinExpired']);
    // Nothing else. No penalty, no reason, no run ending.
    expect(isCoinLive(result.coin)).toBe(false);
  });

  it('goes quiet once it is done', () => {
    const spent = { ...place(), status: 'missed' as const };

    expect(
      advanceCoin(spent, { playerMeters: 999, speedMetersPerSecond: 6, elapsedMs: 9_999 }).events,
    ).toEqual([]);
  });
});

describe('collecting', () => {
  it('needs the word typed *and* the lane reached', () => {
    const coin = attached(place());
    const lane = coin.lane;

    // Typed, but never arrived.
    expect(collectsCoins(commitCoin(coin, 1_100), 1, true)).toBe(false);
    // Arrived, but never typed — driving through them is not collecting them.
    expect(collectsCoins(coin, lane, true)).toBe(false);
    // Typed and arrived.
    expect(collectsCoins(commitCoin(coin, 1_100), lane, true)).toBe(true);
  });

  it('needs the swerve to have finished', () => {
    const committed = commitCoin(attached(place()), 1_100);

    expect(collectsCoins(committed, committed.lane, false)).toBe(false);
  });

  it('pays out only what was collected', () => {
    const committed = commitCoin(attached(place()), 1_100);

    const won = resolveCoin(committed, committed.lane, true);
    expect(won.collected).toBe(true);
    expect(won.value).toBe(MAP_1.content.coinValue);
    expect(won.coin.status).toBe('collected');

    const lost = resolveCoin(committed, 1, true);
    expect(lost.collected).toBe(false);
    // Zero, not a negative. Declining coins is free.
    expect(lost.value).toBe(0);
    expect(lost.coin.status).toBe('missed');
  });

  it('reports the collect plane once', () => {
    const coin = commitCoin(attached(place()), 1_100);
    const first = advanceCoin(coin, {
      playerMeters: coin.collectMeters + 1,
      speedMetersPerSecond: MAP_1.baseSpeedMetersPerSecond,
      elapsedMs: 1_200,
    });

    expect(first.events.map((event) => event.type)).toContain('coinReached');

    const second = advanceCoin(first.coin, {
      playerMeters: coin.collectMeters + 10,
      speedMetersPerSecond: MAP_1.baseSpeedMetersPerSecond,
      elapsedMs: 1_300,
    });

    expect(second.events).toEqual([]);
  });

  it('cannot be committed before its word has appeared', () => {
    const approaching = place();

    expect(commitCoin(approaching, 500)).toBe(approaching);
  });
});
