import { useFrame } from '@react-three/fiber';
import { useRef, type JSX } from 'react';
import type { Group } from 'three';

import type { WorldSnapshot } from '../game-bridge';
import { MAX_SNAPSHOT_COINS } from '../game-bridge';
import { laneCenterX } from './scene-config';

/**
 * Coin lines.
 *
 * A row of spinning coins in a lane, with a word over it. Optional: drive past
 * and nothing happens except that you do not have them.
 *
 * Fixed pools again — `MAX_SNAPSHOT_COINS` lines of `COINS_PER_LINE` each,
 * mounted once and shown or hidden. Coins that appeared and disappeared with
 * the encounter would be React elements created during a run, which is the one
 * thing the render loop is not allowed to do.
 */

export interface CoinsProps {
  readonly snapshot: WorldSnapshot;
  readonly reducedMotion: boolean;
}

/** Coins drawn per line. The value on the HUD counts them; this draws them. */
const COINS_PER_LINE = 8;

/** Metres between coins in a line. */
const COIN_SPACING = 2.6;

const COIN_HEIGHT = 1.05;
const GOLD = '#ffc531';
const GOLD_EDGE = '#c98f10';

export function Coins({ snapshot, reducedMotion }: CoinsProps): JSX.Element {
  const lines = useRef<(Group | null)[]>([]);
  const spin = useRef(0);

  useFrame((_, delta) => {
    if (!reducedMotion) spin.current += delta * 2.4;

    for (let index = 0; index < MAX_SNAPSHOT_COINS; index += 1) {
      const line = lines.current[index];
      if (!line) continue;

      const coin = index < snapshot.coinCount ? snapshot.coins[index] : undefined;

      if (coin === undefined || coin.collected) {
        line.visible = false;
        continue;
      }

      line.visible = true;
      line.position.x = laneCenterX(coin.lane);
      line.position.z = -coin.distanceMeters;

      for (let slot = 0; slot < line.children.length; slot += 1) {
        const child = line.children[slot];
        if (!child) continue;

        // The whole line turns together, offset per coin so it reads as a run
        // of them rather than one object.
        child.rotation.y = spin.current + slot * 0.4;
        // Committed coins bob, as a small "you have these" before you do.
        child.position.y =
          COIN_HEIGHT +
          (reducedMotion || !coin.committed ? 0 : Math.sin(spin.current * 2 + slot) * 0.12);
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
          {Array.from({ length: COINS_PER_LINE }, (_, slot) => (
            <group key={slot} position={[0, COIN_HEIGHT, -slot * COIN_SPACING]}>
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.42, 0.42, 0.08, 14]} />
                <meshLambertMaterial color={GOLD} emissive={GOLD_EDGE} emissiveIntensity={0.35} />
              </mesh>
            </group>
          ))}
        </group>
      ))}
    </group>
  );
}
