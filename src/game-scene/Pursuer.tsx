import { useFrame } from '@react-three/fiber';
import { useRef, type JSX } from 'react';
import type { Group, Mesh, MeshStandardMaterial } from 'three';

import type { WorldSnapshot } from '../game-bridge';
import { CAMERA_BEHIND_METERS, laneCenterX } from './scene-config';

/**
 * The thing behind you (plan 1.3).
 *
 * Built from primitives like everything else in this scene: a slab with a
 * grille, low and wide, reading as a vehicle without being one in particular.
 * Its distance comes from `snapshot.pursuit.gapMeters`, which is a rule — see
 * `game-core/pursuit`. Nothing here decides anything.
 *
 * ## Why it is drawn at all
 *
 * The deadline was the only pressure in the game and it is invisible: it exists
 * for the second or two before it expires. Something closing on you is felt
 * every frame, and that continuous presence is most of what a runner is.
 *
 * ## Why it sits behind the camera most of the time
 *
 * The camera is 7.6m behind the player and the chaser starts 34m back, so at
 * full gap it is off screen — deliberately. A threat permanently in frame stops
 * being read after a minute. It comes into view as it closes, which is exactly
 * when the player needs to know about it, and the glow does the rest.
 */

export interface PursuerProps {
  readonly snapshot: WorldSnapshot;
  readonly reducedMotion: boolean;
}

/*
 * Local constants rather than palette entries, matching `Hazards.tsx`.
 *
 * The chaser looks the same on every map on purpose: it is the one thing in the
 * game that is never part of the scenery, and a Night Highway version of it
 * would be a different threat rather than the same one somewhere else.
 */
const BODY_COLOR = '#2b2f3a';
const GRILLE_COLOR = '#ff5b5b';

/** Lifts it just clear of the road. */
const HEIGHT_METERS = 0.7;

export function Pursuer({ snapshot, reducedMotion }: PursuerProps): JSX.Element {
  const rootRef = useRef<Group>(null);
  const glowRef = useRef<Mesh>(null);
  const seed = useRef(0);

  useFrame((_, delta) => {
    const root = rootRef.current;
    if (!root) return;

    const gap = snapshot.pursuit.gapMeters;
    const pressure = snapshot.pursuit.pressure;

    // Behind the player, in their lane. Following the lane rather than holding
    // the middle is what makes it read as chasing *them*.
    root.position.set(laneCenterX(snapshot.lanePosition), HEIGHT_METERS, gap);

    // Never drawn while the run is not under way: on the results screen it
    // would sit in the middle of the road with nothing chasing.
    root.visible = snapshot.phase === 'running' || snapshot.phase === 'playerHit';

    // Lurching, and more of it the closer it gets. Cosmetic only — the gap is
    // the rule, and this never touches it.
    if (!reducedMotion) {
      seed.current += delta * (2 + pressure * 6);
      root.position.y = HEIGHT_METERS + Math.sin(seed.current) * 0.06 * (0.4 + pressure);
      root.rotation.z = Math.sin(seed.current * 0.7) * 0.03 * pressure;
    }

    const glow = glowRef.current;
    if (glow) {
      const material = glow.material as MeshStandardMaterial;
      // Colour is not the only cue — it is also *closer*, which is the whole
      // point — but it is the one that reads at the edge of vision.
      material.emissiveIntensity = 0.3 + pressure * 2.2;
    }
  });

  return (
    <group ref={rootRef} visible={false}>
      {/* Body. */}
      <mesh castShadow>
        <boxGeometry args={[2.6, 1.4, 3.4]} />
        <meshStandardMaterial color={BODY_COLOR} roughness={0.6} />
      </mesh>

      {/* Grille, facing the player. Emissive, so closing reads at a glance. */}
      <mesh ref={glowRef} position={[0, 0.05, -1.75]}>
        <boxGeometry args={[2.2, 0.7, 0.18]} />
        <meshStandardMaterial
          color={GRILLE_COLOR}
          emissive={GRILLE_COLOR}
          emissiveIntensity={0.3}
        />
      </mesh>

      {/*
        A painted shadow slab, kept even though the scene casts real shadows now.
        The chaser sits behind the camera's shadow box for most of a run, so its
        real shadow would flick in and out as it closed — and a contact shadow
        that appears only when you are about to lose is worse than a fake one
        that is always there.
      */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -HEIGHT_METERS + 0.02, 0]}>
        <planeGeometry args={[2.8, 3.6]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.28} />
      </mesh>
    </group>
  );
}

/** Exported for the test that checks it starts off screen. */
export const PURSUER_CAMERA_BEHIND_METERS = CAMERA_BEHIND_METERS;
