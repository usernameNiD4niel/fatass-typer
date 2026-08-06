import { Sky as DreiSky, Stars } from '@react-three/drei';
import type { JSX } from 'react';

import { SUN_POSITION } from './lighting';
import { DRAW_DISTANCE_METERS, type ScenePalette } from './scene-config';

/**
 * What is above the road.
 *
 * A flat background colour is the single biggest reason a 3D scene reads as a
 * 2D one: with no gradient and no horizon, there is nothing for the eye to
 * place the road *in*. Sky gives distance somewhere to go.
 *
 * ## The asset rule still holds
 *
 * drei's `<Sky>` is a Preetham atmospheric-scattering shader from `three-stdlib`
 * and `<Stars>` is a point cloud with a generated shader. Neither fetches
 * anything, which is why they are usable here.
 *
 * **`<Cloud>` is not**, and this is worth writing down because it looks like it
 * belongs in the same family: `drei/core/Cloud.js` hardcodes a githack CDN URL
 * for its sprite. Importing it would put a remote asset in a build that has
 * none, and it would fail silently offline. Do not.
 */

/** Below this the map is a night map, and the sky is stars rather than air. */
const NIGHT_INTENSITY = 0.8;

export interface SkyProps {
  readonly palette: ScenePalette;
  /** Stills the twinkle. The sky itself is static either way (spec §12). */
  readonly reducedMotion: boolean;
}

export function Sky({ palette, reducedMotion }: SkyProps): JSX.Element {
  if (palette.lightIntensity < NIGHT_INTENSITY) {
    return (
      <Stars
        radius={DRAW_DISTANCE_METERS * 0.9}
        depth={40}
        count={1400}
        factor={3.2}
        saturation={0}
        fade
        speed={reducedMotion ? 0 : 0.6}
      />
    );
  }

  return (
    <DreiSky
      // The same direction the sun light comes from. A sky whose bright spot
      // disagreed with where the shadows point is the kind of thing nobody can
      // name and everybody notices.
      sunPosition={[...SUN_POSITION]}
      distance={DRAW_DISTANCE_METERS * 2}
      // Hazy rather than alpine: a clean sky makes the fog on the horizon look
      // like a mistake instead of like distance.
      turbidity={7}
      rayleigh={1.6}
      mieCoefficient={0.006}
      mieDirectionalG={0.8}
    />
  );
}
