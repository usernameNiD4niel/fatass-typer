import type { PromptCategory, PromptEntry } from '../game-core/models';
import { normalizePromptText } from '../game-core/models';

/**
 * The secret of each map.
 *
 * Every prompt in a run is the next word of one long sentence. Type the whole
 * thing before the finish line and the map gives up what it was about — a short
 * piece of writing, shown on the results screen and kept on the map card
 * afterwards.
 *
 * ## Why the prompts are a sentence and not a word list
 *
 * A random word list is a typing test. A sentence is a *reason* to keep typing:
 * the player is assembling something, they can see how much is left, and the
 * last word of a run means something. It also makes the words themselves fair to
 * read — real prose has rhythm, and rhythm is most of what typing speed is.
 *
 * Nothing here changes the timing model. Each word gets the same budget formula
 * every other prompt gets, derived from its own length, so a two-letter word is
 * quick and a ten-letter word is not. What the sentence changes is *which* word
 * comes next, not what it costs.
 *
 * ## Rules for the text
 *
 * - **No punctuation.** Map 1 deliberately ships no punctuation prompts, and a
 *   sentence spanning every map cannot carry commas on one and not another.
 * - **Lower case**, like every other prompt in the game.
 * - **Ordinary words**, getting longer as the maps do. Spec §15 forbids obscure
 *   vocabulary on the early maps and a sentence is not an excuse to smuggle it in.
 * - **Long enough to last a run.** A run offers forty to seventy encounters, so a
 *   sentence shorter than that would finish in the first minute and the rest of
 *   the run would have nothing to assemble.
 */

export interface MapSecret {
  readonly mapId: string;
  /** What the player types, one word per encounter, in order. */
  readonly sentence: string;
  /** Shown once the sentence is finished. */
  readonly title: string;
  readonly lore: string;
}

export const MAP_SECRETS: readonly MapSecret[] = [
  {
    mapId: 'map-1',
    sentence:
      // Map 1 is the slowest map, so it gets the shortest sentence: a word at
      // 20 WPM takes three times as long to type as the same word at 60, and a
      // secret nobody can finish is a secret nobody reads.
      'the house on our street has a green gate that never rusts and every dog in town waits ' +
      'beside it because the woman who lived there fed them her bread and they are still waiting',
    title: 'The green gate',
    lore: 'Nobody on the street feeds the dogs any more, and nobody has to. They gather at the green gate a little before six every evening, the way they did when Mrs Aliya was still coming home from the bakery with whatever had not sold. The gate has been repainted twice by neighbours who never discussed it.',
  },
  {
    mapId: 'map-2',
    sentence:
      'downtown was built on top of an older downtown and the crossings still follow streets that ' +
      'were paved over before anyone here was born so when the traffic signals fail at midnight ' +
      'the cars drift into the shape of a road nobody has walked in eighty years',
    title: 'The road underneath',
    lore: 'The city archive keeps a survey map from before the rebuild. Overlay it on a modern one and the odd diagonal crossings all line up — every place where drivers cut a corner is a street that used to be there. Traffic engineers have stopped trying to fix them.',
  },
  {
    mapId: 'map-3',
    sentence:
      'the market district keeps a stall that no vendor has ever rented because the awning above it ' +
      'belongs to a family who promised to return and every trader on the row sweeps the empty ' +
      'stones each morning and leaves the pitch open in case somebody finally comes back for it',
    title: 'The open pitch',
    lore: 'Third row, west end, between the spice sellers and the man who repairs umbrellas. The stones are swept, the awning is mended when it tears, and the pitch fee is quietly paid out of the market association fund. Nobody agrees on who the family were. Everybody agrees the pitch stays open.',
  },
  {
    mapId: 'map-4',
    sentence:
      'the industrial zone runs a conveyor that carries nothing at all through the night shift and ' +
      'the engineers keep it powered because the machines around it were calibrated against its ' +
      'vibration decades ago and the entire floor would drift out of tolerance in a single week ' +
      'without that steady empty belt turning',
    title: 'The empty belt',
    lore: 'Line 9 has carried no product since 1998. It costs eleven thousand a year to run. Twice management has scheduled it for decommissioning, and twice the precision shop three hundred metres away began failing tolerance checks within days of the test shutdown. The belt turns.',
  },
  {
    mapId: 'map-5',
    sentence:
      'the night highway has a stretch of eleven kilometres where the streetlights are spaced ' +
      'fractionally closer together than anywhere else in the country and every driver who passes ' +
      'through reports arriving calmer than they started because the rhythm of the light was ' +
      'measured against a resting heartbeat by an engineer who never signed the drawings',
    title: 'The measured stretch',
    lore: 'The spacing appears on no standard. It was submitted as a correction to a lighting schedule in 1974 and approved without comment. Traffic incidents on that stretch run forty percent below the road average. The correction is unsigned, and the department has never found out who made it.',
  },
  {
    mapId: 'map-6',
    sentence:
      'the last stretch of the chase runs past a checkpoint that was abandoned before the ' +
      'motorway opened and the barrier is still raised because the final operator lifted it on ' +
      'their last shift and walked home rather than lower it on anybody again and every runner ' +
      'who reaches this point passes underneath something that was deliberately left open forever',
    title: 'The raised barrier',
    lore: 'The checkpoint booth is empty and the counterweight has long since seized. The barrier points at the sky above the northbound lanes and has done for as long as anyone driving today can remember. It is not maintained. It is simply never lowered, and nobody has ever suggested that it should be.',
  },
];

export function findSecret(mapId: string): MapSecret | undefined {
  return MAP_SECRETS.find((secret) => secret.mapId === mapId);
}

/**
 * Which category a sentence word belongs to.
 *
 * By length, using the same bands the word lists use. The category is not what
 * selects the word — the sentence does that — but the rest of the game reads it
 * for difficulty and for the results breakdown, and a word that lied about its
 * own size would show up there.
 */
function categoryFor(length: number): PromptCategory {
  if (length <= 5) return 'short-word';
  if (length <= 8) return 'medium-word';

  return 'long-word';
}

function difficultyFor(length: number): number {
  return Math.round(Math.min(1, Math.max(0, (length - 2) / 11)) * 100) / 100;
}

/**
 * The sentence as prompts, in order.
 *
 * Ids carry the position rather than the text, because a sentence repeats words
 * — "the" appears eleven times on Map 1 — and the selector's repeat-avoidance
 * and any per-prompt statistics both key on the id.
 */
export function secretPrompts(secret: MapSecret): readonly PromptEntry[] {
  return normalizePromptText(secret.sentence)
    .split(' ')
    .filter((word) => word.length > 0)
    .map((word, index) => ({
      id: `secret:${secret.mapId}:${String(index).padStart(3, '0')}`,
      text: word,
      normalizedText: word,
      difficulty: difficultyFor(word.length),
      category: categoryFor(word.length),
      minimumMap: 1,
      usage: 'both' as const,
      tags: ['secret'],
    }));
}

/** How many words a map's secret asks for. */
export function secretWordCount(secret: MapSecret): number {
  return secretPrompts(secret).length;
}
