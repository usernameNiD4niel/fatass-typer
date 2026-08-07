import type { JSX } from 'react';

import { MapArtwork, Meter, Panel, StatTile, StatTiles } from '../../components/game-ui';
import { Button } from '../../components/ui';
import type { MapConfig, PlayerProfile } from '../../game-core/models';
import { progressFor } from '../../game-core/models';
import styles from './LevelBriefing.module.css';

/**
 * Level briefing (spec §9).
 *
 * The screen between choosing a map and running it. It exists to answer one
 * question honestly: *what is this map going to ask of me?* The target speed,
 * how long the run is, what gets in the way, and what the player has managed
 * here before.
 *
 * It occupies the machine's `PreRunCountdown` state rather than inventing a new
 * one — the player starts the run when they are ready, which is what a briefing
 * is for.
 *
 * ## What the redesign changed
 *
 * The map is now *shown*, with the same artwork the carousel used to pick it —
 * so the card the player pressed and the screen it opened are recognisably the
 * same place. And the target speed is put next to the player's own best on this
 * map rather than in a separate card, because "30 WPM" means nothing until it
 * is set against the 26 you managed last time.
 */

export interface LevelBriefingProps {
  readonly map: MapConfig;
  readonly profile: PlayerProfile;
  readonly onStart: () => void;
  readonly onBack: () => void;
}

/** Roughly how long the run takes at the map's own pace, in seconds. */
function estimatedSeconds(map: MapConfig): number {
  return Math.round(map.distanceMeters / map.baseSpeedMetersPerSecond);
}

export function LevelBriefing({ map, profile, onStart, onBack }: LevelBriefingProps): JSX.Element {
  const progress = progressFor(profile, map.id);
  const played = progress.attempts > 0;

  return (
    <section className={styles.screen} aria-label={`Briefing: ${map.name}`}>
      <div className={styles.layout}>
        <Panel className={styles.brief} feature title={`Map ${String(map.mapNumber)}`}>
          <div className={styles.art}>
            <MapArtwork theme={map.theme} locked={false} />
          </div>

          <header className={styles.head}>
            <h1 className={styles.title}>{map.name}</h1>
            <p className={styles.summary}>
              Type the words to stay ahead of what is behind you. Every word finished pushes it
              back; every word missed lets it close.
            </p>
          </header>

          <div className={styles.actions}>
            <Button variant="primary" size="large" onClick={onStart}>
              Start run
            </Button>
            <Button size="large" onClick={onBack}>
              Back to maps
            </Button>
          </div>
        </Panel>

        <div className={styles.side}>
          <Panel title="What this map asks">
            <StatTiles>
              <StatTile label="Target speed" value={`${String(map.targetWpm)} WPM`} />
              <StatTile label="Distance" value={`${String(map.distanceMeters)} m`} />
              <StatTile label="About" value={`${String(estimatedSeconds(map))} s`} />
              <StatTile label="Coins" value={`${String(map.content.coinValue)} a line`} />
            </StatTiles>
          </Panel>

          <Panel title="Your best here" {...(played ? { meta: `${String(progress.attempts)} runs` } : {})}>
            {played ? (
              <>
                {/*
                  The one comparison that makes the target mean something: what
                  the map asks, against what this player has actually done on it.
                */}
                <Meter
                  label="Best accuracy"
                  value={`${String(Math.round(progress.bestAccuracy * 100))}%`}
                  fraction={progress.bestAccuracy}
                  tone={progress.bestAccuracy >= 0.9 ? 'good' : 'neutral'}
                />
                <StatTiles>
                  <StatTile label="Best score" value={String(Math.round(progress.bestScore))} />
                  <StatTile
                    label="Best speed"
                    value={`${String(Math.round(progress.bestAverageWpm))} WPM`}
                    note={
                      progress.bestAverageWpm >= map.targetWpm
                        ? 'at or above target'
                        : `${String(map.targetWpm - Math.round(progress.bestAverageWpm))} WPM under target`
                    }
                    tone={progress.bestAverageWpm >= map.targetWpm ? 'good' : 'warn'}
                  />
                  <StatTile label="Attempts" value={String(progress.attempts)} />
                  <StatTile label="Completed" value={progress.completed ? 'Yes' : 'Not yet'} />
                </StatTiles>
              </>
            ) : (
              <p className={styles.summary}>You have not run this map yet.</p>
            )}
          </Panel>
        </div>
      </div>
    </section>
  );
}
