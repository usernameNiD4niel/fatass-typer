import type { PromptEntry } from '../../game-core/models';
import { buildPrompts } from './build';

/**
 * Map-themed vocabulary (spec §15).
 *
 * Tagged with the map theme it belongs to. The selector *prefers* these when a
 * map lists matching `themeTags` but never requires them — a themed pool small
 * enough to run dry would otherwise repeat itself into nonsense.
 *
 * Each word has to earn its place twice: it must fit the theme, and it must
 * still be a word an ordinary typist recognises instantly.
 */
export const THEMED_WORDS: readonly PromptEntry[] = buildPrompts('themed', [
  /* Map 1 — neighborhood */
  { text: 'hedge', tags: ['neighborhood'] },
  { text: 'porch', tags: ['neighborhood'] },
  { text: 'driveway', tags: ['neighborhood'] },
  { text: 'mailbox', tags: ['neighborhood'] },
  { text: 'sprinkler', tags: ['neighborhood'], minimumMap: 2 },
  { text: 'garden gate', tags: ['neighborhood'], minimumMap: 2 },

  /* Map 2 — forest valley */
  { text: 'pine', tags: ['forest-valley'], minimumMap: 2 },
  { text: 'creek', tags: ['forest-valley'], minimumMap: 2 },
  { text: 'thicket', tags: ['forest-valley'], minimumMap: 3 },
  { text: 'waterfall', tags: ['forest-valley'], minimumMap: 3 },
  { text: 'antlers', tags: ['forest-valley'], minimumMap: 2 },
  { text: 'clearing', tags: ['forest-valley'], minimumMap: 3 },

  /* Map 3 — desert canyon */
  { text: 'dune', tags: ['desert-canyon'], minimumMap: 3 },
  { text: 'mesa', tags: ['desert-canyon'], minimumMap: 3 },
  { text: 'cactus', tags: ['desert-canyon'], minimumMap: 3 },
  { text: 'canyon', tags: ['desert-canyon'], minimumMap: 3 },
  { text: 'sandstone', tags: ['desert-canyon'], minimumMap: 4 },
  { text: 'dry heat', tags: ['desert-canyon'], minimumMap: 3 },

  /* Map 4 — harbour docks */
  { text: 'pallet', tags: ['harbour-docks'], minimumMap: 4 },
  { text: 'forklift', tags: ['harbour-docks'], minimumMap: 4 },
  { text: 'loading', tags: ['harbour-docks'], minimumMap: 4 },
  { text: 'gantry', tags: ['harbour-docks'], minimumMap: 4 },
  { text: 'container', tags: ['harbour-docks'], minimumMap: 4 },
  { text: 'harbour wall', tags: ['harbour-docks'], minimumMap: 5 },

  /* Map 5 — night highway */
  { text: 'headlamp', tags: ['night-highway'], minimumMap: 5 },
  { text: 'tarmac', tags: ['night-highway'], minimumMap: 5 },
  { text: 'overpass', tags: ['night-highway'], minimumMap: 5 },
  { text: 'reflector', tags: ['night-highway'], minimumMap: 5 },
  { text: 'hard shoulder', tags: ['night-highway'], minimumMap: 5 },
  { text: 'midnight', tags: ['night-highway'], minimumMap: 5 },

  /* Map 6 — volcano ridge */
  { text: 'ember', tags: ['volcano-ridge'], minimumMap: 6 },
  { text: 'ash cloud', tags: ['volcano-ridge'], minimumMap: 6 },
  { text: 'finish line', tags: ['volcano-ridge'], minimumMap: 6 },
  { text: 'obsidian', tags: ['volcano-ridge'], minimumMap: 6 },
  { text: 'no brakes', tags: ['volcano-ridge'], minimumMap: 6 },
  { text: 'the last mile', tags: ['volcano-ridge'], minimumMap: 6 },

  /* Cross-map chase vocabulary, used by every map that tags 'chase'. */
  { text: 'panting', tags: ['chase'] },
  { text: 'snapping', tags: ['chase'], minimumMap: 2 },
  { text: 'gaining', tags: ['chase'] },
  { text: 'sprint', tags: ['chase'] },
  { text: 'pursuit', tags: ['chase'], minimumMap: 3 },
  { text: 'paws', tags: ['chase'] },

  /*
   * Open-country vocabulary shared by the two maps with no buildings on them.
   * Maps 2 and 3 tag `trail` where the urban maps tag `street`; without a pool
   * of its own, a forest would be handing the player kerbs and bollards.
   */
  { text: 'ridge', tags: ['trail'], minimumMap: 2 },
  { text: 'roadside', tags: ['trail'], minimumMap: 2 },
  { text: 'switchback', tags: ['trail'], minimumMap: 4 },
  { text: 'open road', tags: ['trail'], minimumMap: 3 },

  /* Street vocabulary shared by the early urban maps. */
  { text: 'curb', tags: ['street'] },
  { text: 'gutter', tags: ['street'] },
  { text: 'railing', tags: ['street'], minimumMap: 2 },
  { text: 'bollard', tags: ['street'], minimumMap: 3 },
]);
