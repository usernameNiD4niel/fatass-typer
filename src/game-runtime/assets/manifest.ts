import { MAP_THEMES, type MapTheme } from '../../game-core/models/map';

/**
 * Asset manifest (spec §10).
 *
 * Every path the game will ever load is declared here and nowhere else. Nothing
 * in the renderer builds a path by string concatenation — swapping placeholder
 * art for final art means editing this file and dropping files into
 * `public/assets/`, with no code change anywhere else.
 *
 * Today every entry is `optional: true` and nothing ships: the scene is drawn
 * from vector shapes, which spec §10 explicitly permits for the first
 * implementation. The manifest exists now so that art can arrive later without a
 * refactor, and so the loading screen (spec §16) has something to count.
 */

export const ASSET_BASE_PATH = '/assets';

export type AssetKind = 'sprite-sheet' | 'image' | 'audio';

export interface AssetEntry {
  readonly id: string;
  readonly kind: AssetKind;
  /** Path relative to `ASSET_BASE_PATH`. Never absolute, never a URL. */
  readonly path: string;
  /**
   * Optional assets are drawn as vector placeholders when missing. A required
   * asset that fails to load is a hard error — the run cannot be rendered.
   */
  readonly optional: boolean;
  /** Themes this asset belongs to. Empty means it is used by every map. */
  readonly themes: readonly MapTheme[];
}

/**
 * Character and prop art. One sheet per actor keeps the C3 animation state
 * machine pointed at a single file per entity.
 */
const CHARACTER_ASSETS: readonly AssetEntry[] = [
  { id: 'mc-sheet', kind: 'sprite-sheet', path: 'characters/mc.png', optional: true, themes: [] },
  { id: 'dog-sheet', kind: 'sprite-sheet', path: 'characters/dog.png', optional: true, themes: [] },
  {
    id: 'obstacles',
    kind: 'sprite-sheet',
    path: 'props/obstacles.png',
    optional: true,
    themes: [],
  },
];

/**
 * Background art, three depth layers per theme. Generated from the theme list so
 * a seventh map cannot silently ship with two of its three layers declared.
 */
const BACKGROUND_ASSETS: readonly AssetEntry[] = MAP_THEMES.flatMap((theme) =>
  (['far', 'mid', 'near'] as const).map((layer): AssetEntry => ({
    id: `bg-${theme}-${layer}`,
    kind: 'image',
    path: `backgrounds/${theme}/${layer}.png`,
    optional: true,
    themes: [theme],
  })),
);

export const ASSET_MANIFEST: readonly AssetEntry[] = [...CHARACTER_ASSETS, ...BACKGROUND_ASSETS];

/** Full path for an entry. The only place `ASSET_BASE_PATH` is applied. */
export function assetUrl(entry: AssetEntry): string {
  return `${ASSET_BASE_PATH}/${entry.path}`;
}

export function findAsset(id: string): AssetEntry | undefined {
  return ASSET_MANIFEST.find((entry) => entry.id === id);
}

/** Everything a map needs: the shared assets plus its own theme's backgrounds. */
export function assetsForTheme(theme: MapTheme): readonly AssetEntry[] {
  return ASSET_MANIFEST.filter(
    (entry) => entry.themes.length === 0 || entry.themes.includes(theme),
  );
}

export function requiredAssets(): readonly AssetEntry[] {
  return ASSET_MANIFEST.filter((entry) => !entry.optional);
}
