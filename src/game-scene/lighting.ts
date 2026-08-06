import type { ScenePalette } from './scene-config';

/**
 * The light the world is lit by.
 *
 * ## Why one fixed shadow camera is enough
 *
 * The player never moves forward. `Road.tsx` recycles the world *past* a runner
 * pinned at the origin, so the volume that needs shadows is the same handful of
 * metres on every frame of every run. That removes the two things that usually
 * make shadows expensive in a runner: no cascades, and no per-frame frustum
 * fitting. One orthographic camera, sized once, covers the playfield forever.
 *
 * ## Why a hemisphere light and not an ambient one
 *
 * `meshStandardMaterial` is physically based, and physically based materials lit
 * by a single flat ambient term look *worse* than the Lambert ones they replace
 * — grey, plastic, and evenly wrong. What sells them is light arriving from
 * different directions in different colours, which is normally an environment
 * map. This project ships no remote assets, so a hemisphere light is the
 * substitute: sky colour from above, ground colour bounced from below.
 *
 * That is not polish on top of the PBR switch. It is the half that makes it an
 * improvement rather than a regression, which is why both land together.
 */

/**
 * Shadow map resolution.
 *
 * 1024 over a ~60m box is roughly six centimetres per texel — enough for a
 * runner's legs to read as separate from each other, which is the only shadow
 * detail anybody will look at.
 */
export const SHADOW_MAP_SIZE = 1024;

/** Halved when motion is reduced, where the shadow is scenery rather than feedback. */
export const REDUCED_SHADOW_MAP_SIZE = 512;

/**
 * The orthographic box the shadow camera covers, in metres.
 *
 * Wide enough for the road and its kerbs, deep enough to cover the stretch in
 * front of the player that the camera actually frames. Anything beyond it is
 * too far away for a shadow to be legible.
 */
export const SHADOW_BOX = {
  left: -30,
  right: 30,
  top: 40,
  bottom: -40,
  near: 1,
  far: 90,
} as const;

/**
 * Depth offset, in shadow-map units.
 *
 * Negative, and it has to be: the road is a nearly flat surface receiving a
 * shadow from a light at a shallow angle, which is the exact case that produces
 * acne. This is small enough not to detach the runner's shadow from its feet.
 */
export const SHADOW_BIAS = -0.0005;

/** Where the sun sits, in metres. High and to one side, so the runner casts along the road. */
export const SUN_POSITION: readonly [number, number, number] = [18, 34, 12];

export interface LightingRig {
  readonly sunPosition: readonly [number, number, number];
  readonly sunIntensity: number;
  readonly skyColor: string;
  readonly groundColor: string;
  readonly hemisphereIntensity: number;
  readonly shadowMapSize: number;
}

/**
 * The rig for a palette.
 *
 * The sun carries most of the light on a day map and very little on a night
 * one, where the hemisphere term takes over — a night highway lit by a hard
 * directional light looks like a day map with the brightness turned down.
 */
export function lightingRig(palette: ScenePalette, reducedMotion: boolean): LightingRig {
  const night = palette.lightIntensity < 0.8;

  return {
    sunPosition: SUN_POSITION,
    sunIntensity: palette.lightIntensity * (night ? 0.8 : 1.35),
    skyColor: palette.sky,
    // The ground bounce is the road, not the grass: it is what is under the
    // runner, and it is what the underside of the runner sees.
    groundColor: palette.road,
    hemisphereIntensity: palette.lightIntensity * (night ? 1.1 : 0.85),
    shadowMapSize: reducedMotion ? REDUCED_SHADOW_MAP_SIZE : SHADOW_MAP_SIZE,
  };
}
