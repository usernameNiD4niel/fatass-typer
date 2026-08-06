import type { PlayerProfile } from '../game-core/models';
import { equippedSkin, type RunnerLook } from '../game-core/wardrobe';
import { SKINS } from './skins';

/**
 * The player's wardrobe choice, as colours the scene can use.
 *
 * This is the seam. `game-scene` may not read the profile or the catalogue, and
 * `game-core/wardrobe` may not know what a shirt is — so the translation
 * between "which skin is equipped" and "what colour is the shirt" happens here,
 * in content, where both are allowed.
 *
 * Nothing in this file can change a rule. It resolves four colours.
 */
/**
 * Which typing flourish is equipped, as a bare name.
 *
 * `effect-spark` becomes `spark`. The scene switches its stylesheet on this,
 * and stripping the prefix keeps the CSS from carrying the catalogue's id
 * scheme around with it.
 */
export function effectNameFor(profile: PlayerProfile): string {
  const effect = equippedSkin(profile, SKINS, 'effect');

  return effect === undefined ? 'plain' : effect.id.replace(/^effect-/, '');
}

export function runnerLookFor(profile: PlayerProfile): RunnerLook {
  const character = equippedSkin(profile, SKINS, 'character');
  const shoes = equippedSkin(profile, SKINS, 'shoes');
  const effect = equippedSkin(profile, SKINS, 'effect');

  return {
    shirt: character?.colors.primary ?? '#2f6fd0',
    shorts: character?.colors.secondary ?? '#2b3440',
    // The accent is the skin tone: it is the one part of a character skin that
    // is a *person* rather than a garment, so a kit that forgets it keeps it.
    skin: character?.colors.accent ?? '#e0a882',
    shoe: shoes?.colors.primary ?? '#22262c',
    effect: effect?.colors.primary ?? '#ffffff',
  };
}
