import { describe, expect, it } from 'vitest';

import { MAP_THEMES } from '../../game-core/models/map';
import {
  ASSET_BASE_PATH,
  ASSET_MANIFEST,
  assetsForTheme,
  assetUrl,
  findAsset,
  requiredAssets,
} from './manifest';

describe('asset manifest', () => {
  it('gives every asset a unique id', () => {
    const ids = ASSET_MANIFEST.map((entry) => entry.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every asset a unique path', () => {
    const paths = ASSET_MANIFEST.map((entry) => entry.path);

    expect(new Set(paths).size).toBe(paths.length);
  });

  it('keeps paths relative so the base path stays the only prefix', () => {
    for (const entry of ASSET_MANIFEST) {
      expect(entry.path.startsWith('/')).toBe(false);
      expect(entry.path).not.toMatch(/^https?:/);
      expect(entry.path).not.toContain('..');
    }
  });

  it('builds urls from the base path', () => {
    const entry = findAsset('mc-sheet');

    expect(entry).toBeDefined();
    expect(entry && assetUrl(entry)).toBe(`${ASSET_BASE_PATH}/characters/mc.png`);
  });

  it('declares three background layers for every theme', () => {
    for (const theme of MAP_THEMES) {
      const backgrounds = assetsForTheme(theme).filter((entry) => entry.themes.includes(theme));

      expect(backgrounds.map((entry) => entry.id).sort()).toEqual(
        [`bg-${theme}-far`, `bg-${theme}-mid`, `bg-${theme}-near`].sort(),
      );
    }
  });

  it('includes the shared character assets in every theme', () => {
    for (const theme of MAP_THEMES) {
      const ids = assetsForTheme(theme).map((entry) => entry.id);

      expect(ids).toContain('mc-sheet');
      expect(ids).toContain('dog-sheet');
      expect(ids).toContain('obstacles');
    }
  });

  it('never returns another theme’s backgrounds', () => {
    const ids = assetsForTheme('downtown').map((entry) => entry.id);

    expect(ids.some((id) => id.startsWith('bg-') && !id.startsWith('bg-downtown'))).toBe(false);
  });

  it('requires nothing yet — the scene is drawn from vector shapes', () => {
    expect(requiredAssets()).toHaveLength(0);
  });

  it('returns undefined for an unknown id rather than throwing', () => {
    expect(findAsset('not-a-real-asset')).toBeUndefined();
  });
});
