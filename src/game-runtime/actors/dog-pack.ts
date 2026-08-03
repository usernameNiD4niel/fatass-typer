import {
  type ChaseState,
  type ChaseThreat,
  chaseThreat,
  normalizedDistance,
} from '../../game-core/chase';
import { type ChaseProfile } from '../../game-core/models/map';

/**
 * The three dogs (spec §5, §10).
 *
 * The rules model the chase as **one** number — the gap in meters (B6). This
 * module turns that single number into three animals on screen. It adds no
 * behaviour: nothing here can change the gap, decide a catch, or drift out of
 * agreement with the HUD, because every position is derived from `ChaseState`
 * on the frame it is drawn.
 *
 * The dogs are energetic, not frightening (spec §10). Escalation is carried by
 * posture and proximity rather than by anything gruesome.
 */

/** Gap between dogs when they are running as a loose pack, in meters. */
const PACK_SPACING_METERS = 1.15;

/** Meters covered by one full stride cycle. Shorter than the MC's — smaller legs. */
const DOG_STRIDE_METERS = 1.6;

/** Dog height in world meters, for sizing against the MC's 1.75. */
export const DOG_HEIGHT_METERS = 0.85;

/**
 * Per-dog character, so three copies of one drawing do not read as one dog
 * blurred. Each has a size, a lane offset, and a phase offset that keeps their
 * legs out of lockstep.
 */
export interface DogTrait {
  readonly scale: number;
  /** Vertical shift as a fraction of dog height — the pack is not a single file. */
  readonly laneOffset: number;
  readonly phaseOffset: number;
  /** Extra spacing multiplier, so the pack is uneven. */
  readonly spacing: number;
}

export const DOG_TRAITS: readonly DogTrait[] = [
  { scale: 1.0, laneOffset: 0, phaseOffset: 0, spacing: 0 },
  { scale: 0.88, laneOffset: -0.22, phaseOffset: 0.37, spacing: 1 },
  { scale: 1.06, laneOffset: 0.14, phaseOffset: 0.68, spacing: 1.85 },
];

export interface DogPackState {
  /** Shared run cycle, advanced by distance travelled like the MC's. */
  readonly cyclePhase: number;
  /** Free-running clock for cues that are not tied to stride, in seconds. */
  readonly clockSeconds: number;
}

export function createDogPack(): DogPackState {
  return { cyclePhase: 0, clockSeconds: 0 };
}

export interface DogPackAdvanceInput {
  readonly deltaMs: number;
  /** The dogs run at whatever the MC runs at, plus their own catch-up rate. */
  readonly speedMetersPerSecond: number;
}

export function advanceDogPack(state: DogPackState, input: DogPackAdvanceInput): DogPackState {
  const deltaMs = Math.max(0, input.deltaMs);
  const seconds = deltaMs / 1000;
  const advance = Math.max(0, input.speedMetersPerSecond) * (seconds / DOG_STRIDE_METERS);

  return {
    cyclePhase: (state.cyclePhase + advance) % 1,
    clockSeconds: state.clockSeconds + seconds,
  };
}

export interface DogView {
  readonly index: number;
  /** World position along the run, in meters. */
  readonly worldMeters: number;
  readonly cyclePhase: number;
  readonly scale: number;
  readonly laneOffset: number;
  /**
   * How hard this dog is lunging, 0..1. Rises as the gap closes, so the pack
   * stretches into a sprint instead of just being nearer.
   */
  readonly lungeRatio: number;
}

export interface DogPackView {
  readonly dogs: readonly DogView[];
  readonly threat: ChaseThreat;
  /** Gap as 0..1 of the map's starting distance. 0 means caught. */
  readonly closeness: number;
}

export interface DogPackInput {
  readonly state: DogPackState;
  readonly chase: ChaseState;
  readonly profile: ChaseProfile;
  /** The MC's interpolated world position, in meters. */
  readonly playerMeters: number;
}

/**
 * Places the pack for one frame.
 *
 * The lead dog sits exactly `chase.distanceMeters` behind the MC — the number
 * the HUD shows is the number on screen, with no separate visual model to drift
 * out of sync with it.
 */
export function dogPackView(input: DogPackInput): DogPackView {
  const { chase, profile, state } = input;
  const gap = chase.distanceMeters;
  const remaining = normalizedDistance(chase, profile);
  const threat = chaseThreat(chase, profile);

  // The pack tightens as it closes: a spread-out pack at the moment of the catch
  // would leave two dogs stranded behind the MC.
  const tightening = 0.45 + 0.55 * Math.min(1, remaining * 2);
  const lunge = 1 - Math.min(1, remaining * 2.5);

  const dogs = DOG_TRAITS.map((trait, index): DogView => {
    const behind = gap + trait.spacing * PACK_SPACING_METERS * tightening;
    // A small stride-locked surge, so each dog gains and loses ground within its
    // own gait rather than sliding along at a fixed offset.
    const surge =
      Math.sin((state.cyclePhase + trait.phaseOffset) * Math.PI * 2) * 0.12 * (0.5 + lunge);

    return {
      index,
      worldMeters: input.playerMeters - behind + surge,
      cyclePhase: (state.cyclePhase + trait.phaseOffset) % 1,
      scale: trait.scale,
      laneOffset: trait.laneOffset,
      lungeRatio: Math.max(0, Math.min(1, lunge)),
    };
  });

  return { dogs, threat, closeness: 1 - remaining };
}
