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
      'the road through this valley bends around an old pine that the surveyors were told ' +
      'to cut and did not and every crew sent since has found some reason to leave it standing ' +
      'so the whole road is shaped around one tree that nobody will ever admit to saving',
    title: 'The tree in the road',
    lore: 'It is on the original survey as a hazard to be removed. Four resurfacing contracts have widened the bend rather than touched it. The most recent engineer wrote that the curve improves sightlines, which is true, and which nobody believes was the reason.',
  },
  {
    mapId: 'map-3',
    sentence:
      'there is a water tank at the mouth of this canyon that nobody owns and nobody empties and ' +
      'every driver who passes tops it up from whatever they are carrying because the last person ' +
      'who let it run dry was found four days later walking north with no shoes on',
    title: 'The tank at the mouth',
    lore: 'It holds about six hundred litres and it has never been recorded empty. There is no sign, no plaque and no rota. Drivers who have used the road twice already know to stop, and none of them can say who told them.',
  },
  {
    mapId: 'map-4',
    sentence:
      'the harbour keeps one crane running empty through every night shift because the machines ' +
      'along the quay were calibrated against its vibration decades ago and the whole line would ' +
      'drift out of tolerance in a single week without that steady swing over the water',
    title: 'The empty crane',
    lore: 'Crane 9 has lifted nothing since 1998. It costs eleven thousand a year to run. Twice the port has scheduled it for scrap, and twice the container scales three hundred metres away began failing checks within days of the test shutdown. The crane swings.',
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
      'the last stretch of this road runs past a warning post that was abandoned before the ' +
      'mountain was ever declared safe and the barrier is still raised because the final keeper ' +
      'lifted it on their last shift and walked down rather than close the road on anybody again ' +
      'and every runner who reaches this point passes something deliberately left open forever',
    title: 'The raised barrier',
    lore: 'The keeper hut is empty and the counterweight has long since seized. The barrier points at the sky above the ridge road and has done for as long as anyone still climbing can remember. It is not maintained. It is simply never lowered, and nobody has ever suggested that it should be.',
  },
  {
    mapId: 'map-1',
    sentence:
      'there is a bench at the top of our street that nobody sits on because the boy who painted ' +
      'it left town the same week and the paint has kept its colour through eleven winters since',
    title: 'The painted bench',
    lore: 'It was council green when he started and it has been the wrong shade of blue ever since. The council have replaced four benches on that street in the same period. This one they touch up.',
  },
  {
    mapId: 'map-1',
    sentence:
      'the corner shop keeps a shelf of things that were paid for and never collected and the ' +
      'owner will not clear it because every year somebody comes back for one of them and cries',
    title: 'The shelf at the back',
    lore: 'Fourteen items at the last count. A radio, a pair of boots, a birthday cake tin, a wedding album. He keeps a note of who paid, and he has never once charged twice.',
  },
  {
    mapId: 'map-2',
    sentence:
      'the deer in this valley cross the road at the same four places every single evening and ' +
      'those places are exactly where the old cart track ran long before the tarmac on it was ever laid',
    title: 'The old crossing',
    lore: 'The cart track was abandoned in the twenties and is invisible from the ground. It shows up clearly in aerial photographs, and so do the four crossings, which the herd has kept without ever having seen the track.',
  },
  {
    mapId: 'map-2',
    sentence:
      'the tallest waterfall on this ridge runs loudest in the dry months and quietest after rain ' +
      'and three separate surveys have measured it and none of them has offered any reason why ' +
      'the water behaves in a way that every hydrologist agrees it should not',
    title: 'The loud dry season',
    lore: 'The flow is ordinary. The sound is not. The current theory involves a cavity behind the fall that fills in wet weather and damps it, which explains the noise and explains nothing about why it was never found.',
  },
  {
    mapId: 'map-3',
    sentence:
      'the camel train that crosses this road at dusk has walked the same line for four generations ' +
      'and the drivers say the animals will correct them whenever they try to take a shorter way across the flat',
    title: 'The line they keep',
    lore: 'The route is longer than the direct crossing by about two kilometres. It also avoids every soft patch of sand on the flat, which the drivers know and which the herd appears to know better.',
  },
  {
    mapId: 'map-3',
    sentence:
      'the mesa at the far end of the canyon throws a shadow that reaches the road at the same ' +
      'minute every year and the marker somebody cut into the rock to record it is older than ' +
      'every road and every map and every name this place has been given since',
    title: 'The shadow marker',
    lore: 'A groove about a metre long, cut where the shadow edge lands on the fourth of August. It is accurate. Nothing else at the site has been dated, and the groove has been recut at least twice by hands nobody can account for.',
  },
  {
    mapId: 'map-4',
    sentence:
      'the night watchman on the east quay has walked the same route for twenty two years and the ' +
      'path he takes across the dock has worn a line through the concrete that the rain follows',
    title: 'The worn line',
    lore: 'Maintenance resurfaced the quay in 2011 and the line came back within a year. It runs from the gatehouse to the far shed, turns twice for no reason anybody can see, and drains better than the channels that were designed for it.',
  },
  {
    mapId: 'map-4',
    sentence:
      'nobody has found the switch that turns off the last row of lamps at the end of the old pier ' +
      'so this harbour has not been fully dark for as long as the port authority has owned it',
    title: 'The last row',
    lore: 'Four lamps, on their own circuit, fed from somewhere not on the drawings. An electrician traced the cable as far as a wall that was built across it. The estimate to go further was refused twice, and now nobody wants to.',
  },
  {
    mapId: 'map-5',
    sentence:
      'the service station at the halfway point keeps one table by the window permanently laid for ' +
      'a driver who stopped there every night for nine years and then one winter simply did not ' +
      'arrive and nobody working there now has ever met the man they are keeping it for',
    title: 'The laid table',
    lore: 'Staff who never met him keep it up because the ones who trained them did. There is no plaque and no photograph. New managers have twice asked about the table and twice been told, and neither of them raised it again.',
  },
  {
    mapId: 'map-5',
    sentence:
      'there is a stretch of the northbound carriageway where every radio station fades out at the ' +
      'same marker post and comes back exactly nine seconds later whatever the weather is doing ' +
      'and whatever season it happens to be when you drive through it',
    title: 'The nine seconds',
    lore: 'Surveyors have blamed the cutting, the pylons, and the underlying rock. Drivers who use the road nightly stop talking a little before it, out of habit, and start again afterwards without ever having agreed to.',
  },
  {
    mapId: 'map-6',
    sentence:
      'the runners who finish this ridge all say the last kilometre felt shorter than the first one ' +
      'did and the timing boards have never once agreed with a single one of them about it and ' +
      'the organisers long ago stopped trying to talk anybody out of it',
    title: 'The short kilometre',
    lore: 'Split times are consistently slowest over the final climb. Every finisher interviewed since the route opened has described it as the easiest part. The organisers stopped correcting people some years ago.',
  },
  {
    mapId: 'map-6',
    sentence:
      'the ash on this ridge settles everywhere except across the finish line itself and every ' +
      'spring somebody walks up here to sweep a road that the mountain has already left clean ' +
      'and none of them will be the first to stop coming',
    title: 'The clean line',
    lore: 'Fall patterns are even across the whole plateau. The line is clear anyway, by about a metre either side, and has been photographed clear after falls heavy enough to close the road below. The sweeping continues regardless.',
  },
];

/** Every secret a map can tell. */
export function secretsFor(mapId: string): readonly MapSecret[] {
  return MAP_SECRETS.filter((secret) => secret.mapId === mapId);
}

/**
 * A map's secret by its own id.
 *
 * Used by the results screen, which has to show the sentence that was actually
 * played rather than whichever one comes first in the file.
 */
export function findSecretById(secretId: string): MapSecret | undefined {
  return MAP_SECRETS.find((secret) => secretId === secretIdOf(secret));
}

/**
 * A stable id for a secret.
 *
 * Derived from the map and the title rather than stored, because the alternative
 * is a hand-written id per secret that somebody eventually duplicates.
 */
export function secretIdOf(secret: MapSecret): string {
  return `${secret.mapId}:${normalizePromptText(secret.title).replace(/ /g, '-')}`;
}

/**
 * One of a map's secrets, chosen by a run's own seed.
 *
 * **This is what stops a replay being the same run.** Every prompt in a run is
 * the next word of the map's sentence, so a map with one sentence hands the
 * player the identical words in the identical order however many times they
 * play it — which is the fastest way to make a typing game feel like a chore.
 *
 * Seeded rather than random, so a run can still be reproduced from its seed:
 * same seed, same sentence, same everything.
 */
export function pickSecret(mapId: string, seed: string): MapSecret | undefined {
  const options = secretsFor(mapId);
  if (options.length === 0) return undefined;

  return options[hash(seed) % options.length];
}

/**
 * A small string hash. Not cryptographic and not trying to be.
 *
 * `game-core/random` is the only source of randomness in the game and this is
 * not randomness: it is a deterministic choice made once, at the edge, from a
 * seed the caller already has.
 */
function hash(seed: string): number {
  let value = 2_166_136_261;
  for (let index = 0; index < seed.length; index += 1) {
    value ^= seed.charCodeAt(index);
    value = Math.imul(value, 16_777_619);
  }

  return Math.abs(value);
}

/** The first secret a map has. Kept for callers with no run in hand. */
export function findSecret(mapId: string): MapSecret | undefined {
  return secretsFor(mapId)[0];
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
