import type { MapTheme } from '../game-core/models';

/**
 * What a map is made of.
 *
 * ## Why this exists
 *
 * Every map used to be the same map in a different colour. The palette changed
 * the sky and the tarmac, and then the scene drew the identical row of boxes
 * down each side and the identical cars beside it — so map 2 was map 1 in blue
 * and map 6 was map 1 in purple. Colour is not a setting; a forest is not a
 * city with green buildings.
 *
 * A biome says what the *shapes* are: what stands beside the road, what moves
 * on the outer tracks, and what large thing the map has that no other map has.
 *
 * ## Still only drawing
 *
 * Nothing here reaches the rules. A deer on map 2 and a lorry on map 4 are the
 * same zero metres of anything the player can touch, and the scenery pools are
 * the same fixed size on every map — see `scene-pools.test.ts`, which asserts
 * exactly that so a richer biome can never become a slower one.
 *
 * The colours come from `ScenePalette` by name rather than as literals, so the
 * weather can still tint a map without this file knowing weather exists.
 */

/** Which palette colour a part is painted in. */
export type PartColor = 'structureA' | 'structureB' | 'accent' | 'ground';

/** Primitive shapes a piece of scenery can be built from. */
export type PartShape = 'box' | 'cylinder' | 'cone' | 'sphere';

/**
 * One piece of a scenery slot.
 *
 * A slot is given a width and a height; each part scales itself against those
 * rather than carrying absolute metres, so a tall slot is a tall tree rather
 * than a short tree with a long trunk.
 */
export interface SceneryPart {
  readonly shape: PartShape;
  readonly color: PartColor;
  /** Multiplies the slot's width. */
  readonly width: number;
  /** Multiplies the slot's height. */
  readonly height: number;
  /** Centre height, as a share of the slot's height. */
  readonly base: number;
  /** Sideways offset, as a share of the slot's width. Breaks up stacks. */
  readonly offset: number;
  readonly roughness: number;
  readonly metalness: number;
  /**
   * Windows, and a third of them lit. Only true for parts that are buildings —
   * a lit window on a pine tree is the kind of detail that survives review and
   * then ruins a screenshot.
   */
  readonly facade: boolean;
  /** Glows in its own colour. For lava and for lit signage. */
  readonly emissive: number;
}

/** What moves along the outer tracks. */
export type TravellerKind = 'car' | 'lorry' | 'boulder' | 'deer' | 'boar' | 'camel' | 'ostrich';

/** The one large thing a map has that no other map has. */
export type LandmarkKind = 'none' | 'waterfall' | 'mesa' | 'crane' | 'lava';

export interface Biome {
  readonly scenery: readonly SceneryPart[];
  /** Slot height in metres: minimum, then how much it can vary. */
  readonly heightMeters: readonly [number, number];
  /** Slot width in metres: minimum, then how much it can vary. */
  readonly widthMeters: readonly [number, number];
  /** How far back from the carriageway the scenery starts, in metres. */
  readonly insetMeters: number;
  /**
   * What moves out there, alternating by slot.
   *
   * A list rather than one kind: a valley with nothing in it but deer reads as
   * a deer enclosure, and the second species costs one more branch in a switch.
   */
  readonly travellers: readonly TravellerKind[];
  readonly landmark: LandmarkKind;
  /**
   * Reflector posts and overhead gantries.
   *
   * False off the tarmac maps. A motorway gantry over a canyon track reads as a
   * copy-paste, and it is one.
   */
  readonly roadFurniture: boolean;
}

/** A city block: one box, windowed. What every map used to be. */
const BUILDING: SceneryPart = {
  shape: 'box',
  color: 'structureA',
  width: 1,
  height: 1,
  base: 0.5,
  offset: 0,
  roughness: 0.8,
  metalness: 0.05,
  facade: true,
  emissive: 0,
};

const BIOMES: Readonly<Record<MapTheme, Biome>> = {
  neighborhood: {
    scenery: [BUILDING],
    heightMeters: [4, 16],
    widthMeters: [3, 5],
    insetMeters: 4,
    travellers: ['car'],
    landmark: 'none',
    roadFurniture: true,
  },

  /*
   * Trunk and canopy, in two parts, because a tree drawn as one shape is a
   * cone standing on the ground and reads as a bush however tall you make it.
   * The gap between the ground and the foliage is the whole silhouette.
   */
  'forest-valley': {
    scenery: [
      {
        shape: 'cylinder',
        color: 'structureB',
        width: 0.14,
        height: 0.55,
        base: 0.275,
        offset: 0,
        roughness: 0.95,
        metalness: 0,
        facade: false,
        emissive: 0,
      },
      {
        shape: 'cone',
        color: 'structureA',
        width: 1,
        height: 0.75,
        base: 0.72,
        offset: 0,
        roughness: 0.9,
        metalness: 0,
        facade: false,
        emissive: 0,
      },
    ],
    heightMeters: [9, 12],
    widthMeters: [3.4, 2.6],
    insetMeters: 2,
    travellers: ['deer', 'boar'],
    landmark: 'waterfall',
    roadFurniture: false,
  },

  /*
   * A slab with a harder cap on it. Real mesas are layered, and one flat colour
   * from base to top looks like a crate however you scale it.
   */
  'desert-canyon': {
    scenery: [
      {
        shape: 'box',
        color: 'structureA',
        width: 1,
        height: 0.82,
        base: 0.41,
        offset: 0,
        roughness: 1,
        metalness: 0,
        facade: false,
        emissive: 0,
      },
      {
        shape: 'box',
        color: 'structureB',
        width: 1.12,
        height: 0.2,
        base: 0.9,
        offset: 0,
        roughness: 1,
        metalness: 0,
        facade: false,
        emissive: 0,
      },
    ],
    heightMeters: [5, 14],
    widthMeters: [6, 9],
    insetMeters: 3,
    travellers: ['camel', 'ostrich'],
    landmark: 'mesa',
    roadFurniture: false,
  },

  /*
   * Two containers, the upper one set back. Stacked dead flush they read as one
   * tall box; the offset is what makes the stack legible from the road.
   */
  'harbour-docks': {
    scenery: [
      {
        shape: 'box',
        color: 'structureA',
        width: 1,
        height: 0.45,
        base: 0.225,
        offset: 0,
        roughness: 0.55,
        metalness: 0.35,
        facade: false,
        emissive: 0,
      },
      {
        shape: 'box',
        color: 'structureB',
        width: 0.92,
        height: 0.42,
        base: 0.66,
        offset: 0.12,
        roughness: 0.55,
        metalness: 0.35,
        facade: false,
        emissive: 0,
      },
    ],
    heightMeters: [4, 7],
    widthMeters: [5, 4],
    insetMeters: 1.5,
    travellers: ['lorry', 'car'],
    landmark: 'crane',
    roadFurniture: true,
  },

  'night-highway': {
    scenery: [BUILDING],
    heightMeters: [5, 20],
    widthMeters: [4, 6],
    insetMeters: 5,
    travellers: ['car'],
    landmark: 'none',
    roadFurniture: true,
  },

  /*
   * A spire with a lit collar at its foot. The collar is the only emissive
   * scenery in the game: it is what stops the map reading as a night map that
   * forgot its streetlights.
   */
  'volcano-ridge': {
    scenery: [
      {
        shape: 'cone',
        color: 'structureA',
        width: 1,
        height: 1,
        base: 0.5,
        offset: 0,
        roughness: 0.65,
        metalness: 0.2,
        facade: false,
        emissive: 0,
      },
      {
        shape: 'cylinder',
        color: 'accent',
        width: 1.25,
        height: 0.06,
        base: 0.03,
        offset: 0,
        roughness: 0.4,
        metalness: 0,
        facade: false,
        emissive: 1.4,
      },
    ],
    heightMeters: [6, 15],
    widthMeters: [4, 6],
    insetMeters: 2.5,
    travellers: ['boulder'],
    landmark: 'lava',
    roadFurniture: false,
  },
};

export function biomeFor(theme: MapTheme): Biome {
  return BIOMES[theme];
}

/**
 * The most parts any biome uses.
 *
 * The scenery pool is allocated for this rather than for the current map, so
 * switching maps never allocates and every map costs what the heaviest one
 * costs. Fixed pools are the rule the whole scene is built on.
 */
export const MAX_SCENERY_PARTS = 2;
