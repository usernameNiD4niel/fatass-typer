import { useFrame } from '@react-three/fiber';
import { useRef, type JSX } from 'react';
import type { Group } from 'three';
import { Vector3 } from 'three';

import type { WorldSnapshot } from '../game-bridge';
import { MAX_SNAPSHOT_COIN_UNITS, MAX_SNAPSHOT_COINS } from '../game-bridge';
import { laneCenterX } from './scene-config';
import { shiftAt } from './curve-state';
import { Glow } from './Glow';

/**
 * Coin lines.
 *
 * A row of spinning coins in a lane, with a word over it. Optional: drive past
 * and nothing happens except that you do not have them.
 *
 * Fixed pools again — `MAX_SNAPSHOT_COINS` lines of `MAX_SNAPSHOT_COIN_UNITS`
 * each, mounted once and shown or hidden. Coins that appeared and disappeared
 * with the encounter would be React elements created during a run, which is the
 * one thing the render loop is not allowed to do.
 *
 * ## Collecting, one at a time
 *
 * Each coin is decided at its own plane rather than the line being won or lost
 * at one. When one is taken the scene flies it up out of the road and off the
 * top of the view, towards where the counter sits in the HUD, shrinking as it
 * goes. The flight is *only* here: the rules already recorded the point at the
 * moment of collection, and a per-coin animation timer in `game-core` would be
 * a rendering concern living in the one layer that must not have any.
 *
 * The flight target is computed from the camera each frame rather than fixed in
 * world space, so it stays at the top of the screen however the camera drifts.
 */

export interface CoinsProps {
  readonly snapshot: WorldSnapshot;
  readonly reducedMotion: boolean;
}

const COIN_HEIGHT = 1.05;
const GOLD = '#ffc531';
const GOLD_EDGE = '#c98f10';

/** How long a collected coin takes to reach the counter, in seconds. */
const FLIGHT_SECONDS = 0.55;

/** Metres above the camera the flight ends — off the top of the view. */
const FLIGHT_RISE_METERS = 4.2;

/** Metres in front of the camera the flight ends. */
const FLIGHT_FORWARD_METERS = 5;

/** Per-coin flight progress, 0..1. Zero means "sitting in the road". */
type FlightState = number[][];

const target = new Vector3();
const start = new Vector3();
const forward = new Vector3();

export function Coins({ snapshot, reducedMotion }: CoinsProps): JSX.Element {
  const lines = useRef<(Group | null)[]>([]);
  const spin = useRef(0);
  /** How far through its flight each coin is. Survives across frames. */
  const flights = useRef<FlightState>(
    Array.from({ length: MAX_SNAPSHOT_COINS }, () =>
      Array.from({ length: MAX_SNAPSHOT_COIN_UNITS }, () => 0),
    ),
  );

  useFrame(({ camera }, delta) => {
    if (!reducedMotion) spin.current += delta * 2.4;

    // Where a collected coin is heading: above and in front of the camera, which
    // reads as "up and off the top of the screen" from the driver's seat.
    camera.getWorldDirection(forward);
    target
      .copy(camera.position)
      .addScaledVector(forward, FLIGHT_FORWARD_METERS)
      .setY(camera.position.y + FLIGHT_RISE_METERS);

    for (let index = 0; index < MAX_SNAPSHOT_COINS; index += 1) {
      const line = lines.current[index];
      const flight = flights.current[index];
      if (!line || !flight) continue;

      const coin = index < snapshot.coinCount ? snapshot.coins[index] : undefined;

      if (coin === undefined) {
        line.visible = false;
        for (let slot = 0; slot < flight.length; slot += 1) flight[slot] = 0;
        continue;
      }

      line.visible = true;
      line.position.x = laneCenterX(coin.lane) + shiftAt(coin.distanceMeters);
      line.position.z = -coin.distanceMeters;

      for (let slot = 0; slot < line.children.length; slot += 1) {
        const child = line.children[slot];
        const unit = slot < coin.unitCount ? coin.units[slot] : undefined;
        if (!child) continue;

        if (unit === undefined) {
          child.visible = false;
          continue;
        }

        // Driven past. It is simply not there any more.
        if (unit.passed && !unit.collected) {
          child.visible = false;
          continue;
        }

        if (unit.collected) {
          const progress = Math.min(1, (flight[slot] ?? 0) + delta / FLIGHT_SECONDS);
          flight[slot] = progress;

          if (progress >= 1) {
            child.visible = false;
            continue;
          }

          // The coin leaves the road and rises out of the world towards the
          // counter. Eased so it accelerates away rather than sliding.
          const eased = progress * progress;

          // The destination is a camera-relative point, so it has to come back
          // into the line's own space before it can be interpolated towards.
          line.updateWorldMatrix(true, false);
          start.copy(target);
          line.worldToLocal(start);

          const fromY = COIN_HEIGHT;
          const fromZ = -unit.offsetMeters;

          child.visible = true;
          child.position.set(
            start.x * eased,
            fromY + (start.y - fromY) * eased,
            fromZ + (start.z - fromZ) * eased,
          );
          child.scale.setScalar(Math.max(0.05, 1 - eased));
          child.rotation.y = spin.current + slot * 0.4 + eased * 12;
          continue;
        }

        // Still in the road, waiting.
        flight[slot] = 0;
        child.visible = true;
        child.scale.setScalar(1);
        child.position.set(
          0,
          COIN_HEIGHT +
            (reducedMotion || !coin.committed ? 0 : Math.sin(spin.current * 2 + slot) * 0.12),
          -unit.offsetMeters,
        );
        // The whole line turns together, offset per coin so it reads as a run of
        // them rather than one object.
        child.rotation.y = spin.current + slot * 0.4;
      }
    }
  });

  return (
    <group>
      {Array.from({ length: MAX_SNAPSHOT_COINS }, (_, line) => (
        <group
          key={line}
          visible={false}
          ref={(group) => {
            lines.current[line] = group;
          }}
        >
          {Array.from({ length: MAX_SNAPSHOT_COIN_UNITS }, (_, slot) => (
            <group key={slot} position={[0, COIN_HEIGHT, 0]}>
              {/*
                Actually metal, now that the lighting can show it: full metalness
                and a low roughness is what makes a coin catch the sun as it
                spins rather than simply being yellow.
              */}
              <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.42, 0.42, 0.08, 14]} />
                <meshStandardMaterial
                  color={GOLD}
                  emissive={GOLD_EDGE}
                  emissiveIntensity={0.3}
                  roughness={0.25}
                  metalness={1}
                />
              </mesh>
              {/*
                A halo, so a coin is findable on the night maps. Edge-on, a disc
                is a few pixels of nothing; this is what keeps it visible while
                it spins. See `Glow.tsx`.
              */}
              <Glow color={GOLD} size={1.5} opacity={0.4} />
            </group>
          ))}
        </group>
      ))}
    </group>
  );
}
