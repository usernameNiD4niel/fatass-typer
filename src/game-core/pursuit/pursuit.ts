/**
 * The thing behind you.
 *
 * A gap, in metres, between the player and whatever is chasing them. It is a
 * rule rather than a decoration: at zero the run ends, and `game-scene` draws it
 * from the number this file produces.
 *
 * ## Why the game needed one back
 *
 * The dogs were deleted in the three-lane rework and nothing replaced them, so
 * the only pressure left was a deadline the player cannot see. A deadline is
 * felt for the second or two before it expires; a closing object is felt every
 * frame of the run, and that continuous presence is most of what makes a runner
 * hard to put down.
 *
 * ## What moves it
 *
 * Nothing in this module invents a new currency. The gap responds to the same
 * **margin** that 1.2 made pay the score and the boost — how much of a hazard's
 * budget was still unspent when its word was finished:
 *
 *  - Clear decisively and the gap grows. Scrape past and it shrinks.
 *  - Mistype and it shrinks a little, immediately.
 *  - Let a gap word lapse and it shrinks, which is the first real cost gap words
 *    have ever had. They remain free to *decline* — see the note below.
 *
 * ## What deliberately does not move it
 *
 * **Coins.** Ignoring a line of coins costs nothing here, exactly as it costs
 * nothing everywhere else. Coins are the only optional thing in the game and
 * that is only true while declining them is free — a chaser that closed on a
 * declined coin line would make them mandatory for anybody trying to survive,
 * which is the whole feature gone. See `../pickups/README.md`.
 */

/** Everything the pursuit needs to know about itself. */
export interface PursuitState {
  /** Metres between the player and the chaser. The run ends at zero. */
  readonly gapMeters: number;
}

export interface PursuitConfig {
  /** Where the chaser starts, in metres behind. */
  readonly startMeters: number;
  /**
   * The most ground the player may ever bank.
   *
   * Without a ceiling a strong opening buys immunity for the rest of the run,
   * and the threat stops being a threat by the second minute — which is the
   * half of the run it most needs to cover.
   */
  readonly maxMeters: number;
  /**
   * Margin at which a clear neither gains nor loses ground.
   *
   * Measured, not chosen: a typist at a map's advertised speed clears with about
   * this much of the budget spare, so the break-even point is "exactly as good
   * as the map asks". Better than the label and the chaser falls back; worse and
   * it closes.
   */
  readonly neutralMargin: number;
  /** Metres gained per unit of margin above neutral, and lost per unit below. */
  readonly metersPerMargin: number;
  /** Lost on each wrong character. */
  readonly mistakeMeters: number;
  /** Lost when a gap word expires unfinished. */
  readonly flowMissMeters: number;
}

export const DEFAULT_PURSUIT: PursuitConfig = {
  startMeters: 34,
  maxMeters: 52,
  neutralMargin: 0.1,
  metersPerMargin: 14,
  mistakeMeters: 2.4,
  flowMissMeters: 3,
};

export function createPursuit(config: PursuitConfig = DEFAULT_PURSUIT): PursuitState {
  return { gapMeters: config.startMeters };
}

/** Never above the ceiling, never below zero. */
function clamp(gapMeters: number, config: PursuitConfig): PursuitState {
  return { gapMeters: Math.max(0, Math.min(config.maxMeters, gapMeters)) };
}

/**
 * A hazard was cleared. Ground is won or lost by how decisively.
 *
 * `marginFraction` is clamped by the caller's own contract (0..1), but clamped
 * again here rather than trusted: this function can end a run, and a bad number
 * reaching it should produce a bounded move rather than an instant death.
 */
export function applyClear(
  state: PursuitState,
  marginFraction: number,
  config: PursuitConfig = DEFAULT_PURSUIT,
): PursuitState {
  const margin = Math.max(0, Math.min(1, marginFraction));

  return clamp(state.gapMeters + (margin - config.neutralMargin) * config.metersPerMargin, config);
}

/** A wrong character. Costs ground the moment it is typed. */
export function applyMistake(
  state: PursuitState,
  config: PursuitConfig = DEFAULT_PURSUIT,
): PursuitState {
  return clamp(state.gapMeters - config.mistakeMeters, config);
}

/** A gap word expired unfinished. */
export function applyFlowMiss(
  state: PursuitState,
  config: PursuitConfig = DEFAULT_PURSUIT,
): PursuitState {
  return clamp(state.gapMeters - config.flowMissMeters, config);
}

/** True once the chaser has reached the player. */
export function isCaught(state: PursuitState): boolean {
  return state.gapMeters <= 0;
}

/**
 * How close the chaser is, 0..1, where 1 is on top of the player.
 *
 * The scene's danger cue reads this rather than the raw gap, so tuning the
 * distances never silently retunes how alarming it looks.
 */
export function pursuitPressure(
  state: PursuitState,
  config: PursuitConfig = DEFAULT_PURSUIT,
): number {
  if (config.startMeters <= 0) return 1;

  return Math.max(0, Math.min(1, 1 - state.gapMeters / config.startMeters));
}
