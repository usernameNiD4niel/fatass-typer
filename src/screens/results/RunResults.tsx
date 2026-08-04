import type { JSX } from 'react';

import { Button, Card, classes } from '../../components/ui';
import type { MapConfig, PlayerProfile, RunResult } from '../../game-core/models';
import styles from './RunResults.module.css';
import { missedUnlockReason, newRecords, unlockedMap } from './run-summary';

/**
 * Run results (spec §9).
 *
 * One screen for both endings. A player who crashed deserves their numbers
 * just as much as one who finished — the difference is the heading and which
 * action leads, not how much information they are trusted with.
 */

export interface RunResultsProps {
  readonly result: RunResult;
  readonly map: MapConfig;
  /** The profile *before* this run, so records are compared against it. */
  readonly profile: PlayerProfile;
  readonly maps: readonly MapConfig[];
  readonly onRetry: () => void;
  /** Absent when this run unlocked nothing to move on to. */
  readonly onNextMap?: () => void;
  readonly onReturnToMaps: () => void;
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

function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;

  return minutes === 0
    ? `${String(seconds)}s`
    : `${String(minutes)}m ${String(seconds).padStart(2, '0')}s`;
}

export function RunResults({
  result,
  map,
  profile,
  maps,
  onRetry,
  onNextMap,
  onReturnToMaps,
}: RunResultsProps): JSX.Element {
  const records = newRecords(result, profile);
  const unlocked = unlockedMap(result, profile, maps);
  const missed = unlocked === null ? missedUnlockReason(result, profile, maps) : null;
  const mistakes = result.incorrectCharacters;

  return (
    <section className={styles.screen} aria-label="Run results">
      <header className={styles.header}>
        <p className={classes(styles.outcome, result.completed ? styles.completed : styles.caught)}>
          {result.completed ? 'Finished' : 'Crashed'}
        </p>
        <h1 className={styles.title}>{map.name}</h1>
        <p className={styles.subtitle}>
          {result.completed
            ? `You made it in ${formatDuration(result.durationMs)}.`
            : `You lasted ${formatDuration(result.durationMs)}.`}
        </p>
      </header>

      <Card title="This run" titleLevel={2}>
        <dl className={styles.grid}>
          <Stat label="Score" value={String(Math.round(result.score))} />
          <Stat label="Average speed" value={`${String(Math.round(result.averageWpm))} WPM`} />
          <Stat
            label="Sustainable peak"
            value={
              result.sustainablePeakWpm > 0
                ? `${String(Math.round(result.sustainablePeakWpm))} WPM`
                : '—'
            }
            // Spec §7: the honest headline figure, and it needs enough typing to
            // exist at all. Saying so is better than showing a bare dash.
            note={result.sustainablePeakWpm > 0 ? 'held, not a burst' : 'not enough typing yet'}
          />
          <Stat label="Accuracy" value={`${String(Math.round(result.accuracy * 100))}%`} />
          <Stat
            label="Longest combo"
            value={result.longestCombo > 0 ? `${String(result.longestCombo)}×` : '—'}
          />
          <Stat
            label="Obstacles"
            value={`${String(Math.round(result.obstacleSuccessRate * 100))}%`}
            note={
              result.missedPrompts > 0 ? `${String(result.missedPrompts)} missed` : 'all cleared'
            }
          />
          <Stat
            label="Mistakes"
            value={String(mistakes)}
            // Corrections are shown separately because they are not counted
            // against final accuracy (spec §7) — hiding them would make the
            // accuracy figure look arbitrary.
            note={
              result.correctedErrors > 0 ? `${String(result.correctedErrors)} corrected` : undefined
            }
          />
          <Stat label="Prompts" value={String(result.completedPrompts)} />
        </dl>
      </Card>

      {records.length > 0 && (
        <Card title="New records" titleLevel={2}>
          <ul className={styles.records}>
            {records.map((record) => (
              <li key={record.kind} className={styles.record}>
                <span className={styles.recordLabel}>{record.label}</span>
                <span className={styles.recordValue}>{record.value}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {unlocked !== null && (
        <div className={styles.unlock}>
          <p className={styles.unlockTitle}>{unlocked.name} unlocked</p>
          <p className={styles.unlockNote}>Target {unlocked.targetWpm} WPM. Ready when you are.</p>
        </div>
      )}

      {/* What they would need next time, said plainly rather than left implied. */}
      {missed !== null && (
        <div className={styles.unlock}>
          <p className={styles.unlockNote}>{missed}</p>
        </div>
      )}

      <div className={styles.actions}>
        {unlocked !== null && onNextMap !== undefined ? (
          <>
            <Button variant="primary" size="large" onClick={onNextMap}>
              Next map
            </Button>
            <Button size="large" onClick={onRetry}>
              Run again
            </Button>
          </>
        ) : (
          <Button variant="primary" size="large" onClick={onRetry}>
            {result.completed ? 'Run again' : 'Try again'}
          </Button>
        )}
        <Button size="large" onClick={onReturnToMaps}>
          Return to maps
        </Button>
      </div>
    </section>
  );
}
