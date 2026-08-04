import { adjacentLanes, sideBetween, type LaneIndex, type LaneSide } from '../models/lane';
import type { MapConfig } from '../models/map';
import type { PromptEntry } from '../models/prompt';
import { effectiveCharacterCount } from '../models/prompt';
import { pick, type Rng } from '../random';
import {
  computePromptTiming,
  motionReserveMs,
  type PromptTiming,
  spawnDistanceMeters,
  timeToImpactMs,
} from '../timing';

/**
 * Coins — the optional half of the game.
 *
 * A line of coins appears in the lane beside you during the quiet stretch
 * between hazards, with a word floating over it. Type the word and you swerve
 * across and collect them. Ignore it and you drive past, and that is the whole
 * penalty: coins are the only thing in this game you can decline.
 *
 * ## Why they exist
 *
 * Not for the score. The gap between hazards was dead time — several seconds of
 * watching an empty road with nothing to type — and dead time is what made the
 * game boring rather than easy. Coins fill it with something optional, so the
 * player is typing almost continuously without the run ever becoming a gauntlet
 * where one slip is fatal.
 *
 * That is also why they sit in an *adjacent* lane rather than straight ahead.
 * Coins you would collect anyway are a bonus with nothing happening on screen;
 * coins one lane over are a decision, and the swerve is visible.
 *
 * Pure: no clock, no randomness beyond the seeded RNG, no DOM.
 */

export type CoinStatus = 'approaching' | 'active' | 'committed' | 'collected' | 'missed';

export interface ActiveCoin {
  readonly instanceId: string;
  readonly prompt: PromptEntry;
  /** The lane the coins are in. Always adjacent to the player when placed. */
  readonly lane: LaneIndex;
  /** Which way that lane lies, for the world cue. */
  readonly side: LaneSide;
  /** World position of the coin line, in metres. */
  readonly collectMeters: number;
  /** How many coins are in the line. */
  readonly value: number;
  readonly timing: PromptTiming;
  readonly status: CoinStatus;
  readonly spawnedAtMs: number;
  readonly attachedAtMs: number | null;
  readonly deadlineAtMs: number | null;
  /** The collect plane has been reached and reported once. */
  readonly passed: boolean;
}

/**
 * How much earlier than the word the coins become visible, as a multiple of the
 * available time.
 *
 * Shorter than a hazard's lead. A hazard has to be read early enough to be
 * feared; coins only have to be noticed in time to decide.
 */
export const COIN_LEAD_FACTOR = 1.2;

/** Slack over the map's advertised speed. Far less than a hazard gets. */
const COIN_BUFFER = 1.15;

/** Flat allowance for noticing the coins at all. */
const COIN_LEAD_MS = 200;

export interface PlaceCoinInput {
  readonly instanceId: string;
  readonly prompt: PromptEntry;
  readonly map: MapConfig;
  readonly playerLane: LaneIndex;
  readonly playerMeters: number;
  readonly elapsedMs: number;
  readonly speedMetersPerSecond: number;
  readonly rng: Rng;
}

export interface PlaceCoinResult {
  readonly coin: ActiveCoin;
  readonly rng: Rng;
}

/**
 * Puts a line of coins in a lane next to the player.
 *
 * The timing budget is the same one hazards use, so a word that would be fair
 * on a car is fair on a coin. It has to be: a coin the player cannot reach is
 * not an optional reward, it is a taunt.
 */
export function placeCoin(input: PlaceCoinInput): PlaceCoinResult {
  const choices = adjacentLanes(input.playerLane);
  const drawn = pick(input.rng, choices);
  const lane = drawn.value ?? input.playerLane;

  /*
   * A tighter budget than a hazard's, and deliberately so.
   *
   * Missing a hazard ends the run, so its budget has to survive hesitation and
   * a mistake. Missing coins costs nothing, so they can ask for the map's
   * advertised speed and very little more — which is what makes collecting them
   * feel like something you *did* rather than something you were given.
   */
  const timing = computePromptTiming({
    characterCount: effectiveCharacterCount(input.prompt),
    targetWpm: input.map.targetWpm,
    timing: { reactionBuffer: COIN_BUFFER, fixedVisualLeadTimeMs: COIN_LEAD_MS },
  });

  const reserveMs = motionReserveMs('lane-change', input.map.motion);
  const leadMeters = spawnDistanceMeters(
    (timing.availableMs + reserveMs) * COIN_LEAD_FACTOR,
    input.speedMetersPerSecond,
  );

  return {
    rng: drawn.rng,
    coin: {
      instanceId: input.instanceId,
      prompt: input.prompt,
      lane,
      side: sideBetween(input.playerLane, lane) ?? 'right',
      collectMeters: input.playerMeters + leadMeters,
      value: input.map.content.coinValue,
      timing,
      status: 'approaching',
      spawnedAtMs: input.elapsedMs,
      attachedAtMs: null,
      deadlineAtMs: null,
      passed: false,
    },
  };
}

export type CoinEvent =
  | { readonly type: 'coinWordAttached'; readonly coin: ActiveCoin }
  | { readonly type: 'coinExpired'; readonly coin: ActiveCoin }
  /** The player has reached the coins. Either they are in the lane or they are not. */
  | { readonly type: 'coinReached'; readonly coin: ActiveCoin };

export interface CoinAdvanceInput {
  readonly playerMeters: number;
  readonly speedMetersPerSecond: number;
  readonly elapsedMs: number;
}

export interface CoinAdvanceResult {
  readonly coin: ActiveCoin;
  readonly events: readonly CoinEvent[];
}

/** Metres between the player and the coins. Negative once they are behind. */
export function distanceToCoins(coin: ActiveCoin, playerMeters: number): number {
  return coin.collectMeters - playerMeters;
}

export function advanceCoin(coin: ActiveCoin, input: CoinAdvanceInput): CoinAdvanceResult {
  if (coin.status === 'collected' || coin.status === 'missed') return { coin, events: [] };

  const events: CoinEvent[] = [];
  let current = coin;

  const untilMs = timeToImpactMs(
    distanceToCoins(current, input.playerMeters),
    input.speedMetersPerSecond,
  );
  const reserveHint = current.timing.availableMs;

  if (current.status === 'approaching' && untilMs <= reserveHint * COIN_LEAD_FACTOR) {
    current = {
      ...current,
      status: 'active',
      attachedAtMs: input.elapsedMs,
      deadlineAtMs: input.elapsedMs + current.timing.availableMs,
    };
    events.push({ type: 'coinWordAttached', coin: current });
  }

  // Running out of time on a coin costs nothing but the coins. It is not a
  // failure, so it does not go through `resolution.ts` and it never ends a run.
  if (
    current.status === 'active' &&
    current.deadlineAtMs !== null &&
    input.elapsedMs >= current.deadlineAtMs
  ) {
    current = { ...current, status: 'missed' };
    events.push({ type: 'coinExpired', coin: current });

    return { coin: current, events };
  }

  if (!current.passed && input.playerMeters >= current.collectMeters) {
    current = { ...current, passed: true };
    events.push({ type: 'coinReached', coin: current });
  }

  return { coin: current, events };
}

/** Marks the word finished and the swerve begun. */
export function commitCoin(coin: ActiveCoin, elapsedMs: number): ActiveCoin {
  if (coin.status !== 'active') return coin;

  return { ...coin, status: 'committed', deadlineAtMs: coin.deadlineAtMs ?? elapsedMs };
}

/**
 * Did the player actually get there?
 *
 * Being in the lane is the whole test. Typing the word starts the swerve; the
 * swerve is what collects, which is why a player who types it far too late
 * still watches the coins go by.
 */
export function collectsCoins(coin: ActiveCoin, lane: LaneIndex, settled: boolean): boolean {
  return coin.status === 'committed' && settled && lane === coin.lane;
}

export interface CoinResolution {
  readonly coin: ActiveCoin;
  readonly collected: boolean;
  readonly value: number;
}

/** Decides a coin line at the collect plane. Never a failure, either way. */
export function resolveCoin(coin: ActiveCoin, lane: LaneIndex, settled: boolean): CoinResolution {
  const collected = collectsCoins(coin, lane, settled);

  return {
    coin: { ...coin, status: collected ? 'collected' : 'missed' },
    collected,
    value: collected ? coin.value : 0,
  };
}

/** Milliseconds left on the coin word, or `null` before it appears. */
export function coinRemainingMs(coin: ActiveCoin, elapsedMs: number): number | null {
  if (coin.deadlineAtMs === null) return null;

  return Math.max(0, coin.deadlineAtMs - elapsedMs);
}

/** True while the coins are still worth typing for. */
export function isCoinLive(coin: ActiveCoin): boolean {
  return coin.status === 'approaching' || coin.status === 'active' || coin.status === 'committed';
}
