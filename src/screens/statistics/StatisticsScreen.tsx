import type { JSX } from 'react';

import { Meter, Panel, ScreenHead, StatTile, StatTiles } from '../../components/game-ui';
import { Button } from '../../components/ui';
import type { MapConfig, PlayerProfile } from '../../game-core/models';
import { lifetimeAccuracy, progressFor } from '../../game-core/models';
import styles from './Statistics.module.css';

/**
 * Statistics (spec §9, §7).
 *
 * The lifetime view. The headline is the **sustainable peak** — a speed held for
 * ten to fifteen seconds, not a one-second burst — because that is the number
 * the whole progression is built around, and the one a player can trust.
 *
 * ## What the redesign changed
 *
 * It was a card of six equal figures and a bare table. Six equal figures say
 * nothing about which one matters, and the table said what a player had done
 * without saying how it compares to what the map asked. So the peak is now the
 * one large tile, measured against the game's own top target, and each map's
 * row carries a bar of its best accuracy against the gate it has to clear.
 */

export interface StatisticsScreenProps {
  readonly profile: PlayerProfile;
  readonly maps: readonly MapConfig[];
  readonly onBack: () => void;
}

/** The fastest map in the set. The ceiling every speed bar is measured against. */
function topTargetWpm(maps: readonly MapConfig[]): number {
  return maps.reduce((top, map) => Math.max(top, map.targetWpm), 1);
}

export function StatisticsScreen({ profile, maps, onBack }: StatisticsScreenProps): JSX.Element {
  const played = profile.lifetimeCharacters > 0;
  const attempts = maps.reduce((total, map) => total + progressFor(profile, map.id).attempts, 0);
  const completed = maps.filter((map) => progressFor(profile, map.id).completed).length;
  const accuracy = lifetimeAccuracy(profile);
  const peak = profile.sustainablePeakWpm;

  return (
    <section className={styles.screen} aria-label="Statistics">
      <ScreenHead
        eyebrow="Career"
        title="Statistics"
        subtitle={
          played
            ? 'Everything you have typed so far.'
            : 'Nothing yet — finish a run and this fills in.'
        }
      />

      <div className={styles.top}>
        <Panel feature title="Sustainable peak" meta="lifetime best">
          <StatTile
            label="Peak speed"
            value={peak > 0 ? `${String(Math.round(peak))} WPM` : '—'}
            note="Held for 10–15 seconds, not a burst"
            tone={peak > 0 ? 'good' : 'neutral'}
            large
          />
          <Meter
            label="Against the fastest map"
            value={`${String(Math.round(peak))} / ${String(topTargetWpm(maps))} WPM`}
            fraction={peak / topTargetWpm(maps)}
            tone={peak > 0 ? 'good' : 'neutral'}
          />
        </Panel>

        <Panel title="Lifetime">
          <StatTiles>
            <StatTile
              label="Overall accuracy"
              value={played ? `${String(Math.round(accuracy * 100))}%` : '—'}
              tone={played && accuracy >= 0.9 ? 'good' : 'neutral'}
            />
            <StatTile label="Characters typed" value={played ? String(profile.lifetimeCharacters) : '—'} />
            <StatTile label="Runs" value={String(attempts)} />
            <StatTile label="Maps completed" value={`${String(completed)} of ${String(maps.length)}`} />
            <StatTile label="Maps unlocked" value={String(profile.unlockedMapIds.length)} />
          </StatTiles>
        </Panel>
      </div>

      <Panel title="By map" meta={`${String(maps.length)} maps`}>
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
                <tr key={map.id} className={locked ? styles.rowLocked : undefined}>
                  <th scope="row">
                    <span className={styles.mapName}>
                      {map.mapNumber}. {map.name}
                    </span>
                    {locked && <span className={styles.locked}> — locked</span>}
                  </th>
                  {/* A dash, not a zero: never played is not the same as scored nothing. */}
                  <td>{untouched ? '—' : String(Math.round(progress.bestScore))}</td>
                  <td>
                    {untouched ? (
                      '—'
                    ) : (
                      <span className={styles.cellBar}>
                        <span className={styles.cellValue}>
                          {Math.round(progress.bestAccuracy * 100)}%
                        </span>
                        {/*
                          The bar is decoration on a number that is already
                          written beside it — a shape the eye can scan down the
                          column without reading five figures. `aria-hidden`, so
                          it is not announced twice.
                        */}
                        <span className={styles.track} aria-hidden="true">
                          <span
                            className={styles.fill}
                            style={{ width: `${String(Math.round(progress.bestAccuracy * 100))}%` }}
                          />
                        </span>
                      </span>
                    )}
                  </td>
                  <td>{untouched ? '—' : `${String(Math.round(progress.bestAverageWpm))} WPM`}</td>
                  <td>{progress.attempts}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>

      <div className={styles.actions}>
        <Button size="large" onClick={onBack}>
          Back
        </Button>
      </div>
    </section>
  );
}
