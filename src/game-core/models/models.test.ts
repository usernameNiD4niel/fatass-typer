import { describe, expect, it } from 'vitest';
import { isId, isIsoTimestamp } from './ids';
import {
  checkSchema,
  CURRENT_SCHEMA_VERSION,
  isVersioned,
  MINIMUM_SUPPORTED_SCHEMA_VERSION,
} from './schema';
import {
  effectiveCharacterCount,
  hasConsistentNormalization,
  isPromptEntry,
  normalizePromptText,
} from './prompt';
import type { PromptEntry } from './prompt';
import { isMapConfig } from './map';
import type { MapConfig } from './map';
import { coerceSettings, DEFAULT_SETTINGS, isGameSettings } from './settings';
import { emptyRunResult, isRunResult } from './run';
import {
  coercePlayerProfile,
  createPlayerProfile,
  EMPTY_MAP_PROGRESS,
  isMapUnlocked,
  isPlayerProfile,
  lifetimeAccuracy,
  progressFor,
} from './profile';

const NOW = '2026-07-31T09:15:00.000Z';

const PROMPT: PromptEntry = {
  id: 'p-run',
  text: 'Run faster!',
  normalizedText: 'run faster!',
  difficulty: 0.3,
  category: 'short-phrase',
  minimumMap: 1,
  usage: 'both',
  tags: ['neighborhood'],
};

const MAP: MapConfig = {
  id: 'map-1',
  mapNumber: 1,
  name: 'Neighborhood',
  theme: 'neighborhood',
  targetWpm: 20,
  distanceMeters: 600,
  baseSpeedMetersPerSecond: 6,
  timing: { reactionBuffer: 1.7, fixedVisualLeadTimeMs: 600 },
  motion: {
    laneWidthMeters: 3.4,
    laneChangeMs: 480,
    jumpAnticipationMs: 90,
    jumpAirborneMs: 700,
    jumpLandingMs: 150,
    jumpApexMeters: 1.9,
    clearanceMeters: 0.95,
  },
  speed: { maxMetersPerSecond: 7.4, rampPerMinute: 1 },
  boost: { speedMultiplier: 1.4, durationMs: 2000 },
  content: {
    promptCategories: ['short-word', 'medium-word'],
    coinIntervalSeconds: 6,
    coinValue: 5,
    powerupIntervalSeconds: 60,
    flowTolerance: 0.2,
    themeTags: ['neighborhood'],
  },
  unlock: { requiresMapId: null, minimumAccuracy: 0 },
};

describe('ids', () => {
  it('accepts ISO-8601 UTC timestamps', () => {
    expect(isIsoTimestamp(NOW)).toBe(true);
    expect(isIsoTimestamp('2026-07-31T09:15:00Z')).toBe(true);
  });

  it('rejects non-UTC, malformed, and impossible timestamps', () => {
    expect(isIsoTimestamp('2026-07-31 09:15:00')).toBe(false);
    expect(isIsoTimestamp('2026-07-31T09:15:00+02:00')).toBe(false);
    expect(isIsoTimestamp('2026-13-45T99:99:99Z')).toBe(false);
    expect(isIsoTimestamp(Date.parse(NOW))).toBe(false);
  });

  it('rejects empty identifiers', () => {
    expect(isId('map-1')).toBe(true);
    expect(isId('')).toBe(false);
    expect(isId(undefined)).toBe(false);
  });
});

describe('schema versioning', () => {
  it('recognises a current record', () => {
    expect(checkSchema({ schemaVersion: CURRENT_SCHEMA_VERSION })).toBe('current');
  });

  it('flags a record from a newer build without touching it', () => {
    expect(checkSchema({ schemaVersion: CURRENT_SCHEMA_VERSION + 1 })).toBe('too-new');
  });

  it('flags a record older than anything supported', () => {
    expect(checkSchema({ schemaVersion: MINIMUM_SUPPORTED_SCHEMA_VERSION - 1 })).toBe('too-old');
  });

  it('flags data that was never versioned', () => {
    expect(checkSchema({ bestScore: 10 })).toBe('unversioned');
    expect(checkSchema(null)).toBe('unversioned');
    expect(checkSchema('{}')).toBe('unversioned');
  });

  it('rejects a non-integer version', () => {
    expect(isVersioned({ schemaVersion: 1.5 })).toBe(false);
  });
});

describe('prompt content', () => {
  it('normalizes case, edge whitespace, and repeated spaces', () => {
    expect(normalizePromptText('  The  Quick   Brown  ')).toBe('the quick brown');
  });

  it('counts spaces and punctuation toward the character budget', () => {
    // "run faster!" — 11 characters including the space and the exclamation mark.
    expect(effectiveCharacterCount(PROMPT)).toBe(11);
  });

  it('accepts a well-formed prompt', () => {
    expect(isPromptEntry(PROMPT)).toBe(true);
    expect(hasConsistentNormalization(PROMPT)).toBe(true);
  });

  it('catches a stale normalizedText, which would make the prompt uncompletable', () => {
    expect(hasConsistentNormalization({ ...PROMPT, text: 'Run slower!' })).toBe(false);
  });

  it('rejects out-of-range difficulty and unknown categories', () => {
    expect(isPromptEntry({ ...PROMPT, difficulty: 1.4 })).toBe(false);
    expect(isPromptEntry({ ...PROMPT, category: 'haiku' })).toBe(false);
    expect(isPromptEntry({ ...PROMPT, minimumMap: 0 })).toBe(false);
    expect(isPromptEntry({ ...PROMPT, text: '' })).toBe(false);
  });
});

describe('map configuration', () => {
  it('accepts a well-formed map', () => {
    expect(isMapConfig(MAP)).toBe(true);
  });

  it('rejects a reaction buffer below 1, which would make the map unwinnable', () => {
    expect(isMapConfig({ ...MAP, timing: { ...MAP.timing, reactionBuffer: 0.9 } })).toBe(false);
  });

  it('rejects a boost that is not a boost', () => {
    expect(isMapConfig({ ...MAP, boost: { ...MAP.boost, speedMultiplier: 0.8 } })).toBe(false);
  });

  it('rejects an accuracy requirement outside 0..1', () => {
    expect(isMapConfig({ ...MAP, unlock: { requiresMapId: 'map-1', minimumAccuracy: 85 } })).toBe(
      false,
    );
  });

  it('rejects a map with no prompt categories to draw from', () => {
    expect(isMapConfig({ ...MAP, content: { ...MAP.content, promptCategories: [] } })).toBe(false);
  });
});

describe('settings', () => {
  it('ships defaults that pass their own guard', () => {
    expect(isGameSettings(DEFAULT_SETTINGS)).toBe(true);
  });

  it('defaults to case-insensitive comparison, per spec §5', () => {
    expect(DEFAULT_SETTINGS.caseSensitive).toBe(false);
  });

  it('rejects volumes outside 0..1', () => {
    expect(isGameSettings({ ...DEFAULT_SETTINGS, musicVolume: 1.5 })).toBe(false);
  });

  it('keeps every valid field when repairing a partly corrupt object', () => {
    const repaired = coerceSettings({
      ...DEFAULT_SETTINGS,
      theme: 'dark',
      musicVolume: 'loud',
      promptTextSize: 'gigantic',
    });

    expect(repaired.theme).toBe('dark');
    expect(repaired.musicVolume).toBe(DEFAULT_SETTINGS.musicVolume);
    expect(repaired.promptTextSize).toBe(DEFAULT_SETTINGS.promptTextSize);
  });

  it('falls back entirely when given something that is not an object', () => {
    expect(coerceSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(coerceSettings('corrupt')).toEqual(DEFAULT_SETTINGS);
  });
});

describe('run results', () => {
  it('produces an empty result that passes its own guard', () => {
    const result = emptyRunResult('run-1', 'map-1', NOW);

    expect(isRunResult(result)).toBe(true);
    expect(result.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.completed).toBe(false);
    // Nothing typed yet is not the same as everything typed wrong.
    expect(result.accuracy).toBe(1);
  });

  it('rejects impossible ratios and negative counts', () => {
    const result = emptyRunResult('run-1', 'map-1', NOW);

    expect(isRunResult({ ...result, accuracy: 1.2 })).toBe(false);
    expect(isRunResult({ ...result, obstacleSuccessRate: -0.1 })).toBe(false);
    expect(isRunResult({ ...result, correctCharacters: -5 })).toBe(false);
  });

  it('rejects a result with no schema version', () => {
    const { schemaVersion: _dropped, ...unversioned } = emptyRunResult('run-1', 'map-1', NOW);

    expect(isRunResult(unversioned)).toBe(false);
  });
});

describe('player profile', () => {
  it('creates a profile with the first map already unlocked', () => {
    const profile = createPlayerProfile(NOW, 'map-1');

    expect(isPlayerProfile(profile)).toBe(true);
    expect(isMapUnlocked(profile, 'map-1')).toBe(true);
    expect(isMapUnlocked(profile, 'map-2')).toBe(false);
  });

  it('reports empty progress for a map never attempted', () => {
    const profile = createPlayerProfile(NOW, 'map-1');

    expect(progressFor(profile, 'map-4')).toEqual(EMPTY_MAP_PROGRESS);
  });

  it('reports perfect lifetime accuracy before anything is typed', () => {
    expect(lifetimeAccuracy(createPlayerProfile(NOW, 'map-1'))).toBe(1);
  });

  it('computes lifetime accuracy from the counters', () => {
    const profile = {
      ...createPlayerProfile(NOW, 'map-1'),
      lifetimeCharacters: 1000,
      lifetimeCorrectCharacters: 940,
    };

    expect(lifetimeAccuracy(profile)).toBeCloseTo(0.94, 5);
  });

  it('rejects a profile claiming more correct characters than characters typed', () => {
    const profile = {
      ...createPlayerProfile(NOW, 'map-1'),
      lifetimeCharacters: 100,
      lifetimeCorrectCharacters: 200,
    };

    expect(isPlayerProfile(profile)).toBe(false);
  });
});

describe('player profile recovery — spec §17', () => {
  it('keeps unlocked maps and valid progress from a damaged save', () => {
    const damaged = {
      schemaVersion: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: 'not a date',
      sustainablePeakWpm: 32,
      lifetimeCharacters: 500,
      lifetimeCorrectCharacters: 480,
      unlockedMapIds: ['map-1', 'map-2', 42],
      mapProgress: {
        'map-1': { ...EMPTY_MAP_PROGRESS, completed: true, bestScore: 900 },
        'map-2': { completed: 'yes' },
      },
      settings: { ...DEFAULT_SETTINGS, theme: 'dark' },
    };

    const repaired = coercePlayerProfile(damaged, NOW, 'map-1');

    expect(repaired).not.toBeNull();
    expect(isPlayerProfile(repaired)).toBe(true);
    // Earned progress survives.
    expect(repaired?.unlockedMapIds).toEqual(['map-1', 'map-2']);
    expect(repaired?.sustainablePeakWpm).toBe(32);
    expect(repaired?.mapProgress['map-1']?.bestScore).toBe(900);
    expect(repaired?.settings.theme).toBe('dark');
    // Only the unreadable parts are dropped.
    expect(repaired?.mapProgress['map-2']).toBeUndefined();
    expect(repaired?.updatedAt).toBe(NOW);
  });

  it('always leaves the first map playable', () => {
    const repaired = coercePlayerProfile({ unlockedMapIds: [] }, NOW, 'map-1');

    expect(repaired?.unlockedMapIds).toContain('map-1');
  });

  it('clamps contradictory lifetime counters instead of discarding them', () => {
    const repaired = coercePlayerProfile(
      { lifetimeCharacters: 100, lifetimeCorrectCharacters: 5000 },
      NOW,
      'map-1',
    );

    expect(repaired?.lifetimeCharacters).toBe(100);
    expect(repaired?.lifetimeCorrectCharacters).toBe(100);
    expect(isPlayerProfile(repaired)).toBe(true);
  });

  it('gives up only when there is nothing to read', () => {
    expect(coercePlayerProfile(null, NOW, 'map-1')).toBeNull();
    expect(coercePlayerProfile('{"corrupt"', NOW, 'map-1')).toBeNull();
  });

  it('always produces a profile that passes the strict guard', () => {
    const repaired = coercePlayerProfile({}, NOW, 'map-1');

    expect(isPlayerProfile(repaired)).toBe(true);
  });
});
