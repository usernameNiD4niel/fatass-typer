import type { JSX } from 'react';

import { Button, classes, SelectableCard } from '../../components/ui';
import type { MapConfig, PlayerProfile } from '../../game-core/models';
import { type MapCardModel, mapCardLabel, mapCardModel } from './map-card-model';
import styles from './MapSelection.module.css';

/**
 * Map selection (spec §9).
 *
 * One card per map, in progression order. Each card carries everything the
 * player needs to choose: the target speed, the theme, whether it is finished,
 * their bests, and — for a locked map — exactly what would unlock it.
 *
 * A locked card is a disabled button rather than a hidden one. Seeing the shape
 * of the progression is the point; hiding it would make the game feel smaller
 * than it is.
 */

export interface MapSelectionProps {
  readonly maps: readonly MapConfig[];
  readonly profile: PlayerProfile;
  readonly onSelect: (mapId: string) => void;
  readonly onBack: () => void;
}

function formatTheme(theme: string): string {
  return theme.replace(/-/g, ' ');
}

function MapCard({
  model,
  onSelect,
}: {
  model: MapCardModel;
  onSelect: (mapId: string) => void;
}): JSX.Element {
  const { map, progress, locked, completed } = model;

  return (
    <SelectableCard
      title={map.name}
      label={mapCardLabel(model)}
      disabled={locked}
      onSelect={() => {
        onSelect(map.id);
      }}
    >
      <div className={styles.cardHead}>
        <span className={styles.number}>Map {map.mapNumber}</span>
        {(completed || locked) && (
          <span
            className={classes(
              styles.status,
              completed && styles.statusCompleted,
              locked && styles.statusLocked,
            )}
          >
            {locked ? 'Locked' : 'Completed'}
          </span>
        )}
      </div>

      <p className={styles.target}>{map.targetWpm} WPM</p>
      <p className={styles.theme}>{formatTheme(map.theme)}</p>

      {locked ? (
        <p className={styles.lock}>{model.unlockRequirement}</p>
      ) : progress.attempts > 0 ? (
        <p className={styles.bests}>
          <span>Best {Math.round(progress.bestScore)}</span>
          <span>{Math.round(progress.bestAccuracy * 100)}% accuracy</span>
        </p>
      ) : (
        <p className={styles.bests}>Not played yet</p>
      )}
    </SelectableCard>
  );
}

export function MapSelection({ maps, profile, onSelect, onBack }: MapSelectionProps): JSX.Element {
  const models = maps.map((map) => mapCardModel(map, profile, maps));

  return (
    <section className={styles.screen} aria-label="Map selection">
      <header className={styles.header}>
        <h1 className={styles.title}>Choose a map</h1>
        <p className={styles.subtitle}>
          Each map asks for a higher speed and gives you less time to react.
        </p>
      </header>

      <ul className={styles.grid} aria-label="Maps">
        {models.map((model) => (
          <li key={model.map.id}>
            <MapCard model={model} onSelect={onSelect} />
          </li>
        ))}
      </ul>

      <div className={styles.footer}>
        <Button onClick={onBack}>Back</Button>
      </div>
    </section>
  );
}
