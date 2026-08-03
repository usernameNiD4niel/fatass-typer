import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS } from '../game-core/models';
import { isGameCommand, parseGameCommand } from './validate';

describe('parseGameCommand', () => {
  it('accepts the commands that carry no payload', () => {
    for (const type of ['startRun', 'pause', 'resume', 'restart', 'destroy'] as const) {
      const result = parseGameCommand({ type });

      expect(result.ok).toBe(true);
      expect(result.ok && result.command).toEqual({ type });
    }
  });

  it('accepts initialize and loadMap with their ids', () => {
    expect(parseGameCommand({ type: 'initialize', canvasId: 'game-canvas' })).toEqual({
      ok: true,
      command: { type: 'initialize', canvasId: 'game-canvas' },
    });
    expect(parseGameCommand({ type: 'loadMap', mapId: 'map-1' }).ok).toBe(true);
  });

  it('rejects an empty id rather than passing it through', () => {
    expect(parseGameCommand({ type: 'initialize', canvasId: '' }).ok).toBe(false);
    expect(parseGameCommand({ type: 'loadMap', mapId: '   ' }).ok).toBe(false);
  });

  it('accepts an empty submitInput value — that is what a full backspace sends', () => {
    const result = parseGameCommand({ type: 'submitInput', value: '', timestampMs: 0 });

    expect(result.ok).toBe(true);
  });

  it('rejects a submitInput without a usable timestamp', () => {
    expect(parseGameCommand({ type: 'submitInput', value: 'a' }).ok).toBe(false);
    expect(parseGameCommand({ type: 'submitInput', value: 'a', timestampMs: Number.NaN }).ok).toBe(
      false,
    );
    expect(parseGameCommand({ type: 'submitInput', value: 'a', timestampMs: '12' }).ok).toBe(false);
  });

  it('rejects a non-string submitInput value', () => {
    expect(parseGameCommand({ type: 'submitInput', value: 42, timestampMs: 1 }).ok).toBe(false);
  });

  it('validates settings rather than trusting the shape', () => {
    expect(parseGameCommand({ type: 'setSettings', settings: DEFAULT_SETTINGS }).ok).toBe(true);
    expect(parseGameCommand({ type: 'setSettings', settings: { theme: 'light' } }).ok).toBe(false);
    expect(parseGameCommand({ type: 'setSettings' }).ok).toBe(false);
  });

  it('rejects anything that is not a command object', () => {
    for (const value of [null, undefined, 'startRun', 42, [], () => undefined]) {
      expect(parseGameCommand(value).ok).toBe(false);
    }
  });

  it('rejects an unknown command type and says which', () => {
    const result = parseGameCommand({ type: 'selfDestruct' });

    expect(result.ok).toBe(false);
    expect(result.ok || result.reason).toContain('selfDestruct');
  });

  it('gives a reason for every rejection', () => {
    const result = parseGameCommand({ type: 'loadMap' });

    expect(result.ok).toBe(false);
    expect(result.ok || result.reason.length).toBeGreaterThan(0);
  });

  it('drops extra properties instead of forwarding them', () => {
    const result = parseGameCommand({ type: 'loadMap', mapId: 'map-2', evil: true });

    expect(result.ok && result.command).toEqual({ type: 'loadMap', mapId: 'map-2' });
  });

  it('exposes a boolean guard for callers that only need yes or no', () => {
    expect(isGameCommand({ type: 'pause' })).toBe(true);
    expect(isGameCommand({ type: 'pause', extra: 1 })).toBe(true);
    expect(isGameCommand({})).toBe(false);
  });
});
