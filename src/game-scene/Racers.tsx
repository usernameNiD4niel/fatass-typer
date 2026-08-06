import { useFrame } from '@react-three/fiber';
import { useRef, type JSX } from 'react';
import type { Group } from 'three';

import { MAX_SNAPSHOT_RACERS, type WorldSnapshot } from '../game-bridge';
import { racerKit } from './racer-kits';
import { pose } from './runner/gait';
import { RIG } from './runner/runner-rig';
import { shiftAt } from './curve-state';
import { laneCenterX } from './scene-config';

/**
 * The two opponents.
 *
 * The same figure as the player, in different colours, with the same gait
 * function driving it — which is the point of `runner/gait.ts` being pure and
 * separate. A rival that ran differently from the player would read as a
 * different kind of thing rather than as somebody you are racing.
 *
 * ## They are drawn, not decided
 *
 * Every position here comes from the snapshot. Nothing in this file can change
 * who wins: `game-core/race` decides that, and it does so without knowing this
 * file exists.
 *
 * ## They can be run through
 *
 * Nothing in this game collides, so a rival in the player's lane is passed
 * through rather than bumped. That is a deliberate choice recorded in the run
 * rules, not an oversight here: adding a collision would make the race a second
 * way to lose, and the chaser has that job.
 */

export interface RacersProps {
  readonly snapshot: WorldSnapshot;
  readonly reducedMotion: boolean;
}

/** Strides per second at six metres a second, matching the player's rig. */
const STRIDE_RATE = 1.6;
const STRIDE_REFERENCE_SPEED = 6;

export function Racers({ snapshot, reducedMotion }: RacersProps): JSX.Element {
  const groups = useRef<(Group | null)[]>([]);
  const hips = useRef<(Group | null)[]>([]);
  const knees = useRef<(Group | null)[]>([]);
  const shoulders = useRef<(Group | null)[]>([]);
  /** One phase per racer, so their strides are not in lockstep. */
  const phases = useRef<number[]>(Array.from({ length: MAX_SNAPSHOT_RACERS }, (_, i) => i * 0.37));
  const lastAhead = useRef<number[]>(Array.from({ length: MAX_SNAPSHOT_RACERS }, () => 0));

  useFrame((_, delta) => {
    for (let index = 0; index < MAX_SNAPSHOT_RACERS; index += 1) {
      const group = groups.current[index];
      if (!group) continue;

      const racer = index < snapshot.racerCount ? snapshot.racers[index] : undefined;
      if (racer === undefined) {
        group.visible = false;
        continue;
      }

      group.visible = true;
      // On the road, which bends: the same shift the tarmac under them gets.
      group.position.x = laneCenterX(racer.lane) + shiftAt(racer.aheadMeters);
      // Ahead of the player is *into* the screen, which is negative z.
      group.position.z = -racer.aheadMeters;

      /*
       * Their gait runs on their own speed, not the player's.
       *
       * Derived from how fast the gap is changing rather than passed through
       * the snapshot: the scene already knows where they were last frame, and
       * a rival's exact speed is not something any rule depends on.
       */
      const previous = lastAhead.current[index] ?? racer.aheadMeters;
      const closing = delta > 0 ? (racer.aheadMeters - previous) / delta : 0;
      lastAhead.current[index] = racer.aheadMeters;
      const speed = Math.max(0, snapshot.speedMetersPerSecond + closing);

      const phase =
        (phases.current[index] ?? 0) +
        delta * STRIDE_RATE * Math.max(0.4, speed / STRIDE_REFERENCE_SPEED);
      phases.current[index] = phase;

      const next = pose({
        phase,
        speedMetersPerSecond: speed,
        airborne: false,
        reducedMotion,
      });

      const hip = hips.current[index];
      const knee = knees.current[index];
      const shoulder = shoulders.current[index];
      if (hip) hip.rotation.x = next.leftHip;
      if (knee) knee.rotation.x = next.rightHip;
      if (shoulder) shoulder.rotation.x = next.leftShoulder;
    }
  });

  return (
    <group>
      {Array.from({ length: MAX_SNAPSHOT_RACERS }, (_, index) => {
        const kit = racerKit(index);

        return (
          <group
            key={index}
            visible={false}
            ref={(group) => {
              groups.current[index] = group;
            }}
          >
            {/*
              A simpler build than the player's.

              They are seen from behind at ten to forty metres, usually moving,
              and never the thing the player is looking at. Two legs, two arms
              and a torso read correctly at that distance; the ball joints and
              the belly that make the player's figure work up close would be a
              few hundred triangles nobody resolves.
            */}
            <group
              ref={(group) => {
                hips.current[index] = group;
              }}
              position={[-RIG.hipHalfWidth, RIG.hipHeight, 0]}
            >
              <mesh castShadow position={[0, -RIG.thighLength, 0]}>
                <capsuleGeometry args={[RIG.thighRadius, RIG.thighLength * 1.5, 4, 8]} />
                <meshStandardMaterial color={kit.shorts} roughness={0.85} />
              </mesh>
            </group>
            <group
              ref={(group) => {
                knees.current[index] = group;
              }}
              position={[RIG.hipHalfWidth, RIG.hipHeight, 0]}
            >
              <mesh castShadow position={[0, -RIG.thighLength, 0]}>
                <capsuleGeometry args={[RIG.thighRadius, RIG.thighLength * 1.5, 4, 8]} />
                <meshStandardMaterial color={kit.shorts} roughness={0.85} />
              </mesh>
            </group>

            <mesh castShadow position={[0, RIG.hipHeight + RIG.torsoHeight / 2, 0]}>
              <capsuleGeometry args={[RIG.torsoRadius * 0.85, RIG.torsoHeight * 0.6, 6, 12]} />
              <meshStandardMaterial color={kit.shirt} roughness={0.75} />
            </mesh>

            <group
              ref={(group) => {
                shoulders.current[index] = group;
              }}
              position={[-RIG.shoulderHalfWidth, RIG.hipHeight + RIG.shoulderHeight, 0]}
            >
              <mesh castShadow position={[0, -RIG.upperArmLength * 0.8, 0]}>
                <capsuleGeometry args={[RIG.upperArmRadius, RIG.upperArmLength, 4, 8]} />
                <meshStandardMaterial color={kit.skin} roughness={0.8} />
              </mesh>
            </group>
            <mesh
              castShadow
              position={[RIG.shoulderHalfWidth, RIG.hipHeight + RIG.shoulderHeight * 0.6, 0]}
            >
              <capsuleGeometry args={[RIG.upperArmRadius, RIG.upperArmLength, 4, 8]} />
              <meshStandardMaterial color={kit.skin} roughness={0.8} />
            </mesh>

            <mesh
              castShadow
              position={[0, RIG.hipHeight + RIG.torsoHeight + RIG.neckHeight + RIG.headRadius, 0]}
            >
              <sphereGeometry args={[RIG.headRadius, 12, 10]} />
              <meshStandardMaterial color={kit.skin} roughness={0.8} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
