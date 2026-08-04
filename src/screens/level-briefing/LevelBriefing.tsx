import type { JSX } from 'react';

import { Button, Card } from '../../components/ui';
import type {
  MapConfig,
  ObstacleAction,
  ObstacleDefinition,
  PlayerProfile,
} from '../../game-core/models';
import { progressFor } from '../../game-core/models';
import styles from './LevelBriefing.module.css';

/**
 * What each hazard asks for, in words rather than in the rules' vocabulary.
 * "type the prompt to lane-change past it" is accurate and unreadable.
 */
const ACTION_BRIEFING: Readonly<Record<ObstacleAction, string>> = {
  jump: 'type the prompt to jump past it.',
  'lane-change': 'type the word on the open side to pull into that lane.',
};

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
  /** The obstacles this map can spawn, already filtered to its own list. */
  readonly obstacles: readonly ObstacleDefinition[];
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

export function LevelBriefing({
  map,
  profile,
  obstacles,
  onStart,
  onBack,
}: LevelBriefingProps): JSX.Element {
  const progress = progressFor(profile, map.id);
  const played = progress.attempts > 0;

  return (
    <section className={styles.screen} aria-label={`Briefing: ${map.name}`}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Map {map.mapNumber}</p>
        <h1 className={styles.title}>{map.name}</h1>
        <p className={styles.summary}>
          Type the prompts to stay ahead. Clear the obstacle prompts before you reach them.
        </p>
      </header>

      <Card title="What this map asks" titleLevel={2}>
        <dl className={styles.facts}>
          <Fact label="Target speed" value={`${String(map.targetWpm)} WPM`} />
          <Fact label="Distance" value={`${String(map.distanceMeters)} m`} />
          <Fact label="About" value={`${String(estimatedSeconds(map))} s`} />
          <Fact
            label="Obstacles"
            value={obstacles.length === 0 ? 'None' : String(obstacles.length)}
          />
        </dl>
      </Card>

      {obstacles.length > 0 && (
        <Card title="What you will meet" titleLevel={2}>
          <ul className={styles.tips}>
            {obstacles.map((obstacle) => (
              <li key={obstacle.id}>
                <strong>{obstacle.label}</strong> — {ACTION_BRIEFING[obstacle.action]}
              </li>
            ))}
          </ul>
        </Card>
      )}

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
