import type { JSX } from 'react';

import type { WorldSnapshot } from '../game-bridge';
import { Runner } from './runner/Runner';

/**
 * The runner.
 *
 * A thin wrapper, kept because the rest of the scene refers to "the player" and
 * because the figure itself is now three files — the rig, the gait, and the
 * assembly. See `runner/`.
 */

export interface PlayerProps {
  readonly snapshot: WorldSnapshot;
  readonly reducedMotion: boolean;
}

export function Player({ snapshot, reducedMotion }: PlayerProps): JSX.Element {
  return <Runner snapshot={snapshot} reducedMotion={reducedMotion} />;
}
