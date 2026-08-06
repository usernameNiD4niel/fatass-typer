import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef, type JSX } from 'react';
import type { Group } from 'three';

import { MAX_SNAPSHOT_POPUPS, type WorldSnapshot } from '../game-bridge';
import { laneCenterX } from './scene-config';
import styles from './ScorePopups.module.css';

/**
 * Floating score labels — what that word was worth, said where it happened.
 *
 * The game already computed all of this and showed none of it. Score was a
 * number in a corner that changed by an unexplained amount, so a player could
 * not tell a decisive clear from a scraped one, and a mistyped character cost
 * points silently. Both are now stated at the moment they happen, over the road
 * rather than in the HUD, because that is where the player is looking.
 *
 * ## Why the pool is read whole
 *
 * `popupCount` says how many are alive but not *which* slots, since the ring
 * buffer recycles the oldest rather than compacting. Empty slots carry an empty
 * `id` and are skipped. Iterating the whole fixed pool costs six checks a frame
 * and avoids the allocation that compacting would need.
 *
 * ## Why nothing here is React state
 *
 * A popup changes every frame for the second or so it lives. Held in state that
 * would re-render the scene per frame, which is the one thing the architecture
 * forbids. The elements are mounted once, and `useFrame` writes their transform
 * and opacity directly.
 */

export interface ScorePopupsProps {
  readonly snapshot: WorldSnapshot;
  readonly reducedMotion: boolean;
}

/** Height the label starts at, in metres. Above the runner, below the word. */
const START_HEIGHT_METERS = 1.9;

/** How far it rises over its life, in metres. */
const RISE_METERS = 1.5;

/** How far ahead of the player it sits, in metres. */
const DISTANCE_METERS = 6;

/** Matches `POPUP_LIFETIME_MS` in the runtime host. */
const LIFETIME_MS = 950;

export function ScorePopups({ snapshot, reducedMotion }: ScorePopupsProps): JSX.Element {
  const groupRefs = useRef<(Group | null)[]>([]);
  const labelRefs = useRef<(HTMLParagraphElement | null)[]>([]);

  useFrame(() => {
    for (let index = 0; index < MAX_SNAPSHOT_POPUPS; index += 1) {
      const group = groupRefs.current[index];
      const label = labelRefs.current[index];
      if (!group || !label) continue;

      const popup = snapshot.popups[index];
      if (popup === undefined || popup.id === '') {
        group.visible = false;
        continue;
      }

      const life = Math.min(1, popup.ageMs / LIFETIME_MS);
      group.visible = true;
      group.position.set(
        laneCenterX(popup.lane),
        START_HEIGHT_METERS + (reducedMotion ? 0 : RISE_METERS * life),
        -DISTANCE_METERS,
      );

      // Holds full strength for the first third, then fades. A label that
      // starts fading immediately is unreadable at the moment it matters most.
      const opacity = life < 0.34 ? 1 : 1 - (life - 0.34) / 0.66;
      label.style.opacity = String(Math.max(0, opacity));

      // Written only when it changes: this is per-frame code, and assigning
      // identical strings to the DOM every frame is work for nothing.
      const text = `${popup.points > 0 ? '+' : ''}${String(popup.points)}`;
      if (label.textContent !== text) {
        label.textContent = text;
        label.dataset['kind'] = popup.kind;
      }
    }
  });

  return (
    <>
      {Array.from({ length: MAX_SNAPSHOT_POPUPS }, (_unused, index) => (
        <group
          key={index}
          ref={(node): void => {
            groupRefs.current[index] = node;
          }}
          visible={false}
        >
          <Html center zIndexRange={[15, 0]} pointerEvents="none">
            <p
              ref={(node): void => {
                labelRefs.current[index] = node;
              }}
              className={styles.popup}
              data-kind="gain"
              aria-hidden="true"
            />
          </Html>
        </group>
      ))}
    </>
  );
}
