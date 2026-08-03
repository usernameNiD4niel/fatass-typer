import type { ChaseProfile } from '../models/map';

/**
 * The dog chase (spec §5).
 *
 * One logical chase-distance meter — deliberately not three simulated animals.
 * The dogs are rendered as three sprites, but the rule is a single gap in meters
 * between the MC and the pack. Spec §5 is explicit that physical AI adds nothing
 * here, and a single number is the thing the HUD, the audio layer, and the
 * game-over condition can all agree on.
 *
 * The gap only ever moves for reasons the player can perceive:
 *   - running normally lets the dogs gain
 *   - boosting opens the gap
 *   - collisions and missed prompts cost a fixed chunk
 *   - a streak of clean typing earns some back
 */

export interface ChaseState {
  /** Gap between the MC and the pack, in meters. Zero means caught. */
  readonly distanceMeters: number;
  /** Consecutive prompts completed without a mistake. */
  readonly streak: number;
  /** Highest streak reached this run. */
  readonly longestStreak: number;
  readonly caught: boolean;
}

export function createChaseState(profile: ChaseProfile): ChaseState {
  return {
    distanceMeters: profile.startingDistanceMeters,
    streak: 0,
    longestStreak: 0,
    caught: false,
  };
}

/**
 * Distances below this are treated as zero.
 *
 * Accumulating a per-frame delta leaves floating-point residue — running the gap
 * down to exactly zero lands on 7.5e-14 instead. Without this the dogs would
 * hover a fraction of a nanometre behind the MC forever and never catch up.
 */
const CAUGHT_EPSILON_METERS = 1e-6;

/**
 * Applies a change in meters, clamping to both ends of the meter.
 *
 * The starting distance doubles as the maximum: a strong player should feel
 * safe, but a run where the dogs are irrelevant is not a chase.
 */
function withDistance(state: ChaseState, profile: ChaseProfile, meters: number): ChaseState {
  const bounded = Math.min(profile.startingDistanceMeters, Math.max(0, meters));
  const clamped = bounded <= CAUGHT_EPSILON_METERS ? 0 : bounded;

  return {
    ...state,
    distanceMeters: clamped,
    // Being caught is permanent for the run. Recovering from zero would let a
    // late boost undo a game over that has already been reported.
    caught: state.caught || clamped <= 0,
  };
}

/** Speeds needed to advance the chase, in meters per second. */
export interface ChaseSpeeds {
  /** The MC's current speed, including any active boost. */
  readonly playerSpeedMetersPerSecond: number;
  /** The map's unboosted speed — the pace the chase is balanced against. */
  readonly baseSpeedMetersPerSecond: number;
}

/**
 * Net rate the gap changes at, in meters per second. Positive opens the gap.
 *
 * At base speed this is exactly `-baseCatchUpMetersPerSecond`: the dogs are
 * defined as slightly faster than an unboosted MC, which is what makes standing
 * still impossible and boosts worth chasing.
 */
export function chaseRateMetersPerSecond(profile: ChaseProfile, speeds: ChaseSpeeds): number {
  const speedAdvantage = speeds.playerSpeedMetersPerSecond - speeds.baseSpeedMetersPerSecond;

  return speedAdvantage - profile.baseCatchUpMetersPerSecond;
}

/** Advances the chase over a time step. */
export function advanceChase(
  state: ChaseState,
  profile: ChaseProfile,
  deltaMs: number,
  speeds: ChaseSpeeds,
): ChaseState {
  if (state.caught || deltaMs <= 0) return state;

  const meters = chaseRateMetersPerSecond(profile, speeds) * (deltaMs / 1_000);

  return withDistance(state, profile, state.distanceMeters + meters);
}

/**
 * How accurate a prompt has to be to buy ground back.
 *
 * Not perfection. Perfection meant a player mistyping one character in twelve —
 * 92% accuracy, which is the gate Map 6 asks for — never recovered a single
 * metre all run, on any map. Ground is earned by typing well, and 90% of a
 * prompt is typing well; the mistake still costs time, and still breaks the
 * streak that leads to the next recovery.
 */
export const RECOVERY_ACCURACY = 0.85;

/** Whether a finished prompt was accurate enough to earn ground back. */
export function earnsRecovery(correctCharacters: number, incorrectCharacters: number): boolean {
  const total = correctCharacters + incorrectCharacters;
  if (total <= 0) return false;

  return correctCharacters / total >= RECOVERY_ACCURACY;
}

/**
 * The player hit an obstacle. The largest single penalty, and it breaks the
 * streak — spec §5 wants collisions to visibly bring the dogs closer.
 */
export function registerCollision(state: ChaseState, profile: ChaseProfile): ChaseState {
  if (state.caught) return state;

  return withDistance(
    { ...state, streak: 0 },
    profile,
    state.distanceMeters - profile.collisionPenaltyMeters,
  );
}

/**
 * An obstacle prompt expired without being completed, but the MC got past it
 * anyway. Cheaper than a collision, and still breaks the streak.
 */
export function registerMissedPrompt(state: ChaseState, profile: ChaseProfile): ChaseState {
  if (state.caught) return state;

  return withDistance(
    { ...state, streak: 0 },
    profile,
    state.distanceMeters - profile.missedPromptPenaltyMeters,
  );
}

/**
 * A prompt was completed cleanly.
 *
 * Recovery only starts once the streak reaches the map's threshold, so ground is
 * earned by a run of good typing rather than handed back for every prompt.
 */
export function registerPromptCompleted(state: ChaseState, profile: ChaseProfile): ChaseState {
  if (state.caught) return state;

  const streak = state.streak + 1;
  const earned = streak >= profile.streakThreshold ? profile.streakRecoveryMeters : 0;

  return withDistance(
    { ...state, streak, longestStreak: Math.max(state.longestStreak, streak) },
    profile,
    state.distanceMeters + earned,
  );
}

/** Breaks the streak without moving the dogs — for a mistyped character. */
export function breakStreak(state: ChaseState): ChaseState {
  return state.streak === 0 ? state : { ...state, streak: 0 };
}

/* -------------------------------------------------------------------------- */
/* Reporting                                                                  */
/* -------------------------------------------------------------------------- */

/** Gap as 0..1, where 1 is the starting distance and 0 is caught. */
export function normalizedDistance(state: ChaseState, profile: ChaseProfile): number {
  if (profile.startingDistanceMeters <= 0) return 0;

  return state.distanceMeters / profile.startingDistanceMeters;
}

/** Threat level for HUD colour, dog animation, and the audio danger layer. */
export type ChaseThreat = 'safe' | 'closing' | 'critical' | 'caught';

export function chaseThreat(state: ChaseState, profile: ChaseProfile): ChaseThreat {
  if (state.caught) return 'caught';
  if (state.distanceMeters <= profile.dangerThresholdMeters / 2) return 'critical';
  if (state.distanceMeters <= profile.dangerThresholdMeters) return 'closing';

  return 'safe';
}

/**
 * Seconds until the dogs catch the MC at the current rate, or `Infinity` when
 * the player is pulling away. Used to decide how urgent the danger audio is.
 */
export function secondsUntilCaught(
  state: ChaseState,
  profile: ChaseProfile,
  speeds: ChaseSpeeds,
): number {
  if (state.caught) return 0;

  const rate = chaseRateMetersPerSecond(profile, speeds);
  if (rate >= 0) return Number.POSITIVE_INFINITY;

  return state.distanceMeters / -rate;
}
