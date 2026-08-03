import { isGameSettings } from '../game-core/models';
import { isFiniteNumber, isRecord } from '../game-core/models/guards';
import type { GameCommand } from './messages';

/**
 * Boundary validation (spec §13).
 *
 * Every command is checked before it reaches the runtime, even though both sides
 * are our own TypeScript today. The bridge is the seam a Rust runtime would sit
 * behind, and a seam that trusts its input is not a seam — it is a call with
 * extra steps. Validation here also means a malformed command produces a
 * `fatalError` the UI can show, instead of an exception deep in the game loop.
 *
 * The result carries a reason rather than throwing: an invalid command is a
 * message to report, not a crash.
 */

export type CommandParseResult =
  | { readonly ok: true; readonly command: GameCommand }
  | { readonly ok: false; readonly reason: string };

function invalid(reason: string): CommandParseResult {
  return { ok: false, reason };
}

/**
 * An id must survive trimming.
 *
 * `game-core`'s `isNonEmptyString` accepts `"   "`, which is right for prose but
 * wrong for a lookup key: a whitespace id would sail through the boundary and
 * fail as a missing map deep inside the runtime.
 */
function isUsableId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function parseGameCommand(value: unknown): CommandParseResult {
  if (!isRecord(value)) return invalid('command must be an object');

  const type = value['type'];
  if (typeof type !== 'string') return invalid('command is missing a string "type"');

  switch (type) {
    case 'initialize': {
      if (!isUsableId(value['canvasId'])) return invalid('initialize needs a canvasId');

      return { ok: true, command: { type, canvasId: value['canvasId'] } };
    }

    case 'loadMap': {
      if (!isUsableId(value['mapId'])) return invalid('loadMap needs a mapId');

      return { ok: true, command: { type, mapId: value['mapId'] } };
    }

    case 'submitInput': {
      // An empty string is legitimate — it is what a full backspace looks like.
      if (typeof value['value'] !== 'string') return invalid('submitInput needs a string value');
      if (!isFiniteNumber(value['timestampMs'])) {
        return invalid('submitInput needs a finite timestampMs');
      }

      return {
        ok: true,
        command: { type, value: value['value'], timestampMs: value['timestampMs'] },
      };
    }

    case 'setSettings': {
      if (!isGameSettings(value['settings'])) return invalid('setSettings needs valid settings');

      return { ok: true, command: { type, settings: value['settings'] } };
    }

    case 'startRun':
    case 'pause':
    case 'resume':
    case 'restart':
    case 'destroy':
      return { ok: true, command: { type } };

    default:
      return invalid(`unknown command type "${type}"`);
  }
}

export function isGameCommand(value: unknown): value is GameCommand {
  return parseGameCommand(value).ok;
}
