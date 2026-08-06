import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { type CSSProperties, useRef, type JSX } from 'react';
import type { Group, Mesh, MeshBasicMaterial } from 'three';

import type { WorldSnapshot } from '../game-bridge';
import { laneCenterX, LANE_WIDTH_METERS, type RunnerLook, type ScenePalette } from './scene-config';
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
  /** The equipped look. Only its `effect` tint is read here. */
  readonly look?: RunnerLook;
  /** Which flourish is equipped, as a name the stylesheet switches on. */
  readonly effectName?: string;
}

/** How much the word swells at full flourish. Small: it must stay readable. */
const EFFECT_SWELL = 0.08;

/** Height the word floats at, in metres. Above a car, clear of the runner. */
const PROMPT_HEIGHT_METERS = 2.9;

/**
 * How far ahead a flow word floats, in metres.
 *
 * Far enough to sit in the same band of the screen a hazard word occupies while
 * it is being read, so the eye does not have to move between the two kinds. It
 * does not approach — it holds station, because there is nothing arriving.
 */
const FLOW_PROMPT_DISTANCE_METERS = 22;

export function WorldPrompt({
  snapshot,
  palette,
  reducedMotion,
  look,
  effectName = 'plain',
}: WorldPromptProps): JSX.Element {
  const rootRef = useRef<Group>(null);
  const cueRef = useRef<Mesh>(null);
  const arrowRef = useRef<Group>(null);
  const wordRef = useRef<HTMLParagraphElement>(null);
  /** How lit the word is, 0..1. Rises as it is typed and falls once it is gone. */
  const flourish = useRef(0);

  useFrame(({ clock }) => {
    const root = rootRef.current;
    if (!root) return;

    const challenge = snapshot.challenge;
    if (challenge === null) {
      root.visible = false;

      return;
    }

    const anchor = findAnchor(snapshot, challenge.hazardId);
    if (anchor === null) {
      root.visible = false;

      return;
    }

    root.visible = true;

    // Cars and coins point at the lane to be in; jumps point at themselves.
    const lane = challenge.safeLane ?? anchor.lane;
    root.position.set(laneCenterX(lane), PROMPT_HEIGHT_METERS, -anchor.distanceMeters);

    // The lane cue lies on the road *between* the player and the safe lane, so
    // the eye is led there rather than merely told (spec §6). It is scaled and
    // placed here rather than in JSX because its length is the gap the player
    // still has to cover, which changes every frame.
    const cue = cueRef.current;
    if (cue) {
      cue.visible = challenge.safeLane !== null;
      if (cue.visible) {
        const length = Math.max(4, anchor.distanceMeters);
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
      // An optional word never turns urgent: nothing is going to happen to you
      // if you ignore it, and dressing it up as a threat would be a lie.
      const urgent = !challenge.optional && challenge.urgency > 0.6;
      word.dataset['urgent'] = urgent ? 'true' : 'false';
      word.dataset['optional'] = challenge.optional ? 'true' : 'false';
      word.dataset['perfect'] = challenge.perfect ? 'true' : 'false';
      // A flow word is optional too, but it is not a coin: the amber styling
      // means "there is something over there to go and get", and a word that
      // points nowhere must not borrow it.
      word.dataset['flow'] = challenge.kind === 'flow' ? 'true' : 'false';
      const beat =
        reducedMotion || !urgent ? 1 : 1 + Math.abs(Math.sin(clock.elapsedTime * 6)) * 0.06;

      /*
       * The wardrobe's typing effect.
       *
       * Driven by how much of the word is typed rather than by an event,
       * because the scene has no events — it reads a snapshot. The value rises
       * with the word and decays once the word is gone, which is what makes a
       * finished word flare rather than simply vanish.
       *
       * Purely a look. The same word, on the same deadline, whatever is worn.
       */
      const typed = challenge.word.length === 0 ? 0 : challenge.typedLength / challenge.word.length;
      flourish.current = reducedMotion ? 0 : Math.max(flourish.current * 0.9, typed * typed);
      word.style.setProperty('--effect-strength', flourish.current.toFixed(3));

      word.style.transform = `scale(${String(beat * (1 + flourish.current * EFFECT_SWELL))})`;
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
        {/*
          One metre long, and scaled to the distance every frame. It used to be
          sixteen metres *and* scaled, which laid a carpet down the whole lane.
        */}
        <planeGeometry args={[LANE_WIDTH_METERS * 0.34, 1]} />
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
        No `distanceFactor`, deliberately.

        Scaling the word with distance is the obvious thing and it is wrong: a
        word forty metres out is unreadable exactly when the player most needs to
        read it, and the same word at two metres fills half the screen. A label
        of constant size that *tracks* its hazard keeps the association without
        either failure.
      */}
      <Html center zIndexRange={[20, 0]} pointerEvents="none">
        <p
          ref={wordRef}
          className={styles.word}
          data-urgent="false"
          data-optional="false"
          data-perfect="false"
          data-flow="false"
          data-effect={effectName}
          style={{ '--effect-tint': look?.effect ?? '#ffffff' } as CSSProperties}
          aria-hidden="true"
        >
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

/** Where in the world a word belongs. */
interface PromptAnchor {
  readonly distanceMeters: number;
  readonly lane: number;
}

/**
 * Finds whatever the word is attached to.
 *
 * A coin line is the only thing left with a body; everything else sits ahead of
 * the player. Returning `null` hides the word, so a lookup that misses is a
 * player typing something they cannot see — which is why the flow case is
 * answered first rather than fallen through to.
 */
function findAnchor(snapshot: WorldSnapshot, id: string): PromptAnchor | null {
  const challenge = snapshot.challenge;

  // A flow word has no body to track — there is nothing on the road that it
  // refers to. It sits a fixed distance ahead, in the lane the player is
  // actually in, so it reads as part of the run rather than as HUD text.
  if (challenge !== null && challenge.kind === 'flow') {
    return { distanceMeters: FLOW_PROMPT_DISTANCE_METERS, lane: snapshot.lanePosition };
  }

  for (let index = 0; index < snapshot.coinCount; index += 1) {
    const coin = snapshot.coins[index];
    if (coin?.instanceId === id) {
      return { distanceMeters: coin.distanceMeters, lane: coin.lane };
    }
  }

  return null;
}
