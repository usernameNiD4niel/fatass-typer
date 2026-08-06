import type { Skin, SkinCategory } from '../game-core/wardrobe';

/**
 * The wardrobe catalogue.
 *
 * Data, like the maps and the prompts. Nothing here changes a rule: a skin
 * decides what the runner is made of and what a finished word looks like, and
 * a player wearing every one of them runs at exactly the speed of a player
 * wearing none. That is the whole contract — the moment a skin is worth *buying
 * for the advantage*, credits stop being a reward and become a paywall.
 *
 * Prices are in credits, which come from placing in races and from coins.
 * Roughly: a first place is 120, so the cheap things are one good run and the
 * expensive ones are a handful.
 */

/** Everything free is owned from the start, and one per category is free. */
export const SKINS: readonly Skin[] = [
  /* ---------------------------------------------------------------- shoes */
  {
    id: 'shoes-default',
    category: 'shoes',
    name: 'Worn trainers',
    description: 'What you turned up in.',
    price: 0,
    colors: { primary: '#22262c', secondary: '#3b424b' },
  },
  {
    id: 'shoes-racer',
    category: 'shoes',
    name: 'Track spikes',
    description: 'Red, and faintly ridiculous on a public road.',
    price: 150,
    colors: { primary: '#d1342f', secondary: '#f2f2f2' },
  },
  {
    id: 'shoes-neon',
    category: 'shoes',
    name: 'Neon runners',
    description: 'Visible from the far carriageway.',
    price: 320,
    colors: { primary: '#c6ff3d', secondary: '#1d2a08' },
  },
  {
    id: 'shoes-gold',
    category: 'shoes',
    name: 'Gold pair',
    description: 'For somebody who keeps winning.',
    price: 900,
    colors: { primary: '#e8b53a', secondary: '#6b4c07' },
  },

  /* ------------------------------------------------------------ character */
  {
    id: 'character-default',
    category: 'character',
    name: 'The regular',
    description: 'Blue shirt, dark shorts, no particular plan.',
    price: 0,
    colors: { primary: '#2f6fd0', secondary: '#2b3440', accent: '#e0a882' },
  },
  {
    id: 'character-hi-vis',
    category: 'character',
    name: 'Road crew',
    description: 'Hi-vis orange. Nobody is going to hit you.',
    price: 260,
    colors: { primary: '#ff8a1f', secondary: '#33302a', accent: '#e0a882' },
  },
  {
    id: 'character-monochrome',
    category: 'character',
    name: 'Night shift',
    description: 'All greys. Reads well on the dark maps.',
    price: 420,
    colors: { primary: '#4a5260', secondary: '#23282f', accent: '#cfa384' },
  },
  {
    id: 'character-champion',
    category: 'character',
    name: 'Champion kit',
    description: 'White and gold. Earned, not bought — well, both.',
    price: 1_100,
    colors: { primary: '#f4f1e8', secondary: '#c9a227', accent: '#e0a882' },
  },

  /* --------------------------------------------------------------- effect */
  {
    id: 'effect-default',
    category: 'effect',
    name: 'Plain',
    description: 'A finished word just goes.',
    price: 0,
    colors: { primary: '#ffffff' },
  },
  {
    id: 'effect-spark',
    category: 'effect',
    name: 'Spark',
    description: 'Every finished word flares before it leaves.',
    price: 200,
    colors: { primary: '#ffd166' },
  },
  {
    id: 'effect-pulse',
    category: 'effect',
    name: 'Pulse',
    description: 'The word swells as the last character lands.',
    price: 380,
    colors: { primary: '#6ad4ff' },
  },
  {
    id: 'effect-ember',
    category: 'effect',
    name: 'Ember',
    description: 'It burns out rather than disappearing.',
    price: 760,
    colors: { primary: '#ff6a3d' },
  },
];

/** Every skin of one kind, in catalogue order. */
export function skinsInCategory(category: SkinCategory): readonly Skin[] {
  return SKINS.filter((skin) => skin.category === category);
}

export function findSkin(id: string): Skin | undefined {
  return SKINS.find((skin) => skin.id === id);
}
