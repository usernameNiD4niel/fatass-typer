import type { MapConfig } from '../models/map';
import type { PromptEntry } from '../models/prompt';
import { effectiveCharacterCount } from '../models/prompt';
import { computePromptTiming, type PromptTiming } from '../timing';

/**
 * Flow words — the thing that keeps the keyboard busy.
 *
 * ## Why they exist
 *
 * A run used to ask for about sixty characters of typing in eighty seconds.
 * Every individual word was tight, and the map's advertised speed was honestly
 * enforced, but the *volume* was tiny: seven hazard words and six coin words,
 * with the rest of the run spent watching a car approach. A typing game that
 * asks for thirteen words a minute is not practice, whatever its label says.
 *
 * The gaps were not fixable by packing hazards closer together. Two attempts at
 * that are recorded in `obstacles/README.md` and both were reverted, for the
 * same underlying reason: an encounter that ends the run needs road, and road
 * takes time. The tail after committing — where the word is answered and the
 * body is still travelling to the collision plane — is dead by construction.
 *
 * A flow word fills that time and asks for **nothing but typing**. No lane
 * change, no jump, no swerve, no world position. That is the whole design: the
 * reverted coin-in-the-tail experiment failed because coins need a swerve and
 * the swerve cannot start until the hazard's plane is behind the player. A word
 * that moves nobody has no such constraint, so it can run in any moment the
 * player is not already reading something that matters more.
 *
 * ## What it costs to miss one
 *
 * Points and the combo. Never the run. Only hazards end runs, and that rule is
 * worth more than any pressure a fatal filler word could add — with one word on
 * screen at essentially all times, making every word fatal would turn the game
 * into a coin flip.
 *
 * Pure: no clock, no randomness, no DOM.
 */

export type FlowStatus = 'active' | 'completed' | 'missed';

export interface ActiveFlowWord {
  readonly instanceId: string;
  readonly prompt: PromptEntry;
  readonly timing: PromptTiming;
  readonly status: FlowStatus;
  readonly attachedAtMs: number;
  readonly deadlineAtMs: number;
}

/**
 * Slack over the map's advertised speed.
 *
 * Tighter than a hazard's buffer and about the same as a coin's. A flow word
 * carries no reaction cost — it is already on screen, in the same place the last
 * one was, and the player is mid-rhythm rather than reacting to something new.
 * The buffer that a hazard spends on *noticing* is the buffer a flow word does
 * not need.
 */
export const FLOW_BUFFER = 1.1;

/** Flat allowance for the eye to land on a word that just replaced another. */
export const FLOW_LEAD_MS = 160;

export interface PlaceFlowWordInput {
  readonly instanceId: string;
  readonly prompt: PromptEntry;
  readonly map: MapConfig;
  readonly elapsedMs: number;
}

/**
 * Puts a word on screen, now.
 *
 * No approach, no lead, no world position — a flow word is not a thing on the
 * road, it is the road being quiet. It exists from the moment it is created and
 * its deadline starts immediately.
 */
export function placeFlowWord(input: PlaceFlowWordInput): ActiveFlowWord {
  const timing = computePromptTiming({
    characterCount: effectiveCharacterCount(input.prompt),
    targetWpm: input.map.targetWpm,
    timing: { reactionBuffer: FLOW_BUFFER, fixedVisualLeadTimeMs: FLOW_LEAD_MS },
  });

  return {
    instanceId: input.instanceId,
    prompt: input.prompt,
    timing,
    status: 'active',
    attachedAtMs: input.elapsedMs,
    deadlineAtMs: input.elapsedMs + timing.availableMs,
  };
}

/** True while the word is still worth typing. */
export function isFlowLive(word: ActiveFlowWord): boolean {
  return word.status === 'active';
}

/** Has the budget run out? Costs the combo, never the run. */
export function flowExpired(word: ActiveFlowWord, elapsedMs: number): boolean {
  return word.status === 'active' && elapsedMs >= word.deadlineAtMs;
}

export function expireFlowWord(word: ActiveFlowWord): ActiveFlowWord {
  return word.status === 'active' ? { ...word, status: 'missed' } : word;
}

export function completeFlowWord(word: ActiveFlowWord): ActiveFlowWord {
  return word.status === 'active' ? { ...word, status: 'completed' } : word;
}

/** Milliseconds left on the word. Zero once the budget is spent. */
export function flowRemainingMs(word: ActiveFlowWord, elapsedMs: number): number {
  return Math.max(0, word.deadlineAtMs - elapsedMs);
}

/** How far through the budget, 0..1, for the prompt's urgency pulse. */
export function flowUrgency(word: ActiveFlowWord, elapsedMs: number): number {
  const span = word.deadlineAtMs - word.attachedAtMs;
  if (span <= 0) return 1;

  return Math.min(1, Math.max(0, (elapsedMs - word.attachedAtMs) / span));
}
