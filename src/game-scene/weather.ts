import type { ScenePalette } from './scene-config';

/**
 * What the sky is doing.
 *
 * **Cosmetic, entirely.** Rain does not slow the runner, a storm does not
 * shorten a deadline, and snow does not make a word worth less. The rules never
 * see this file — it changes fog, light and particles and nothing else.
 *
 * That is a deliberate line rather than an unfinished one. Weather that changed
 * the rules would mean a run's difficulty depended on a die roll the player
 * cannot see before they commit, and every map's advertised speed would become
 * a lie on the days it rained.
 *
 * ## Why it exists
 *
 * The same road, six times, is the same road. A run that opens under snow is a
 * different thing to look at from one that opens in sun, and looking different
 * is most of what stops a replay feeling like a repeat.
 */

export const WEATHERS = ['clear', 'rain', 'snow', 'storm'] as const;

export type Weather = (typeof WEATHERS)[number];

export interface WeatherLook {
  readonly kind: Weather;
  /** Particles drawn. Zero for clear skies. */
  readonly particleCount: number;
  /** How fast they fall, in metres per second. */
  readonly fallSpeed: number;
  /** How far they lean, as metres of drift per metre of fall. */
  readonly slant: number;
  /** Particle colour. */
  readonly color: string;
  /** Particle size, in metres. */
  readonly size: number;
  /** Multiplies the sun. Overcast weather is dimmer. */
  readonly lightScale: number;
  /** Multiplies the hemisphere fill, which carries an overcast sky. */
  readonly fillScale: number;
  /** Where the fog starts, as a share of the draw distance. Lower is thicker. */
  readonly fogNear: number;
  /** How grey the sky and fog go, 0..1. */
  readonly haze: number;
}

const LOOKS: Readonly<Record<Weather, WeatherLook>> = {
  clear: {
    kind: 'clear',
    particleCount: 0,
    fallSpeed: 0,
    slant: 0,
    color: '#ffffff',
    size: 0,
    lightScale: 1,
    fillScale: 1,
    fogNear: 0.5,
    haze: 0,
  },
  rain: {
    kind: 'rain',
    particleCount: 900,
    // Fast and hard: rain reads as speed lines, which is why it suits a runner.
    fallSpeed: 34,
    slant: 0.18,
    color: '#b8d4e8',
    size: 0.5,
    lightScale: 0.62,
    fillScale: 1.15,
    fogNear: 0.28,
    haze: 0.55,
  },
  snow: {
    kind: 'snow',
    particleCount: 700,
    // Slow, and it drifts. Snow that fell like rain would read as ash.
    fallSpeed: 4.5,
    slant: 0.5,
    color: '#f4f8ff',
    size: 0.16,
    lightScale: 0.78,
    fillScale: 1.3,
    fogNear: 0.22,
    haze: 0.7,
  },
  storm: {
    kind: 'storm',
    particleCount: 1_400,
    fallSpeed: 46,
    // Nearly sideways. The slant is what says *storm* rather than *heavy rain*.
    slant: 0.62,
    color: '#a9c3d8',
    size: 0.62,
    lightScale: 0.4,
    fillScale: 1.05,
    fogNear: 0.16,
    haze: 0.8,
  },
};

export function weatherLook(kind: Weather): WeatherLook {
  return LOOKS[kind];
}

/**
 * The weather for a run, from its seed.
 *
 * Seeded rather than random so a run stays reproducible: the same seed gives
 * the same road, the same sentence and the same sky.
 *
 * Clear is weighted heaviest. A game where it rains half the time is a game
 * that looks like it rains all the time, and the point of weather here is
 * contrast between runs rather than atmosphere in any one of them.
 */
export function weatherFor(seed: string): Weather {
  const roll = hash(seed) % 100;

  if (roll < 45) return 'clear';
  if (roll < 75) return 'rain';
  if (roll < 92) return 'snow';

  return 'storm';
}

function hash(seed: string): number {
  let value = 2_166_136_261;
  for (let index = 0; index < seed.length; index += 1) {
    value ^= seed.charCodeAt(index);
    value = Math.imul(value, 16_777_619);
  }

  return Math.abs(value);
}

/**
 * A palette with the weather applied.
 *
 * The sky and the fog move toward grey rather than being replaced, so a night
 * map in the rain is still recognisably that night map. Replacing them outright
 * made all six maps look like the same wet afternoon.
 */
export function weatheredPalette(palette: ScenePalette, look: WeatherLook): ScenePalette {
  if (look.haze === 0) return palette;

  return {
    ...palette,
    sky: mix(palette.sky, OVERCAST, look.haze * 0.8),
    fog: mix(palette.fog, OVERCAST, look.haze),
    lightIntensity: palette.lightIntensity * look.lightScale,
  };
}

/** The colour every sky tends toward as the weather closes in. */
const OVERCAST = '#8e99a6';

/** Blends two `#rrggbb` colours. Kept here so the palette stays plain data. */
function mix(from: string, to: string, amount: number): string {
  const share = Math.max(0, Math.min(1, amount));
  const channels = [1, 3, 5].map((offset) => {
    const left = Number.parseInt(from.slice(offset, offset + 2), 16);
    const right = Number.parseInt(to.slice(offset, offset + 2), 16);
    if (Number.isNaN(left) || Number.isNaN(right)) return 0;

    return Math.round(left + (right - left) * share);
  });

  return `#${channels.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}
