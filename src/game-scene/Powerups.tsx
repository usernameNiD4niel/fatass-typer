import { useFrame } from '@react-three/fiber';
import { useRef, type JSX } from 'react';
import type { Group } from 'three';

import type { WorldSnapshot } from '../game-bridge';
import { MAX_SNAPSHOT_POWERUPS } from '../game-bridge';
import { laneCenterX } from './scene-config';

/**
 * Powerup crates.
 *
 * A floating, turning crate in a lane, coloured by what is inside it. Rare —
 * about one a minute — so unlike coins and hazards it is allowed to look like an
 * event: it hovers, it spins, and it is the brightest thing on the road.
 *
 * The kind is legible before the sentence is read. A player who has seen a gold
 * shield once should recognise the next one at distance and decide whether this
 * is a run worth spending a clean sentence on.
 */

export interface PowerupsProps {
  readonly snapshot: WorldSnapshot;
  readonly reducedMotion: boolean;
}

const CRATE_HEIGHT = 1.5;

/** Colour per kind. Distinct at distance, which is the only requirement. */
const KIND_COLORS = {
  flight: '#6ad4ff',
  shield: '#ffd24a',
  magnet: '#ff5f9e',
} as const;

export function Powerups({ snapshot, reducedMotion }: PowerupsProps): JSX.Element {
  const slots = useRef<(Group | null)[]>([]);
  const spin = useRef(0);

  useFrame((_, delta) => {
    if (!reducedMotion) spin.current += delta;

    for (let index = 0; index < MAX_SNAPSHOT_POWERUPS; index += 1) {
      const group = slots.current[index];
      if (!group) continue;

      const powerup = index < snapshot.powerupCount ? snapshot.powerups[index] : undefined;

      if (powerup === undefined || powerup.claimed) {
        group.visible = false;
        continue;
      }

      group.visible = true;
      group.position.x = laneCenterX(powerup.lane);
      group.position.z = -powerup.distanceMeters;
      group.position.y = CRATE_HEIGHT + (reducedMotion ? 0 : Math.sin(spin.current * 2) * 0.22);
      group.rotation.y = reducedMotion ? 0.6 : spin.current * 1.4;

      for (let child = 0; child < group.children.length; child += 1) {
        const mesh = group.children[child];
        if (mesh) mesh.visible = child === kindIndex(powerup.kind);
      }
    }
  });

  return (
    <group>
      {Array.from({ length: MAX_SNAPSHOT_POWERUPS }, (_, index) => (
        <group
          key={index}
          visible={false}
          ref={(group) => {
            slots.current[index] = group;
          }}
        >
          <Crate color={KIND_COLORS.flight} />
          <Crate color={KIND_COLORS.shield} />
          <Crate color={KIND_COLORS.magnet} />
        </group>
      ))}
    </group>
  );
}

function kindIndex(kind: WorldSnapshot['powerups'][number]['kind']): number {
  if (kind === 'flight') return 0;
  if (kind === 'shield') return 1;

  return 2;
}

function Crate({ color }: { color: string }): JSX.Element {
  return (
    <group>
      <mesh>
        <boxGeometry args={[1.3, 1.3, 1.3]} />
        <meshLambertMaterial color={color} emissive={color} emissiveIntensity={0.4} />
      </mesh>
      {/* A band, so the crate reads as a container rather than a coloured cube. */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[1.42, 0.26, 1.42]} />
        <meshLambertMaterial color="#1c1f24" />
      </mesh>
    </group>
  );
}
