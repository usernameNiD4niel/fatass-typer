import { MAP_THEMES, type MapTheme } from '../../game-core/models/map';

/**
 * Placeholder theme palettes (spec §10).
 *
 * Original vector art, not sprites — the first implementation is explicitly
 * allowed to be simple shapes, and shapes need colours. These are *scene*
 * colours only. UI colour lives in `styles/tokens.css` and never leaks in here;
 * the canvas is not themed by the light/dark setting, it is themed by the map.
 *
 * Replacing this with real art means swapping the draw calls, not this file's
 * shape — the manifest already reserves the asset paths.
 */

export interface ScenePalette {
  readonly skyTop: string;
  readonly skyBand: string;
  readonly far: string;
  readonly mid: string;
  readonly near: string;
  readonly ground: string;
  readonly groundEdge: string;
  readonly groundMarking: string;
  /** Highlight for the finish line and other landmarks. */
  readonly accent: string;
}

const PALETTES: Readonly<Record<MapTheme, ScenePalette>> = {
  neighborhood: {
    skyTop: '#bfe3ff',
    skyBand: '#d7eeff',
    far: '#9ec5e8',
    mid: '#7fae86',
    near: '#5c8f68',
    ground: '#6b6f76',
    groundEdge: '#4c5057',
    groundMarking: '#d8dce2',
    accent: '#ffcf5c',
  },
  downtown: {
    skyTop: '#a9c7ea',
    skyBand: '#c8dcf4',
    far: '#8296b4',
    mid: '#5f7191',
    near: '#414d67',
    ground: '#5a5f68',
    groundEdge: '#3d424a',
    groundMarking: '#e2e6ec',
    accent: '#ff9f5c',
  },
  'market-district': {
    skyTop: '#ffd9a8',
    skyBand: '#ffe9cd',
    far: '#e0a377',
    mid: '#c47a5a',
    near: '#95503c',
    ground: '#7a5b48',
    groundEdge: '#553f32',
    groundMarking: '#f2ddc4',
    accent: '#ff6b6b',
  },
  'industrial-zone': {
    skyTop: '#c2c6c9',
    skyBand: '#d9dcdf',
    far: '#9aa0a5',
    mid: '#75797f',
    near: '#54585d',
    ground: '#4a4d52',
    groundEdge: '#313438',
    groundMarking: '#c9ad4a',
    accent: '#ffb020',
  },
  'night-highway': {
    skyTop: '#101a33',
    skyBand: '#1b2a4d',
    far: '#26375f',
    mid: '#2f3f6b',
    near: '#1d2743',
    ground: '#23262e',
    groundEdge: '#14161b',
    groundMarking: '#f0f3f8',
    accent: '#5cd9ff',
  },
  'final-pursuit': {
    skyTop: '#2a1030',
    skyBand: '#4a1a3c',
    far: '#6b2440',
    mid: '#8a2f3e',
    near: '#4d1c2c',
    ground: '#2b2028',
    groundEdge: '#181117',
    groundMarking: '#ffd8e0',
    accent: '#ff4d6d',
  },
};

/** Map 1's palette. The fallback while no map is loaded — never a blank canvas. */
export const DEFAULT_SCENE_PALETTE: ScenePalette = PALETTES.neighborhood;

export function scenePalette(theme: MapTheme): ScenePalette {
  return PALETTES[theme];
}

export function allScenePalettes(): readonly (readonly [MapTheme, ScenePalette])[] {
  return MAP_THEMES.map((theme) => [theme, PALETTES[theme]] as const);
}
