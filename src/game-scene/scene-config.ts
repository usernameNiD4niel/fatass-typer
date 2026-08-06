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
  /**
   * The two colours everything vertical is built from.
   *
   * Named for the job rather than for the thing, because the thing changes with
   * the map: these are buildings on the city maps, tree trunks and foliage in
   * the forest, rock in the canyon, and container steel on the docks. See
   * `biome.ts`, which decides what gets built out of them.
   */
  readonly structureA: string;
  readonly structureB: string;
  readonly accent: string;
  /** Light intensity, so a night map is dim without being unreadable. */
  readonly lightIntensity: number;
  /**
   * What the air is doing.
   *
   * Stated rather than inferred from `lightIntensity`, which is what it used to
   * be. Weather dims that number, so an overcast afternoon could tip a map into
   * being drawn as night — and the volcano, which is a daytime map lit through
   * ash, had no way to ask for a sky that was neither.
   */
  readonly skyKind: 'day' | 'night' | 'ash';
}

const PALETTES: Readonly<Record<MapTheme, ScenePalette>> = {
  neighborhood: {
    sky: '#bfe0f5',
    fog: '#cfe6f7',
    ground: '#7fb069',
    road: '#4c5158',
    roadEdge: '#9aa3ad',
    laneMarking: '#f2f4f7',
    structureA: '#8fb8dd',
    structureB: '#a7c9a0',
    accent: '#ffb020',
    lightIntensity: 1.15,
    skyKind: 'day',
  },
  'forest-valley': {
    sky: '#cfe8ef',
    fog: '#d5e9df',
    // Deeper and less yellow than the suburb's lawns: this is undergrowth,
    // not grass, and it has to read as darker than the trees standing on it.
    ground: '#4f7a3f',
    road: '#4a4f52',
    roadEdge: '#8d9a8b',
    laneMarking: '#eef4ea',
    structureA: '#2f6b3c',
    structureB: '#6b5136',
    accent: '#7fd6a2',
    lightIntensity: 1.2,
    skyKind: 'day',
  },
  'desert-canyon': {
    sky: '#f4d9a8',
    fog: '#efd3ac',
    ground: '#d8b483',
    road: '#5a5148',
    roadEdge: '#b8a288',
    laneMarking: '#fff6e4',
    structureA: '#b4653f',
    structureB: '#8d4a2f',
    accent: '#ff9a3d',
    lightIntensity: 1.3,
    skyKind: 'day',
  },
  'harbour-docks': {
    sky: '#b9c6cf',
    fog: '#c0cbd2',
    // Wet concrete rather than grass. The docks are the only map whose ground
    // is the same family as its road, which is what makes it read as a yard.
    ground: '#6e7a80',
    road: '#3f4348',
    roadEdge: '#868d95',
    laneMarking: '#e6e9ed',
    structureA: '#3f6f8d',
    structureB: '#c25a3a',
    accent: '#ffc24a',
    lightIntensity: 0.98,
    skyKind: 'day',
  },
  'night-highway': {
    sky: '#131a2b',
    fog: '#1b2338',
    ground: '#1f2a33',
    road: '#242a31',
    roadEdge: '#4a5462',
    laneMarking: '#e8edf5',
    structureA: '#26314a',
    structureB: '#1a2233',
    accent: '#6ad4ff',
    lightIntensity: 0.55,
    skyKind: 'night',
  },
  'volcano-ridge': {
    sky: '#4a2620',
    fog: '#5a3026',
    /*
     * Lighter than a volcano wants to be, and deliberately.
     *
     * The first pass used near-black rock under a 0.75 sun and the road went
     * with it: lane markings on tarmac nobody could see. The map is lit by what
     * is coming out of the ground, so the ash it is lit *through* has to be pale
     * enough for that to show.
     */
    ground: '#5a4640',
    road: '#3d3733',
    roadEdge: '#7a655c',
    laneMarking: '#ffe9d6',
    structureA: '#3a2f30',
    structureB: '#5e3428',
    accent: '#ff6a2a',
    lightIntensity: 0.95,
    skyKind: 'ash',
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
