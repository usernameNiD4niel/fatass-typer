import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef, type JSX } from 'react';
import type { Group } from 'three';

import type { WorldSnapshot } from '../game-bridge';
import { bestLineState } from './best-line-state';
import { ROAD_HALF_WIDTH } from './scene-config';
import styles from './BestLine.module.css';

/**
 * A line across the road where the last run ended (plan 2.2).
 *
 * The endless mode's entire content. There is no finish line to reach, so the
 * only thing to beat is yourself, and a number in the HUD is not something you
 * race — a gate on the road ahead is. Crossing it is the moment the mode exists
 * for, and it has to happen *in the world*, at the place it actually happened.
 *
 * ## Why it stays behind you afterwards
 *
 * It is not removed once passed. The band recedes down the road like anything
 * else, which is the reward: the further it is behind you, the better this run
 * is going. Deleting it at the moment of crossing would throw away the only
 * evidence.
 */

export interface BestLineProps {
  readonly snapshot: WorldSnapshot;
  /** Metres from the start. Zero means there is no best yet — nothing is drawn. */
  readonly bestDistanceMeters: number;
}

export function BestLine({ snapshot, bestDistanceMeters }: BestLineProps): JSX.Element | null {
  const rootRef = useRef<Group>(null);
  const labelRef = useRef<HTMLParagraphElement>(null);

  useFrame(() => {
    const root = rootRef.current;
    if (!root) return;

    const state = bestLineState(bestDistanceMeters, snapshot.playerMeters);

    root.visible = state.visible;
    if (!state.visible) return;

    root.position.set(0, 0.02, -state.aheadMeters);

    const label = labelRef.current;
    if (label) {
      label.dataset['beaten'] = state.beaten ? 'true' : 'false';
      label.textContent = state.beaten ? 'Best beaten' : 'Your best';
    }
  });

  // No best yet: a first run has nothing to chase, and a line at zero metres
  // would sit under the player's feet on the start line.
  if (bestDistanceMeters <= 0) return null;

  return (
    <group ref={rootRef} visible={false}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[ROAD_HALF_WIDTH * 2, 1.1]} />
        <meshBasicMaterial color="#ffd166" transparent opacity={0.75} />
      </mesh>

      {/* Posts, so the mark reads as a gate from a distance rather than paint. */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (ROAD_HALF_WIDTH + 0.35), 1.3, 0]}>
          <boxGeometry args={[0.28, 2.6, 0.28]} />
          <meshStandardMaterial color="#ffd166" emissive="#ffd166" emissiveIntensity={0.5} />
        </mesh>
      ))}

      <Html center position={[0, 2.9, 0]} zIndexRange={[14, 0]} pointerEvents="none">
        <p ref={labelRef} className={styles.label} data-beaten="false" aria-hidden="true">
          Your best
        </p>
      </Html>
    </group>
  );
}
