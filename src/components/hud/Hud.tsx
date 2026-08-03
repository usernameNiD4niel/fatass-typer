import type { JSX } from 'react';

import type { LiveRunStats } from '../../game-core/models';
import { Button, classes } from '../ui';
import styles from './Hud.module.css';
import { THREAT_WORD, type ThreatLevel, threatLevel } from './threat';

/**
 * The run HUD (spec §9).
 *
 * Everything here is deliberately secondary to the prompt: smaller type, lower
 * contrast, one row. Spec §4 warns against overloading the HUD, and the way that
 * happens is six readouts all shouting at once.
 *
 * Two meters, because they answer the only two questions that matter mid-run:
 * *how far to go* and *how close are they*.
 */

export interface HudProps {
  readonly stats: LiveRunStats;
  readonly onPause: () => void;
  readonly paused: boolean;
  /** Disabled outside a run, when pausing means nothing. */
  readonly canPause: boolean;
}

const THREAT_CLASS: Readonly<Record<ThreatLevel, string | undefined>> = {
  safe: styles.safe,
  closing: styles.closing,
  critical: styles.critical,
  caught: styles.caught,
};

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

export function Hud({ stats, onPause, paused, canPause }: HudProps): JSX.Element {
  const threat = threatLevel(stats.dogDistanceNormalized);

  return (
    <div className={styles.hud}>
      <dl className={styles.stats}>
        <Stat label="WPM" value={String(Math.round(stats.currentWpm))} />
        <Stat label="Accuracy" value={`${String(Math.round(stats.accuracy * 100))}%`} />
        <Stat label="Combo" value={stats.combo > 0 ? `${String(stats.combo)}×` : '—'} />
        <Stat label="Score" value={String(Math.round(stats.score))} />
      </dl>

      <div className={styles.meters}>
        <Meter
          label="To finish"
          valueText={`${String(Math.round(stats.progress * 100))}%`}
          ratio={stats.progress}
          fillClass={styles.progressFill}
        />
        <Meter
          label="Dogs"
          // A word, not only a colour and a length (spec §12).
          valueText={THREAT_WORD[threat]}
          ratio={stats.dogDistanceNormalized}
          fillClass={THREAT_CLASS[threat]}
          emphasise={threat === 'critical' || threat === 'caught'}
        />
      </div>

      <Button size="small" onClick={onPause} disabled={!canPause}>
        {paused ? 'Resume' : 'Pause'}
      </Button>
    </div>
  );
}
