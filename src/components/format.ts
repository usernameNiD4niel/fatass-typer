/**
 * Numbers as the player reads them.
 *
 * Shared because the same quantity shown two ways in two places reads as two
 * different quantities — the map card, the HUD and the results screen all state
 * distance, and they have to agree.
 */

/** Metres in a kilometre. Named so the switch below is not a bare 1000. */
const METERS_PER_KILOMETER = 1_000;

/**
 * A distance, in the largest unit that still says something.
 *
 * Under a kilometre it is whole metres: the difference between 380m and 390m is
 * a real difference to somebody chasing their own best, and "0.4 km" throws it
 * away. Past that the metres stop mattering and the leading digits start to.
 */
export function formatDistance(meters: number): string {
  const safe = Number.isFinite(meters) ? Math.max(0, meters) : 0;

  if (safe < METERS_PER_KILOMETER) return `${String(Math.round(safe))} m`;

  return `${(safe / METERS_PER_KILOMETER).toFixed(2)} km`;
}
