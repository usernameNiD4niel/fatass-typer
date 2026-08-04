import { useFrame } from '@react-three/fiber';
import { useRef, type JSX } from 'react';
import type { Group, Mesh } from 'three';

import type { WorldSnapshot } from '../game-bridge';
import { laneCenterX, PLAYER_HEIGHT_METERS } from './scene-config';

/**
 * The runner, seen from behind (spec §11).
 *
 * A stylised figure from box primitives. Every *position* it takes comes from
 * the snapshot — which is to say from `game-core/motion`, the same curve the
 * rules use to decide whether a lane change finished in time. This component
 * adds only what cannot change an outcome: the run cycle, the torso sway, the
 * lean into a turn, the squash on landing.
 *
 * That division is the whole reason the lane easing lives in `game-core`. If
 * this file owned the curve, the rules could not answer the question the car
 * encounter turns on.
 */

const COLORS = {
  skin: '#e8b48c',
  shirt: '#2f6fd0',
  shorts: '#2b3440',
  shoe: '#22262c',
  hair: '#4a3728',
} as const;

/** Strides per second at the map's base speed. Scaled by actual speed. */
const STRIDE_RATE = 1.6;

/** How high flight holds the runner. Above a box truck, and visibly so. */
const FLIGHT_HEIGHT_METERS = 4.2;

export interface PlayerProps {
  readonly snapshot: WorldSnapshot;
  readonly reducedMotion: boolean;
}

export function Player({ snapshot, reducedMotion }: PlayerProps): JSX.Element {
  const rootRef = useRef<Group>(null);
  const bodyRef = useRef<Group>(null);
  const leftLegRef = useRef<Mesh>(null);
  const rightLegRef = useRef<Mesh>(null);
  const leftArmRef = useRef<Mesh>(null);
  const rightArmRef = useRef<Mesh>(null);

  const phase = useRef(0);
  const lastLaneX = useRef(0);
  const flight = useRef(0);

  useFrame((_, delta) => {
    const root = rootRef.current;
    const body = bodyRef.current;
    if (!root || !body) return;

    const laneX = laneCenterX(snapshot.lanePosition);

    root.position.x = laneX;
    // Flight is a *held* altitude, not a jump: the jump arc still applies on top
    // of it, so a jump while flying reads as a hop rather than a teleport.
    const flightLift = snapshot.effects.flying ? FLIGHT_HEIGHT_METERS : 0;
    flight.current += (flightLift - flight.current) * Math.min(1, delta * 3);
    root.position.y = snapshot.jumpHeightMeters + flight.current;

    // Lean into the move. Derived from how fast the body is crossing lanes, so
    // it is right for a one-lane hop and a two-lane dive without being told
    // which one this is.
    const lateralSpeed = delta > 0 ? (laneX - lastLaneX.current) / delta : 0;
    lastLaneX.current = laneX;
    const targetRoll = reducedMotion ? 0 : Math.max(-0.35, Math.min(0.35, -lateralSpeed * 0.05));
    body.rotation.z += (targetRoll - body.rotation.z) * Math.min(1, delta * 12);

    // Landing compression, and the crouch before take-off.
    const squash = 1 - snapshot.crouch * 0.22;
    body.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));

    // The run cycle runs on distance, not on time: the legs match the road.
    // Flying counts as airborne — there is nothing to run on up there.
    const airborne = snapshot.jumpHeightMeters > 0.05 || snapshot.effects.flying;
    phase.current += delta * STRIDE_RATE * Math.max(0.4, snapshot.speedMetersPerSecond / 6);

    const swing = airborne ? 0.5 : Math.sin(phase.current * Math.PI * 2) * 0.7;
    const counter = airborne ? -0.3 : -swing;

    if (leftLegRef.current) leftLegRef.current.rotation.x = swing;
    if (rightLegRef.current) rightLegRef.current.rotation.x = -swing;
    if (leftArmRef.current) leftArmRef.current.rotation.x = counter;
    if (rightArmRef.current) rightArmRef.current.rotation.x = -counter;

    // Vertical bounce, small enough to read as gait rather than as a hop.
    body.position.y =
      airborne || reducedMotion ? 0 : Math.abs(Math.sin(phase.current * Math.PI)) * 0.05;
  });

  const legLength = PLAYER_HEIGHT_METERS * 0.45;
  const torsoHeight = PLAYER_HEIGHT_METERS * 0.36;

  return (
    <group ref={rootRef}>
      <group ref={bodyRef}>
        {/* Legs, hinged at the hip so the swing reads as a stride. */}
        <group position={[-0.16, legLength, 0]}>
          <mesh ref={leftLegRef} position={[0, -legLength / 2, 0]}>
            <boxGeometry args={[0.22, legLength, 0.24]} />
            <meshLambertMaterial color={COLORS.shorts} />
          </mesh>
        </group>
        <group position={[0.16, legLength, 0]}>
          <mesh ref={rightLegRef} position={[0, -legLength / 2, 0]}>
            <boxGeometry args={[0.22, legLength, 0.24]} />
            <meshLambertMaterial color={COLORS.shorts} />
          </mesh>
        </group>

        <mesh position={[-0.16, 0.05, 0.02]}>
          <boxGeometry args={[0.24, 0.1, 0.34]} />
          <meshLambertMaterial color={COLORS.shoe} />
        </mesh>
        <mesh position={[0.16, 0.05, 0.02]}>
          <boxGeometry args={[0.24, 0.1, 0.34]} />
          <meshLambertMaterial color={COLORS.shoe} />
        </mesh>

        {/* Torso — heavy-set, which is the character. */}
        <mesh position={[0, legLength + torsoHeight / 2, 0]}>
          <boxGeometry args={[0.72, torsoHeight, 0.46]} />
          <meshLambertMaterial color={COLORS.shirt} />
        </mesh>

        <group position={[-0.44, legLength + torsoHeight * 0.85, 0]}>
          <mesh ref={leftArmRef} position={[0, -torsoHeight * 0.4, 0]}>
            <boxGeometry args={[0.17, torsoHeight * 0.8, 0.2]} />
            <meshLambertMaterial color={COLORS.skin} />
          </mesh>
        </group>
        <group position={[0.44, legLength + torsoHeight * 0.85, 0]}>
          <mesh ref={rightArmRef} position={[0, -torsoHeight * 0.4, 0]}>
            <boxGeometry args={[0.17, torsoHeight * 0.8, 0.2]} />
            <meshLambertMaterial color={COLORS.skin} />
          </mesh>
        </group>

        <mesh position={[0, legLength + torsoHeight + 0.14, 0]}>
          <boxGeometry args={[0.3, 0.3, 0.3]} />
          <meshLambertMaterial color={COLORS.skin} />
        </mesh>
        <mesh position={[0, legLength + torsoHeight + 0.28, -0.02]}>
          <boxGeometry args={[0.32, 0.12, 0.32]} />
          <meshLambertMaterial color={COLORS.hair} />
        </mesh>
      </group>
    </group>
  );
}
