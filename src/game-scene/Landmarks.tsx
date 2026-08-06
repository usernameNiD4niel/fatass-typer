import { useFrame } from '@react-three/fiber';
import { useRef, type JSX } from 'react';
import type { Group, Mesh } from 'three';

import type { MapTheme } from '../game-core/models';
import type { WorldSnapshot } from '../game-bridge';
import { biomeFor, type LandmarkKind } from './biome';
import { shiftAt } from './curve-state';
import {
  CARRIAGEWAY_CENTRE,
  CARRIAGEWAY_WIDTH,
  DRAW_DISTANCE_METERS,
  noise,
  type ScenePalette,
} from './scene-config';

/**
 * The one large thing a map has that no other map has.
 *
 * ## Why it is separate from the scenery
 *
 * Roadside scenery is a rhythm: fourteen slots a side, evenly spaced, close
 * enough to flick past. It says what the place is *made of*. It cannot say what
 * the place *is*, because anything big enough to do that would have to be rare
 * enough to be an event — and a pool that fires once every two hundred metres
 * is a different pool with different spacing.
 *
 * So: waterfalls down the valley side, buttes across the canyon, gantry cranes
 * over the dock, and lava beside the ridge road. Three per map, recycled, well
 * outside anything the player can reach.
 *
 * Everything here is primitives, moves only on the z axis, and follows the same
 * `shiftAt` bend the road does. It cannot be collided with and is not in the
 * snapshot — like every other thing in this folder, it draws and does not
 * decide.
 */

export interface LandmarksProps {
  readonly snapshot: WorldSnapshot;
  readonly palette: ScenePalette;
  readonly theme: MapTheme;
  readonly reducedMotion: boolean;
}

/** Landmarks in flight at once. Rare is the point; more would be scenery. */
const COUNT = 3;
const SPACING_METERS = 150;

/** How far out they stand, beyond the far kerb of the flanking carriageway. */
const INSET_METERS = 26;

const RECYCLE_BEHIND_METERS = 40;

function recycleZ(base: number, travelled: number, span: number): number {
  const wrapped = (((base - travelled) % span) + span) % span;

  return RECYCLE_BEHIND_METERS - wrapped;
}

export function Landmarks({
  snapshot,
  palette,
  theme,
  reducedMotion,
}: LandmarksProps): JSX.Element | null {
  const kind = biomeFor(theme).landmark;
  const groups = useRef<(Group | null)[]>([]);
  const fallers = useRef<(Mesh | null)[]>([]);
  const elapsed = useRef(0);

  useFrame((_, delta) => {
    if (!reducedMotion) elapsed.current += delta;

    const travelled = reducedMotion ? 0 : snapshot.playerMeters;
    const span = COUNT * SPACING_METERS;

    for (let slot = 0; slot < COUNT; slot += 1) {
      const group = groups.current[slot];
      if (!group) continue;

      // Alternating sides. Three on one side would read as a wall.
      const direction = slot % 2 === 0 ? -1 : 1;
      const z = recycleZ(slot * SPACING_METERS, travelled, span);
      const out = CARRIAGEWAY_CENTRE + CARRIAGEWAY_WIDTH / 2 + INSET_METERS + noise(slot * 7) * 18;

      group.position.set(direction * out + shiftAt(-z), 0, z);
      // Facing the road, so a crane's boom reaches over it rather than away.
      group.rotation.y = direction > 0 ? -Math.PI / 2 : Math.PI / 2;
    }

    /*
     * The water falls by moving, because there is no texture to scroll.
     *
     * Each sheet drops through the height of the fall and jumps back to the
     * top, offset from its neighbours. Three sheets is enough: the eye reads
     * continuous motion long before it can count them.
     */
    if (kind === 'waterfall') {
      for (let index = 0; index < fallers.current.length; index += 1) {
        const sheet = fallers.current[index];
        if (!sheet) continue;

        const phase = (elapsed.current * 0.55 + index / SHEETS) % 1;
        sheet.position.y = FALL_TOP - phase * FALL_HEIGHT;
        sheet.scale.y = 1 - phase * 0.35;
      }
    }
  });

  if (kind === 'none') return null;

  return (
    <group>
      {Array.from({ length: COUNT }, (_, slot) => (
        <group
          key={slot}
          ref={(group) => {
            groups.current[slot] = group;
          }}
        >
          <Landmark kind={kind} slot={slot} palette={palette} fallers={fallers} />
        </group>
      ))}
    </group>
  );
}

function Landmark({
  kind,
  slot,
  palette,
  fallers,
}: {
  kind: LandmarkKind;
  slot: number;
  palette: ScenePalette;
  fallers: { current: (Mesh | null)[] };
}): JSX.Element | null {
  if (kind === 'waterfall') return <Waterfall slot={slot} palette={palette} fallers={fallers} />;
  if (kind === 'mesa') return <Butte slot={slot} palette={palette} />;
  if (kind === 'crane') return <Crane palette={palette} />;
  if (kind === 'lava') return <LavaFlow palette={palette} />;

  return null;
}

/** How far the water falls, and from where. Shared by the sheets and the cliff. */
const FALL_TOP = 26;
const FALL_HEIGHT = 22;
const SHEETS = 3;

/**
 * A cliff with water coming off it.
 *
 * The cliff is doing most of the work: falling water with nothing behind it
 * reads as a white rectangle in mid-air. The plunge pool at the bottom is what
 * stops it reading as water that stops.
 */
function Waterfall({
  slot,
  palette,
  fallers,
}: {
  slot: number;
  palette: ScenePalette;
  fallers: { current: (Mesh | null)[] };
}): JSX.Element {
  return (
    <>
      {/*
        Six sides rather than four. A box this size reads as a billboard
        standing in a field; an outcrop with corners in it reads as ground that
        happens to stop.
      */}
      <mesh castShadow receiveShadow position={[0, 15, 0]} rotation={[0, 0.4, 0]}>
        <cylinderGeometry args={[13, 18, 34, 6]} />
        <meshStandardMaterial color="#5d6b5a" roughness={1} metalness={0} />
      </mesh>
      {Array.from({ length: SHEETS }, (_, index) => (
        <mesh
          key={index}
          ref={(mesh) => {
            fallers.current[slot * SHEETS + index] = mesh;
          }}
          position={[0, FALL_TOP, 15.5]}
        >
          <boxGeometry args={[7, 11, 0.5]} />
          {/*
            Unlit, and deliberately: falling water is brighter than the rock it
            is falling past whatever the sun is doing, and a lit material makes
            it grey on the overcast maps.
          */}
          <meshBasicMaterial color="#eaf6ff" transparent opacity={0.9} />
        </mesh>
      ))}
      <mesh position={[0, 0.4, 17]}>
        <cylinderGeometry args={[8, 8, 0.8, 14]} />
        <meshStandardMaterial color={palette.accent} roughness={0.25} metalness={0.1} />
      </mesh>
    </>
  );
}

/** A butte, big enough to be the horizon rather than the roadside. */
function Butte({ slot, palette }: { slot: number; palette: ScenePalette }): JSX.Element {
  const height = 34 + noise(slot * 31) * 22;

  return (
    <>
      <mesh castShadow receiveShadow position={[0, height / 2, 0]}>
        <cylinderGeometry args={[13, 17, height, 7]} />
        <meshStandardMaterial color={palette.structureA} roughness={1} metalness={0} />
      </mesh>
      <mesh castShadow position={[0, height + 1, 0]}>
        <cylinderGeometry args={[13.6, 13.6, 2, 7]} />
        <meshStandardMaterial color={palette.structureB} roughness={1} metalness={0} />
      </mesh>
    </>
  );
}

/** A gantry crane: two legs, a boom over the water, and a hoist hanging off it. */
function Crane({ palette }: { palette: ScenePalette }): JSX.Element {
  return (
    <>
      {[-5, 5].map((x) => (
        <mesh key={x} castShadow position={[x, 11, 0]}>
          <boxGeometry args={[1.4, 22, 1.4]} />
          <meshStandardMaterial color={palette.accent} roughness={0.6} metalness={0.4} />
        </mesh>
      ))}
      <mesh castShadow position={[0, 22.6, 6]}>
        <boxGeometry args={[13, 1.6, 30]} />
        <meshStandardMaterial color={palette.accent} roughness={0.6} metalness={0.4} />
      </mesh>
      <mesh castShadow position={[0, 18.5, 15]}>
        <boxGeometry args={[3, 6.5, 3]} />
        <meshStandardMaterial color={palette.structureB} roughness={0.5} metalness={0.5} />
      </mesh>
      <mesh position={[0, 26, 0]}>
        <boxGeometry args={[2.6, 5, 2.6]} />
        <meshStandardMaterial color={palette.structureA} roughness={0.5} metalness={0.5} />
      </mesh>
    </>
  );
}

/**
 * A lava flow: a glowing channel with a bank either side.
 *
 * Unlit, like the waterfall and for the mirrored reason — lava is a light
 * source, and a standard material would have the sun deciding how bright the
 * inside of a volcano looks.
 */
function LavaFlow({ palette }: { palette: ScenePalette }): JSX.Element {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
        <planeGeometry args={[9, DRAW_DISTANCE_METERS * 0.9]} />
        <meshBasicMaterial color={palette.accent} />
      </mesh>
      {[-6.5, 6.5].map((x) => (
        <mesh key={x} castShadow receiveShadow position={[x, 1.1, 0]}>
          <boxGeometry args={[4.5, 2.2, DRAW_DISTANCE_METERS * 0.9]} />
          <meshStandardMaterial color={palette.structureA} roughness={1} metalness={0} />
        </mesh>
      ))}
      {[-24, 6, 38].map((z) => (
        <mesh key={z} castShadow position={[0, 6, z]}>
          <coneGeometry args={[4, 12, 7]} />
          <meshStandardMaterial
            color={palette.structureB}
            roughness={0.8}
            metalness={0.1}
            emissive={palette.accent}
            emissiveIntensity={0.35}
          />
        </mesh>
      ))}
    </>
  );
}

/** Fixed for the life of a run, like every other pool in the scene. */
export const LANDMARK_POOL = COUNT;
