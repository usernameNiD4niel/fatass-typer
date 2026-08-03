/**
 * Dog threat, as the HUD reports it.
 *
 * Kept out of the component file so the screen exports only components (fast
 * refresh gives up on a module that mixes the two), and so the thresholds are
 * testable on their own.
 */

export type ThreatLevel = 'safe' | 'closing' | 'critical' | 'caught';

/**
 * Bands for the meter.
 *
 * These describe how the *gap* reads to a player, which is why they are
 * fractions of the map's starting distance rather than meters: a 12m gap is
 * comfortable on one map and desperate on another.
 */
export function threatLevel(normalizedDistance: number): ThreatLevel {
  if (normalizedDistance <= 0) return 'caught';
  if (normalizedDistance <= 0.2) return 'critical';
  if (normalizedDistance <= 0.4) return 'closing';

  return 'safe';
}

export const THREAT_WORD: Readonly<Record<ThreatLevel, string>> = {
  safe: 'Safe',
  closing: 'Closing',
  critical: 'Right behind you',
  caught: 'Caught',
};
