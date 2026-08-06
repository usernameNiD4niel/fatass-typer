import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, type JSX } from 'react';
import { type InstancedMesh, Object3D } from 'three';

import { noise } from './scene-config';
import type { WeatherLook } from './weather';

/**
 * Rain, snow, and what a storm looks like from inside it.
 *
 * Named `WeatherLayer` rather than `Weather` because `weather.ts` beside it owns
 * the *data*, and on a case-insensitive filesystem `./Weather` and `./weather`
 * are the same import. One of them had to give.
 *
 * ## One instanced mesh, recycled forever
 *
 * Every drop is an instance of the same box, and they are never created or
 * destroyed: each one falls, and the moment it passes the ground it is put back
 * at the top with its horizontal position unchanged. A thousand particles cost
 * one draw call and no allocation, which is the only way this belongs in a
 * scene that has to hold sixty frames a second (`README.md`).
 *
 * ## Why the box moves with the camera
 *
 * The volume is a slab around the player rather than a weather system over the
 * map. Anything outside a few metres of the camera is too small to see, so
 * simulating it would be paying for pixels nobody receives.
 *
 * ## It changes nothing
 *
 * No rule reads this. See `weather.ts` for why that line is deliberate.
 */

export interface WeatherLayerProps {
  readonly look: WeatherLook;
  readonly reducedMotion: boolean;
}

/** The slab the particles live in, in metres. */
const VOLUME = { width: 46, height: 22, depth: 70 } as const;

/** Reused for instance transforms. One object, not one per particle per frame. */
const dummy = new Object3D();

export function WeatherLayer({ look, reducedMotion }: WeatherLayerProps): JSX.Element | null {
  const meshRef = useRef<InstancedMesh>(null);

  /**
   * Where each particle started.
   *
   * Fixed at mount from `noise`, not from the run's RNG: `game-core` owns the
   * seeded generator and nothing about which pixel a raindrop occupies belongs
   * anywhere near it.
   */
  const seeds = useMemo(
    () =>
      Array.from({ length: look.particleCount }, (_, index) => ({
        x: (noise(index * 3.1) - 0.5) * VOLUME.width,
        y: noise(index * 7.7) * VOLUME.height,
        z: (noise(index * 11.3) - 0.5) * VOLUME.depth,
      })),
    [look.particleCount],
  );

  const fallen = useRef<number[]>([]);
  if (fallen.current.length !== seeds.length) {
    fallen.current = Array.from({ length: seeds.length }, () => 0);
  }

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh || seeds.length === 0) return;

    /*
     * Reduced motion stops the fall and leaves the particles hanging.
     *
     * A screenful of fast-moving specks is exactly the kind of large peripheral
     * motion spec §12 is about, and removing the weather entirely would take
     * away the thing that makes the run *look* different, which is the whole
     * feature. Still weather, just still.
     */
    const step = reducedMotion ? 0 : look.fallSpeed * delta;

    for (let index = 0; index < seeds.length; index += 1) {
      const seed = seeds[index];
      if (seed === undefined) continue;

      let drop = (fallen.current[index] ?? 0) + step;
      // Wrapped rather than reset: a particle that restarted at a fixed height
      // would make the whole field pulse in unison.
      if (drop > VOLUME.height) drop -= VOLUME.height;
      fallen.current[index] = drop;

      const y = seed.y - drop;
      dummy.position.set(
        seed.x + drop * look.slant,
        y < 0 ? y + VOLUME.height : y,
        seed.z - VOLUME.depth / 3,
      );
      // Leaning along the direction of travel, so a drop reads as falling
      // rather than as a floating stick.
      dummy.rotation.z = -Math.atan(look.slant);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
  });

  if (look.particleCount === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, look.particleCount]}
      frustumCulled={false}
    >
      {/*
        Snow is a fleck and rain is a streak, and the difference is entirely in
        this box: the same geometry stretched by the look's own size.
      */}
      <boxGeometry
        args={[look.size * 0.22, look.size * (look.kind === 'snow' ? 0.22 : 3.4), 0.06]}
      />
      {/*
        Unlit, and transparent. Lit particles would be black against a bright
        sky on exactly the maps where the weather matters most.
      */}
      <meshBasicMaterial
        color={look.color}
        transparent
        opacity={look.kind === 'snow' ? 0.9 : 0.55}
      />
    </instancedMesh>
  );
}
