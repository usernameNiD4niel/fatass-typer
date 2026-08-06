import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type JSX } from 'react';
import type { InstancedMesh, Mesh } from 'three';
import { Object3D, PlaneGeometry } from 'three';

import type { WorldSnapshot } from '../game-bridge';
import {
  CARRIAGEWAY_CENTRE,
  CARRIAGEWAY_WIDTH,
  DRAW_DISTANCE_METERS,
  laneCenterX,
  LANE_WIDTH_METERS,
  noise,
  ROAD_HALF_WIDTH,
  SCENERY_PER_SIDE,
  SCENERY_SPACING_METERS,
  type ScenePalette,
  windowGlow,
} from './scene-config';
import { createAsphaltRoughness, createFacade } from './textures';
import { isStraight, shiftAt } from './curve-state';

/**
 * The endless road (spec §13).
 *
 * Nothing is allocated per frame and nothing is created as the run goes on.
 * Fixed pools of lane dashes, kerb blocks, reflector posts and roadside
 * buildings are placed once and then *recycled*: each frame, anything that has
 * fallen behind the player is moved a whole pool-length forward. The player
 * never reaches the end of the road because there is no end — only the same
 * few dozen objects, leapfrogging.
 *
 * The recycling seam is hidden by fog rather than by drawing further, which is
 * the cheaper half of the same trick.
 *
 * ## What the vertical things are for
 *
 * Reflector posts and gantries do no work in the rules and cost almost nothing
 * to draw, and they are the main reason the road reads as *fast*. Speed on a
 * flat surface is invisible: with hazards gone, nothing comes at the player any
 * more, and a road with only paint on it looks the same at 7 m/s as at 15.
 * Things passing close to the camera are what make the difference legible.
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

/** Lit windows are warm white, not the map's accent: they are lamps, not signage. */
const WINDOW_LIGHT = '#ffce8a';

/** Segments across the road, for the crown. A handful is enough to bend a highlight. */
const CROWN_SEGMENTS = 6;

/** How far the surface falls from the crown to the kerb, in metres. */
const CROWN_HEIGHT_METERS = 0.09;

/** Reflector posts down each verge. The closest thing to the camera, so the fastest-reading. */
const POST_COUNT = 30;
const POST_SPACING = 7;

/** Overhead sign gantries. Rare, and the only thing that passes *over* the player. */
const GANTRY_COUNT = 4;
const GANTRY_SPACING = 62;

export function Road({ snapshot, palette, reducedMotion }: RoadProps): JSX.Element {
  const dashesRef = useRef<InstancedMesh>(null);
  const sceneryRef = useRef<InstancedMesh>(null);
  const postsRef = useRef<InstancedMesh>(null);
  const gantriesRef = useRef<InstancedMesh>(null);

  /*
   * Painted once, disposed on unmount.
   *
   * A `CanvasTexture` is GPU memory; leaking one per remount would be a slow
   * bleed nobody notices until the fifth run of a session.
   */
  const roughness = useMemo(() => createAsphaltRoughness(), []);
  const facade = useMemo(() => createFacade(), []);
  useEffect(() => {
    return () => {
      roughness?.dispose();
      facade?.color.dispose();
      facade?.emissive.dispose();
    };
  }, [roughness, facade]);

  /*
   * The road is crowned, and the camber is baked once.
   *
   * A dead-flat surface is the last thing in the scene that gives away that it
   * is a plane: the sun's highlight falls across it as a uniform sheet. A couple
   * of centimetres of fall from the crown to each kerb bends that highlight,
   * which is all it takes.
   *
   * Baked into the geometry rather than displaced in a shader because it never
   * changes — the road does not move, it is recycled past.
   */
  const surface = useMemo(() => {
    const geometry = new PlaneGeometry(
      ROAD_HALF_WIDTH * 2,
      DRAW_DISTANCE_METERS * 2,
      CROWN_SEGMENTS,
      RIBBON_SEGMENTS,
    );
    const position = geometry.attributes['position'];
    if (position !== undefined) {
      for (let index = 0; index < position.count; index += 1) {
        const across = position.getX(index) / ROAD_HALF_WIDTH;
        // Parabolic: flat along the crown, falling away fastest at the kerb.
        position.setZ(index, -CROWN_HEIGHT_METERS * across * across);
      }
      position.needsUpdate = true;
    }
    geometry.computeVertexNormals();

    return geometry;
  }, []);

  /*
   * The road bends, and it bends by moving its own vertices.
   *
   * A plane cannot curve, so the surface is built as a ribbon of segments and
   * each row is pushed sideways by how far up the road it is. The rest of the
   * scene is shifted the same way, by the same function — see
   * `curve-state.ts`. Everything moves together, so nothing's relationship to
   * anything else changes and no rule has to know.
   */
  const ribbons = useRef<(Mesh | null)[]>([]);
  useEffect(() => {
    return () => {
      surface.dispose();
    };
  }, [surface]);

  useFrame(() => {
    // Reduced motion holds the *decoration* still; the road itself keeps moving,
    // because the movement is the game (spec §12).
    const travelled = reducedMotion ? 0 : snapshot.playerMeters;

    if (!isStraight()) {
      for (const ribbon of ribbons.current) {
        if (!ribbon) continue;
        bendRibbon(ribbon);
      }
    }

    const dashes = dashesRef.current;
    if (dashes) {
      const span = DASH_COUNT * DASH_SPACING;

      let index = 0;
      for (let lane = 0; lane < 2; lane += 1) {
        const x = laneCenterX(lane) + LANE_WIDTH_METERS / 2;
        for (let step = 0; step < DASH_COUNT; step += 1) {
          const z = recycleZ(step * DASH_SPACING, travelled, span);
          dummy.position.set(x + shiftAt(-z), 0.02, z);
          dummy.scale.set(0.16, 1, DASH_LENGTH);
          dummy.updateMatrix();
          dashes.setMatrixAt(index, dummy.matrix);
          index += 1;
        }
      }
      dashes.instanceMatrix.needsUpdate = true;
    }

    const posts = postsRef.current;
    if (posts) {
      const span = POST_COUNT * POST_SPACING;

      let index = 0;
      for (let side = 0; side < 2; side += 1) {
        const direction = side === 0 ? -1 : 1;
        for (let slot = 0; slot < POST_COUNT; slot += 1) {
          const z = recycleZ(slot * POST_SPACING, travelled, span);
          dummy.position.set(direction * (ROAD_HALF_WIDTH + 1.1) + shiftAt(-z), 0.55, z);
          dummy.scale.set(0.12, 1.1, 0.12);
          dummy.updateMatrix();
          posts.setMatrixAt(index, dummy.matrix);
          index += 1;
        }
      }
      posts.instanceMatrix.needsUpdate = true;
    }

    const gantries = gantriesRef.current;
    if (gantries) {
      const span = GANTRY_COUNT * GANTRY_SPACING;

      for (let slot = 0; slot < GANTRY_COUNT; slot += 1) {
        const z = recycleZ(slot * GANTRY_SPACING, travelled, span);
        dummy.position.set(shiftAt(-z), 6.2, z);
        dummy.scale.set(ROAD_HALF_WIDTH * 2 + 3, 0.5, 0.4);
        dummy.updateMatrix();
        gantries.setMatrixAt(slot, dummy.matrix);
      }
      gantries.instanceMatrix.needsUpdate = true;
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
          /*
           * Set well back, and now measured from the *far* kerb of the flanking
           * carriageway rather than from the player's own. Buildings standing in
           * the oncoming traffic was the giveaway that the two were placed by
           * files that did not know about each other.
           */
          const inset = 4 + noise(seed + 23) * 14;

          const z = recycleZ(slot * SCENERY_SPACING_METERS, travelled, span);
          dummy.position.set(
            direction * (CARRIAGEWAY_CENTRE + CARRIAGEWAY_WIDTH / 2 + inset + width / 2) +
              shiftAt(-z),
            height / 2,
            z,
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
      <mesh
        receiveShadow
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.02, -DRAW_DISTANCE_METERS / 2]}
      >
        <planeGeometry args={[400, DRAW_DISTANCE_METERS * 2]} />
        <meshStandardMaterial color={palette.ground} roughness={0.95} metalness={0} />
      </mesh>

      {/*
        The surface never moves. It is featureless, so scrolling it would achieve
        nothing except eventually sliding it out of view; the lane dashes are
        what carry the sense of speed.

        The roughness map is what makes it look like tarmac rather than like a
        grey plane — see `textures.ts` for why the grain is painted into
        roughness rather than into colour.
      */}
      <mesh
        receiveShadow
        geometry={surface}
        ref={(mesh) => {
          ribbons.current[0] = mesh;
        }}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, -DRAW_DISTANCE_METERS / 2]}
      >
        <meshStandardMaterial
          color={palette.road}
          roughness={0.85}
          metalness={0}
          {...(roughness === null ? {} : { roughnessMap: roughness })}
        />
      </mesh>
      {[-1, 1].map((side, index) => (
        <mesh
          key={side}
          receiveShadow
          ref={(mesh) => {
            ribbons.current[1 + index] = mesh;
          }}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[side * (ROAD_HALF_WIDTH + 0.35), 0.01, -DRAW_DISTANCE_METERS / 2]}
        >
          <planeGeometry args={[0.7, DRAW_DISTANCE_METERS * 2, 1, RIBBON_SEGMENTS]} />
          <meshStandardMaterial color={palette.roadEdge} roughness={0.8} metalness={0} />
        </mesh>
      ))}

      {/*
        The flanking carriageways.

        Surface only — the traffic on them lives in `AmbientTraffic.tsx` and is
        positioned independently. Without these the vehicles drive along the
        grass, which reads as a bug rather than as scenery, and undoes the one
        job they have: making the speed look real.
      */}
      {[-1, 1].map((side, index) => (
        <mesh
          key={`carriageway-${String(side)}`}
          receiveShadow
          ref={(mesh) => {
            ribbons.current[3 + index] = mesh;
          }}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[side * CARRIAGEWAY_CENTRE, 0, -DRAW_DISTANCE_METERS / 2]}
        >
          <planeGeometry args={[CARRIAGEWAY_WIDTH, DRAW_DISTANCE_METERS * 2, 1, RIBBON_SEGMENTS]} />
          <meshStandardMaterial
            color={palette.road}
            roughness={0.88}
            metalness={0}
            {...(roughness === null ? {} : { roughnessMap: roughness })}
          />
        </mesh>
      ))}

      {/*
        Markings stay unlit, deliberately. Fresh paint under a low sun is the one
        thing on the road brighter than the sun can make it, and a lit marking on
        the night maps disappears exactly when it is most needed.
      */}
      <instancedMesh
        ref={dashesRef}
        args={[undefined, undefined, DASH_COUNT * 2]}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 0.02, 1]} />
        <meshBasicMaterial color={palette.laneMarking} />
      </instancedMesh>

      <instancedMesh
        ref={postsRef}
        castShadow
        args={[undefined, undefined, POST_COUNT * 2]}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          color={palette.roadEdge}
          emissive={palette.accent}
          emissiveIntensity={0.35}
          roughness={0.5}
          metalness={0.1}
        />
      </instancedMesh>

      <instancedMesh
        ref={gantriesRef}
        castShadow
        args={[undefined, undefined, GANTRY_COUNT]}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={palette.buildingB} roughness={0.7} metalness={0.2} />
      </instancedMesh>

      <instancedMesh
        ref={sceneryRef}
        castShadow
        args={[undefined, undefined, SCENERY_PER_SIDE * 2]}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        {/*
          Windows, and a third of them lit. The emissive map is what makes the
          night maps read as a city rather than as a row of dark boxes — and it
          is the same texture in daylight, where the emissive term is simply
          swamped by the sun.
        */}
        <meshStandardMaterial
          color={palette.buildingA}
          roughness={0.8}
          metalness={0.05}
          emissive={WINDOW_LIGHT}
          emissiveIntensity={windowGlow(palette)}
          {...(facade === null ? {} : { map: facade.color, emissiveMap: facade.emissive })}
        />
      </instancedMesh>
    </group>
  );
}

/**
 * Rows along a long surface. Enough that a bend reads as a curve rather than as
 * a series of corners, and few enough that moving them all is free.
 */
const RIBBON_SEGMENTS = 64;

/**
 * Pushes one long surface sideways to follow the road.
 *
 * Each vertex is moved by `shiftAt` for its own depth. The geometry keeps its
 * original z, so the mesh still covers the same stretch of road — only its `x`
 * changes, which is exactly what a bend is.
 */
function bendRibbon(mesh: Mesh): void {
  const geometry = mesh.geometry;
  const position = geometry.attributes['position'];
  const rest = geometry.userData['restX'] as Float32Array | undefined;
  if (position === undefined) return;

  // The straight road is remembered once: bending a bent road compounds.
  const original =
    rest ??
    (() => {
      const copy = new Float32Array(position.count);
      for (let index = 0; index < position.count; index += 1) copy[index] = position.getX(index);
      geometry.userData['restX'] = copy;

      return copy;
    })();

  for (let index = 0; index < position.count; index += 1) {
    // The mesh is rotated flat, so its local y runs *up* the road, and the
    // group it sits in is pushed back by half the draw distance.
    const depth = position.getY(index) + DRAW_DISTANCE_METERS / 2;
    position.setX(index, (original[index] ?? 0) + shiftAt(depth));
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
}

/** Pool sizes, fixed for the life of a run. Nothing here grows with distance. */
export const ROAD_POOL = {
  dashes: DASH_COUNT * 2,
  scenery: SCENERY_PER_SIDE * 2,
  posts: POST_COUNT * 2,
  gantries: GANTRY_COUNT,
} as const;
