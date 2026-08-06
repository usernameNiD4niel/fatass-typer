import type { LaneIndex } from '../models/lane';
import { LANE_INDICES } from '../models/lane';
import type { MapConfig } from '../models/map';
import { rampedSpeed } from '../motion/speed';
import { nextFloat, pick, type Rng } from '../random';

/**
 * The other two runners.
 *
 * ## What they are
 *
 * Opponents in a race, and nothing else. They do not type, cannot be collided
 * with, and are not a second way to lose — the chaser keeps that job. What they
 * do is make the road contested: they are somewhere ahead or behind at every
 * moment, they finish before or after you, and **they take coins**.
 *
 * ## Why their speed is a wander rather than a number
 *
 * A bot at a fixed speed is a line on a graph: within ten seconds the player
 * knows whether they are winning and nothing that happens afterwards changes
 * it. Each racer instead holds a *target* pace and drifts toward it, with the
 * target re-drawn every few seconds — so a lead is something that has to be
 * held rather than something you established once.
 *
 * The band the target is drawn from is derived from the map, so a bot on Map 1
 * is beatable at 20 WPM and a bot on Map 6 is not. Same as everything else
 * here: the map's own number decides.
 *
 * Pure and seeded: no clock, no `Math.random`. Same seed, same race.
 */

export interface Racer {
  readonly id: string;
  /** Display name, for the standings. */
  readonly name: string;
  /** Distance covered, in metres — the same scale as the player's. */
  readonly meters: number;
  /** Which lane they are running in. Cosmetic: nothing collides. */
  readonly lane: LaneIndex;
  /** Current pace, metres per second. */
  readonly speed: number;
  /** The pace they are drifting toward. */
  readonly targetSpeed: number;
  /** Run time at which a new target is drawn. */
  readonly retargetAtMs: number;
  /** True once they have crossed the finish line. */
  readonly finished: boolean;
  /** When they finished, in run time. `null` until they do. */
  readonly finishedAtMs: number | null;
}

export interface RaceState {
  readonly racers: readonly Racer[];
  readonly rng: Rng;
}

/**
 * The band a racer's pace is drawn from, as a share of what the map's own
 * audience travels at.
 *
 * The floor sits below a target-speed player and the ceiling above them, so
 * both outcomes are live for the player the map was written for. Someone
 * typing well beats both; someone scraping the map loses to both.
 */
const PACE_FLOOR = 0.86;
const PACE_CEILING = 1.14;

/** How quickly a racer closes on its target pace, per second. */
const PACE_APPROACH = 0.45;

/** How often a new target pace is drawn, in milliseconds. */
const RETARGET_MIN_MS = 3_500;
const RETARGET_SPREAD_MS = 4_500;

const NAMES = ['Rival', 'Pacer'] as const;

/**
 * The speed the map's own audience actually travels at.
 *
 * Not `baseSpeedMetersPerSecond`: a player typing at the map's advertised speed
 * carries momentum most of the time, so base speed is the pace of somebody who
 * has stopped, and pacing the bots against it would make them trivially
 * beatable on every map.
 *
 * The share below is the tuning that matters in this file. A typist at exactly
 * the map's advertised speed earns a momentum of roughly `0.45`, so pacing the
 * bots a little under that puts them **neck and neck** with the map's own
 * audience: sometimes ahead, sometimes behind, the lead changing hands. Type
 * better than the map asks and you pull away and keep the coins; type worse and
 * you spend the run watching somebody else take them.
 *
 * Pacing them *at* 0.55 was tried first and it was too much — a target-speed
 * player never once led, so every coin in every run went to a bot.
 *
 * ## Why this number cannot simply be raised
 *
 * It was the obvious answer to opponents being too easy, and it was tried:
 * flat rises and a ladder climbing with the map number, both. Every version
 * failed the same assertion — a typist at the map's own advertised speed took
 * **zero** coins, on every map from 4 up, because the margin they beat a bot by
 * is small and this number eats it directly.
 *
 * Drawn pace decides whether the map's own audience is *in* the race. It is the
 * wrong dial for making a good player work, because it moves both. The chase
 * below is the right one: it does nothing until somebody is genuinely clear.
 */
const RACER_MOMENTUM_SHARE = 0.25;

export function referenceSpeed(map: MapConfig, elapsedMs: number): number {
  const ramped = rampedSpeed(map.baseSpeedMetersPerSecond, map.speed, elapsedMs);

  return ramped * (1 + (map.boost.speedMultiplier - 1) * RACER_MOMENTUM_SHARE);
}

function drawTarget(map: MapConfig, elapsedMs: number, rng: Rng): { value: number; rng: Rng } {
  const drawn = nextFloat(rng);
  const share = PACE_FLOOR + (PACE_CEILING - PACE_FLOOR) * drawn.value;

  return { value: referenceSpeed(map, elapsedMs) * share, rng: drawn.rng };
}

export function createRace(map: MapConfig, rng: Rng): RaceState {
  const racers: Racer[] = [];
  let current = rng;
  const lanes = [...LANE_INDICES];

  for (let index = 0; index < NAMES.length; index += 1) {
    const target = drawTarget(map, 0, current);
    current = target.rng;

    // A lane each, and never the centre one the player starts in — opening the
    // run already overlapping somebody reads as a bug even though nothing
    // collides.
    const available = lanes.filter((lane) => lane !== 1);
    const drawnLane = pick(current, available);
    current = drawnLane.rng;
    const lane = drawnLane.value ?? 0;
    lanes.splice(lanes.indexOf(lane), 1);

    racers.push({
      id: `racer-${String(index + 1)}`,
      name: NAMES[index] ?? 'Rival',
      meters: 0,
      lane,
      speed: target.value,
      targetSpeed: target.value,
      retargetAtMs: RETARGET_MIN_MS,
      finished: false,
      finishedAtMs: null,
    });
  }

  return { racers, rng: current };
}

export interface AdvanceRaceInput {
  readonly map: MapConfig;
  readonly deltaMs: number;
  readonly elapsedMs: number;
  /** Zero on an endless map, where nobody finishes. */
  readonly distanceMeters: number;
  /** How far the player has come. Read only to decide how hard to chase. */
  readonly playerMeters: number;
}

/**
 * How hard an opponent runs down a lead, as extra metres per second per metre
 * of deficit, and the most it can add.
 *
 * ## Why they chase at all
 *
 * Drawn pace alone makes an opponent a moving obstacle rather than a rival: get
 * twenty metres up on one and it will never be seen again, because it has no
 * idea it is losing. That is exactly what "the bots are not hard to deal with"
 * describes — the race is decided in its first thirty seconds and then nothing
 * happens for two minutes.
 *
 * So a racer that is *behind* runs a little harder, and the further behind, the
 * harder. A racer in front gets nothing: this is a rubber band, not a leash, and
 * a player who has earned a lead should still be able to extend it — they just
 * have to keep typing to hold it.
 *
 * The cap is what keeps it honest. At full stretch it is worth about a fifth of
 * the map's pace, so a big lead still converts into coins; it cannot summon an
 * opponent back from any distance, which would make the lead meaningless and
 * the coins arbitrary.
 */
const CHASE_PER_METER = 0.05;
const CHASE_CAP_SHARE = 0.22;

/**
 * How far behind an opponent has to be before it starts chasing.
 *
 * Without this the chase fires in a race that is *already* level — the two
 * opponents trade the lead with the player every few seconds, so one of them is
 * always a few metres down and always being handed pace for it. Measured: a
 * typist at the map's advertised speed took **zero** coins on all six maps,
 * because the bot they had just edged out was immediately given the margin back.
 *
 * Twenty-five metres is about three seconds of road. Inside it the race is a
 * race and nobody is helped; outside it the player has genuinely pulled clear,
 * which is the only case this was ever meant to answer.
 */
const CHASE_DEADBAND_METERS = 25;

function chaseBonus(map: MapConfig, elapsedMs: number, deficitMeters: number): number {
  const chased = deficitMeters - CHASE_DEADBAND_METERS;
  if (chased <= 0) return 0;

  const reference = referenceSpeed(map, elapsedMs);

  return Math.min(chased * CHASE_PER_METER, reference * CHASE_CAP_SHARE);
}

/** Runs every racer forward one step. */
export function advanceRace(state: RaceState, input: AdvanceRaceInput): RaceState {
  const seconds = input.deltaMs / 1000;
  let rng = state.rng;

  const racers = state.racers.map((racer) => {
    if (racer.finished) return racer;

    let { targetSpeed, retargetAtMs } = racer;

    if (input.elapsedMs >= retargetAtMs) {
      const target = drawTarget(input.map, input.elapsedMs, rng);
      rng = target.rng;
      targetSpeed = target.value;

      const spread = nextFloat(rng);
      rng = spread.rng;
      retargetAtMs = input.elapsedMs + RETARGET_MIN_MS + spread.value * RETARGET_SPREAD_MS;
    }

    // Eased rather than snapped: a bot that changed pace instantly would read
    // as teleporting when it is a few metres from the camera.
    const speed = racer.speed + (targetSpeed - racer.speed) * Math.min(1, seconds * PACE_APPROACH);
    /*
     * The chase is added to the *distance travelled*, not to `speed`.
     *
     * Folding it into the stored speed would compound: next frame's easing
     * would treat the bonus as the pace it was approaching, and a racer that
     * fell behind once would accelerate away from its own target for the rest
     * of the run.
     */
    const chase = chaseBonus(input.map, input.elapsedMs, input.playerMeters - racer.meters);
    const meters = racer.meters + (speed + chase) * seconds;

    const done = input.distanceMeters > 0 && meters >= input.distanceMeters;

    return {
      ...racer,
      speed,
      targetSpeed,
      retargetAtMs,
      meters: done ? input.distanceMeters : meters,
      finished: done,
      finishedAtMs: done ? input.elapsedMs : null,
    };
  });

  return { racers, rng };
}

/**
 * Where the player stands, 1-based.
 *
 * Ties go to the player, which matters more than it sounds: a bot drawn at
 * exactly the player's pace would otherwise flicker the standing every frame.
 */
export function playerPlacement(state: RaceState, playerMeters: number): number {
  let ahead = 0;
  for (const racer of state.racers) {
    if (racer.meters > playerMeters) ahead += 1;
  }

  return ahead + 1;
}

/** The furthest-ahead racer, or `null` when the player leads. */
export function leadingRacer(state: RaceState, playerMeters: number): Racer | null {
  let leader: Racer | null = null;

  for (const racer of state.racers) {
    if (racer.meters <= playerMeters) continue;
    if (leader === null || racer.meters > leader.meters) leader = racer;
  }

  return leader;
}

/** True when the player is in front of everybody. */
export function playerLeads(state: RaceState, playerMeters: number): boolean {
  return leadingRacer(state, playerMeters) === null;
}
