import { useState, type JSX } from 'react';

import { Button, Card, classes } from '../../components/ui';
import { SKINS, skinsInCategory } from '../../content/skins';
import type { PlayerProfile } from '../../game-core/models';
import {
  buySkin,
  canAfford,
  equippedSkin,
  equipSkin,
  owns,
  SKIN_CATEGORIES,
  type Skin,
  type SkinCategory,
} from '../../game-core/wardrobe';
import styles from './WardrobeScreen.module.css';

/**
 * The wardrobe (plan: the race).
 *
 * Credits come from placing in races and from coins; they buy shoes, a
 * character, and what a finished word does. **Nothing here changes a rule** —
 * see `game-core/wardrobe`, which is where that promise is written down and
 * where it is kept.
 *
 * The screen owns no rules of its own. Buying and equipping are pure functions
 * over the profile; this renders their result and hands the new profile up.
 */

const CATEGORY_LABELS: Readonly<Record<SkinCategory, string>> = {
  character: 'Character',
  shoes: 'Shoes',
  effect: 'Typing effect',
};

const CATEGORY_BLURBS: Readonly<Record<SkinCategory, string>> = {
  character: 'What you are wearing on the road.',
  shoes: 'Seen from behind, every stride.',
  effect: 'What happens when a word lands.',
};

export interface WardrobeScreenProps {
  readonly profile: PlayerProfile;
  readonly onChange: (profile: PlayerProfile) => void;
  readonly onBack: () => void;
}

function Swatch({ skin }: { skin: Skin }): JSX.Element {
  return (
    <span className={styles.swatch} aria-hidden="true">
      <span className={styles.swatchPrimary} style={{ background: skin.colors.primary }} />
      {skin.colors.secondary !== undefined && (
        <span className={styles.swatchSecondary} style={{ background: skin.colors.secondary }} />
      )}
    </span>
  );
}

export function WardrobeScreen({ profile, onChange, onBack }: WardrobeScreenProps): JSX.Element {
  const [category, setCategory] = useState<SkinCategory>('character');
  const items = skinsInCategory(category);
  const worn = equippedSkin(profile, SKINS, category);

  return (
    <section className={styles.screen} aria-label="Wardrobe">
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Wardrobe</h1>
          <p className={styles.subtitle}>
            Earned by placing in races and by taking coins. None of it makes you faster.
          </p>
        </div>
        <p className={styles.credits}>
          <span className={styles.creditsLabel}>Credits</span>
          <span className={styles.creditsValue}>{Math.round(profile.credits)}</span>
        </p>
      </header>

      {/*
        Tabs rather than three long lists. Each category is small, and a player
        who wants shoes should not scroll past the characters to reach them.
      */}
      <div className={styles.tabs} role="tablist" aria-label="Skin categories">
        {SKIN_CATEGORIES.map((entry) => (
          <button
            key={entry}
            type="button"
            role="tab"
            aria-selected={entry === category}
            className={classes(styles.tab, entry === category && styles.tabActive)}
            onClick={() => {
              setCategory(entry);
            }}
          >
            {CATEGORY_LABELS[entry]}
          </button>
        ))}
      </div>

      <Card title={CATEGORY_LABELS[category]} titleLevel={2}>
        <p className={styles.blurb}>{CATEGORY_BLURBS[category]}</p>

        <ul className={styles.items}>
          {items.map((skin) => {
            const isWorn = worn?.id === skin.id;
            const isOwned = owns(profile, skin);
            const affordable = canAfford(profile, skin);

            return (
              <li
                key={skin.id}
                className={classes(styles.item, isWorn && styles.itemWorn)}
                // The state is in the text as well as in the border, so it does
                // not depend on seeing a colour (spec §12).
                aria-current={isWorn ? 'true' : undefined}
              >
                <Swatch skin={skin} />

                <span className={styles.itemText}>
                  <span className={styles.itemName}>{skin.name}</span>
                  <span className={styles.itemDescription}>{skin.description}</span>
                </span>

                <span className={styles.itemAction}>
                  {isWorn ? (
                    <span className={styles.wornTag}>Worn</span>
                  ) : isOwned ? (
                    <Button
                      size="small"
                      onClick={() => {
                        onChange(equipSkin(profile, skin));
                      }}
                    >
                      Wear
                    </Button>
                  ) : (
                    <Button
                      size="small"
                      disabled={!affordable}
                      onClick={() => {
                        onChange(buySkin(profile, skin));
                      }}
                      {...(affordable
                        ? {}
                        : {
                            'aria-label': `${skin.name} — ${String(skin.price)} credits, not enough`,
                          })}
                    >
                      {`${String(skin.price)} cr`}
                    </Button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>

      <Button onClick={onBack}>Back</Button>
    </section>
  );
}
