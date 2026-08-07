import type { CSSProperties, JSX } from 'react';

import { mapArt } from '../../content/map-art';
import type { MapTheme } from '../../game-core/models';
import styles from './MapArtwork.module.css';

/**
 * The picture at the top of a map card.
 *
 * A sky, a horizon glow, and two or three silhouettes — enough that a player
 * recognises the docks from the canyon before reading either name, which is the
 * whole job. See `content/map-art.ts` for why it is polygons rather than an
 * image, and why these colours are not the scene's.
 *
 * `aria-hidden`, and it has to be: everything the picture says is already in the
 * card's accessible name, and a screen reader announcing a decorative drawing
 * between the map's name and its target speed would be noise.
 */

export interface MapArtworkProps {
  readonly theme: MapTheme;
  /** Dimmed for a locked map, the same way the rest of the card is. */
  readonly locked: boolean;
}

export function MapArtwork({ theme, locked }: MapArtworkProps): JSX.Element {
  const art = mapArt(theme);

  return (
    <div
      className={styles.art}
      aria-hidden="true"
      style={
        {
          '--art-sky-top': art.skyTop,
          '--art-sky-bottom': art.skyBottom,
          '--art-accent': art.accent,
        } as CSSProperties
      }
      data-locked={locked ? 'true' : 'false'}
    >
      {/*
        `preserveAspectRatio="none"` so the horizon always lands on the bottom
        edge of the panel whatever the card is scaled to. These are silhouettes,
        not diagrams: stretching one is invisible, and letterboxing one would
        leave a band of nothing under the skyline.
      */}
      <svg className={styles.artScene} viewBox="0 0 100 60" preserveAspectRatio="none">
        {art.layers.map((layer) => (
          <polygon
            key={layer.points}
            points={layer.points}
            fill={layer.depth === 'far' ? art.far : art.near}
            opacity={layer.depth === 'far' ? 0.75 : 1}
          />
        ))}
      </svg>
    </div>
  );
}
