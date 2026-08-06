import { useFrame } from '@react-three/fiber';
import { useRef, type JSX } from 'react';
import type { Group } from 'three';

import type { MapTheme } from '../game-core/models';
import type { WorldSnapshot } from '../game-bridge';
import { biomeFor, type TravellerKind } from './biome';
import { shiftAt } from './curve-state';
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
 *
 * ## Why they are not all cars
 *
 * The map decides what moves out there — deer in the forest, a camel train in
 * the canyon, lorries on the docks, loose rock on the volcano. It is the same
 * pool, the same recycling and the same two speeds; only the mesh and the gait
 * change. A forest with saloon cars filing past it was the single loudest thing
 * left saying *this is the city map in green*.
 */

export interface AmbientTrafficProps {
  readonly snapshot: WorldSnapshot;
  readonly palette: ScenePalette;
  readonly theme: MapTheme;
  readonly reducedMotion: boolean;
}

/** Vehicles per flanking carriageway. */
const PER_SIDE = 5;
const SPACING_METERS = 46;

/** Oncoming closing speed, in metres per second, on top of the player's own. */
const ONCOMING_SPEED = 11;

/** Same-direction traffic, slower than the player. It falls behind, which reads as speed. */
const OVERTAKEN_SPEED = 4.5;

/**
 * How much of the vehicle speeds an animal keeps.
 *
 * A deer closing at eleven metres a second on top of the player's own is a deer
 * doing about seventy miles an hour, and it looked it — the herd went past like
 * traffic because it *was* traffic with a different mesh on it. Half of that is
 * a hard gallop, which is what these are meant to be.
 */
const ANIMAL_SPEED_SHARE = 0.5;

const RECYCLE_BEHIND_METERS = 30;

function wrap(base: number, travelled: number, span: number): number {
  const wrapped = (((base - travelled) % span) + span) % span;

  return RECYCLE_BEHIND_METERS - wrapped;
}

const BODY_COLORS = ['#b8443c', '#3f6fae', '#c9c3b6', '#3f4a52', '#7a6f9c'] as const;

export function AmbientTraffic({
  snapshot,
  palette,
  theme,
  reducedMotion,
}: AmbientTrafficProps): JSX.Element {
  const kinds = biomeFor(theme).travellers;

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
      const pace = living(kinds) ? ANIMAL_SPEED_SHARE : 1;
      const relative = oncoming
        ? drift.current * ONCOMING_SPEED * pace
        : -drift.current * OVERTAKEN_SPEED * pace;

      for (let slot = 0; slot < PER_SIDE; slot += 1) {
        const group = groupRefs.current[index];
        const kind = kindFor(kinds, index);
        index += 1;
        if (!group) continue;

        const seed = side * 41 + slot;
        // Within the carriageway's own width, so nobody straddles its edge.
        const lateral = (oncoming ? -1 : 1) * (CARRIAGEWAY_CENTRE + (noise(seed) - 0.5) * 2.4);

        const z = wrap(slot * SPACING_METERS + noise(seed + 7) * 12, travelled + relative, span);
        /*
         * Animals bound; vehicles and rock do not.
         *
         * A gait would be wasted on something the player sees for a second and
         * a half in their peripheral vision, so this is one sine wave in y and
         * a little lean — enough that a deer reads as alive rather than as a
         * brown car, and cheap enough to run on ten of them.
         */
        const animal = isAnimal(kind);
        const bound =
          animal && !reducedMotion ? Math.abs(Math.sin(drift.current * GAITS[kind] + seed)) : 0;
        // The far carriageways follow the same bend the player's road does.
        group.position.set(lateral + shiftAt(-z), bound * BOUNDS[kind], z);
        if (animal) group.rotation.x = -bound * 0.16;
        if (kind === 'boulder') group.rotation.x = -(z + drift.current * 9) * 0.35;
      }
    }
  });

  return (
    <group>
      {Array.from({ length: PER_SIDE * 2 }, (_, index) => {
        const oncoming = index < PER_SIDE;
        const kind = kindFor(kinds, index);

        return (
          <group
            key={index}
            ref={(group) => {
              groupRefs.current[index] = group;
            }}
            // Oncoming traffic faces the camera. Without this, tail lights end
            // up on the wrong end and a deer runs backwards — both read as
            // wrong long before anybody works out why.
            rotation={[0, oncoming ? Math.PI : 0, 0]}
          >
            <Traveller kind={kind} index={index} oncoming={oncoming} palette={palette} />
          </group>
        );
      })}
    </group>
  );
}

/**
 * Which species this slot is.
 *
 * A map lists more than one, and they alternate by slot rather than by chance:
 * a herd drawn at random puts three boars in a row about as often as not, and
 * once it has, the map looks like it only has boars.
 */
function kindFor(kinds: readonly TravellerKind[], index: number): TravellerKind {
  return kinds[index % kinds.length] ?? 'car';
}

function isAnimal(kind: TravellerKind): boolean {
  return kind === 'deer' || kind === 'camel' || kind === 'boar' || kind === 'ostrich';
}

/** True when everything on this map's outer tracks is alive. */
function living(kinds: readonly TravellerKind[]): boolean {
  return kinds.every(isAnimal);
}

/** How fast each one bounds, in cycles per second, and how high it leaves the ground. */
const GAITS: Readonly<Record<TravellerKind, number>> = {
  car: 0,
  lorry: 0,
  boulder: 0,
  deer: 2.6,
  // Short legs, quick steps, and it barely leaves the ground.
  boar: 4.2,
  // A camel does not bound at all. This is the sway of a walk.
  camel: 1.1,
  ostrich: 3.4,
};

const BOUNDS: Readonly<Record<TravellerKind, number>> = {
  car: 0,
  lorry: 0,
  boulder: 0,
  deer: 0.45,
  boar: 0.12,
  camel: 0.14,
  ostrich: 0.3,
};

/** One traveller, by kind. Every branch is primitives and nothing else. */
function Traveller({
  kind,
  index,
  oncoming,
  palette,
}: {
  kind: TravellerKind;
  index: number;
  oncoming: boolean;
  palette: ScenePalette;
}): JSX.Element {
  if (kind === 'boulder') return <Boulder index={index} palette={palette} />;
  if (kind === 'car' || kind === 'lorry') {
    return <Vehicle index={index} oncoming={oncoming} palette={palette} long={kind === 'lorry'} />;
  }

  /*
   * Animals are modelled head-first — nose at +z — and then turned around.
   *
   * The group they sit in is oriented for vehicles, whose front is the end the
   * tail lights are *not* on, which works out to -z. An animal built the
   * obvious way therefore galloped down the road backwards, tail first, on
   * every same-direction track in the game.
   */
  return (
    <group rotation={[0, Math.PI, 0]}>
      {kind === 'deer' ? <Deer index={index} /> : null}
      {kind === 'boar' ? <Boar index={index} /> : null}
      {kind === 'camel' ? <Camel index={index} /> : null}
      {kind === 'ostrich' ? <Ostrich index={index} /> : null}
    </group>
  );
}

/** Low, heavy and tusked. The silhouette is the opposite of the deer's. */
function Boar({ index }: { index: number }): JSX.Element {
  const coat = BOAR_COATS[index % BOAR_COATS.length] ?? BOAR_COATS[0];

  return (
    <>
      <mesh castShadow position={[0, 0.72, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <capsuleGeometry args={[0.42, 0.9, 4, 8]} />
        <meshStandardMaterial color={coat} roughness={0.95} metalness={0} />
      </mesh>
      <mesh castShadow position={[0, 0.66, 0.85]} rotation={[0.15, 0, 0]}>
        <coneGeometry args={[0.34, 0.8, 8]} />
        <meshStandardMaterial color={coat} roughness={0.95} metalness={0} />
      </mesh>
      {[-0.14, 0.14].map((x) => (
        <mesh key={x} position={[x, 0.5, 1.1]} rotation={[-0.5, 0, 0]}>
          <coneGeometry args={[0.04, 0.26, 5]} />
          <meshStandardMaterial color="#efe4c8" roughness={0.6} metalness={0} />
        </mesh>
      ))}
      {LEGS.map(([x, z]) => (
        <mesh key={`${String(x)}:${String(z)}`} castShadow position={[x * 0.8, 0.24, z * 0.7]}>
          <cylinderGeometry args={[0.09, 0.07, 0.48, 6]} />
          <meshStandardMaterial color="#3a2b1e" roughness={0.95} metalness={0} />
        </mesh>
      ))}
    </>
  );
}

/** Two legs, all neck. Nothing else on the desert map is that shape. */
function Ostrich({ index }: { index: number }): JSX.Element {
  const coat = index % 2 === 0 ? '#3b3733' : '#4a443d';

  return (
    <>
      <mesh castShadow position={[0, 1.5, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <capsuleGeometry args={[0.5, 0.5, 4, 8]} />
        <meshStandardMaterial color={coat} roughness={0.95} metalness={0} />
      </mesh>
      <mesh castShadow position={[0, 2.1, 0.35]} rotation={[0.25, 0, 0]}>
        <capsuleGeometry args={[0.11, 1.1, 4, 6]} />
        <meshStandardMaterial color="#c9a27a" roughness={0.9} metalness={0} />
      </mesh>
      <mesh castShadow position={[0, 2.72, 0.6]}>
        <sphereGeometry args={[0.17, 10, 8]} />
        <meshStandardMaterial color="#c9a27a" roughness={0.9} metalness={0} />
      </mesh>
      <mesh position={[0, 2.68, 0.82]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.07, 0.28, 6]} />
        <meshStandardMaterial color="#e0a54a" roughness={0.6} metalness={0} />
      </mesh>
      {[-0.22, 0.22].map((x) => (
        <mesh key={x} castShadow position={[x, 0.75, 0]}>
          <cylinderGeometry args={[0.08, 0.06, 1.5, 6]} />
          <meshStandardMaterial color="#c9a27a" roughness={0.9} metalness={0} />
        </mesh>
      ))}
    </>
  );
}

/**
 * A car, or a lorry, which is a car with a longer back and no rear window.
 *
 * The two share a component because the docks differ from the city by
 * proportion rather than by parts, and two files that drift apart is a worse
 * outcome than one flag.
 */
function Vehicle({
  index,
  oncoming,
  palette,
  long,
}: {
  index: number;
  oncoming: boolean;
  palette: ScenePalette;
  long: boolean;
}): JSX.Element {
  const color = BODY_COLORS[index % BODY_COLORS.length] ?? BODY_COLORS[0];
  const length = long ? 8.2 : 4.4;

  return (
    <>
      <mesh castShadow position={[0, long ? 1.5 : 0.75, 0]}>
        <boxGeometry args={[2.1, long ? 2.4 : 0.95, length]} />
        <meshStandardMaterial color={color} roughness={0.35} metalness={0.45} />
      </mesh>
      <mesh castShadow position={[0, long ? 1.9 : 1.42, long ? length / 2 - 1.1 : -0.25]}>
        <boxGeometry args={[1.85, long ? 1.5 : 0.62, long ? 2 : 2.2]} />
        <meshStandardMaterial
          color={palette.structureB}
          roughness={0.12}
          metalness={0.2}
          transparent
          opacity={0.75}
        />
      </mesh>
      {/* Lights: unlit material, because they are the light. */}
      <mesh position={[0, 0.85, length / 2 + 0.04]}>
        <boxGeometry args={[1.7, 0.16, 0.06]} />
        <meshBasicMaterial color={oncoming ? '#fff3cf' : '#ff5b5b'} />
      </mesh>
      {[-0.78, 0.78].map((x) => (
        <mesh
          key={x}
          position={[x, 0.34, long ? -length / 2 + 1.4 : 0]}
          rotation={[0, 0, Math.PI / 2]}
        >
          <cylinderGeometry args={[0.34, 0.34, 2.2, 10]} />
          <meshStandardMaterial color="#1b1e22" roughness={0.9} metalness={0} />
        </mesh>
      ))}
    </>
  );
}

/** Four legs, a neck and antlers. The antlers are what name the silhouette. */
function Deer({ index }: { index: number }): JSX.Element {
  const coat = DEER_COATS[index % DEER_COATS.length] ?? DEER_COATS[0];

  return (
    <>
      <mesh castShadow position={[0, 1.05, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <capsuleGeometry args={[0.42, 1.1, 4, 8]} />
        <meshStandardMaterial color={coat} roughness={0.85} metalness={0} />
      </mesh>
      <mesh castShadow position={[0, 1.62, 0.7]} rotation={[0.5, 0, 0]}>
        <capsuleGeometry args={[0.16, 0.6, 4, 6]} />
        <meshStandardMaterial color={coat} roughness={0.85} metalness={0} />
      </mesh>
      <mesh castShadow position={[0, 1.95, 0.95]}>
        <sphereGeometry args={[0.22, 10, 8]} />
        <meshStandardMaterial color={coat} roughness={0.85} metalness={0} />
      </mesh>
      {[-0.16, 0.16].map((x) => (
        <mesh key={x} castShadow position={[x, 2.25, 0.88]} rotation={[0.3, 0, x > 0 ? -0.4 : 0.4]}>
          <coneGeometry args={[0.07, 0.55, 5]} />
          <meshStandardMaterial color="#e8dcc0" roughness={0.9} metalness={0} />
        </mesh>
      ))}
      {LEGS.map(([x, z]) => (
        <mesh key={`${String(x)}:${String(z)}`} castShadow position={[x, 0.45, z]}>
          <cylinderGeometry args={[0.08, 0.06, 0.9, 6]} />
          <meshStandardMaterial color="#4a3524" roughness={0.9} metalness={0} />
        </mesh>
      ))}
    </>
  );
}

/** Taller than the deer, humped, and it walks rather than bounds. */
function Camel({ index }: { index: number }): JSX.Element {
  const coat = CAMEL_COATS[index % CAMEL_COATS.length] ?? CAMEL_COATS[0];

  return (
    <>
      <mesh castShadow position={[0, 1.75, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <capsuleGeometry args={[0.55, 1.5, 4, 8]} />
        <meshStandardMaterial color={coat} roughness={0.9} metalness={0} />
      </mesh>
      <mesh castShadow position={[0, 2.35, -0.1]}>
        <sphereGeometry args={[0.5, 10, 8]} />
        <meshStandardMaterial color={coat} roughness={0.9} metalness={0} />
      </mesh>
      <mesh castShadow position={[0, 2.5, 1]} rotation={[0.35, 0, 0]}>
        <capsuleGeometry args={[0.18, 1.1, 4, 6]} />
        <meshStandardMaterial color={coat} roughness={0.9} metalness={0} />
      </mesh>
      <mesh castShadow position={[0, 3.05, 1.3]}>
        <sphereGeometry args={[0.24, 10, 8]} />
        <meshStandardMaterial color={coat} roughness={0.9} metalness={0} />
      </mesh>
      {LEGS.map(([x, z]) => (
        <mesh key={`${String(x)}:${String(z)}`} castShadow position={[x, 0.75, z]}>
          <cylinderGeometry args={[0.11, 0.09, 1.5, 6]} />
          <meshStandardMaterial color={coat} roughness={0.9} metalness={0} />
        </mesh>
      ))}
    </>
  );
}

/**
 * Loose rock, rolling.
 *
 * The volcano has no traffic and no wildlife, and an empty pair of tracks would
 * have cost the map the speed cue every other map gets. Rock rolls downhill,
 * which is both the cue and the threat the map is about — and it is still
 * outside every lane the player can reach.
 */
function Boulder({ index, palette }: { index: number; palette: ScenePalette }): JSX.Element {
  const radius = 0.8 + noise(index * 13) * 0.7;

  return (
    <>
      <mesh castShadow position={[0, radius, 0]}>
        <dodecahedronGeometry args={[radius, 0]} />
        <meshStandardMaterial
          color={palette.structureA}
          roughness={0.95}
          metalness={0.05}
          emissive={palette.accent}
          emissiveIntensity={0.25}
        />
      </mesh>
      {/*
        A hot core, small enough to be seen between the faces rather than
        instead of them. It was a wireframe over the whole rock first, which
        read as a cage rather than as something that has not finished cooling.
      */}
      <mesh position={[0, radius, 0]}>
        <dodecahedronGeometry args={[radius * 0.82, 0]} />
        <meshBasicMaterial color={palette.accent} />
      </mesh>
    </>
  );
}

/** Where the four legs go, in metres. Shared by both animals. */
const LEGS: readonly (readonly [number, number])[] = [
  [-0.3, 0.55],
  [0.3, 0.55],
  [-0.3, -0.55],
  [0.3, -0.55],
];

const DEER_COATS = ['#8a5f3c', '#9c7148', '#7a5232'] as const;
const CAMEL_COATS = ['#c8a06a', '#b98f5c', '#d4ae7c'] as const;
const BOAR_COATS = ['#4a3b2c', '#3d3126', '#57462f'] as const;

/** Fixed for the life of a run, like every other pool in the scene. */
export const TRAFFIC_POOL = PER_SIDE * 2;
