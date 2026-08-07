import type { JSX } from 'react';

import { MapArtwork, Panel, StatTile, StatTiles } from '../../components/game-ui';
import { Button, classes } from '../../components/ui';
import { findSecretById } from '../../content';
import type { MapConfig, PlayerProfile, RunResult } from '../../game-core/models';
import styles from './RunResults.module.css';
import { missedUnlockReason, newRecords, unlockedMap } from './run-summary';
import { mergeKeyStats, weakestKeys } from '../../game-core/keystats';

/**
 * Run results (spec §9).
 *
 * One screen for both endings. A player who crashed deserves their numbers
 * just as much as one who finished — the difference is the heading and which
 * action leads, not how much information they are trusted with.
 *
 * ## What the redesign changed
 *
 * The outcome is now a banner across the top of the map it happened on, rather
 * than a word above a heading. This is the screen a player sees at the end of
 * every run, and the first thing it has to answer is *how did that go* — which
 * is a verdict, not a table. The eleven figures underneath are unchanged in
 * substance and only regrouped: the four a player actually reads first sit
 * apart from the seven they read when they care.
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

/**
 * What a finished run is called, given where it placed.
 *
 * The place is the headline when there was a race to win, because "1st" says
 * more about how the run went than "Finished" does. A run with no placement
 * recorded — anything stored before the race existed — still reads correctly.
 */
function finishedLabel(placement: number | undefined): string {
  if (placement === undefined) return 'Finished';
  if (placement === 1) return 'Won';
  if (placement === 2) return 'Finished 2nd';

  return 'Finished 3rd';
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
  /*
   * The lifetime table with this run already folded in, so the screen reflects
   * what just happened rather than the state before it. `profile` here is
   * deliberately the *pre-run* profile — that is what makes record comparison
   * work — so the run's own table has to be added back for this one panel.
   */
  const weakest = weakestKeys(mergeKeyStats(profile.keyStats, result.keyStats), { limit: 4 });
  const unlocked = unlockedMap(result, profile, maps);
  const missed = unlocked === null ? missedUnlockReason(result, profile, maps) : null;
  const mistakes = result.incorrectCharacters;
  // By id, not by map: a map has several secrets and this run played one.
  const secret = result.secretId === undefined ? undefined : findSecretById(result.secretId);

  return (
    <section className={styles.screen} aria-label="Run results">
      {/*
        The verdict, over the place it happened.

        A run ends and the first question is "how did that go" — so the answer
        is the largest thing on the screen, and the map is behind it rather than
        named beside it. The banner is tinted by the outcome *and* says which
        outcome it was in words, because colour alone is not an answer
        (spec §12).
      */}
      <header
        className={classes(
          styles.banner,
          result.completed ? styles.bannerCompleted : styles.bannerCaught,
        )}
      >
        <div className={styles.bannerArt} aria-hidden="true">
          <MapArtwork theme={map.theme} locked={false} />
        </div>
        <div className={styles.bannerText}>
          <p className={styles.outcome}>
            {result.completed ? finishedLabel(result.placement) : 'Caught'}
          </p>
          <h1 className={styles.title}>{map.name}</h1>
          <p className={styles.subtitle}>
            {result.completed
              ? `You made it in ${formatDuration(result.durationMs)}.`
              : `You lasted ${formatDuration(result.durationMs)}.`}
          </p>
        </div>
      </header>

      {/*
        The four a player reads first, apart from the rest. Score, speed,
        accuracy and the honest peak are the run; everything below is why.

        A labelled region rather than a bare grid, so the grouping is not purely
        visual: it gives a screen-reader user the same "here is the verdict, the
        detail is below" shape that the layout gives everyone else.
      */}
      <section className={styles.headline} aria-label="How the run went">
        <StatTiles>
          <StatTile label="Score" value={String(Math.round(result.score))} large />
          <StatTile
            label="Average speed"
            value={`${String(Math.round(result.averageWpm))} WPM`}
            note={
              result.averageWpm >= map.targetWpm
                ? `at or above the map's ${String(map.targetWpm)}`
                : `the map asks ${String(map.targetWpm)}`
            }
            tone={result.averageWpm >= map.targetWpm ? 'good' : 'warn'}
            large
          />
          <StatTile
            label="Accuracy"
            value={`${String(Math.round(result.accuracy * 100))}%`}
            tone={result.accuracy >= 0.9 ? 'good' : result.accuracy >= 0.8 ? 'warn' : 'bad'}
            large
          />
          <StatTile
            label="Sustainable peak"
            value={
              result.sustainablePeakWpm > 0
                ? `${String(Math.round(result.sustainablePeakWpm))} WPM`
                : '—'
            }
            // Spec §7: the honest headline figure, and it needs enough typing to
            // exist at all. Saying so is better than showing a bare dash.
            note={result.sustainablePeakWpm > 0 ? 'held, not a burst' : 'not enough typing yet'}
            large
          />
        </StatTiles>
      </section>

      <Panel title="This run" titleLevel={2}>
        <dl className={styles.grid}>
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
            label="Coins"
            value={String(result.coinsCollected)}
            note={result.coinsCollected > 0 ? 'optional, and taken' : 'none taken'}
          />
          <Stat
            label="Powerups"
            value={String(result.powerupsClaimed)}
            note={result.powerupsClaimed > 0 ? 'sentences typed clean' : 'none claimed'}
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
          {result.placement !== undefined && (
            <Stat
              label="Race"
              value={
                result.placement === 1
                  ? '1st of 3'
                  : `${String(result.placement)}${result.placement === 2 ? 'nd' : 'rd'} of 3`
              }
            />
          )}
          {result.coinsStolen !== undefined && result.coinsStolen > 0 && (
            // Named apart from missed coins: one is a coin the player declined,
            // the other is a coin they were beaten to.
            <Stat label="Coins lost to rivals" value={String(result.coinsStolen)} />
          )}
          <Stat label="Prompts" value={String(result.completedPrompts)} />
        </dl>
      </Panel>

      {/*
        The secret.

        The run's sentence, assembled a word at a time by every prompt in it.
        Finishing it is the only way to read what the map was about, and it is
        deliberately not tied to reaching the finish line: a player caught a
        metre short still typed every word of it.
      */}
      {secret !== undefined && result.secretUnlocked && (
        <Panel title={secret.title} titleLevel={2}>
          <p className={styles.secretLore}>{secret.lore}</p>
        </Panel>
      )}

      {secret !== undefined && !result.secretUnlocked && result.secretWordCount > 0 && (
        <Panel title="The secret of this map" titleLevel={2}>
          <p className={styles.secretProgress}>
            {`${String(result.secretWordsTyped)} of ${String(result.secretWordCount)} words typed. Finish the sentence to read it.`}
          </p>
        </Panel>
      )}

      {/*
        The only actionable thing on this screen (plan 2.4).

        "88% accurate" does not tell anybody what to practise. This does, and it
        is drawn from the *lifetime* table rather than from this run: one run is
        a handful of keystrokes per character, and a weakness read off that is
        mostly noise. The game is already steering the vocabulary toward these,
        so this is as much an explanation of what it is doing as a report.
      */}
      {weakest.length > 0 && (
        <Panel title="Worst keys" titleLevel={2}>
          <p className={styles.weakNote}>Words with these in them will come up more often.</p>
          <ul className={styles.records}>
            {weakest.map((entry) => (
              <li key={entry.key} className={styles.record}>
                <span className={styles.recordLabel}>
                  <kbd className={styles.weakKey}>{entry.key}</kbd>
                </span>
                <span className={styles.recordValue}>
                  {`${String(Math.round(entry.missRate * 100))}% missed`}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {records.length > 0 && (
        <Panel title="New records" titleLevel={2}>
          <ul className={styles.records}>
            {records.map((record) => (
              <li key={record.kind} className={styles.record}>
                <span className={styles.recordLabel}>{record.label}</span>
                <span className={styles.recordValue}>{record.value}</span>
              </li>
            ))}
          </ul>
        </Panel>
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
