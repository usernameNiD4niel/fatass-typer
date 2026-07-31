import type { MapConfig, TimingProfile } from '../models/map';
import type { ObstacleDefinition } from '../models/obstacle';
import { effectiveCharacterCount } from '../models/prompt';
import type { PromptEntry } from '../models/prompt';
import { millisecondsToType } from '../stats/wpm';

/**
 * Prompt timing (spec §6).
 *
 * The transparent formula, kept literal so the numbers can be reasoned about
 * during playtesting:
 *
 *     expected_typing_seconds = effective_character_count / 5 / target_wpm * 60
 *     available_seconds       = expected_typing_seconds * reaction_buffer
 *                               + fixed_visual_lead_time
 *
 * Effective character count includes spaces and punctuation — the player has to
 * type them, so they cost time.
 *
 * Everything here is milliseconds. Seconds appear only in the spec text.
 */

export interface PromptTimingInput {
  readonly characterCount: number;
  /** The map's honest target speed. */
  readonly targetWpm: number;
  readonly timing: TimingProfile;
  /**
   * Extra allowance for noticing this particular obstacle, from
   * `ObstacleDefinition.baseReactionTimeMs`. Zero for boost prompts, which have
   * no impact deadline.
   */
  readonly extraReactionMs?: number;
}

export interface PromptTiming {
  /** How long the prompt takes to type at the map's target speed. */
  readonly expectedTypingMs: number;
  /** How long the player actually gets before impact. */
  readonly availableMs: number;
  /** Slack above the expected typing time. Negative would be unwinnable. */
  readonly spareMs: number;
}

/**
 * Time to type `characterCount` characters at `targetWpm`.
 *
 * This is the spec's `expected_typing_seconds`, in milliseconds.
 */
export function expectedTypingMs(characterCount: number, targetWpm: number): number {
  return millisecondsToType(characterCount, targetWpm);
}

/**
 * Full timing budget for a prompt.
 *
 * The reaction buffer multiplies the *typing* time, so longer prompts get
 * proportionally more slack. The visual lead is flat: noticing a prompt takes
 * the same moment whether it is one word or six.
 */
export function computePromptTiming(input: PromptTimingInput): PromptTiming {
  const typingMs = expectedTypingMs(input.characterCount, input.targetWpm);
  const availableMs =
    typingMs * input.timing.reactionBuffer +
    input.timing.fixedVisualLeadTimeMs +
    (input.extraReactionMs ?? 0);

  return {
    expectedTypingMs: typingMs,
    availableMs,
    spareMs: availableMs - typingMs,
  };
}

/** Timing for a prompt attached to an obstacle on a given map. */
export function obstaclePromptTiming(
  map: MapConfig,
  obstacle: ObstacleDefinition,
  prompt: PromptEntry,
): PromptTiming {
  return computePromptTiming({
    characterCount: effectiveCharacterCount(prompt),
    targetWpm: map.targetWpm,
    timing: map.timing,
    extraReactionMs: obstacle.baseReactionTimeMs,
  });
}

/**
 * A prompt is only fair if a player typing at the map's stated target speed can
 * finish it in time. A map whose prompts fail this is lying about its difficulty.
 */
export function isPromptFeasible(timing: PromptTiming): boolean {
  return timing.spareMs >= 0;
}

/**
 * Speed in WPM a player must actually hold to finish inside the deadline.
 *
 * Always at or below the map's target speed when the timing is feasible. This is
 * the number to check during playtesting: if Map 1 demands 26 WPM for a prompt,
 * its 20 WPM label is dishonest.
 */
export function requiredWpm(characterCount: number, availableMs: number): number {
  if (availableMs <= 0 || characterCount <= 0) return 0;

  return characterCount / 5 / (availableMs / 60_000);
}

/* -------------------------------------------------------------------------- */
/* Placing the obstacle in the world                                          */
/* -------------------------------------------------------------------------- */

/**
 * How far ahead of the MC an obstacle must spawn so that the player gets exactly
 * the available time before impact.
 *
 * Uses the map's base speed rather than current speed: an obstacle placed while
 * boosting would otherwise arrive early once the boost expires.
 */
export function spawnDistanceMeters(availableMs: number, speedMetersPerSecond: number): number {
  if (availableMs <= 0 || speedMetersPerSecond <= 0) return 0;

  return (availableMs / 1_000) * speedMetersPerSecond;
}

/** Milliseconds until the MC reaches something `distanceMeters` ahead. */
export function timeToImpactMs(distanceMeters: number, speedMetersPerSecond: number): number {
  if (distanceMeters <= 0) return 0;
  if (speedMetersPerSecond <= 0) return Number.POSITIVE_INFINITY;

  return (distanceMeters / speedMetersPerSecond) * 1_000;
}

/* -------------------------------------------------------------------------- */
/* Deadline pressure for the HUD                                              */
/* -------------------------------------------------------------------------- */

/** How close the deadline is, for HUD colour and audio escalation (spec §9). */
export type DeadlinePressure = 'safe' | 'warning' | 'critical' | 'expired';

/** Fraction of the budget remaining below which the HUD warns. */
export const WARNING_THRESHOLD = 0.5;
export const CRITICAL_THRESHOLD = 0.25;

export function deadlinePressure(remainingMs: number, availableMs: number): DeadlinePressure {
  if (remainingMs <= 0) return 'expired';
  if (availableMs <= 0) return 'expired';

  const fraction = remainingMs / availableMs;

  if (fraction <= CRITICAL_THRESHOLD) return 'critical';
  if (fraction <= WARNING_THRESHOLD) return 'warning';

  return 'safe';
}

/**
 * Fraction of the deadline consumed, 0..1, for the HUD pressure meter.
 * Clamped so a late frame cannot push the meter past full.
 */
export function deadlineProgress(elapsedMs: number, availableMs: number): number {
  if (availableMs <= 0) return 1;

  return Math.min(1, Math.max(0, elapsedMs / availableMs));
}
