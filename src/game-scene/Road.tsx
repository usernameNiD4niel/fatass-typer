import { useFrame } from '@react-three/fiber';
import { useRef, type JSX } from 'react';
import type { InstancedMesh } from 'three';
import { Object3D } from 'three';

import type { WorldSnapshot } from '../game-bridge';
import {
  DRAW_DISTANCE_METERS,
  laneCenterX,
  LANE_WIDTH_METERS,
  noise,
  ROAD_HALF_WIDTH,
  SCENERY_PER_SIDE,
  SCENERY_SPACING_METERS,
  type ScenePalette,
} from './scene-config';

/**
 * The endless road (spec §13).
 *
 * Nothing is allocated per frame and nothing is created as the run goes on.
 * A fixed pool of lane dashes and roadside buildings is placed once and then
 * *recycled*: each frame, anything that has fallen behind the player is moved a
 * whole pool-length forward. The player never reaches the end of the road
 * because there is no end — only the same twenty-odd objects, leapfrogging.
 *
 * The recycling seam is hidden by fog rather than by drawing further, which is
 * the cheaper half of the same trick.
 */

export interface RoadProps {
  readonly snapshot: WorldSnapshot;
  readonly palette: ScenePalette;
  readonly reducedMotion: boolean;
}

/** Reused for instance transforms. One object, not one per instance per frame. */
const dummy = new Object3D();

/**
 * How far behind the camera an object is recycled to the far end.
 *
 * The whole trick rests on this number. Recycle in front of the camera and the
 * player watches buildings blink out of existence; recycle behind it and the
 * road is seamless. The camera sits at `CAMERA_BEHIND_METERS`, so anything past
 * this has already gone by.
 */
const RECYCLE_BEHIND_METERS = 24;

/**
 * Where a pooled object sits this frame.
 *
 * `base` is its slot along the pool; the modulo wraps it so the pool tiles the
 * road forever, and the offset puts the seam out of sight behind the camera.
 */
function recycleZ(base: number, travelled: number, span: number): number {
  const wrapped = (((base - travelled) % span) + span) % span;

  return RECYCLE_BEHIND_METERS - wrapped;
}

/** Dashes per lane divider, across the whole draw distance. */
const DASH_COUNT = 26;
const DASH_SPACING = DRAW_DISTANCE_METERS / DASH_COUNT;
const DASH_LENGTH = 2.6;

export function Road({ snapshot, palette, reducedMotion }: RoadProps): JSX.Element {
  const dashesRef = useRef<InstancedMesh>(null);
  const sceneryRef = useRef<InstancedMesh>(null);

  useFrame(() => {
    // Reduced motion holds the *decoration* still; the road itself keeps moving,
    // because the movement is the game (spec §12).
    const travelled = reducedMotion ? 0 : snapshot.playerMeters;

    const dashes = dashesRef.current;
    if (dashes) {
      const span = DASH_COUNT * DASH_SPACING;

      let index = 0;
      for (let lane = 0; lane < 2; lane += 1) {
        const x = laneCenterX(lane) + LANE_WIDTH_METERS / 2;
        for (let step = 0; step < DASH_COUNT; step += 1) {
          dummy.position.set(x, 0.02, recycleZ(step * DASH_SPACING, travelled, span));
          dummy.scale.set(0.16, 1, DASH_LENGTH);
          dummy.updateMatrix();
          dashes.setMatrixAt(index, dummy.matrix);
          index += 1;
        }
      }
      dashes.instanceMatrix.needsUpdate = true;
    }

    const scenery = sceneryRef.current;
    if (scenery) {
      const span = SCENERY_PER_SIDE * SCENERY_SPACING_METERS;

      let index = 0;
      for (let side = 0; side < 2; side += 1) {
        const direction = side === 0 ? -1 : 1;
        for (let slot = 0; slot < SCENERY_PER_SIDE; slot += 1) {
          const seed = side * 97 + slot;
          const height = 4 + noise(seed) * 16;
          const width = 3 + noise(seed + 11) * 5;
          // Set well back from the kerb. Close scenery reads as an obstruction
          // and, at this camera height, simply fills the frame.
          const inset = 9 + noise(seed + 23) * 14;

          dummy.position.set(
            direction * (ROAD_HALF_WIDTH + inset + width / 2),
            height / 2,
            recycleZ(slot * SCENERY_SPACING_METERS, travelled, span),
          );
          dummy.scale.set(width, height, width);
          dummy.updateMatrix();
          scenery.setMatrixAt(index, dummy.matrix);
          index += 1;
        }
      }
      scenery.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group>
      {/* Ground plane, wide enough that its edges never enter frame. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, -DRAW_DISTANCE_METERS / 2]}>
        <planeGeometry args={[400, DRAW_DISTANCE_METERS * 2]} />
        <meshLambertMaterial color={palette.ground} />
      </mesh>

      {/*
        The surface never moves. It is featureless, so scrolling it would achieve
        nothing except eventually sliding it out of view; the lane dashes are
        what carry the sense of speed.
      */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -DRAW_DISTANCE_METERS / 2]}>
        <planeGeometry args={[ROAD_HALF_WIDTH * 2, DRAW_DISTANCE_METERS * 2]} />
        <meshLambertMaterial color={palette.road} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[side * (ROAD_HALF_WIDTH + 0.35), 0.01, -DRAW_DISTANCE_METERS / 2]}
        >
          <planeGeometry args={[0.7, DRAW_DISTANCE_METERS * 2]} />
          <meshLambertMaterial color={palette.roadEdge} />
        </mesh>
      ))}

      <instancedMesh
        ref={dashesRef}
        args={[undefined, undefined, DASH_COUNT * 2]}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 0.02, 1]} />
        <meshBasicMaterial color={palette.laneMarking} />
      </instancedMesh>

      <instancedMesh
        ref={sceneryRef}
        args={[undefined, undefined, SCENERY_PER_SIDE * 2]}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshLambertMaterial color={palette.buildingA} />
      </instancedMesh>
    </group>
  );
}

/** Pool sizes, fixed for the life of a run. Nothing here grows with distance. */
export const ROAD_POOL = {
  dashes: DASH_COUNT * 2,
  scenery: SCENERY_PER_SIDE * 2,
} as const;
