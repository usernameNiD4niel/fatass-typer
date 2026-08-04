import type { JSX } from 'react';

import type { LiveRunStats } from '../../game-core/models';
import { formatDistance } from '../format';
import { Button, classes } from '../ui';
import styles from './Hud.module.css';

/**
 * The run HUD (spec §9).
 *
 * Everything here is deliberately secondary to the prompt: smaller type, lower
 * contrast, one row. Spec §4 warns against overloading the HUD, and the way that
 * happens is six readouts all shouting at once.
 *
 * Two meters, because they answer the two questions that matter mid-run: *how
 * far to go* and *how fast am I going* — the second being the thing that decides
 * how much road the next hazard leaves you.
 *
 * The active word is never here. It belongs beside the hazard it applies to
 * (spec §16), out in the world where the player is already looking.
 */

export interface HudProps {
  readonly stats: LiveRunStats;
  /** Top speed the map can reach, for the speed meter's scale. */
  readonly topSpeedMetersPerSecond: number;
  /**
   * No finish line (plan 2.2).
   *
   * "To finish" cannot be shown on a map that has none — a progress bar that
   * never fills is worse than no progress bar — so distance takes its place.
   */
  readonly endless?: boolean;
  /** Furthest the player has ever got on this map, in metres. */
  readonly bestDistanceMeters?: number;
  readonly onPause: () => void;
  readonly paused: boolean;
  /** Disabled outside a run, when pausing means nothing. */
  readonly canPause: boolean;
}

/** Whole seconds, rounded up — a countdown that shows 0 while still running lies. */
function formatSeconds(ms: number): string {
  return `${String(Math.ceil(ms / 1000))}s`;
}

function Stat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className={styles.stat}>
      <dt className={styles.statLabel}>{label}</dt>
      <dd className={styles.statValue}>{value}</dd>
    </div>
  );
}

function Meter({
  label,
  valueText,
  ratio,
  fillClass,
  emphasise = false,
}: {
  label: string;
  valueText: string;
  ratio: number;
  fillClass: string | undefined;
  emphasise?: boolean;
}): JSX.Element {
  const percent = Math.round(Math.min(1, Math.max(0, ratio)) * 100);

  return (
    <div className={styles.meter}>
      <span className={styles.meterHead}>
        <span>{label}</span>
        <span className={classes(styles.meterValue, emphasise && styles.threatCritical)}>
          {valueText}
        </span>
      </span>
      <div
        className={styles.track}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={valueText}
      >
        <div className={classes(styles.fill, fillClass)} style={{ width: `${String(percent)}%` }} />
      </div>
    </div>
  );
}

export function Hud({
  stats,
  topSpeedMetersPerSecond,
  endless = false,
  bestDistanceMeters = 0,
  onPause,
  paused,
  canPause,
}: HudProps): JSX.Element {
  const speedRatio =
    topSpeedMetersPerSecond > 0 ? stats.speedMetersPerSecond / topSpeedMetersPerSecond : 0;

  const pressure = stats.pursuitPressure;
  const chaserWord = pressure >= 0.75 ? 'On you' : pressure >= 0.4 ? 'Closing' : 'Behind';
  const chaserFill =
    pressure >= 0.75
      ? styles.chaserFillCritical
      : pressure >= 0.4
        ? styles.chaserFillClose
        : styles.chaserFill;

  return (
    <div className={styles.hud}>
      <dl className={styles.stats}>
        <Stat label="WPM" value={String(Math.round(stats.currentWpm))} />
        <Stat label="Accuracy" value={`${String(Math.round(stats.accuracy * 100))}%`} />
        <Stat label="Combo" value={stats.combo > 0 ? `${String(stats.combo)}×` : '—'} />
        <Stat label="Coins" value={String(stats.coins)} />
        <Stat label="Lives" value={stats.shields > 0 ? `+${String(stats.shields)}` : '—'} />
        {/*
          The sentence, as a count. Every word typed in a run is the next word
          of the map's secret, and a player who cannot see how much is left has
          no reason to care that there is a sentence at all.
        */}
        {stats.secretWordCount > 0 && (
          <Stat
            label="Secret"
            value={`${String(stats.secretWordsTyped)}/${String(stats.secretWordCount)}`}
          />
        )}
        <Stat label="Score" value={String(Math.round(stats.score))} />
      </dl>

      {(stats.flightRemainingMs > 0 || stats.magnetRemainingMs > 0) && (
        <ul className={styles.effects} aria-label="Active powerups">
          {stats.flightRemainingMs > 0 && (
            <li className={styles.effect}>Flying {formatSeconds(stats.flightRemainingMs)}</li>
          )}
          {stats.magnetRemainingMs > 0 && (
            <li className={styles.effect}>Magnet {formatSeconds(stats.magnetRemainingMs)}</li>
          )}
        </ul>
      )}

      <div className={styles.meters}>
        {endless ? (
          /*
            Distance, and the number to beat beside it.

            A meter needs a maximum and there is none, so this is a readout
            rather than a bar. The best is shown throughout rather than only at
            the end, because a target you cannot see while you are chasing it is
            not a target.
          */
          <div className={styles.meter}>
            <span className={styles.meterHead}>
              <span>Distance</span>
              <span className={styles.meterValue}>{formatDistance(stats.distanceMeters)}</span>
            </span>
            <span className={styles.meterHead}>
              <span>Furthest</span>
              <span className={styles.meterValue}>
                {bestDistanceMeters > 0 ? formatDistance(bestDistanceMeters) : '—'}
              </span>
            </span>
          </div>
        ) : (
          <Meter
            label="To finish"
            valueText={`${String(Math.round(stats.progress * 100))}%`}
            ratio={stats.progress}
            fillClass={styles.progressFill}
          />
        )}
        {/*
          The chaser, as how much trouble you are in rather than as metres.
          The word carries the meaning on its own, so the danger is never
          colour-only (spec §12) — and it is a word rather than a percentage
          because "68% caught" is not a thing a player can act on.
        */}
        <Meter
          label="Chaser"
          valueText={chaserWord}
          ratio={stats.pursuitPressure}
          fillClass={chaserFill}
          emphasise={stats.pursuitPressure >= 0.75}
        />
        <Meter
          label="Speed"
          // A number, not only a colour and a length (spec §12).
          valueText={`${stats.speedMetersPerSecond.toFixed(1)} m/s`}
          ratio={speedRatio}
          fillClass={styles.speedFill}
        />
      </div>

      <Button size="small" onClick={onPause} disabled={!canPause}>
        {paused ? 'Resume' : 'Pause'}
      </Button>
    </div>
  );
}
