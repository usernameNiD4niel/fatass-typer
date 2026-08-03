import type { PromptEntry } from '../../game-core/models';
import { buildPrompts } from './build';

/**
 * Phrases (spec §15).
 *
 * Spaces are part of the skill, and a phrase is where a typist's rhythm either
 * holds or falls apart — so these carry the later maps.
 *
 * Every phrase is something that could be said about the run in progress. It
 * keeps the game's voice consistent, and a phrase the player can predict from
 * its first words is faster to type, which is the point of a boost prompt.
 */

/** 8–14 characters. Two or three short words. */
export const SHORT_PHRASES: readonly PromptEntry[] = buildPrompts('short-phrase', [
  { text: 'keep going' },
  { text: 'run faster' },
  { text: 'good dog' },
  { text: 'almost there' },
  { text: 'down the road' },
  { text: 'not today' },
  { text: 'go go go' },
  { text: 'watch out', minimumMap: 2 },
  { text: 'left turn', minimumMap: 2 },
  { text: 'over here', minimumMap: 2 },
  { text: 'nearly out', minimumMap: 2 },
  { text: 'one more', minimumMap: 2 },
  { text: 'hold the pace', minimumMap: 3 },
  { text: 'past the gate', minimumMap: 3 },
  { text: 'up the stairs', minimumMap: 3 },
  { text: 'mind the step', minimumMap: 3 },
  { text: 'through here', minimumMap: 3 },
  { text: 'still ahead', minimumMap: 2 },
]);

/**
 * 15–30 characters. Whole sentences, for the maps that ask for sustained speed
 * rather than bursts.
 */
export const MEDIUM_PHRASES: readonly PromptEntry[] = buildPrompts('medium-phrase', [
  { text: 'the dogs are gaining', minimumMap: 3 },
  { text: 'do not look back now', minimumMap: 3 },
  { text: 'keep your feet moving', minimumMap: 4 },
  { text: 'the finish line is close', minimumMap: 4 },
  { text: 'one more street to go', minimumMap: 4 },
  { text: 'faster than yesterday', minimumMap: 4 },
  { text: 'straight through the gap', minimumMap: 5 },
  { text: 'hold the line and run', minimumMap: 4 },
  { text: 'the road opens up here', minimumMap: 5 },
  { text: 'no time to slow down', minimumMap: 4 },
  { text: 'almost out of the city', minimumMap: 5 },
  { text: 'breathe and keep typing', minimumMap: 5 },
  { text: 'the last stretch now', minimumMap: 6 },
  { text: 'everything you have left', minimumMap: 6 },
  { text: 'they are right behind you', minimumMap: 6 },
]);
