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

function GitHubIcon(): JSX.Element {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57C20.565 21.795 24 17.31 24 12c0-6.63-5.37-12-12-12Z" />
    </svg>
  );
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
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Typing Chase</h1>
          <a
            href="https://github.com/usernameNiD4niel/fatass-typer"
            className={styles.githubLink}
            aria-label="View on GitHub"
            target="_blank"
            rel="noopener noreferrer"
          >
            <GitHubIcon />
          </a>
        </div>
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
