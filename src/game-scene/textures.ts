import { CanvasTexture, RepeatWrapping, type Texture } from 'three';

import { noise } from './scene-config';

/**
 * Textures, painted rather than downloaded.
 *
 * `game-scene/README.md` forbids remote assets, and that rule is worth keeping:
 * it is why the whole game loads in one request and why nothing can 404 into a
 * blank road. But an untextured road is a flat grey plane, and no amount of
 * lighting rescues a surface with no detail for the light to catch.
 *
 * So the detail is generated: a small canvas, painted once at mount from the
 * same `noise()` helper the scenery uses, uploaded as a texture and tiled. It
 * ships zero bytes and costs one paint per run.
 *
 * **These allocate.** Build them in a `useMemo` and dispose them in the matching
 * cleanup — a texture leaked per remount is GPU memory nothing will reclaim.
 */

/**
 * Texture resolution.
 *
 * Small on purpose. The road is seen at a glancing angle and tiled every few
 * metres, so what matters is that the grain exists at all, not that it is
 * sharp. 256 is about 200 kB of GPU memory per map.
 */
const TEXTURE_SIZE = 256;

/** How many times the road texture repeats across the surface and along it. */
export const ROAD_REPEAT = { across: 3, along: 60 } as const;

function createCanvas(size: number): HTMLCanvasElement | null {
  // Guarded because this module is imported by tests running in jsdom, where a
  // canvas exists but its 2D context may not.
  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  return canvas;
}

/**
 * Asphalt grain, as a roughness map.
 *
 * Roughness rather than colour: tarmac is not a patterned surface, it is an
 * evenly dark one that scatters light unevenly. Painting the variation into
 * roughness makes it catch the sun in patches the way a real road does, and
 * leaves the palette's own colour in charge of what shade the road is.
 */
export function createAsphaltRoughness(): Texture | null {
  const canvas = createCanvas(TEXTURE_SIZE);
  const context = canvas?.getContext('2d') ?? null;
  if (canvas === null || context === null) return null;

  const image = context.createImageData(TEXTURE_SIZE, TEXTURE_SIZE);
  for (let y = 0; y < TEXTURE_SIZE; y += 1) {
    for (let x = 0; x < TEXTURE_SIZE; x += 1) {
      // Two frequencies: coarse patches of wear, fine aggregate on top.
      const coarse = noise(Math.floor(x / 16) * 31 + Math.floor(y / 16) * 71);
      const fine = noise(x * 3.1 + y * 7.7);
      const value = Math.round(150 + coarse * 55 + fine * 45);

      const index = (y * TEXTURE_SIZE + x) * 4;
      image.data[index] = value;
      image.data[index + 1] = value;
      image.data[index + 2] = value;
      image.data[index + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);

  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(ROAD_REPEAT.across, ROAD_REPEAT.along);

  return texture;
}

/**
 * A soft radial gradient, for fake bloom.
 *
 * Real bloom means `@react-three/postprocessing`, which is another 150 kB on
 * top of a `three` chunk already past 850. A handful of additive billboards on
 * the few things that actually glow — coins, crates, the lane cue — gets most
 * of the look for one small texture and no new dependency.
 */
export function createGlowSprite(): Texture | null {
  const canvas = createCanvas(64);
  const context = canvas?.getContext('2d') ?? null;
  if (canvas === null || context === null) return null;

  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.45, 'rgba(255,255,255,0.35)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);

  return new CanvasTexture(canvas);
}
