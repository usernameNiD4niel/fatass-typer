import type { MapConfig } from '../models/map';
import type { PromptEntry } from '../models/prompt';
import { effectiveCharacterCount } from '../models/prompt';
import { computePromptTiming, type PromptTiming } from '../timing';

/**
 * The surge: a long sentence, typed clean, for speed.
 *
 * ## What it is for
 *
 * The race can run away from a player. Two opponents who are quicker than you
 * this minute are quicker than you the next, and a runner who is forty metres
 * down with a minute to go has nothing to *do* about it — every other mechanic
 * in the game pays out in the same proportion whoever is winning.
 *
 * The surge is the exception. It arrives on a fixed clock, it is the same for
 * everybody, and it is the one thing in the game that can turn a race around in
 * ten seconds. Everyone gets one a minute; what you get out of it is decided
 * entirely by whether you can hold a long sentence together.
 *
 * ## The bargain
 *
 * A long sentence — a dozen words or so, far longer than anything else the game
 * asks for. While it is running the player is already faster; finishing the
 * whole thing clean pays a much larger boost that lasts.
 *
 * **One wrong character ends it.** Not the run, not the combo — the surge. The
 * speed it was giving stops immediately and the sentence goes away. That is the
 * whole tension: the longer you have held it, the more you have to lose, and the
 * temptation is to hurry exactly when hurrying is most expensive.
 *
 * Pure: no clock, no randomness, no DOM.
 */

export type SurgeStatus = 'active' | 'completed' | 'broken';

export interface ActiveSurge {
  readonly instanceId: string;
  readonly prompt: PromptEntry;
  readonly timing: PromptTiming;
  readonly status: SurgeStatus;
  readonly attachedAtMs: number;
  /** When it lapses if the sentence is not finished. Generous — it is long. */
  readonly deadlineAtMs: number;
}

/**
 * Slack over the map's advertised speed.
 *
 * The most generous budget in the game, and it has to be. The sentence is four
 * times the length of anything else on the road and one slip ends it, so a
 * deadline tight enough to hurry the player would make the whole thing a
 * lottery rather than a test of holding a rhythm.
 */
export const SURGE_BUFFER = 1.6;

/** Flat allowance for reading a long sentence before starting it. */
export const SURGE_LEAD_MS = 700;

/**
 * The longest a surge may hold the field, in milliseconds.
 *
 * A hard ceiling on top of the typing budget, and it is load-bearing. The
 * budget alone is proportional to the sentence, so on a 20 WPM map a dozen
 * words worked out at over a minute — and because a surge owns the field, that
 * was a minute with no flow words, which meant a minute in which a player who
 * typed *nothing at all* was never once penalised. An idle run finished the map.
 *
 * Twenty seconds is long enough to be an event and short enough that the rest
 * of the game keeps running.
 */
export const SURGE_MAX_MS = 20_000;

/** How often one arrives, in milliseconds. */
export const SURGE_INTERVAL_MS = 60_000;

/**
 * When the first one arrives.
 *
 * Half an interval, so it interleaves with the powerup crates rather than
 * colliding with them: crate at a minute, surge at ninety seconds, and so on.
 * Two sentences arriving together would mean one of them silently losing the
 * field.
 */
export const FIRST_SURGE_AT_MS = 30_000;

/** Extra speed while a surge is being typed, as momentum. */
export const SURGE_MOMENTUM = 0.75;

/** Momentum granted for finishing the whole sentence. Full pace, held. */
export const SURGE_COMPLETE_MOMENTUM = 1;

/**
 * How long the completion reward lasts, in milliseconds.
 *
 * Long enough to be worth the sentence: at full momentum this is most of a
 * hundred metres, which is the size of gap a race actually turns on.
 */
export const SURGE_REWARD_MS = 12_000;

export interface PlaceSurgeInput {
  readonly instanceId: string;
  readonly prompt: PromptEntry;
  readonly map: MapConfig;
  readonly elapsedMs: number;
}

/**
 * Puts a surge on screen, now.
 *
 * No approach and no world position: like a flow word, it is not a thing on the
 * road. Unlike a flow word, it is the most valuable thing on screen while it
 * lasts.
 */
export function placeSurge(input: PlaceSurgeInput): ActiveSurge {
  const timing = computePromptTiming({
    characterCount: effectiveCharacterCount(input.prompt),
    targetWpm: input.map.targetWpm,
    timing: { reactionBuffer: SURGE_BUFFER, fixedVisualLeadTimeMs: SURGE_LEAD_MS },
  });

  return {
    instanceId: input.instanceId,
    prompt: input.prompt,
    timing,
    status: 'active',
    attachedAtMs: input.elapsedMs,
    deadlineAtMs: input.elapsedMs + Math.min(timing.availableMs, SURGE_MAX_MS),
  };
}

/**
 * The longest sentence the map can actually ask for.
 *
 * A surge is capped at `SURGE_MAX_MS`, so on a slow map a twelve-word sentence
 * would be unfinishable by the very player the map was written for — and an
 * unfinishable reward is a punishment. This picks the longest sentence a typist
 * at the map's own speed could hold together inside the cap, so "long" means
 * long *for this map* rather than long in characters.
 *
 * Falls back to the shortest sentence in the pool when nothing fits, which is
 * the honest failure: still a stretch, still winnable.
 */
export function pickSurge(
  pool: readonly PromptEntry[],
  map: MapConfig,
  index: number,
): PromptEntry | undefined {
  if (pool.length === 0) return undefined;

  const fits = pool.filter((prompt) => {
    const timing = computePromptTiming({
      characterCount: effectiveCharacterCount(prompt),
      targetWpm: map.targetWpm,
      timing: { reactionBuffer: 1, fixedVisualLeadTimeMs: 0 },
    });

    return timing.availableMs <= SURGE_MAX_MS;
  });

  // Longest first, so a map is asked for the most it can actually hold rather
  // than whatever happened to be first in the file.
  const usable =
    fits.length > 0
      ? [...fits].sort(
          (left, right) => effectiveCharacterCount(right) - effectiveCharacterCount(left),
        )
      : shortest(pool);

  return usable[index % usable.length];
}

function shortest(pool: readonly PromptEntry[]): readonly PromptEntry[] {
  const sorted = [...pool].sort(
    (left, right) => effectiveCharacterCount(left) - effectiveCharacterCount(right),
  );

  return sorted.slice(0, 1);
}

export function isSurgeLive(surge: ActiveSurge): boolean {
  return surge.status === 'active';
}

export function surgeExpired(surge: ActiveSurge, elapsedMs: number): boolean {
  return surge.status === 'active' && elapsedMs >= surge.deadlineAtMs;
}

/** One wrong character. The sentence goes, and so does the speed it was giving. */
export function breakSurge(surge: ActiveSurge): ActiveSurge {
  return surge.status === 'active' ? { ...surge, status: 'broken' } : surge;
}

export function completeSurge(surge: ActiveSurge): ActiveSurge {
  return surge.status === 'active' ? { ...surge, status: 'completed' } : surge;
}

/** How far through the sentence, 0..1. Drives the prompt's own styling. */
export function surgeProgress(surge: ActiveSurge, elapsedMs: number): number {
  const span = surge.deadlineAtMs - surge.attachedAtMs;
  if (span <= 0) return 1;

  return Math.min(1, Math.max(0, (elapsedMs - surge.attachedAtMs) / span));
}

/**
 * What a racer's surge is worth, as a share of a full one.
 *
 * **Weighted to whoever is behind**, which is the entire point: a surge that
 * paid the leader as much as the tail would widen the race rather than tighten
 * it, and the mechanic exists to give somebody forty metres down a way back.
 *
 * The leader still gets something. A minute where the player in front simply
 * stops gaining would read as the game taking their lead away rather than as
 * somebody else earning it back.
 */
export function racerSurgeShare(behindMeters: number): number {
  if (behindMeters <= 0) return LEADER_SHARE;

  const share = LEADER_SHARE + (behindMeters / FULL_CATCHUP_METERS) * (1 - LEADER_SHARE);

  return Math.min(1, share);
}

/** What the runner in front gets. Not nothing, and not much. */
const LEADER_SHARE = 0.35;

/** How far behind a racer must be to surge at full strength. */
const FULL_CATCHUP_METERS = 40;
