import { type CSSProperties, type JSX, useCallback, useEffect, useRef, useState } from 'react';

import { MapArtwork, ScreenHead } from '../../components/game-ui';
import { Button, classes, SelectableCard } from '../../components/ui';
import type { MapConfig, PlayerProfile } from '../../game-core/models';
import type { GameAudio } from '../../hooks/useGameAudio';
import { type MapCardModel, mapCardLabel, mapCardModel, openingIndex } from './map-card-model';
import styles from './MapSelection.module.css';
import { formatDistance } from '../../components/format';

/**
 * Map selection (spec §9).
 *
 * One card per map, in progression order. Each card carries everything the
 * player needs to choose: the target speed, the theme, whether it is finished,
 * their bests, and — for a locked map — exactly what would unlock it.
 *
 * A locked card is a disabled button rather than a hidden one. Seeing the shape
 * of the progression is the point; hiding it would make the game feel smaller
 * than it is.
 *
 * ## Why a carousel and not a grid
 *
 * It was a grid of seven equal cards, and a grid says every map is equally the
 * one you are about to play. They are not: a player opens this screen to start
 * *one* map, and the other six are context. So one card is centred, raised and
 * full size, its neighbours are smaller and set back, and moving between them
 * is the interaction.
 *
 * ## Focus is the carousel position
 *
 * There is no second "which card is centred" state. The centred card is the
 * focused card, always, and every card is a real button in the tab order.
 *
 * That is deliberately against the usual carousel pattern, which parks a roving
 * tabindex on the active item and takes the rest out of the tab order. The
 * information on a **locked** card — what would unlock it — is what a stuck
 * player most needs to read, and spec §12 says they must be able to reach it.
 * Tab reaching every card keeps that promise, and tying the centre to focus
 * means the screen can never show one card while the keyboard acts on another.
 *
 * Left and Right are the carousel's own affordance and also move focus, so
 * arrows and Tab cannot disagree either.
 *
 * ## What makes a sound, and what does not
 *
 * Stepping the carousel ticks; choosing a map plays a rising figure. Tab does
 * neither, and that is not an oversight: clicking a card focuses it *and*
 * selects it, so a cue on focus would double up with the one on select every
 * time a card was clicked. The tick belongs to the deliberate act of moving
 * along the row — the arrows and the two arrow buttons.
 *
 * A step that changes nothing is silent too. Pressing Right on the last card
 * does not move the carousel, and a tick that fires anyway is the interface
 * claiming something happened.
 *
 * ## Why the geometry is on the list item
 *
 * The transform that places a card lives on its `<li>`, not on the card. The
 * shared `SelectableCard` sets `transform` itself on `:active` — a card that
 * dipped when pressed would otherwise jump back to the middle of the row while
 * the mouse was down.
 */

export interface MapSelectionProps {
  readonly maps: readonly MapConfig[];
  readonly profile: PlayerProfile;
  readonly onSelect: (mapId: string) => void;
  readonly onBack: () => void;
  /**
   * Optional, like every other screen's.
   *
   * Absent in tests and in any shell that has not built an engine; the screen
   * works in silence rather than requiring one.
   */
  readonly audio?: GameAudio;
}

function formatTheme(theme: string): string {
  return theme.replace(/-/g, ' ');
}

function MapCard({
  model,
  active,
  onSelect,
}: {
  model: MapCardModel;
  active: boolean;
  onSelect: (mapId: string) => void;
}): JSX.Element {
  const { map, progress, locked, completed } = model;
  // No finish line, so "Completed" is not a thing that can happen and distance
  // is the only record worth showing (plan 2.2).
  const endless = map.distanceMeters <= 0;

  return (
    <SelectableCard
      label={mapCardLabel(model)}
      disabled={locked}
      selected={active}
      className={classes(styles.mapCard)}
      onSelect={() => {
        onSelect(map.id);
      }}
    >
      <MapArtwork theme={map.theme} locked={locked} />

      <div className={styles.body}>
        <div className={styles.cardHead}>
          <span className={styles.number}>
            {endless ? 'No finish line' : `Map ${String(map.mapNumber)}`}
          </span>
          {((completed && !endless) || locked) && (
            <span
              className={classes(
                styles.status,
                completed && styles.statusCompleted,
                locked && styles.statusLocked,
              )}
            >
              {locked ? 'Locked' : 'Completed'}
            </span>
          )}
        </div>

        {/*
          The heading is rendered here rather than passed to `SelectableCard` as
          its `title`, which would put it above the artwork. Same element, same
          role, same accessible name — only the order differs.
        */}
        <h3 className={styles.name}>{map.name}</h3>

        <p className={styles.target}>
          {map.targetWpm} WPM{endless ? ' and rising' : ''}
        </p>
        <p className={styles.theme}>{formatTheme(map.theme)}</p>

        {locked ? (
          <p className={styles.lock}>{model.unlockRequirement}</p>
        ) : progress.attempts > 0 ? (
          <p className={styles.bests}>
            {endless ? (
              <span>Furthest {formatDistance(progress.bestDistanceMeters)}</span>
            ) : (
              <span>Best {Math.round(progress.bestScore)}</span>
            )}
            <span>{Math.round(progress.bestAccuracy * 100)}% accuracy</span>
          </p>
        ) : (
          <p className={styles.bests}>Not played yet</p>
        )}
      </div>
    </SelectableCard>
  );
}

export function MapSelection({
  maps,
  profile,
  onSelect,
  onBack,
  audio,
}: MapSelectionProps): JSX.Element {
  const models = maps.map((map) => mapCardModel(map, profile, maps));
  const [active, setActive] = useState(() => openingIndex(models));
  const trackRef = useRef<HTMLUListElement>(null);
  /**
   * Whether the last move came from a control rather than from focus.
   *
   * The arrows and the prev/next buttons have to move focus, or the centred
   * card and the focused card come apart. Focus is *not* moved when the state
   * changed for any other reason — re-centring the page under a player who has
   * simply tabbed somewhere else is the kind of focus theft spec §12 rules out.
   */
  const pendingFocus = useRef(false);

  /**
   * The live index, for `move` to compare against.
   *
   * `move` has to know whether the carousel actually went anywhere before it
   * ticks, and it cannot read that from a state updater: updaters must be pure,
   * and React double-invokes them under StrictMode — which would play the cue
   * twice. It cannot read it from `active` either, because holding an arrow key
   * fires faster than React commits and a stale index would tick past the end
   * of the row. A ref is current in both directions.
   */
  const activeRef = useRef(active);
  activeRef.current = active;

  const move = useCallback(
    (delta: number) => {
      const current = activeRef.current;
      const next = Math.max(0, Math.min(models.length - 1, current + delta));
      // A step that changes nothing is silent. Pressing Right on the last card
      // does not move the carousel, and a tick that fired anyway would be the
      // interface claiming something happened.
      if (next === current) return;

      activeRef.current = next;
      pendingFocus.current = true;
      audio?.unlock();
      audio?.play('uiMove');
      setActive(next);
    },
    [audio, models.length],
  );

  /** Choosing a map: the one menu action with a consequence, so it says so. */
  const choose = useCallback(
    (mapId: string) => {
      audio?.unlock();
      audio?.play('uiSelect');
      onSelect(mapId);
    },
    [audio, onSelect],
  );

  useEffect(() => {
    if (!pendingFocus.current) return;
    pendingFocus.current = false;

    // The buttons, not the list items: a card *is* a button (see `Card.tsx`),
    // and the `<li>` around it is layout with nothing focusable about it.
    const cards = trackRef.current?.querySelectorAll<HTMLElement>(':scope > li > button');
    cards?.[active]?.focus();
  }, [active]);

  return (
    <section className={styles.screen} aria-label="Map selection">
      <ScreenHead
        eyebrow="Campaign"
        title="Choose a map"
        subtitle="Each map asks for a higher speed and gives you less time to react."
      />

      <div className={styles.carousel}>
        <Button
          className={styles.arrow}
          onClick={() => {
            move(-1);
          }}
          disabled={active === 0}
          aria-label="Previous map"
        >
          <span aria-hidden="true">‹</span>
        </Button>

        <div
          className={styles.viewport}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            // Left and Right belong to the carousel here: nothing inside it
            // scrolls or takes a caret, so nothing else wanted them.
            event.preventDefault();
            move(event.key === 'ArrowLeft' ? -1 : 1);
          }}
        >
          <ul ref={trackRef} className={styles.track} aria-label="Maps">
            {models.map((model, index) => (
              <li
                key={model.map.id}
                className={styles.slot}
                /*
                 * Distance from the centre, as data. The stylesheet turns it
                 * into a position, a scale and a depth; it never needs to know
                 * how many maps there are, and this never needs to know how
                 * wide a card is.
                 */
                style={
                  {
                    '--distance': index - active,
                    '--abs-distance': Math.abs(index - active),
                  } as CSSProperties
                }
                /*
                 * `onFocus` on the item rather than the card: React's focus
                 * event bubbles (it is `focusin` underneath), so this catches
                 * the button inside without the shared card needing a new prop.
                 */
                onFocus={() => {
                  setActive(index);
                }}
              >
                <MapCard model={model} active={index === active} onSelect={choose} />
              </li>
            ))}
          </ul>
        </div>

        <Button
          className={styles.arrow}
          onClick={() => {
            move(1);
          }}
          disabled={active === models.length - 1}
          aria-label="Next map"
        >
          <span aria-hidden="true">›</span>
        </Button>
      </div>

      {/*
        Where you are in the row. Decorative: the same fact is in the live
        region below, in words, and a row of dots is not something a screen
        reader can usefully walk.
      */}
      <ol className={styles.dots} aria-hidden="true">
        {models.map((model, index) => (
          <li
            key={model.map.id}
            className={classes(styles.dot, index === active && styles.dotActive)}
          />
        ))}
      </ol>

      {/*
        Sighted players watch the card move; this is the same fact for everyone
        else. Polite, so it never interrupts the card's own announcement.
      */}
      <p className={styles.position} aria-live="polite">
        {models[active]?.map.name ?? ''} — {active + 1} of {models.length}
      </p>

      <div className={styles.footer}>
        <Button onClick={onBack}>Back</Button>
      </div>
    </section>
  );
}
