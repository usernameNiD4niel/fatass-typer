import type { LaneIndex } from '../models/lane';
import { LANE_INDICES } from '../models/lane';
import type { MapConfig } from '../models/map';
import { COASTING_FLOOR } from '../motion/momentum';
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
 * ## Why this number cannot simply be raised — measured, twice
 *
 * It is the obvious answer to "the opponents are too easy", and it has now been
 * tried in three forms: a flat rise, a ladder climbing with the map number, and
 * a floor that tracked the player's own momentum. All three failed the same
 * assertions, and the numbers are worth writing down because they explain *why*
 * this dial is off limits.
 *
 * The coin contest is **winner-take-all**. Whoever is in front reaches a coin
 * first, and a lead compounds — so the standings settle in the opening seconds
 * and then hold. Moving this share by five points, from `0.25` to `0.30`, took a
 * typist at the map's advertised speed from a real share of the coins to
 * **zero, on all six maps**, and dropped a typist at 1.7× the advertised speed
 * from taking four fifths of them to taking a quarter.
 *
 * That is not a tuning margin, it is a cliff. Drawn pace decides whether the
 * map's own audience is *in* the race, and it moves both ends of it at once.
 * The chase below is the dial for making a good player work: it does nothing
 * until somebody is genuinely clear, and it only ever applies to an opponent
 * who is **behind** — so it cannot take a coin off a player who is in front.
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
  /**
   * The player's live momentum, 0..1 — including whatever a surge is holding it
   * up to, because that is the speed the player is actually travelling at.
   *
   * Read only by the chase. Omitting it chases at the standing rate.
   */
  readonly playerMomentum?: number | undefined;
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
 * So a racer that is *behind* runs a lot harder, and the further behind, the
 * harder. A racer in front gets nothing: this is a rubber band, not a leash, and
 * a player who has earned a lead should still be able to extend it — they just
 * have to keep typing to hold it.
 *
 * **This is the only dial there is.** Drawn pace is a cliff (see
 * `RACER_MOMENTUM_SHARE`) and the chase is not, precisely because it applies to
 * an opponent who is *behind* — it cannot take a coin off a player who is in
 * front, so it can be made genuinely fierce without touching who wins the road.
 * The rates below are roughly 2.5× what they were, because at the old ones a
 * hundred-metre lead was still worth only a fifth of the map's pace and a good
 * typist never saw the field again. Where they stop is a judgement, not a
 * measurement: the coin assertions still pass at a 4-metre dead band and a cap
 * of a *whole extra map pace*, which is a bot that teleports.
 *
 * The cap is what keeps it honest: it cannot summon an opponent back from any
 * distance at once, which would make the lead meaningless.
 */
const CHASE_PER_METER = 0.12;
const CHASE_CAP_SHARE = 0.55;

/**
 * How far behind an opponent has to be before it starts chasing.
 *
 * Without this the chase fires in a race that is *already* level — the two
 * opponents trade the lead with the player every few seconds, so one of them is
 * always a few metres down and always being handed pace for it. Measured: a
 * typist at the map's advertised speed took **zero** coins on all six maps,
 * because the bot they had just edged out was immediately given the margin back.
 *
 * Inside it the race is a race and nobody is helped; outside it the player has
 * genuinely pulled clear, which is the only case this was ever meant to answer.
 */
const CHASE_DEADBAND_METERS = 10;

/**
 * How far the dead band shrinks, and how much harder the chase pulls, against a
 * player who has stopped typing.
 *
 * ## Why the chase reads the player's momentum
 *
 * The reported bug: *"when I do not type the bots aren't moving faster, as if
 * they do not create advantage while I am not typing."* True as written. Their
 * pace never looked at the player at all, and the player's own speed only sags
 * to `COASTING_FLOOR` — so putting the keyboard down slowed the player by a few
 * percent and did nothing whatever to the field.
 *
 * The obvious fix — pace the field above the coasting floor — is the cliff
 * described above. So the coupling goes here instead, where it is safe: the
 * further the player's momentum sits below what a working typist holds, the
 * smaller the gap an opponent will tolerate and the harder it runs to close it.
 *
 * It **integrates**, which is the point. Momentum bottoms out between words for
 * everybody, including a typist at twice the map's speed, so an instantaneous
 * reading cannot tell idling from an ordinary gap between two words. A dip of
 * half a second is worth a fraction of a metre and vanishes; ten seconds of
 * silence is worth a chunk of the lead. Nothing has to decide what counts as
 * "idle" — the arithmetic does it.
 */
const WORKING_MOMENTUM = 0.55;
const COAST_DEADBAND_SHRINK = 0.75;
const COAST_CHASE_BOOST = 1;

/**
 * How far below a working typist the player currently is, 0..1.
 *
 * `1` is a player coasting on nothing; `0` is anybody holding the momentum the
 * map was tuned around.
 */
function coastingSlack(playerMomentum: number): number {
  return Math.max(
    0,
    Math.min(1, (WORKING_MOMENTUM - playerMomentum) / (WORKING_MOMENTUM - COASTING_FLOOR)),
  );
}

function chaseBonus(reference: number, deficitMeters: number, playerMomentum: number): number {
  const slack = coastingSlack(playerMomentum);

  const chased = deficitMeters - CHASE_DEADBAND_METERS * (1 - COAST_DEADBAND_SHRINK * slack);
  if (chased <= 0) return 0;

  const urgency = 1 + COAST_CHASE_BOOST * slack;

  return Math.min(chased * CHASE_PER_METER * urgency, reference * CHASE_CAP_SHARE * urgency);
}

/** Runs every racer forward one step. */
export function advanceRace(state: RaceState, input: AdvanceRaceInput): RaceState {
  const seconds = input.deltaMs / 1000;
  let rng = state.rng;

  // The scale the chase cap is measured against.
  const reference = referenceSpeed(input.map, input.elapsedMs);
  // A caller with no momentum to report is not a caller reporting a coasting
  // player, so the default is the working level: chase at the standing rate.
  const playerMomentum = input.playerMomentum ?? WORKING_MOMENTUM;

  const racers = state.racers.map((racer) => {
    if (racer.finished) return racer;

    let { targetSpeed, retargetAtMs } = racer;

    if (input.elapsedMs >= retargetAtMs) {
      const drawn = drawTarget(input.map, input.elapsedMs, rng);
      rng = drawn.rng;
      targetSpeed = drawn.value;

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
    const chase = chaseBonus(reference, input.playerMeters - racer.meters, playerMomentum);
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
