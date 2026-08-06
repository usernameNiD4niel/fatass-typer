/**
 * What each opponent wears.
 *
 * Shared, because two things have to agree on it: the figure on the road and
 * the badge beside the player that says how far away that figure is. A badge
 * whose colour did not match the runner it referred to would be worse than no
 * badge — the player would have to work out which is which every time they
 * glanced at it, which is exactly the glance the badge exists to save.
 */

export interface RacerKit {
  readonly shirt: string;
  readonly shorts: string;
  readonly skin: string;
}

/** Deliberately not the player's blue. Telling the three apart matters. */
export const RACER_KITS: readonly RacerKit[] = [
  { shirt: '#d1503f', shorts: '#3a2b2b', skin: '#c98f6b' },
  { shirt: '#2fa36b', shorts: '#26332c', skin: '#e3c39a' },
];

export function racerKit(index: number): RacerKit {
  return (
    RACER_KITS[index] ?? RACER_KITS[0] ?? { shirt: '#d1503f', shorts: '#3a2b2b', skin: '#c98f6b' }
  );
}
