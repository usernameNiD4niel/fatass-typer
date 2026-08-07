import type { JSX } from 'react';

import { MapArtwork, Meter, Panel, StatTile, StatTiles } from '../../components/game-ui';
import { Button } from '../../components/ui';
import type { MapConfig, PlayerProfile } from '../../game-core/models';
import { lifetimeAccuracy } from '../../game-core/models';
import styles from './MainMenu.module.css';
import { highestUnlockedMap } from './menu-progress';

/**
 * Main menu (spec §9).
 *
 * Presentational: it is handed a profile and raises events. It reads no storage
 * and starts no run, so the same screen serves whatever F5 ends up loading
 * progress from.
 *
 * ## What it is now
 *
 * It was a title, six buttons in a row, and a card of three numbers — a launcher
 * rather than a front end. What a player wants on opening the game is *where am
 * I and what happens if I press the big button*, so that is what it leads with:
 * the map they are up to, drawn, with its target speed, and one primary action
 * against it. Everything else is a rail beside it.
 *
 * The three figures shown are still the ones the progression is built on: how
 * far they have got, their sustainable peak (spec §7 — never a one-second
 * burst), and their lifetime accuracy.
 */

export interface MainMenuProps {
  readonly profile: PlayerProfile;
  /** Every map, in progression order. Unlock state comes from the profile. */
  readonly maps: readonly MapConfig[];
  readonly onStart: () => void;
  /** Absent when there is no run to continue. */
  readonly onContinue?: () => void;
  readonly onMaps: () => void;
  /**
   * Absent until the statistics screen exists (step E6).
   *
   * The control is still shown, disabled and labelled as unavailable, rather
   * than hidden: a menu that grows an entry later is more disorienting than one
   * that says "not yet".
   */
  readonly onStatistics?: () => void;
  /** Absent until the wardrobe exists to open. Same reasoning as statistics. */
  readonly onWardrobe?: () => void;
  readonly onSettings: () => void;
}

/**
 * The fastest map in the set, used only to scale the peak-speed meter.
 *
 * The bar is "how far along the whole game's range are you", so its ceiling has
 * to be the game's own top target rather than a number picked here. A map list
 * that is somehow empty falls back to 1, which makes the meter full rather than
 * dividing by zero.
 */
function topTargetWpm(maps: readonly MapConfig[]): number {
  return maps.reduce((top, map) => Math.max(top, map.targetWpm), 1);
}

export function MainMenu({
  profile,
  maps,
  onStart,
  onContinue,
  onMaps,
  onStatistics,
  onWardrobe,
  onSettings,
}: MainMenuProps): JSX.Element {
  const furthest = highestUnlockedMap(profile, maps);
  const peak = profile.sustainablePeakWpm;
  const accuracy = lifetimeAccuracy(profile);
  const played = profile.lifetimeCharacters > 0;

  return (
    <section className={styles.screen} aria-label="Main menu">
      <header className={styles.masthead}>
        <h1 className={styles.title}>Typing Chase</h1>
        <p className={styles.tagline}>Type fast. The road does not wait.</p>
      </header>

      <div className={styles.layout}>
        {/*
          The hero. Where the player is up to, drawn rather than described —
          the same artwork the map carousel uses, so the two screens agree
          about what a place looks like.
        */}
        <Panel
          className={styles.hero}
          feature
          title="Up next"
          {...(furthest === null ? {} : { meta: `Map ${String(furthest.mapNumber)}` })}
        >
          {furthest !== null && (
            <div className={styles.heroArt}>
              <MapArtwork theme={furthest.theme} locked={false} />
            </div>
          )}

          <div className={styles.heroText}>
            <p className={styles.heroName}>{furthest === null ? '—' : furthest.name}</p>
            {/*
              The target as a chip rather than a sentence. The words "Target N
              WPM" already appear once on this screen, on the tile beside it,
              and a figure that reads twice in two wordings reads as two facts.
            */}
            <p className={styles.heroTarget}>
              {furthest === null ? (
                'No maps available'
              ) : (
                <span className={styles.heroChip}>{furthest.targetWpm} WPM</span>
              )}
            </p>
          </div>

          <div className={styles.heroActions}>
            {/* Continue leads when it exists: a returning player wants their run
                back, not a fresh one. */}
            {onContinue !== undefined && (
              <Button variant="primary" size="large" fullWidth onClick={onContinue}>
                Continue
              </Button>
            )}
            <Button
              variant={onContinue === undefined ? 'primary' : 'secondary'}
              size="large"
              fullWidth
              onClick={onStart}
            >
              {onContinue === undefined ? 'Start' : 'New run'}
            </Button>
          </div>
        </Panel>

        <div className={styles.side}>
          <Panel title="Progress">
            <Meter
              label="Sustainable peak"
              // Zero is shown as a dash rather than "0 WPM": a player who has
              // not typed anything has no peak, and reporting one would be a
              // small lie.
              value={peak > 0 ? `${String(Math.round(peak))} WPM` : '—'}
              fraction={peak / topTargetWpm(maps)}
              tone={peak > 0 ? 'good' : 'neutral'}
            />
            <p className={styles.meterNote}>Held for 10–15 seconds, not a burst</p>

            <StatTiles>
              <StatTile
                compact
                label="Furthest map"
                value={furthest === null ? '—' : `${String(furthest.mapNumber)}. ${furthest.name}`}
                {...(furthest === null
                  ? {}
                  : { note: `Target ${String(furthest.targetWpm)} WPM` })}
              />
              <StatTile
                label="Overall accuracy"
                value={played ? `${String(Math.round(accuracy * 100))}%` : '—'}
                {...(played ? {} : { note: 'Play a run to start tracking' })}
                tone={played && accuracy >= 0.9 ? 'good' : 'neutral'}
              />
            </StatTiles>
          </Panel>

          <nav className={styles.actions} aria-label="Main menu actions">
            <Button size="large" fullWidth onClick={onMaps}>
              Maps
            </Button>
            <Button
              size="large"
              fullWidth
              onClick={onStatistics}
              disabled={onStatistics === undefined}
              {...(onStatistics === undefined
                ? { 'aria-label': 'Statistics — not available yet' }
                : {})}
            >
              Statistics
            </Button>
            <Button
              size="large"
              fullWidth
              onClick={onWardrobe}
              disabled={onWardrobe === undefined}
              {...(onWardrobe === undefined
                ? { 'aria-label': 'Wardrobe — not available yet' }
                : {})}
            >
              Wardrobe
            </Button>
            <Button size="large" fullWidth onClick={onSettings}>
              Settings
            </Button>
          </nav>
        </div>
      </div>
    </section>
  );
}
