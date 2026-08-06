import type { JSX } from 'react';

import { Button, Card } from '../../components/ui';
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
 */

export interface LevelBriefingProps {
  readonly map: MapConfig;
  readonly profile: PlayerProfile;
  readonly onStart: () => void;
  readonly onBack: () => void;
}

function Fact({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className={styles.fact}>
      <dt className={styles.factLabel}>{label}</dt>
      <dd className={styles.factValue}>{value}</dd>
    </div>
  );
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
      <header className={styles.header}>
        <p className={styles.eyebrow}>Map {map.mapNumber}</p>
        <h1 className={styles.title}>{map.name}</h1>
        <p className={styles.summary}>
          Type the words to stay ahead of what is behind you. Every word finished pushes it back;
          every word missed lets it close.
        </p>
      </header>

      <Card title="What this map asks" titleLevel={2}>
        <dl className={styles.facts}>
          <Fact label="Target speed" value={`${String(map.targetWpm)} WPM`} />
          <Fact label="Distance" value={`${String(map.distanceMeters)} m`} />
          <Fact label="About" value={`${String(estimatedSeconds(map))} s`} />
          <Fact label="Coins" value={`${String(map.content.coinValue)} a line`} />
        </dl>
      </Card>

      <Card title="Your best here" titleLevel={2}>
        {played ? (
          <dl className={styles.facts}>
            <Fact label="Best score" value={String(Math.round(progress.bestScore))} />
            <Fact
              label="Best accuracy"
              value={`${String(Math.round(progress.bestAccuracy * 100))}%`}
            />
            <Fact label="Attempts" value={String(progress.attempts)} />
            <Fact label="Completed" value={progress.completed ? 'Yes' : 'Not yet'} />
          </dl>
        ) : (
          <p className={styles.summary}>You have not run this map yet.</p>
        )}
      </Card>

      <div className={styles.actions}>
        <Button variant="primary" size="large" onClick={onStart}>
          Start run
        </Button>
        <Button size="large" onClick={onBack}>
          Back to maps
        </Button>
      </div>
    </section>
  );
}
