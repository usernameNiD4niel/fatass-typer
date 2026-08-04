import type { JSX, ReactNode } from 'react';

import { Button, Card } from '../../components/ui';
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
 * The three figures shown are the ones the progression is actually built on:
 * how far the player has got, their sustainable peak (spec §7 — never a
 * one-second burst), and their lifetime accuracy.
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
  readonly onSettings: () => void;
}

function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string | undefined;
}): JSX.Element {
  return (
    <div className={styles.stat}>
      <dt className={styles.statLabel}>{label}</dt>
      <dd className={styles.statValue}>{value}</dd>
      {note !== undefined && <dd className={styles.statNote}>{note}</dd>}
    </div>
  );
}

export function MainMenu({
  profile,
  maps,
  onStart,
  onContinue,
  onMaps,
  onStatistics,
  onSettings,
}: MainMenuProps): JSX.Element {
  const furthest = highestUnlockedMap(profile, maps);
  const peak = profile.sustainablePeakWpm;
  const accuracy = lifetimeAccuracy(profile);
  const played = profile.lifetimeCharacters > 0;

  const stats: ReactNode = (
    <dl className={styles.stats}>
      <Stat
        label="Furthest map"
        value={furthest === null ? '—' : `${String(furthest.mapNumber)}. ${furthest.name}`}
        note={furthest === null ? undefined : `Target ${String(furthest.targetWpm)} WPM`}
      />
      <Stat
        label="Sustainable peak"
        // Zero is shown as a dash rather than "0 WPM": a player who has not
        // typed anything has no peak, and reporting one would be a small lie.
        value={peak > 0 ? `${String(Math.round(peak))} WPM` : '—'}
        note="Held for 10–15 seconds, not a burst"
      />
      <Stat
        label="Overall accuracy"
        value={played ? `${String(Math.round(accuracy * 100))}%` : '—'}
        {...(played ? {} : { note: 'Play a run to start tracking' })}
      />
    </dl>
  );

  return (
    <section className={styles.screen} aria-label="Main menu">
      <header className={styles.header}>
        <h1 className={styles.title}>Typing Chase</h1>
        <p className={styles.tagline}>Type fast. The road does not wait.</p>
      </header>

      <nav className={styles.actions} aria-label="Main menu actions">
        {/* Continue leads when it exists: a returning player wants their run
            back, not a fresh one. */}
        {onContinue !== undefined && (
          <Button variant="primary" size="large" onClick={onContinue}>
            Continue
          </Button>
        )}
        <Button
          variant={onContinue === undefined ? 'primary' : 'secondary'}
          size="large"
          onClick={onStart}
        >
          {onContinue === undefined ? 'Start' : 'New run'}
        </Button>
        <Button size="large" onClick={onMaps}>
          Maps
        </Button>
        <Button
          size="large"
          onClick={onStatistics}
          disabled={onStatistics === undefined}
          {...(onStatistics === undefined
            ? { 'aria-label': 'Statistics — not available yet' }
            : {})}
        >
          Statistics
        </Button>
        <Button size="large" onClick={onSettings}>
          Settings
        </Button>
      </nav>

      <Card title="Your progress" titleLevel={2}>
        {stats}
      </Card>
    </section>
  );
}
