import { useState, type JSX } from 'react';

import { Panel, ScreenHead, TabRail } from '../../components/game-ui';
import { Button, classes } from '../../components/ui';
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
 *
 * ## What the redesign changed
 *
 * A list of rows became a grid of cards, each showing the thing it sells at a
 * size you can actually judge. A wardrobe is the one screen in the game whose
 * entire job is *how something looks*, and a 24-pixel swatch at the end of a
 * text row cannot do that job. The colours are the skin's own, straight from
 * the catalogue, so the card and the runner cannot disagree.
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

/**
 * The item, shown large.
 *
 * Two colours on a lit ground rather than a flat chip: the runner is a shaded
 * object under a sun, and a flat rectangle of the same hex looks like a
 * different colour from the thing it is selling.
 */
function Preview({ skin }: { skin: Skin }): JSX.Element {
  return (
    <span className={styles.preview} aria-hidden="true">
      <span className={styles.previewPrimary} style={{ background: skin.colors.primary }} />
      {skin.colors.secondary !== undefined && (
        <span className={styles.previewSecondary} style={{ background: skin.colors.secondary }} />
      )}
    </span>
  );
}

export function WardrobeScreen({ profile, onChange, onBack }: WardrobeScreenProps): JSX.Element {
  const [category, setCategory] = useState<SkinCategory>('character');
  const items = skinsInCategory(category);
  const worn = equippedSkin(profile, SKINS, category);
  const owned = items.filter((skin) => owns(profile, skin)).length;

  return (
    <section className={styles.screen} aria-label="Wardrobe">
      <ScreenHead
        eyebrow="Locker"
        title="Wardrobe"
        subtitle="Earned by placing in races and by taking coins. None of it makes you faster."
        aside={
          <p className={styles.credits}>
            <span className={styles.creditsLabel}>Credits</span>
            <span className={styles.creditsValue}>{Math.round(profile.credits)}</span>
          </p>
        }
      />

      {/*
        Tabs rather than three long lists. Each category is small, and a player
        who wants shoes should not scroll past the characters to reach them.
      */}
      <TabRail
        label="Skin categories"
        tabs={SKIN_CATEGORIES}
        active={category}
        render={(entry) => CATEGORY_LABELS[entry]}
        onSelect={setCategory}
      />

      <Panel
        title={CATEGORY_LABELS[category]}
        meta={`${String(owned)} of ${String(items.length)} owned`}
      >
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
                <Preview skin={skin} />

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
                      fullWidth
                      onClick={() => {
                        onChange(equipSkin(profile, skin));
                      }}
                    >
                      Wear
                    </Button>
                  ) : (
                    <Button
                      size="small"
                      fullWidth
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
      </Panel>

      <div className={styles.actions}>
        <Button size="large" onClick={onBack}>
          Back
        </Button>
      </div>
    </section>
  );
}
