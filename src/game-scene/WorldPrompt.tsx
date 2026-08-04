import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef, type JSX } from 'react';
import type { Group, Mesh, MeshBasicMaterial } from 'three';

import type { WorldSnapshot } from '../game-bridge';
import { laneCenterX, LANE_WIDTH_METERS, type ScenePalette } from './scene-config';
import styles from './WorldPrompt.module.css';

/**
 * The typing challenge, in the world (spec §15).
 *
 * For a car it sits over the safe lane, above a glowing strip and an arrow that
 * say which way to go. For a jump hazard it sits directly above the obstacle.
 * Either way it travels with the thing it applies to, so the word and the reason
 * for the word are never in two different places.
 *
 * ## Why HTML and not 3D text
 *
 * The obvious choice is drei's `<Text>`. It is rejected for one concrete
 * reason: troika fetches its default font from a CDN, and this project ships no
 * remote assets. Bundling a font would fix that and cost a binary asset and a
 * licence audit.
 *
 * The overlay buys back more than it costs. Per-character styling is one span
 * each instead of two overlapping SDF meshes; the prompt inherits the app's font
 * stack, its type scale, and the player's prompt-size setting; high-contrast
 * mode already applies to it; and the word can be read by a screen reader
 * because it is text.
 *
 * The usual objection — that projecting a DOM node jitters — is handled the way
 * it has to be: drei's `<Html>` writes transforms directly in the render loop,
 * so nothing here goes through React state per frame.
 */

export interface WorldPromptProps {
  readonly snapshot: WorldSnapshot;
  readonly palette: ScenePalette;
  readonly reducedMotion: boolean;
}

/** Height the word floats at, in metres. Above a car, clear of the runner. */
const PROMPT_HEIGHT_METERS = 2.9;

export function WorldPrompt({ snapshot, palette, reducedMotion }: WorldPromptProps): JSX.Element {
  const rootRef = useRef<Group>(null);
  const cueRef = useRef<Mesh>(null);
  const arrowRef = useRef<Group>(null);
  const wordRef = useRef<HTMLParagraphElement>(null);

  useFrame(({ clock }) => {
    const root = rootRef.current;
    if (!root) return;

    const challenge = snapshot.challenge;
    if (challenge === null) {
      root.visible = false;

      return;
    }

    const hazard = findHazard(snapshot, challenge.hazardId);
    if (hazard === undefined) {
      root.visible = false;

      return;
    }

    root.visible = true;

    // Cars point at the safe lane; jumps point at themselves.
    const lane = challenge.safeLane ?? hazard.blockedLanes[0] ?? 1;
    root.position.set(laneCenterX(lane), PROMPT_HEIGHT_METERS, -hazard.distanceMeters);

    // The lane cue lies on the road *between* the player and the safe lane, so
    // the eye is led there rather than merely told (spec §6). It is scaled and
    // placed here rather than in JSX because its length is the gap the player
    // still has to cover, which changes every frame.
    const cue = cueRef.current;
    if (cue) {
      cue.visible = challenge.safeLane !== null;
      if (cue.visible) {
        const length = Math.max(4, hazard.distanceMeters);
        cue.scale.set(1, length, 1);
        cue.position.set(0, -PROMPT_HEIGHT_METERS + 0.03, length / 2);
      }
      const material = cue.material as MeshBasicMaterial;
      const pulse = reducedMotion ? 0.34 : 0.22 + Math.abs(Math.sin(clock.elapsedTime * 4)) * 0.2;
      material.opacity = pulse;
    }

    const arrow = arrowRef.current;
    if (arrow) {
      arrow.visible = challenge.safeSide !== null;
      arrow.rotation.z = challenge.safeSide === 'left' ? Math.PI / 2 : -Math.PI / 2;
    }

    // Urgency: a restrained pulse as the deadline closes, never a flash.
    const word = wordRef.current;
    if (word) {
      const urgent = challenge.urgency > 0.6;
      word.dataset['urgent'] = urgent ? 'true' : 'false';
      const beat =
        reducedMotion || !urgent ? 1 : 1 + Math.abs(Math.sin(clock.elapsedTime * 6)) * 0.06;
      word.style.transform = `scale(${String(beat)})`;
    }
  });

  const challenge = snapshot.challenge;

  return (
    <group ref={rootRef} visible={false}>
      {/* Glow strip down the safe lane. */}
      <mesh
        ref={cueRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -PROMPT_HEIGHT_METERS + 0.03, 6]}
      >
        <planeGeometry args={[LANE_WIDTH_METERS * 0.86, 16]} />
        <meshBasicMaterial color={palette.accent} transparent opacity={0.4} />
      </mesh>

      {/* Arrow, pointing the way out. */}
      <group ref={arrowRef} position={[0, -1.1, 0]}>
        <mesh>
          <coneGeometry args={[0.42, 1, 3]} />
          <meshBasicMaterial color={palette.accent} />
        </mesh>
      </group>

      {/*
        `distanceFactor` scales the word with distance so it belongs to the
        world. Too small a factor and a hazard forty metres out is unreadable —
        which is exactly when the player needs to read it.
      */}
      <Html center distanceFactor={26} zIndexRange={[20, 0]} pointerEvents="none">
        <p ref={wordRef} className={styles.word} data-urgent="false" aria-hidden="true">
          {challenge === null
            ? null
            : // Per code point, which is what the typing engine compares against.
              Array.from(challenge.word).map((character, index) => (
                <span
                  key={`${character}-${String(index)}`}
                  className={
                    index === challenge.firstErrorIndex
                      ? styles.incorrect
                      : index < challenge.typedLength
                        ? styles.correct
                        : index === challenge.typedLength
                          ? styles.current
                          : styles.untyped
                  }
                >
                  {character === ' ' ? ' ' : character}
                </span>
              ))}
        </p>
      </Html>
    </group>
  );
}

function findHazard(
  snapshot: WorldSnapshot,
  hazardId: string,
): WorldSnapshot['hazards'][number] | undefined {
  for (let index = 0; index < snapshot.hazardCount; index += 1) {
    const hazard = snapshot.hazards[index];
    if (hazard?.instanceId === hazardId) return hazard;
  }

  return undefined;
}
