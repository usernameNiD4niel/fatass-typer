import { useRef, type JSX } from 'react';

import type { LiveRunStats } from '../../game-core/models';
import { formatDistance } from '../format';
import { Button, classes, VisuallyHidden } from '../ui';
import styles from './Hud.module.css';
import { paceBand, PACE_HEADROOM, PACE_WORD, type PaceBand } from './pace';

/**
 * The run HUD (spec §9).
 *
 * Everything here is deliberately secondary to the prompt: smaller type, lower
 * contrast, one row. Spec §4 warns against overloading the HUD, and the way that
 * happens is six readouts all shouting at once.
 *
 * Three meters, because they answer the three questions that matter mid-run:
 * *how far to go*, *how much trouble am I in*, and *am I typing fast enough for
 * this map* — the last being the one the player can actually act on.
 *
 * The active word is never here. It belongs out in the world ahead of the
 * runner (spec §16), where the player is already looking.
 */

export interface HudProps {
  readonly stats: LiveRunStats;
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
  note,
  tick,
}: {
  label: string;
  valueText: string;
  ratio: number;
  fillClass: string | undefined;
  emphasise?: boolean;
  /** A word beside the label, so the meter never says something in colour alone. */
  note?: string;
  /** 0..1 along the track. A reference point the fill can be read against. */
  tick?: number;
}): JSX.Element {
  const percent = Math.round(Math.min(1, Math.max(0, ratio)) * 100);
  const spoken = note === undefined ? valueText : `${note}, ${valueText}`;

  return (
    <div className={styles.meter}>
      <span className={styles.meterHead}>
        <span>
          {label}
          {note !== undefined && <span className={styles.meterNote}>{note}</span>}
        </span>
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
        aria-valuetext={spoken}
      >
        <div className={classes(styles.fill, fillClass)} style={{ width: `${String(percent)}%` }} />
        {tick !== undefined && (
          <div
            className={styles.tick}
            style={{ left: `${String(Math.round(tick * 100))}%` }}
            aria-hidden="true"
          />
        )}
      </div>
    </div>
  );
}

/** Ordinals, for the two places that are not "3rd". */
const PLACE_LABEL: Record<number, string> = { 1: '1st', 2: '2nd', 3: '3rd' };

const PACE_FILL: Record<PaceBand, string | undefined> = {
  idle: styles.paceFillIdle,
  behind: styles.paceFillBehind,
  onPace: styles.paceFillOnPace,
  ahead: styles.paceFillAhead,
};

export function Hud({
  stats,
  endless = false,
  bestDistanceMeters = 0,
  onPause,
  paused,
  canPause,
}: HudProps): JSX.Element {
  const bandRef = useRef<PaceBand>('idle');
  const paceRatio = stats.targetWpm > 0 ? stats.currentWpm / stats.targetWpm : 0;
  const band = paceBand(paceRatio, bandRef.current);
  bandRef.current = band;

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
        {/*
          The standing, as a place and a gap.

          Both, because either alone is useless: "2nd" does not say whether the
          player is about to take the lead, and "+4 m" does not say of whom.
        */}
        <Stat
          label="Place"
          value={PLACE_LABEL[stats.placement] ?? `${String(stats.placement)}th`}
        />
        <Stat label="Score" value={String(Math.round(stats.score))} />

        {/*
          The opponents' gaps, for a screen reader only.

          They are *shown* beside the runner now (`game-scene/RivalBadges.tsx`),
          which is a better place to glance at and no place at all to read from:
          the scene is drawn, unlabelled, and out of the accessibility tree.
          Keeping the numbers here as text is what stops moving them into the
          world from quietly removing them for anybody not looking at it.
        */}
        <VisuallyHidden>
          {stats.rivals.map((rival) => (
            <div key={rival.side}>
              <dt>{rival.side === 'left' ? 'Rival on the left' : 'Rival on the right'}</dt>
              <dd>
                {rival.gapMeters >= 0
                  ? `${String(Math.round(rival.gapMeters))} metres ahead`
                  : `${String(Math.abs(Math.round(rival.gapMeters)))} metres behind`}
              </dd>
            </div>
          ))}
        </VisuallyHidden>
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
        {/*
          Pace: how fast the player is typing against what this map asks for.
          It replaces the old m/s readout because speed is now downstream of
          typing — two meters were showing one fact, and only one of them was
          a number the player could do anything about.
        */}
        <Meter
          label="Pace"
          note={PACE_WORD[band]}
          // The target as well as the reading, so the ratio is never inferred
          // from colour (spec §12).
          valueText={
            band === 'idle'
              ? `— / ${String(Math.round(stats.targetWpm))} WPM`
              : `${String(Math.round(stats.currentWpm))} / ${String(Math.round(stats.targetWpm))} WPM`
          }
          ratio={paceRatio / PACE_HEADROOM}
          tick={1 / PACE_HEADROOM}
          fillClass={PACE_FILL[band]}
          emphasise={band === 'behind'}
        />
      </div>

      <Button size="small" onClick={onPause} disabled={!canPause}>
        {paused ? 'Resume' : 'Pause'}
      </Button>
    </div>
  );
}
