import type { PlayerProfile } from '../models/profile';

/**
 * The wardrobe: credits, what they buy, and what is being worn.
 *
 * ## The rule that matters
 *
 * **Nothing here changes a rule.** A skin decides what the runner is made of
 * and what a finished word looks like. A player wearing every skin runs at
 * exactly the speed of a player wearing none, types against the same budget,
 * and is chased by the same thing. The moment a skin is worth buying for the
 * advantage, credits stop being a reward for playing well and start being a
 * tax on playing at all.
 *
 * The catalogue lives in `content/skins.ts`; this module knows only the shape.
 *
 * Pure: no clock, no randomness, no storage. Buying returns a new profile and
 * the caller decides whether to persist it.
 */

export const SKIN_CATEGORIES = ['character', 'shoes', 'effect'] as const;

export type SkinCategory = (typeof SKIN_CATEGORIES)[number];

export interface SkinColors {
  readonly primary: string;
  readonly secondary?: string;
  readonly accent?: string;
}

export interface Skin {
  readonly id: string;
  readonly category: SkinCategory;
  readonly name: string;
  readonly description: string;
  /** In credits. Zero means it is owned from the start. */
  readonly price: number;
  readonly colors: SkinColors;
}

export function isSkinCategory(value: unknown): value is SkinCategory {
  return typeof value === 'string' && (SKIN_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Whether the player owns a skin.
 *
 * Free skins are owned by everybody, always, and are deliberately not written
 * into the profile when a run ends. A save that had to *record* the free items
 * would be a save that could lose them.
 */
export function owns(profile: PlayerProfile, skin: Skin): boolean {
  return skin.price === 0 || profile.ownedSkinIds.includes(skin.id);
}

export function canAfford(profile: PlayerProfile, skin: Skin): boolean {
  return profile.credits >= skin.price;
}

/** Why a purchase cannot go through, or `null` when it can. */
export type PurchaseRefusal = 'already-owned' | 'too-expensive';

export function refusalFor(profile: PlayerProfile, skin: Skin): PurchaseRefusal | null {
  if (owns(profile, skin)) return 'already-owned';
  if (!canAfford(profile, skin)) return 'too-expensive';

  return null;
}

/**
 * Buys a skin, and equips it.
 *
 * Equipping is not a separate step the player has to discover: somebody who has
 * just spent nine hundred credits on gold shoes wants to be wearing gold shoes.
 * They can change back for free.
 *
 * Returns the profile unchanged when the purchase cannot go through, so a
 * double-click cannot charge twice.
 */
export function buySkin(profile: PlayerProfile, skin: Skin): PlayerProfile {
  if (refusalFor(profile, skin) !== null) return profile;

  return equipSkin(
    {
      ...profile,
      credits: profile.credits - skin.price,
      ownedSkinIds: [...profile.ownedSkinIds, skin.id],
    },
    skin,
  );
}

/** Wears a skin the player already owns. Unowned skins are ignored. */
export function equipSkin(profile: PlayerProfile, skin: Skin): PlayerProfile {
  if (!owns(profile, skin)) return profile;

  return {
    ...profile,
    equippedSkinIds: { ...profile.equippedSkinIds, [skin.category]: skin.id },
  };
}

/**
 * The skin being worn in a category, resolved against a catalogue.
 *
 * Falls back to the first free skin of that category when the profile names
 * one that no longer exists — a renamed or retired skin leaves somebody's
 * profile pointing at nothing, and the fix for that is a default, not a crash.
 */
export function equippedSkin(
  profile: PlayerProfile,
  catalogue: readonly Skin[],
  category: SkinCategory,
): Skin | undefined {
  const chosen = profile.equippedSkinIds[category];
  const inCategory = catalogue.filter((skin) => skin.category === category);

  const worn = inCategory.find((skin) => skin.id === chosen);
  if (worn !== undefined && owns(profile, worn)) return worn;

  return inCategory.find((skin) => skin.price === 0) ?? inCategory[0];
}

/**
 * A wardrobe choice, resolved to colours.
 *
 * Lives here rather than in `game-scene` because two layers need to agree on it
 * and only one of them is allowed to import the other. `content` resolves a
 * profile into this; the scene reads it. Neither has to know about the other.
 *
 * Colours only, deliberately. If this shape ever grows a field that changes
 * behaviour, the promise at the top of this file has been broken.
 */
export interface RunnerLook {
  readonly shirt: string;
  readonly shorts: string;
  readonly skin: string;
  readonly shoe: string;
  /** Tint of the flourish when a word lands. */
  readonly effect: string;
}

/** Credits earned by a run. */
export interface CreditsEarned {
  readonly placement: number;
  readonly coins: number;
  readonly total: number;
}

/**
 * What a run pays into the purse.
 *
 * Two sources, deliberately. Placing is the headline — it is what the race is
 * *for* — but a player who is being comfortably beaten still collects coins,
 * and a wardrobe that only ever opened for the winner would be a wardrobe most
 * players never see.
 *
 * Nothing is paid for a run that ended with the chaser. Being caught is the
 * failure state; paying it would make the shortest possible run the most
 * efficient way to earn.
 */
export function creditsFor(input: {
  readonly placement: number;
  readonly coinsCollected: number;
  readonly completed: boolean;
}): CreditsEarned {
  if (!input.completed) return { placement: 0, coins: 0, total: 0 };

  const placement = PLACEMENT_CREDITS[input.placement - 1] ?? 0;
  const coins = input.coinsCollected * CREDITS_PER_COIN;

  return { placement, coins, total: placement + coins };
}

/** First, second, third. Third still pays: finishing at all is worth something. */
const PLACEMENT_CREDITS = [120, 60, 25] as const;

const CREDITS_PER_COIN = 2;
