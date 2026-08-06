import { useFrame } from '@react-three/fiber';
import { useRef, type JSX } from 'react';
import type { Group } from 'three';

import type { WorldSnapshot } from '../game-bridge';
import { CARRIAGEWAY_CENTRE, noise, type ScenePalette } from './scene-config';

/**
 * Traffic on the other carriageways.
 *
 * ## Why this exists
 *
 * Removing hazards removed the only things that came at the player, and with
 * them most of the sense of speed. Speed on an empty road is close to
 * invisible: lane dashes read the same at seven metres a second as at fifteen,
 * because there is nothing near the camera to compare them against. What was
 * lost was not the danger — the chaser carries that — it was the *motion*.
 *
 * So the vehicles come back, with the one change that matters: they are never
 * in a lane the player can be in. They sit outside `ROAD_HALF_WIDTH`, on
 * flanking carriageways, and the oncoming side moves *toward* the camera, which
 * is what makes closing speed legible at all.
 *
 * They cannot be collided with, cannot be typed at, and are not in the
 * snapshot. If one ever needs to be, it stops being scenery and belongs in
 * `game-core`.
 */

export interface AmbientTrafficProps {
  readonly snapshot: WorldSnapshot;
  readonly palette: ScenePalette;
  readonly reducedMotion: boolean;
}

/** Vehicles per flanking carriageway. */
const PER_SIDE = 5;
const SPACING_METERS = 46;

/** Oncoming closing speed, in metres per second, on top of the player's own. */
const ONCOMING_SPEED = 11;

/** Same-direction traffic, slower than the player. It falls behind, which reads as speed. */
const OVERTAKEN_SPEED = 4.5;

const RECYCLE_BEHIND_METERS = 30;

function wrap(base: number, travelled: number, span: number): number {
  const wrapped = (((base - travelled) % span) + span) % span;

  return RECYCLE_BEHIND_METERS - wrapped;
}

const BODY_COLORS = ['#b8443c', '#3f6fae', '#c9c3b6', '#3f4a52', '#7a6f9c'] as const;

export function AmbientTraffic({
  snapshot,
  palette,
  reducedMotion,
}: AmbientTrafficProps): JSX.Element {
  const groupRefs = useRef<(Group | null)[]>([]);
  const drift = useRef(0);

  useFrame((_, delta) => {
    /*
     * Reduced motion parks the traffic rather than removing it.
     *
     * Vehicles sliding past at closing speed are exactly the kind of large
     * peripheral motion spec §12 is about; an empty pair of carriageways would
     * be stranger than a stationary one.
     */
    if (!reducedMotion) drift.current += delta;

    const travelled = reducedMotion ? 0 : snapshot.playerMeters;
    const span = PER_SIDE * SPACING_METERS;

    let index = 0;
    for (let side = 0; side < 2; side += 1) {
      const oncoming = side === 0;
      // Oncoming traffic closes; overtaken traffic is passed. Both are offsets
      // on top of the road already moving past.
      const relative = oncoming ? drift.current * ONCOMING_SPEED : -drift.current * OVERTAKEN_SPEED;

      for (let slot = 0; slot < PER_SIDE; slot += 1) {
        const group = groupRefs.current[index];
        index += 1;
        if (!group) continue;

        const seed = side * 41 + slot;
        // Within the carriageway's own width, so nobody straddles its edge.
        const lateral = (oncoming ? -1 : 1) * (CARRIAGEWAY_CENTRE + (noise(seed) - 0.5) * 2.4);

        group.position.set(
          lateral,
          0,
          wrap(slot * SPACING_METERS + noise(seed + 7) * 12, travelled + relative, span),
        );
      }
    }
  });

  return (
    <group>
      {Array.from({ length: PER_SIDE * 2 }, (_, index) => {
        const oncoming = index < PER_SIDE;
        const color = BODY_COLORS[index % BODY_COLORS.length] ?? BODY_COLORS[0];

        return (
          <group
            key={index}
            ref={(group) => {
              groupRefs.current[index] = group;
            }}
            // Oncoming vehicles face the camera. Without this their tail lights
            // would be on the wrong end, which reads as wrong long before
            // anybody works out why.
            rotation={[0, oncoming ? Math.PI : 0, 0]}
          >
            <mesh castShadow position={[0, 0.75, 0]}>
              <boxGeometry args={[2.1, 0.95, 4.4]} />
              <meshStandardMaterial color={color} roughness={0.35} metalness={0.45} />
            </mesh>
            <mesh castShadow position={[0, 1.42, -0.25]}>
              <boxGeometry args={[1.85, 0.62, 2.2]} />
              <meshStandardMaterial
                color={palette.buildingB}
                roughness={0.12}
                metalness={0.2}
                transparent
                opacity={0.75}
              />
            </mesh>
            {/* Lights: unlit material, because they are the light. */}
            <mesh position={[0, 0.85, 2.24]}>
              <boxGeometry args={[1.7, 0.16, 0.06]} />
              <meshBasicMaterial color={oncoming ? '#fff3cf' : '#ff5b5b'} />
            </mesh>
            {[-0.78, 0.78].map((x) => (
              <mesh key={x} position={[x, 0.34, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.34, 0.34, 2.2, 10]} />
                <meshStandardMaterial color="#1b1e22" roughness={0.9} metalness={0} />
              </mesh>
            ))}
          </group>
        );
      })}
    </group>
  );
}

/** Fixed for the life of a run, like every other pool in the scene. */
export const TRAFFIC_POOL = PER_SIDE * 2;
