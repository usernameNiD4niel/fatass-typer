import type { JSX } from 'react';

import { Button, Card } from '../../components/ui';
import type { MapConfig, PlayerProfile } from '../../game-core/models';
import { lifetimeAccuracy, progressFor } from '../../game-core/models';
import styles from './Statistics.module.css';

/**
 * Statistics (spec §9, §7).
 *
 * The lifetime view. The headline is the **sustainable peak** — a speed held for
 * ten to fifteen seconds, not a one-second burst — because that is the number
 * the whole progression is built around, and the one a player can trust.
 */

export interface StatisticsScreenProps {
  readonly profile: PlayerProfile;
  readonly maps: readonly MapConfig[];
  readonly onBack: () => void;
}

function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}): JSX.Element {
  return (
    <div className={styles.stat}>
      <dt className={styles.statLabel}>{label}</dt>
      <dd className={styles.statValue}>{value}</dd>
      {note !== undefined && <dd className={styles.statNote}>{note}</dd>}
    </div>
  );
}

export function StatisticsScreen({ profile, maps, onBack }: StatisticsScreenProps): JSX.Element {
  const played = profile.lifetimeCharacters > 0;
  const attempts = maps.reduce((total, map) => total + progressFor(profile, map.id).attempts, 0);
  const completed = maps.filter((map) => progressFor(profile, map.id).completed).length;

  return (
    <section className={styles.screen} aria-label="Statistics">
      <header className={styles.header}>
        <h1 className={styles.title}>Statistics</h1>
        <p className={styles.subtitle}>
          {played
            ? 'Everything you have typed so far.'
            : 'Nothing yet — finish a run and this fills in.'}
        </p>
      </header>

      <Card title="Lifetime" titleLevel={2}>
        <dl className={styles.grid}>
          <Stat
            label="Sustainable peak"
            value={
              profile.sustainablePeakWpm > 0
                ? `${String(Math.round(profile.sustainablePeakWpm))} WPM`
                : '—'
            }
            note="Held for 10–15 seconds, not a burst"
          />
          <Stat
            label="Overall accuracy"
            value={played ? `${String(Math.round(lifetimeAccuracy(profile) * 100))}%` : '—'}
          />
          <Stat
            label="Characters typed"
            value={played ? String(profile.lifetimeCharacters) : '—'}
          />
          <Stat label="Runs" value={String(attempts)} />
          <Stat label="Maps completed" value={`${String(completed)} of ${String(maps.length)}`} />
          <Stat label="Maps unlocked" value={String(profile.unlockedMapIds.length)} />
        </dl>
      </Card>

      <Card title="By map" titleLevel={2}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Map</th>
              <th scope="col">Best score</th>
              <th scope="col">Best accuracy</th>
              <th scope="col">Best speed</th>
              <th scope="col">Runs</th>
            </tr>
          </thead>
          <tbody>
            {maps.map((map) => {
              const progress = progressFor(profile, map.id);
              const locked = !profile.unlockedMapIds.includes(map.id);
              const untouched = progress.attempts === 0;

              return (
                <tr key={map.id}>
                  <th scope="row">
                    {map.mapNumber}. {map.name}
                    {locked && <span className={styles.locked}> — locked</span>}
                  </th>
                  {/* A dash, not a zero: never played is not the same as scored nothing. */}
                  <td>{untouched ? '—' : String(Math.round(progress.bestScore))}</td>
                  <td>{untouched ? '—' : `${String(Math.round(progress.bestAccuracy * 100))}%`}</td>
                  <td>{untouched ? '—' : `${String(Math.round(progress.bestAverageWpm))} WPM`}</td>
                  <td>{progress.attempts}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <div className={styles.actions}>
        <Button size="large" onClick={onBack}>
          Back
        </Button>
      </div>
    </section>
  );
}
