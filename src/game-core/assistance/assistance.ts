import type { AdaptiveAssistanceConfig, MapConfig } from '../models';
import { DEFAULT_ADAPTIVE_ASSISTANCE } from '../models';

/**
 * Adaptive assistance (spec §6).
 *
 * A player who keeps missing the same kind of obstacle is usually a few hundred
 * milliseconds short, not fundamentally unable. This gives them those
 * milliseconds — and takes them back once they stop needing them.
 *
 * Three rules keep it from becoming a lie:
 *
 *   1. **It moves the reaction buffer only.** Never the target speed, never the
 *      chase, never the score. The player is given more time to *see* a prompt,
 *      not a slower game.
 *   2. **It is clamped, hard.** `minimumBufferMultiplier` and
 *      `maximumBufferMultiplier` bound it in both directions, so no run can
 *      drift far from the map's stated difficulty.
 *   3. **The displayed target WPM never changes.** Spec §6 is explicit: show the
 *      map's intended target honestly. A number that quietly moved with the
 *      player's performance would make every other number meaningless.
 *
 * Pure, like everything in `game-core`: it counts what happened and returns a
 * multiplier.
 */

export interface AssistanceState {
  /** Multiplier applied to the map's reaction buffer. 1 is the map as written. */
  readonly bufferMultiplier: number;
  readonly consecutiveFailures: number;
  readonly consecutiveSuccesses: number;
  /** How many times it has eased, for the results screen and for tests. */
  readonly easings: number;
  readonly tightenings: number;
}

export const NEUTRAL_ASSISTANCE: AssistanceState = {
  bufferMultiplier: 1,
  consecutiveFailures: 0,
  consecutiveSuccesses: 0,
  easings: 0,
  tightenings: 0,
};

export function createAssistance(): AssistanceState {
  return NEUTRAL_ASSISTANCE;
}

function clamp(value: number, config: AdaptiveAssistanceConfig): number {
  return Math.min(config.maximumBufferMultiplier, Math.max(config.minimumBufferMultiplier, value));
}

/**
 * An obstacle was missed — a stumble or a collision.
 *
 * Easing only starts after `failuresBeforeEasing` in a row. A single miss is
 * ordinary; three in a row is a pattern, and reacting to the first one would
 * make the game feel like it was flinching.
 */
export function registerFailure(
  state: AssistanceState,
  config: AdaptiveAssistanceConfig = DEFAULT_ADAPTIVE_ASSISTANCE,
): AssistanceState {
  if (!config.enabled) return state;

  const consecutiveFailures = state.consecutiveFailures + 1;

  if (consecutiveFailures < config.failuresBeforeEasing) {
    return { ...state, consecutiveFailures, consecutiveSuccesses: 0 };
  }

  const eased = clamp(state.bufferMultiplier + config.bufferStep, config);

  return {
    ...state,
    bufferMultiplier: eased,
    // The counter resets, so easing is paced: another three misses are needed
    // before the next step, rather than every miss compounding.
    consecutiveFailures: 0,
    consecutiveSuccesses: 0,
    easings: eased > state.bufferMultiplier ? state.easings + 1 : state.easings,
  };
}

/**
 * An obstacle was cleared.
 *
 * Tightening takes far more evidence than easing — eight in a row against three.
 * Being given help you did not need is a small unfairness; having it taken away
 * mid-recovery is a large one.
 */
export function registerSuccess(
  state: AssistanceState,
  config: AdaptiveAssistanceConfig = DEFAULT_ADAPTIVE_ASSISTANCE,
): AssistanceState {
  if (!config.enabled) return state;

  const consecutiveSuccesses = state.consecutiveSuccesses + 1;

  if (consecutiveSuccesses < config.successesBeforeTightening) {
    return { ...state, consecutiveSuccesses, consecutiveFailures: 0 };
  }

  const tightened = clamp(state.bufferMultiplier - config.bufferStep, config);

  return {
    ...state,
    bufferMultiplier: tightened,
    consecutiveFailures: 0,
    consecutiveSuccesses: 0,
    tightenings: tightened < state.bufferMultiplier ? state.tightenings + 1 : state.tightenings,
  };
}

/** The reaction buffer actually in force. */
export function effectiveReactionBuffer(map: MapConfig, state: AssistanceState): number {
  return map.timing.reactionBuffer * state.bufferMultiplier;
}

/**
 * The map as the timing calculations should see it.
 *
 * Only `timing.reactionBuffer` differs. Returning a whole config rather than a
 * loose number means every caller gets the adjustment automatically — there is
 * no second code path where assistance is forgotten.
 */
export function assistedMap(map: MapConfig, state: AssistanceState): MapConfig {
  if (state.bufferMultiplier === 1) return map;

  return {
    ...map,
    timing: { ...map.timing, reactionBuffer: effectiveReactionBuffer(map, state) },
  };
}

/**
 * How far from the map as written, as a percentage. For the dev overlay.
 *
 * Never shown to the player: spec §6 warns against letting adaptation become
 * visible speed manipulation, and a badge saying "12% easier" would be exactly
 * that.
 */
export function assistanceDriftPercent(state: AssistanceState): number {
  return Math.round((state.bufferMultiplier - 1) * 100);
}
