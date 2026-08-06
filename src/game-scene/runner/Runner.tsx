import { useFrame } from '@react-three/fiber';
import { useRef, type JSX } from 'react';
import type { Group } from 'three';

import type { WorldSnapshot } from '../../game-bridge';
import { laneCenterX, type RunnerLook } from '../scene-config';
import { pose } from './gait';
import { RIG, RUNNER_COLORS } from './runner-rig';

/**
 * The runner, seen from behind (spec §11).
 *
 * Every *position* it takes comes from the snapshot — which is to say from
 * `game-core/motion`, the same curve the rules use. This component adds only
 * what cannot change an outcome: the run cycle, the torso twist, the lean into
 * a turn, the squash on landing.
 *
 * ## Why capsules and ball joints
 *
 * The figure was nine boxes with a leg swung rigidly from the hip. Two things
 * make it read as a person instead: limbs that bend at the knee and elbow, and
 * a sphere at every hinge. The sphere is the cheap half and the important one —
 * without it, two capsules meeting at an angle show the gap between their
 * rounded ends, and the character looks like segmented tubing.
 *
 * ## Why the geometry is declared once
 *
 * Left and right share a capsule; every joint shares a sphere. Declaring them
 * inline per mesh would be twenty geometries for six shapes, uploaded twice
 * over, for a figure nobody sees the far side of.
 */

export interface RunnerProps {
  readonly snapshot: WorldSnapshot;
  readonly reducedMotion: boolean;
  /** What the player chose in the wardrobe. Colours only — never a rule. */
  readonly look?: RunnerLook;
}

/** Strides per second at six metres a second. Scaled by actual speed. */
const STRIDE_RATE = 1.6;
const STRIDE_REFERENCE_SPEED = 6;

/** How high flight holds the runner. Well clear of the road, and visibly so. */
const FLIGHT_HEIGHT_METERS = 4.2;

/** What the figure wears when nobody has chosen anything. */
const DEFAULT_LOOK: RunnerLook = {
  shirt: RUNNER_COLORS.shirt,
  shorts: RUNNER_COLORS.shorts,
  skin: RUNNER_COLORS.skin,
  shoe: RUNNER_COLORS.shoe,
  effect: '#ffffff',
};

function Joint({ radius, color }: { radius: number; color: string }): JSX.Element {
  return (
    <mesh castShadow>
      <sphereGeometry args={[radius, 12, 8]} />
      <meshStandardMaterial color={color} roughness={0.8} metalness={0} />
    </mesh>
  );
}

export function Runner({ snapshot, reducedMotion, look }: RunnerProps): JSX.Element {
  const kit = look ?? DEFAULT_LOOK;
  const rootRef = useRef<Group>(null);
  const bodyRef = useRef<Group>(null);
  const torsoRef = useRef<Group>(null);

  const leftHipRef = useRef<Group>(null);
  const rightHipRef = useRef<Group>(null);
  const leftKneeRef = useRef<Group>(null);
  const rightKneeRef = useRef<Group>(null);
  const leftAnkleRef = useRef<Group>(null);
  const rightAnkleRef = useRef<Group>(null);
  const leftShoulderRef = useRef<Group>(null);
  const rightShoulderRef = useRef<Group>(null);
  const leftElbowRef = useRef<Group>(null);
  const rightElbowRef = useRef<Group>(null);

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
    phase.current +=
      delta * STRIDE_RATE * Math.max(0.4, snapshot.speedMetersPerSecond / STRIDE_REFERENCE_SPEED);

    const next = pose({
      phase: phase.current,
      speedMetersPerSecond: snapshot.speedMetersPerSecond,
      airborne,
      reducedMotion,
    });

    if (leftHipRef.current) leftHipRef.current.rotation.x = next.leftHip;
    if (rightHipRef.current) rightHipRef.current.rotation.x = next.rightHip;
    if (leftKneeRef.current) leftKneeRef.current.rotation.x = -next.leftKnee;
    if (rightKneeRef.current) rightKneeRef.current.rotation.x = -next.rightKnee;
    if (leftAnkleRef.current) leftAnkleRef.current.rotation.x = next.leftAnkle;
    if (rightAnkleRef.current) rightAnkleRef.current.rotation.x = next.rightAnkle;
    if (leftShoulderRef.current) leftShoulderRef.current.rotation.x = next.leftShoulder;
    if (rightShoulderRef.current) rightShoulderRef.current.rotation.x = next.rightShoulder;
    if (leftElbowRef.current) leftElbowRef.current.rotation.x = -next.leftElbow;
    if (rightElbowRef.current) rightElbowRef.current.rotation.x = -next.rightElbow;

    if (torsoRef.current) torsoRef.current.rotation.y = next.torsoTwist;
    body.rotation.x = next.lean;
    body.position.y = next.bob;
  });

  const legs = [
    { side: -1, hip: leftHipRef, knee: leftKneeRef, ankle: leftAnkleRef },
    { side: 1, hip: rightHipRef, knee: rightKneeRef, ankle: rightAnkleRef },
  ] as const;

  const arms = [
    { side: -1, shoulder: leftShoulderRef, elbow: leftElbowRef },
    { side: 1, shoulder: rightShoulderRef, elbow: rightElbowRef },
  ] as const;

  return (
    <group ref={rootRef}>
      <group ref={bodyRef}>
        {legs.map(({ side, hip, knee, ankle }) => (
          <group key={side} ref={hip} position={[side * RIG.hipHalfWidth, RIG.hipHeight, 0]}>
            <Joint radius={RIG.jointRadius} color={kit.skin} />
            <mesh castShadow position={[0, -RIG.thighLength / 2, 0]}>
              <capsuleGeometry args={[RIG.thighRadius, RIG.thighLength * 0.7, 4, 10]} />
              <meshStandardMaterial color={kit.shorts} roughness={0.85} metalness={0} />
            </mesh>

            <group ref={knee} position={[0, -RIG.thighLength, 0]}>
              <Joint radius={RIG.jointRadius * 0.85} color={kit.skin} />
              <mesh castShadow position={[0, -RIG.shinLength / 2, 0]}>
                <capsuleGeometry args={[RIG.shinRadius, RIG.shinLength * 0.7, 4, 10]} />
                <meshStandardMaterial color={kit.skin} roughness={0.8} metalness={0} />
              </mesh>

              <group ref={ankle} position={[0, -RIG.shinLength, 0]}>
                <mesh castShadow position={[0, -RIG.footHeight / 2, RIG.footLength * 0.22]}>
                  <boxGeometry args={[RIG.footWidth, RIG.footHeight, RIG.footLength]} />
                  <meshStandardMaterial color={kit.shoe} roughness={0.6} metalness={0} />
                </mesh>
              </group>
            </group>
          </group>
        ))}

        <group ref={torsoRef} position={[0, RIG.hipHeight, 0]}>
          <mesh castShadow position={[0, RIG.torsoHeight / 2, 0]}>
            <capsuleGeometry args={[RIG.torsoRadius, RIG.torsoHeight * 0.6, 6, 14]} />
            <meshStandardMaterial color={kit.shirt} roughness={0.75} metalness={0} />
          </mesh>

          {/*
            The belly. It is the character — the whole figure is heavy-set, and a
            rebuild that quietly slimmed him down would be a different runner.
          */}
          <mesh
            castShadow
            position={[0, RIG.torsoHeight * 0.42 - RIG.bellyDrop, RIG.bellyPush]}
            scale={[1, 0.82, 0.95]}
          >
            <sphereGeometry args={[RIG.bellyRadius, 16, 12]} />
            <meshStandardMaterial color={kit.shirt} roughness={0.75} metalness={0} />
          </mesh>

          {arms.map(({ side, shoulder, elbow }) => (
            <group
              key={side}
              ref={shoulder}
              position={[side * RIG.shoulderHalfWidth, RIG.shoulderHeight, 0]}
            >
              <Joint radius={RIG.jointRadius * 0.8} color={kit.skin} />
              <mesh castShadow position={[0, -RIG.upperArmLength / 2, 0]}>
                <capsuleGeometry args={[RIG.upperArmRadius, RIG.upperArmLength * 0.7, 4, 10]} />
                <meshStandardMaterial color={kit.shirt} roughness={0.75} metalness={0} />
              </mesh>

              <group ref={elbow} position={[0, -RIG.upperArmLength, 0]}>
                <Joint radius={RIG.jointRadius * 0.65} color={kit.skin} />
                <mesh castShadow position={[0, -RIG.forearmLength / 2, 0]}>
                  <capsuleGeometry args={[RIG.forearmRadius, RIG.forearmLength * 0.7, 4, 10]} />
                  <meshStandardMaterial color={kit.skin} roughness={0.8} metalness={0} />
                </mesh>
              </group>
            </group>
          ))}

          <mesh castShadow position={[0, RIG.torsoHeight + RIG.neckHeight + RIG.headRadius, 0]}>
            <sphereGeometry args={[RIG.headRadius, 16, 12]} />
            <meshStandardMaterial color={kit.skin} roughness={0.8} metalness={0} />
          </mesh>
          <mesh
            castShadow
            position={[
              0,
              RIG.torsoHeight + RIG.neckHeight + RIG.headRadius * 1.35,
              -RIG.headRadius * 0.12,
            ]}
            scale={[1, 0.62, 1]}
          >
            <sphereGeometry args={[RIG.headRadius * 1.02, 14, 10]} />
            <meshStandardMaterial color={RUNNER_COLORS.hair} roughness={0.9} metalness={0} />
          </mesh>
        </group>
      </group>
    </group>
  );
}
