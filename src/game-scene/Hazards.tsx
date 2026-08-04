import { useFrame } from '@react-three/fiber';
import { useRef, type JSX } from 'react';
import type { Group } from 'three';

import type { HazardSnapshot, WorldSnapshot } from '../game-bridge';
import { MAX_SNAPSHOT_HAZARDS } from '../game-bridge';
import { laneCenterX, LANE_WIDTH_METERS, type ScenePalette } from './scene-config';

/**
 * Cars and jump obstacles.
 *
 * A fixed pool of `MAX_SNAPSHOT_HAZARDS` groups, each holding both silhouettes
 * and showing whichever the slot currently needs. Hazards are never mounted or
 * unmounted mid-run: creating React elements as the road goes past is exactly
 * the per-frame allocation spec §20 warns about, and a hazard that pops into
 * existence is a hazard that was not readable early.
 *
 * Both shapes are deliberately unmistakable at distance. A car is wide, low, and
 * coloured; a jump hazard is narrow, striped, and sits across the lane. The
 * player has to know which verb is being asked for before they can read the word.
 */

export interface HazardsProps {
  readonly snapshot: WorldSnapshot;
  readonly palette: ScenePalette;
}

const CAR_COLORS = ['#d94f4f', '#e0a13c', '#4f7fd9'] as const;

export function Hazards({ snapshot, palette }: HazardsProps): JSX.Element {
  const slots = useRef<(Group | null)[]>([]);

  useFrame(() => {
    for (let index = 0; index < MAX_SNAPSHOT_HAZARDS; index += 1) {
      const group = slots.current[index];
      if (!group) continue;

      const hazard = index < snapshot.hazardCount ? snapshot.hazards[index] : undefined;

      if (hazard === undefined || hazard.resolved) {
        group.visible = false;
        continue;
      }

      group.visible = true;
      group.position.z = -hazard.distanceMeters;

      const car = group.children[0];
      const jump = group.children[1];
      const isCar = hazard.action === 'lane-change';

      if (car) car.visible = isCar;
      if (jump) jump.visible = !isCar;

      positionBlockers(isCar ? car : jump, hazard);
    }
  });

  return (
    <group>
      {Array.from({ length: MAX_SNAPSHOT_HAZARDS }, (_, index) => (
        <group
          key={index}
          visible={false}
          ref={(group) => {
            slots.current[index] = group;
          }}
        >
          <group>
            {[0, 1, 2].map((lane) => (
              <Car key={lane} color={CAR_COLORS[lane % CAR_COLORS.length] ?? '#d94f4f'} />
            ))}
          </group>
          <group>
            {[0, 1, 2].map((lane) => (
              <JumpObstacle key={lane} accent={palette.accent} />
            ))}
          </group>
        </group>
      ))}
    </group>
  );
}

/**
 * Puts one blocker in each lane the hazard occupies and hides the rest.
 *
 * A car encounter can block two lanes on the harder maps, so the count is not
 * fixed — but the *pool* is, which is what keeps this allocation-free.
 */
function positionBlockers(container: unknown, hazard: HazardSnapshot): void {
  if (!isGroup(container)) return;

  for (let index = 0; index < container.children.length; index += 1) {
    const child = container.children[index];
    if (!child) continue;

    const lane = hazard.blockedLanes[index];
    if (lane === undefined) {
      child.visible = false;
      continue;
    }

    child.visible = true;
    child.position.x = laneCenterX(lane);
  }
}

function isGroup(value: unknown): value is Group {
  return typeof value === 'object' && value !== null && 'children' in value;
}

/** A low, wide box on wheels. Reads as "go around" at distance. */
function Car({ color }: { color: string }): JSX.Element {
  return (
    <group>
      <mesh position={[0, 0.65, 0]}>
        <boxGeometry args={[LANE_WIDTH_METERS * 0.72, 0.9, 4.2]} />
        <meshLambertMaterial color={color} />
      </mesh>
      <mesh position={[0, 1.35, -0.3]}>
        <boxGeometry args={[LANE_WIDTH_METERS * 0.6, 0.6, 2.1]} />
        <meshLambertMaterial color="#2b3440" />
      </mesh>
      {[-1, 1].map((side) =>
        [-1.4, 1.4].map((z) => (
          <mesh key={`${String(side)}:${String(z)}`} position={[side * 1.05, 0.32, z]}>
            <boxGeometry args={[0.24, 0.62, 0.62]} />
            <meshLambertMaterial color="#1c1f24" />
          </mesh>
        )),
      )}
      {/* Rear lights, so a stationary car reads as a car and not as a wall. */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.9, 0.85, 2.12]}>
          <boxGeometry args={[0.4, 0.22, 0.06]} />
          <meshBasicMaterial color="#ff5b5b" />
        </mesh>
      ))}
    </group>
  );
}

/** A striped barrier low enough to clear. Reads as "go over". */
function JumpObstacle({ accent }: { accent: string }): JSX.Element {
  return (
    <group>
      <mesh position={[0, 0.42, 0]}>
        <boxGeometry args={[LANE_WIDTH_METERS * 0.86, 0.84, 0.5]} />
        <meshLambertMaterial color={accent} />
      </mesh>
      {[-1, 0, 1].map((offset) => (
        <mesh key={offset} position={[offset * 0.9, 0.42, 0.28]}>
          <boxGeometry args={[0.34, 0.84, 0.04]} />
          <meshBasicMaterial color="#1c1f24" />
        </mesh>
      ))}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * LANE_WIDTH_METERS * 0.4, 0.25, 0]}>
          <boxGeometry args={[0.22, 0.5, 0.6]} />
          <meshLambertMaterial color="#e4e7eb" />
        </mesh>
      ))}
    </group>
  );
}
