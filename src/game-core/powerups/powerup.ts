import type { LaneIndex, LaneSide } from '../models/lane';
import { adjacentLanes, sideBetween } from '../models/lane';
import type { MapConfig } from '../models/map';
import type { PromptEntry } from '../models/prompt';
import { effectiveCharacterCount } from '../models/prompt';
import { pick, type Rng } from '../random';
import {
  computePromptTiming,
  laneChangeReserveMs,
  type PromptTiming,
  spawnDistanceMeters,
  timeToImpactMs,
} from '../timing';

/**
 * Powerups — the one thing in the game you have to be *perfect* to get.
 *
 * Roughly once a minute a crate appears in a lane with a whole sentence over it.
 * Type the sentence and the powerup is yours. Make a single mistake and it is
 * gone — not a slower deadline, not a partial reward, gone.
 *
 * ## Why perfect, and only here
 *
 * Everywhere else the game is deliberately forgiving: a wrong character costs
 * your combo, never your run, because accuracy is a statistic the progression
 * gates on and a game that ends on one slip cannot measure it.
 *
 * A powerup is the exception that makes the rule interesting. It is optional, it
 * is rare, and it is the one moment where the game asks *can you do this
 * cleanly?* — which is a different question from "can you do this fast", and it
 * is worth asking once a minute.
 *
 * Pure: no clock, no randomness beyond the seeded RNG, no DOM.
 */

export const POWERUP_KINDS = ['flight', 'shield', 'magnet'] as const;
export type PowerupKind = (typeof POWERUP_KINDS)[number];

export interface PowerupDefinition {
  readonly kind: PowerupKind;
  readonly label: string;
  /** One line, shown when it is granted. */
  readonly blurb: string;
}

export const POWERUPS: Readonly<Record<PowerupKind, PowerupDefinition>> = {
  flight: {
    kind: 'flight',
    label: 'Flight',
    blurb: 'Over everything for half a minute.',
  },
  shield: {
    kind: 'shield',
    label: 'Extra lives',
    blurb: 'Two crashes you get to walk away from.',
  },
  magnet: {
    kind: 'magnet',
    label: 'Magnet',
    blurb: 'Coins come to you, wherever you are.',
  },
};

/**
 * How long flight lasts.
 *
 * It used to be thirty seconds, on the theory that a holiday from the rules is a
 * reward. Measured, it is the opposite: hazards are suspended and any whose
 * window passes is waived, so flight hands the player a fifth of a Map 1 run
 * with nothing on screen to type. In one measured run it deleted two of the
 * seven hazards outright.
 *
 * A reward in a typing game cannot be an absence of typing. Six seconds is long
 * enough to read as a let-off and short enough that the road never goes quiet.
 */
export const FLIGHT_MS = 6_000;

/** How long the magnet pulls for. */
export const MAGNET_MS = 20_000;

/** Crashes a shield absorbs. */
export const SHIELD_CHARGES = 2;

export type PowerupStatus =
  | 'approaching'
  | 'active'
  /** Taken. */
  | 'claimed'
  /** Mistyped, or the deadline passed. Gone either way. */
  | 'lost';

export interface ActivePowerup {
  readonly instanceId: string;
  readonly kind: PowerupKind;
  readonly prompt: PromptEntry;
  readonly lane: LaneIndex;
  readonly side: LaneSide;
  readonly reachMeters: number;
  readonly timing: PromptTiming;
  readonly status: PowerupStatus;
  readonly spawnedAtMs: number;
  readonly attachedAtMs: number | null;
  readonly deadlineAtMs: number | null;
  readonly passed: boolean;
}

/**
 * Slack on the sentence, over the map's advertised speed.
 *
 * More generous than a coin and more generous than a hazard, because a sentence
 * is long and the no-mistake rule is already the hard part. Asking for speed
 * *and* perfection at once would make powerups something only the top of the
 * ladder ever sees.
 */
const POWERUP_BUFFER = 1.45;

const POWERUP_LEAD_MS = 400;

/** How much earlier than the sentence the crate becomes visible. */
export const POWERUP_LEAD_FACTOR = 1.15;

export interface PlacePowerupInput {
  readonly instanceId: string;
  readonly prompt: PromptEntry;
  readonly map: MapConfig;
  readonly playerLane: LaneIndex;
  readonly playerMeters: number;
  readonly elapsedMs: number;
  readonly speedMetersPerSecond: number;
  readonly rng: Rng;
}

export interface PlacePowerupResult {
  readonly powerup: ActivePowerup;
  readonly rng: Rng;
}

export function placePowerup(input: PlacePowerupInput): PlacePowerupResult {
  const laneDraw = pick(input.rng, adjacentLanes(input.playerLane));
  const lane = laneDraw.value ?? input.playerLane;

  const kindDraw = pick(laneDraw.rng, POWERUP_KINDS);
  const kind = kindDraw.value ?? 'shield';

  const timing = computePromptTiming({
    characterCount: effectiveCharacterCount(input.prompt),
    targetWpm: input.map.targetWpm,
    timing: { reactionBuffer: POWERUP_BUFFER, fixedVisualLeadTimeMs: POWERUP_LEAD_MS },
  });

  const reserveMs = laneChangeReserveMs(input.map.motion);
  const leadMeters = spawnDistanceMeters(
    (timing.availableMs + reserveMs) * POWERUP_LEAD_FACTOR,
    input.speedMetersPerSecond,
  );

  return {
    rng: kindDraw.rng,
    powerup: {
      instanceId: input.instanceId,
      kind,
      prompt: input.prompt,
      lane,
      side: sideBetween(input.playerLane, lane) ?? 'right',
      reachMeters: input.playerMeters + leadMeters,
      timing,
      status: 'approaching',
      spawnedAtMs: input.elapsedMs,
      attachedAtMs: null,
      deadlineAtMs: null,
      passed: false,
    },
  };
}

export type PowerupEvent =
  | { readonly type: 'powerupSentenceAttached'; readonly powerup: ActivePowerup }
  | { readonly type: 'powerupExpired'; readonly powerup: ActivePowerup }
  | { readonly type: 'powerupReached'; readonly powerup: ActivePowerup };

export interface PowerupAdvanceInput {
  readonly playerMeters: number;
  readonly speedMetersPerSecond: number;
  readonly elapsedMs: number;
}

export function distanceToPowerup(powerup: ActivePowerup, playerMeters: number): number {
  return powerup.reachMeters - playerMeters;
}

export function isPowerupLive(powerup: ActivePowerup): boolean {
  return powerup.status === 'approaching' || powerup.status === 'active';
}

export function advancePowerup(
  powerup: ActivePowerup,
  input: PowerupAdvanceInput,
): { powerup: ActivePowerup; events: readonly PowerupEvent[] } {
  if (!isPowerupLive(powerup)) return { powerup, events: [] };

  const events: PowerupEvent[] = [];
  let current = powerup;

  const untilMs = timeToImpactMs(
    distanceToPowerup(current, input.playerMeters),
    input.speedMetersPerSecond,
  );

  if (current.status === 'approaching' && untilMs <= current.timing.availableMs) {
    current = {
      ...current,
      status: 'active',
      attachedAtMs: input.elapsedMs,
      deadlineAtMs: input.elapsedMs + current.timing.availableMs,
    };
    events.push({ type: 'powerupSentenceAttached', powerup: current });
  }

  if (
    current.status === 'active' &&
    current.deadlineAtMs !== null &&
    input.elapsedMs >= current.deadlineAtMs
  ) {
    current = { ...current, status: 'lost' };
    events.push({ type: 'powerupExpired', powerup: current });

    return { powerup: current, events };
  }

  if (!current.passed && input.playerMeters >= current.reachMeters) {
    current = { ...current, passed: true };
    events.push({ type: 'powerupReached', powerup: current });
  }

  return { powerup: current, events };
}

/** A single mistake forfeits it. This is the whole point of a powerup. */
export function forfeitPowerup(powerup: ActivePowerup): ActivePowerup {
  return powerup.status === 'active' ? { ...powerup, status: 'lost' } : powerup;
}

export function claimPowerup(powerup: ActivePowerup): ActivePowerup {
  return powerup.status === 'active' ? { ...powerup, status: 'claimed' } : powerup;
}

/* -------------------------------------------------------------------------- */
/* What a claimed powerup actually does                                       */
/* -------------------------------------------------------------------------- */

export interface PowerupEffects {
  /** Milliseconds of flight left. Above zero, nothing on the road can touch you. */
  readonly flightRemainingMs: number;
  /** Milliseconds of magnet left. Coins collect without going to them. */
  readonly magnetRemainingMs: number;
  /** Crashes that will be absorbed instead of ending the run. */
  readonly shields: number;
}

export const NO_EFFECTS: PowerupEffects = {
  flightRemainingMs: 0,
  magnetRemainingMs: 0,
  shields: 0,
};

export function grantPowerup(effects: PowerupEffects, kind: PowerupKind): PowerupEffects {
  switch (kind) {
    case 'flight':
      // Refreshed, not stacked. Two flights in a row is thirty seconds from the
      // second one, which is what a player expects and is easier to read.
      return { ...effects, flightRemainingMs: FLIGHT_MS };
    case 'magnet':
      return { ...effects, magnetRemainingMs: MAGNET_MS };
    case 'shield':
      return { ...effects, shields: effects.shields + SHIELD_CHARGES };
  }
}

/** Runs the effect timers down. Shields have no clock — they are spent, not timed. */
export function advanceEffects(effects: PowerupEffects, deltaMs: number): PowerupEffects {
  if (effects.flightRemainingMs === 0 && effects.magnetRemainingMs === 0) return effects;

  return {
    ...effects,
    flightRemainingMs: Math.max(0, effects.flightRemainingMs - deltaMs),
    magnetRemainingMs: Math.max(0, effects.magnetRemainingMs - deltaMs),
  };
}

export function isFlying(effects: PowerupEffects): boolean {
  return effects.flightRemainingMs > 0;
}

export function hasMagnet(effects: PowerupEffects): boolean {
  return effects.magnetRemainingMs > 0;
}

/** Spends a shield. Returns `null` when there was none to spend. */
export function spendShield(effects: PowerupEffects): PowerupEffects | null {
  return effects.shields > 0 ? { ...effects, shields: effects.shields - 1 } : null;
}
