import { useMemo, type JSX } from 'react';
import { AdditiveBlending } from 'three';

import { sharedGlowTexture } from './textures';

/**
 * A soft additive halo, for the few things that should look lit.
 *
 * ## Why this instead of bloom
 *
 * Real bloom means `@react-three/postprocessing`, which is another ~150 kB on
 * top of a `three` chunk already past 850, plus a full-screen composite pass
 * every frame. What bloom would actually be used for here is small and
 * enumerable: coins, crates, and the lane cue. A billboard behind each of them
 * gets most of that look for one 64×64 texture and no new dependency.
 *
 * The honest difference is that this does not bleed onto its surroundings — a
 * coin will not brighten the road under it. That is a real loss and a small one
 * at this camera distance.
 *
 * ## Why a sprite
 *
 * Sprites face the camera automatically, so the halo is round from every angle
 * without a per-frame billboard calculation. `depthWrite` is off so two of them
 * overlapping do not cut each other out, and additive blending means the halo
 * only ever brightens what is behind it.
 */

export interface GlowProps {
  readonly color: string;
  /** Diameter in metres. */
  readonly size: number;
  readonly opacity?: number;
}

export function Glow({ color, size, opacity = 0.55 }: GlowProps): JSX.Element | null {
  const texture = useMemo(() => sharedGlowTexture(), []);
  if (texture === null) return null;

  return (
    <sprite scale={[size, size, size]}>
      <spriteMaterial
        map={texture}
        color={color}
        transparent
        opacity={opacity}
        blending={AdditiveBlending}
        depthWrite={false}
        // Fog would dim the halo with distance while the emissive material
        // behind it kept its brightness, which reads as the glow sliding off
        // the object as it approaches.
        fog={false}
      />
    </sprite>
  );
}
