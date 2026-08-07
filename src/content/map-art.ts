import type { MapTheme } from '../game-core/models';

/**
 * What a map looks like on its card.
 *
 * ## Why this is not the scene's palette
 *
 * `game-scene/scene-config.ts` already holds a palette per theme, and this is
 * deliberately not it. Two reasons, and the second is the real one:
 *
 *  - `screens` may not import `game-scene`. That palette arrives with Three.js
 *    attached, and the menu is the one part of the app that loads before the
 *    canvas does (the whole point of lazy-loading it in step G3).
 *  - They are lit differently. The scene's colours are surface colours handed
 *    to a renderer with a sun, a fog and a tone mapper in front of them; a card
 *    has none of those, so the same hex reads flat and washed out on a dark
 *    menu. These are the *finished* colours — what the map looks like after the
 *    scene has finished lighting it.
 *
 * ## Why the silhouettes are polygons and not pictures
 *
 * Same rule as everything else here: this project ships no remote assets and no
 * binary ones. Four to six points per shape is enough to tell a pine from a
 * crane from a mesa at card size, it scales to any card without a second file,
 * and it costs nothing to load.
 *
 * The coordinate space is a 100 × 60 viewBox with the horizon at y = 60, so a
 * shape's points read as "how tall, how wide, how far along".
 */

/** One silhouette layer, back to front. */
export interface MapArtLayer {
  /** SVG polygon points in a 100 × 60 space, horizon at the bottom. */
  readonly points: string;
  /** Which of the palette's two silhouette colours this layer uses. */
  readonly depth: 'far' | 'near';
}

export interface MapArt {
  /** Sky gradient, top to horizon. */
  readonly skyTop: string;
  readonly skyBottom: string;
  /** Distant silhouette — hazier, lower contrast. */
  readonly far: string;
  /** Near silhouette — the shapes that say what this place is. */
  readonly near: string;
  /** The one bright thing: a sun, a lamp, a lava glow. */
  readonly accent: string;
  readonly layers: readonly MapArtLayer[];
}

/** Blocks of flats, one row behind another. */
const CITY: readonly MapArtLayer[] = [
  { points: '0,60 0,34 10,34 10,26 22,26 22,38 34,38 34,30 44,30 44,60', depth: 'far' },
  { points: '56,60 56,28 66,28 66,18 78,18 78,32 90,32 90,24 100,24 100,60', depth: 'far' },
  { points: '38,60 38,44 50,44 50,36 60,36 60,48 70,48 70,60', depth: 'near' },
];

/** Conifers: a trunk line and a canopy, twice. */
const PINES: readonly MapArtLayer[] = [
  { points: '4,60 16,22 28,60', depth: 'far' },
  { points: '30,60 44,14 58,60', depth: 'far' },
  { points: '60,60 72,30 84,60', depth: 'near' },
  { points: '82,60 92,38 100,60', depth: 'near' },
];

/** Flat-topped mesas, stepped where the harder cap rock sits. */
const MESAS: readonly MapArtLayer[] = [
  { points: '0,60 6,36 30,36 36,60', depth: 'far' },
  { points: '52,60 58,24 84,24 90,60', depth: 'far' },
  { points: '30,60 36,44 56,44 62,60', depth: 'near' },
];

/** Gantry cranes over a container stack. */
const DOCKS: readonly MapArtLayer[] = [
  { points: '10,60 10,18 46,18 46,24 16,24 16,60', depth: 'far' },
  { points: '58,60 58,14 94,14 94,20 64,20 64,60', depth: 'far' },
  { points: '0,60 0,46 24,46 24,52 48,52 48,60', depth: 'near' },
  { points: '66,60 66,48 100,48 100,60', depth: 'near' },
];

/** Towers, tall and thin, the way a motorway sees a city at night. */
const TOWERS: readonly MapArtLayer[] = [
  { points: '6,60 6,20 18,20 18,60', depth: 'far' },
  { points: '26,60 26,10 36,10 36,60', depth: 'far' },
  { points: '48,60 48,26 58,26 58,60', depth: 'far' },
  { points: '68,60 68,16 80,16 80,60', depth: 'near' },
  { points: '86,60 86,32 98,32 98,60', depth: 'near' },
];

/** A ridge with a broken cone on it. */
const VOLCANO: readonly MapArtLayer[] = [
  { points: '0,60 22,30 34,38 48,20 62,40 78,26 100,60', depth: 'far' },
  { points: '30,60 50,22 58,28 64,22 84,60', depth: 'near' },
];

const ART: Readonly<Record<MapTheme, MapArt>> = {
  neighborhood: {
    skyTop: '#4a7fb5',
    skyBottom: '#a8d2ee',
    far: '#2f4f74',
    near: '#1d3550',
    accent: '#ffc861',
    layers: CITY,
  },
  'forest-valley': {
    skyTop: '#2f6f7a',
    skyBottom: '#b6dcc9',
    far: '#255a3a',
    near: '#123524',
    accent: '#8fe6b4',
    layers: PINES,
  },
  'desert-canyon': {
    skyTop: '#c06a3c',
    skyBottom: '#f6d49b',
    far: '#8d4a2f',
    near: '#5b2d1e',
    accent: '#ffb15c',
    layers: MESAS,
  },
  'harbour-docks': {
    skyTop: '#3d5a72',
    skyBottom: '#b6c7d2',
    far: '#2b4557',
    near: '#16262f',
    accent: '#ffc24a',
    layers: DOCKS,
  },
  'night-highway': {
    skyTop: '#0a0f1e',
    skyBottom: '#26365c',
    far: '#141d33',
    near: '#070b16',
    accent: '#6ad4ff',
    layers: TOWERS,
  },
  'volcano-ridge': {
    skyTop: '#2a0f0e',
    skyBottom: '#8a3a22',
    far: '#4a2620',
    near: '#1c1210',
    accent: '#ff6a2a',
    layers: VOLCANO,
  },
};

export function mapArt(theme: MapTheme): MapArt {
  return ART[theme];
}
