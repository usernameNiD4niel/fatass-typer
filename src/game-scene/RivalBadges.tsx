import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef, type JSX } from 'react';
import type { Group } from 'three';

import { MAX_SNAPSHOT_RACERS, type WorldSnapshot } from '../game-bridge';
import { racerKit } from './racer-kits';
import styles from './RivalBadges.module.css';
import { shiftAt } from './curve-state';
import { laneCenterX } from './scene-config';

/**
 * How far each opponent is, beside the runner.
 *
 * ## Why it is here and not in the HUD
 *
 * It was two readouts in the top bar, and the top bar is the wrong place for
 * it: the player's eyes are on the word and on the road, and a number that has
 * to be *found* is a number nobody reads while typing. Beside the runner it is
 * in peripheral vision, which is where a gap that changes every frame belongs.
 *
 * ## Why the badge rather than a bare number
 *
 * Two opponents, so a number on its own has to be labelled, and a label has to
 * be read. A circle in the runner's own colours is recognised rather than read,
 * and the colour is shared with the figure on the road (`racer-kits.ts`) so the
 * two are the same object as far as the player is concerned.
 *
 * ## Real time
 *
 * Written straight into the DOM from `useFrame`, not through React. The gap
 * changes every frame; routed through state it would arrive at the bridge's
 * ~10Hz and visibly step. Nothing here re-renders after mount.
 */

export interface RivalBadgesProps {
  readonly snapshot: WorldSnapshot;
}

/** How far to the side of the runner the badges sit, in metres. */
const SIDE_OFFSET_METERS = 2.1;

/** How high they float. Level with the runner's shoulders, clear of their head. */
const BADGE_HEIGHT_METERS = 1.5;

/**
 * How far up the road they sit, in metres.
 *
 * A few metres ahead rather than level with the runner. At the runner's own
 * depth the camera is only seven metres back, so a two-metre offset throws the
 * badges out over the verge — far enough that they read as belonging to the
 * scenery rather than to the player. Pushing them up the road shrinks the
 * spread without moving them out of the corner of the eye.
 */
const BADGE_AHEAD_METERS = 4;

/**
 * A head-and-shoulders mark, drawn rather than fetched.
 *
 * Two shapes: nobody is meant to recognise a face at this size. What has to
 * read at a glance is *that it is a runner* and *which one*, and the ring
 * around it carries the second half.
 */
function ProfileMark({ color }: { color: string }): JSX.Element {
  return (
    <svg className={styles.mark} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="9" r="4" fill={color} />
      <path d="M4 22c0-4.4 3.6-8 8-8s8 3.6 8 8z" fill={color} />
    </svg>
  );
}

export function RivalBadges({ snapshot }: RivalBadgesProps): JSX.Element {
  const rootRef = useRef<Group>(null);
  const holders = useRef<(Group | null)[]>([]);
  const labels = useRef<(HTMLSpanElement | null)[]>([]);

  useFrame(() => {
    const root = rootRef.current;
    if (root) root.position.x = laneCenterX(snapshot.lanePosition) + shiftAt(BADGE_AHEAD_METERS);

    for (let index = 0; index < MAX_SNAPSHOT_RACERS; index += 1) {
      const holder = holders.current[index];
      const label = labels.current[index];
      const racer = index < snapshot.racerCount ? snapshot.racers[index] : undefined;

      if (holder) holder.visible = racer !== undefined;
      if (racer === undefined || !label) continue;

      /*
       * The badge sits on the side of the road that opponent runs on, so it
       * points at them rather than at a slot. Their lane never changes mid-run,
       * but reading it from the snapshot means it cannot drift out of step if
       * that ever changes.
       */
      const left = racer.lane < 1;
      if (holder) holder.position.x = left ? -SIDE_OFFSET_METERS : SIDE_OFFSET_METERS;

      /*
       * Signed from the rival: `-5 m` means they are five metres behind you.
       * The sign is that way round because the number is about them.
       */
      const metres = Math.round(racer.aheadMeters);
      const text = `${metres >= 0 ? '+' : ''}${String(metres)} m`;
      // Guarded, because writing identical text every frame still dirties the
      // node and this runs sixty times a second for the length of a run.
      if (label.textContent !== text) label.textContent = text;
    }
  });

  return (
    <group ref={rootRef}>
      {Array.from({ length: MAX_SNAPSHOT_RACERS }, (_, index) => {
        const kit = racerKit(index);

        return (
          <group
            key={index}
            visible={false}
            ref={(group) => {
              holders.current[index] = group;
            }}
            position={[0, BADGE_HEIGHT_METERS, -BADGE_AHEAD_METERS]}
          >
            <Html center zIndexRange={[18, 0]} pointerEvents="none">
              {/*
                Decorative, deliberately. The same numbers are in the HUD as
                text for a screen reader — see `Hud.tsx` — and announcing a
                figure that changes sixty times a second would be unusable.
              */}
              <div className={styles.badge} aria-hidden="true">
                {/* The ring is the identity: same colour as the runner it names. */}
                <span className={styles.ring} style={{ borderColor: kit.shirt }}>
                  <ProfileMark color={kit.shirt} />
                </span>
                <span
                  className={styles.distance}
                  style={{ color: kit.shirt }}
                  ref={(node) => {
                    labels.current[index] = node;
                  }}
                >
                  0 m
                </span>
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}
