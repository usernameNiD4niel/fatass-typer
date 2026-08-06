import type { MapTheme } from '../game-core/models';

/**
 * Everything the scene needs to know that is not in the snapshot.
 *
 * Geometry constants and palettes only — no rules. If a number here changed the
 * outcome of a run it would belong in `content/`, not in the renderer.
 */

/** Metres between lane centres. Mirrors `content/road.ts`, and must match it. */
export const LANE_WIDTH_METERS = 3.4;

/** Half-width of the drivable surface, in metres. */
export const ROAD_HALF_WIDTH = (LANE_WIDTH_METERS * 3) / 2;

/** How far ahead the camera can see. Fog hides the recycling seam beyond it. */
export const DRAW_DISTANCE_METERS = 190;

/**
 * The carriageways either side of the player's road.
 *
 * Shared, because two files have to agree on them: `Road` draws the surface and
 * `AmbientTraffic` puts vehicles on it. Held apart, the traffic ends up driving
 * on the grass beside its own road.
 */
export const CARRIAGEWAY_CENTRE = ROAD_HALF_WIDTH + 5.1;
export const CARRIAGEWAY_WIDTH = 7;

/** Roadside scenery slots per side. Recycled the same way segments are. */
export const SCENERY_PER_SIDE = 14;
export const SCENERY_SPACING_METERS = 14;

/** Camera, in metres relative to the player. */
export const CAMERA_HEIGHT_METERS = 3.4;
export const CAMERA_BEHIND_METERS = 7.6;
/** Where the camera looks, ahead of the player. Keeps hazards in frame early. */
export const CAMERA_TARGET_AHEAD_METERS = 14;
export const BASE_FOV_DEGREES = 62;

/** The player, in metres. */
export const PLAYER_HEIGHT_METERS = 1.75;

export interface ScenePalette {
  readonly sky: string;
  readonly fog: string;
  readonly ground: string;
  readonly road: string;
  readonly roadEdge: string;
  readonly laneMarking: string;
  readonly buildingA: string;
  readonly buildingB: string;
  readonly accent: string;
  /** Light intensity, so a night map is dim without being unreadable. */
  readonly lightIntensity: number;
}

const PALETTES: Readonly<Record<MapTheme, ScenePalette>> = {
  neighborhood: {
    sky: '#bfe0f5',
    fog: '#cfe6f7',
    ground: '#7fb069',
    road: '#4c5158',
    roadEdge: '#9aa3ad',
    laneMarking: '#f2f4f7',
    buildingA: '#8fb8dd',
    buildingB: '#a7c9a0',
    accent: '#ffb020',
    lightIntensity: 1.15,
  },
  downtown: {
    sky: '#a9cbe8',
    fog: '#bcd6ec',
    ground: '#6f8f7a',
    road: '#464b52',
    roadEdge: '#8f98a2',
    laneMarking: '#f2f4f7',
    buildingA: '#7fa6cc',
    buildingB: '#b3bfcb',
    accent: '#4aa3ff',
    lightIntensity: 1.1,
  },
  'market-district': {
    sky: '#f2d9b0',
    fog: '#eed7bb',
    ground: '#93a86a',
    road: '#514c47',
    roadEdge: '#a89b8b',
    laneMarking: '#fff4e2',
    buildingA: '#dfa46b',
    buildingB: '#c98c62',
    accent: '#ff8a3d',
    lightIntensity: 1.2,
  },
  'industrial-zone': {
    sky: '#b9bec4',
    fog: '#c3c7cc',
    ground: '#7e8377',
    road: '#3f4348',
    roadEdge: '#868d95',
    laneMarking: '#e6e9ed',
    buildingA: '#8d949c',
    buildingB: '#6f767e',
    accent: '#ffc24a',
    lightIntensity: 0.95,
  },
  'night-highway': {
    sky: '#131a2b',
    fog: '#1b2338',
    ground: '#1f2a33',
    road: '#242a31',
    roadEdge: '#4a5462',
    laneMarking: '#e8edf5',
    buildingA: '#26314a',
    buildingB: '#1a2233',
    accent: '#6ad4ff',
    lightIntensity: 0.55,
  },
  'final-pursuit': {
    sky: '#2a1626',
    fog: '#39203a',
    ground: '#2c2130',
    road: '#2a2530',
    roadEdge: '#5b4a63',
    laneMarking: '#f4e8ff',
    buildingA: '#42294d',
    buildingB: '#301c3a',
    accent: '#ff5f7e',
    lightIntensity: 0.7,
  },
};

export const DEFAULT_SCENE_PALETTE: ScenePalette = PALETTES.neighborhood;

export function scenePalette(theme: MapTheme): ScenePalette {
  return PALETTES[theme];
}

/**
 * How brightly the lit windows burn, for a given palette.
 *
 * Zero in daylight, and that is the point rather than an economy. Windows lit at
 * midday is the classic tell of an emissive map applied without asking what time
 * it is — the city reads as being at night while the sky says otherwise. They
 * come up as the map gets darker, and on the night maps they carry it.
 */
export function windowGlow(palette: ScenePalette): number {
  return Math.max(0, Math.min(0.9, 1.05 - palette.lightIntensity));
}

/**
 * What the runner is wearing.
 *
 * Re-exported from `game-core/wardrobe`, which owns the shape: the scene may
 * not read the profile or the catalogue, so the look is resolved elsewhere and
 * handed over as colours.
 */
export type { RunnerLook } from '../game-core/wardrobe';

/** Lateral position of a lane centre, in metres. Accepts a fractional lane. */
export function laneCenterX(lane: number): number {
  return (lane - 1) * LANE_WIDTH_METERS;
}

/**
 * A stable pseudo-random value for a scenery slot.
 *
 * Deliberately not the seeded RNG from `game-core`: nothing here affects the
 * outcome of a run, and scenery that changed with the game seed would make two
 * runs of the same map look unrelated for no reason.
 */
export function noise(seed: number): number {
  const value = Math.sin(seed * 91.7) * 43758.5453;

  return value - Math.floor(value);
}
