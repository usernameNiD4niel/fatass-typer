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

  /* Map 2 — downtown */
  { text: 'taxi', tags: ['downtown'], minimumMap: 2 },
  { text: 'plaza', tags: ['downtown'], minimumMap: 2 },
  { text: 'lobby', tags: ['downtown'], minimumMap: 2 },
  { text: 'revolving', tags: ['downtown'], minimumMap: 3 },
  { text: 'skyline', tags: ['downtown'], minimumMap: 2 },
  { text: 'crosswalk', tags: ['downtown'], minimumMap: 3 },

  /* Map 3 — market district */
  { text: 'stall', tags: ['market-district'], minimumMap: 3 },
  { text: 'crates', tags: ['market-district'], minimumMap: 3 },
  { text: 'awning', tags: ['market-district'], minimumMap: 3 },
  { text: 'produce', tags: ['market-district'], minimumMap: 3 },
  { text: 'haggling', tags: ['market-district'], minimumMap: 4 },
  { text: 'flowers', tags: ['market-district'], minimumMap: 3 },

  /* Map 4 — industrial zone */
  { text: 'pallet', tags: ['industrial-zone'], minimumMap: 4 },
  { text: 'forklift', tags: ['industrial-zone'], minimumMap: 4 },
  { text: 'loading', tags: ['industrial-zone'], minimumMap: 4 },
  { text: 'gantry', tags: ['industrial-zone'], minimumMap: 4 },
  { text: 'girder', tags: ['industrial-zone'], minimumMap: 4 },
  { text: 'chainlink', tags: ['industrial-zone'], minimumMap: 5 },

  /* Map 5 — night highway */
  { text: 'headlamp', tags: ['night-highway'], minimumMap: 5 },
  { text: 'tarmac', tags: ['night-highway'], minimumMap: 5 },
  { text: 'overpass', tags: ['night-highway'], minimumMap: 5 },
  { text: 'reflector', tags: ['night-highway'], minimumMap: 5 },
  { text: 'hard shoulder', tags: ['night-highway'], minimumMap: 5 },
  { text: 'midnight', tags: ['night-highway'], minimumMap: 5 },

  /* Map 6 — final pursuit */
  { text: 'floodlight', tags: ['final-pursuit'], minimumMap: 6 },
  { text: 'last gate', tags: ['final-pursuit'], minimumMap: 6 },
  { text: 'finish line', tags: ['final-pursuit'], minimumMap: 6 },
  { text: 'sirens', tags: ['final-pursuit'], minimumMap: 6 },
  { text: 'no brakes', tags: ['final-pursuit'], minimumMap: 6 },
  { text: 'the last mile', tags: ['final-pursuit'], minimumMap: 6 },

  /* Cross-map chase vocabulary, used by every map that tags 'chase'. */
  { text: 'panting', tags: ['chase'] },
  { text: 'snapping', tags: ['chase'], minimumMap: 2 },
  { text: 'gaining', tags: ['chase'] },
  { text: 'sprint', tags: ['chase'] },
  { text: 'pursuit', tags: ['chase'], minimumMap: 3 },
  { text: 'paws', tags: ['chase'] },

  /* Street vocabulary shared by the early urban maps. */
  { text: 'curb', tags: ['street'] },
  { text: 'gutter', tags: ['street'] },
  { text: 'railing', tags: ['street'], minimumMap: 2 },
  { text: 'bollard', tags: ['street'], minimumMap: 3 },
]);
