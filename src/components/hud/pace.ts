/**
 * Pace: how fast the player is typing, against what the map is asking for.
 *
 * Pure, and in its own file rather than in `Hud.tsx`, because the dead band
 * below is the whole reason the meter is readable and it deserves to be
 * testable without rendering anything.
 */

/** Where a pace sits relative to what the map asks for. */
export type PaceBand = 'idle' | 'behind' | 'onPace' | 'ahead';

/** Below this share of the map's target, the map will not be finished. */
const PACE_BEHIND = 0.75;

/**
 * How far past a boundary the ratio must travel before the band flips back.
 *
 * `currentWpm` is a three-second rolling window arriving ten times a second, so
 * a player sitting exactly on a boundary would strobe the bar between two
 * colours — which spec §12 forbids outright, and which is unreadable besides.
 */
const PACE_HYSTERESIS = 0.03;

/** Headroom above the target, so a fast typist can see that they are fast. */
export const PACE_HEADROOM = 1.25;

/**
 * The band for a pace ratio, given the band it is already in.
 *
 * The previous band is an argument rather than module state so the function
 * stays pure — the caller holds it in a ref.
 */
export function paceBand(ratio: number, previous: PaceBand): PaceBand {
  if (!Number.isFinite(ratio) || ratio <= 0) return 'idle';

  // Leaving a band costs more than entering it did.
  const behind = previous === 'behind' ? PACE_BEHIND + PACE_HYSTERESIS : PACE_BEHIND;
  const ahead = previous === 'ahead' ? 1 - PACE_HYSTERESIS : 1;

  if (ratio >= ahead) return 'ahead';
  if (ratio >= behind) return 'onPace';

  return 'behind';
}

/*
  Four channels carry the band, and only one of them is hue (spec §12): the
  word, the glyph in front of it, the numbers beside it, and where the fill
  edge sits against the target tick.
*/
export const PACE_WORD: Record<PaceBand, string> = {
  idle: '— Ready',
  behind: '▼ Behind',
  onPace: '● On pace',
  ahead: '▲ Ahead',
};
