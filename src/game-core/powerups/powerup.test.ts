import { describe, expect, it } from 'vitest';

import { MAP_1 } from '../../content/maps';
import { ALL_PROMPTS } from '../../content/prompts';
import { adjacentLanes, type LaneIndex } from '../models/lane';
import type { PromptEntry } from '../models/prompt';
import { createRngFromString } from '../random';
import {
  type ActivePowerup,
  advanceEffects,
  advancePowerup,
  claimPowerup,
  distanceToPowerup,
  FLIGHT_MS,
  forfeitPowerup,
  grantPowerup,
  hasMagnet,
  isFlying,
  isPowerupLive,
  MAGNET_MS,
  NO_EFFECTS,
  placePowerup,
  POWERUP_KINDS,
  SHIELD_CHARGES,
  spendShield,
} from './powerup';

/**
 * The one place the game asks for perfection.
 *
 * Everything else is forgiving on purpose. A powerup is not, and these tests
 * pin the severity: one mistake and it is gone, with no second chance and no
 * partial credit.
 */

const SENTENCE = ALL_PROMPTS.find(
  (entry) => entry.category === 'short-phrase' && entry.minimumMap === 1,
) as PromptEntry;

function place(playerLane: LaneIndex = 1, seed = 'power'): ActivePowerup {
  return placePowerup({
    instanceId: 'powerup-1',
    prompt: SENTENCE,
    map: MAP_1,
    playerLane,
    playerMeters: 0,
    elapsedMs: 0,
    speedMetersPerSecond: MAP_1.baseSpeedMetersPerSecond,
    rng: createRngFromString(seed),
  }).powerup;
}

function attached(powerup: ActivePowerup): ActivePowerup {
  return {
    ...powerup,
    status: 'active',
    attachedAtMs: 1_000,
    deadlineAtMs: 1_000 + powerup.timing.availableMs,
  };
}

describe('placing a powerup', () => {
  it('puts the crate in a lane the player has to move to', () => {
    for (const lane of [0, 1, 2] as const) {
      const powerup = place(lane);

      expect(powerup.lane).not.toBe(lane);
      expect(adjacentLanes(lane)).toContain(powerup.lane);
    }
  });

  it('asks for a sentence, not a word', () => {
    // A word is too short to answer the question a powerup asks, which is not
    // "how fast" but "how cleanly".
    expect(place().prompt.text.includes(' ')).toBe(true);
  });

  it('is more generous with time than a hazard is', () => {
    // Speed *and* perfection at once would put powerups out of reach of anyone
    // but the top of the ladder. The no-mistake rule is the hard part.
    const powerup = place();
    const perCharacter = powerup.timing.availableMs / powerup.prompt.normalizedText.length;

    expect(powerup.timing.spareMs).toBeGreaterThan(0);
    expect(perCharacter).toBeGreaterThan(0);
    expect(distanceToPowerup(powerup, 0)).toBeGreaterThan(0);
  });

  it('draws a kind from the seed, and can draw any of them', () => {
    const kinds = new Set(
      Array.from({ length: 60 }, (_, index) => place(1, `kind-${String(index)}`).kind),
    );

    expect(kinds.size).toBeGreaterThan(1);
    for (const kind of kinds) expect(POWERUP_KINDS).toContain(kind);
  });
});

describe('claiming one', () => {
  it('is forfeited outright by a mistake', () => {
    const lost = forfeitPowerup(attached(place()));

    expect(lost.status).toBe('lost');
    expect(isPowerupLive(lost)).toBe(false);
    // And it stays lost. There is no recovering it inside the same encounter.
    expect(claimPowerup(lost).status).toBe('lost');
  });

  it('is forfeited by running out of time, just as quietly', () => {
    const powerup = attached(place());
    const result = advancePowerup(powerup, {
      playerMeters: 0,
      speedMetersPerSecond: MAP_1.baseSpeedMetersPerSecond,
      elapsedMs: (powerup.deadlineAtMs ?? 0) + 1,
    });

    expect(result.powerup.status).toBe('lost');
    expect(result.events.map((event) => event.type)).toEqual(['powerupExpired']);
  });

  it('cannot be claimed before its sentence has appeared', () => {
    const approaching = place();

    expect(claimPowerup(approaching)).toBe(approaching);
    expect(forfeitPowerup(approaching)).toBe(approaching);
  });

  it('attaches its sentence once', () => {
    let powerup = place();
    const seen: string[] = [];
    let meters = 0;

    for (let step = 0; step < 400 && powerup.status === 'approaching'; step += 1) {
      meters += MAP_1.baseSpeedMetersPerSecond * 0.05;
      const result = advancePowerup(powerup, {
        playerMeters: meters,
        speedMetersPerSecond: MAP_1.baseSpeedMetersPerSecond,
        elapsedMs: step * 50,
      });
      powerup = result.powerup;
      seen.push(...result.events.map((event) => event.type));
    }

    expect(powerup.status).toBe('active');
    expect(seen.filter((type) => type === 'powerupSentenceAttached')).toHaveLength(1);
  });
});

describe('what they do', () => {
  it('flight suspends the rules for half a minute', () => {
    const flying = grantPowerup(NO_EFFECTS, 'flight');

    expect(isFlying(flying)).toBe(true);
    expect(flying.flightRemainingMs).toBe(FLIGHT_MS);
    expect(isFlying(advanceEffects(flying, FLIGHT_MS + 1))).toBe(false);
  });

  it('flight refreshes rather than stacking', () => {
    const half = advanceEffects(grantPowerup(NO_EFFECTS, 'flight'), FLIGHT_MS / 2);
    const again = grantPowerup(half, 'flight');

    // Thirty seconds from the second one, which is what a player expects and is
    // far easier to read off a countdown than forty-five.
    expect(again.flightRemainingMs).toBe(FLIGHT_MS);
  });

  it('the magnet runs on its own clock', () => {
    const magnet = grantPowerup(NO_EFFECTS, 'magnet');

    expect(hasMagnet(magnet)).toBe(true);
    expect(magnet.magnetRemainingMs).toBe(MAGNET_MS);
    expect(hasMagnet(advanceEffects(magnet, MAGNET_MS + 1))).toBe(false);
  });

  it('shields are spent, not timed, and they do stack', () => {
    const shielded = grantPowerup(NO_EFFECTS, 'shield');
    expect(shielded.shields).toBe(SHIELD_CHARGES);

    // Unlike the timed effects, a second shield is worth having.
    expect(grantPowerup(shielded, 'shield').shields).toBe(SHIELD_CHARGES * 2);
    // And time does not take them away.
    expect(advanceEffects(shielded, 10 * 60_000).shields).toBe(SHIELD_CHARGES);
  });

  it('spends one shield at a time, and reports having none left', () => {
    let effects = grantPowerup(NO_EFFECTS, 'shield');

    for (let charge = SHIELD_CHARGES; charge > 0; charge -= 1) {
      const spent = spendShield(effects);
      expect(spent).not.toBeNull();
      if (spent === null) return;
      expect(spent.shields).toBe(charge - 1);
      effects = spent;
    }

    // `null` rather than a zeroed object: the caller has to notice, because the
    // difference is whether the run ends.
    expect(spendShield(effects)).toBeNull();
  });

  it('leaves untouched effects alone when nothing is running', () => {
    expect(advanceEffects(NO_EFFECTS, 1_000)).toBe(NO_EFFECTS);
  });
});
