import { Canvas, useFrame } from '@react-three/fiber';
import { useMemo, type JSX } from 'react';

import type { WorldSnapshot } from '../game-bridge';
import type { MapTheme } from '../game-core/models';
import { ChaseCamera } from './ChaseCamera';
import { Hazards } from './Hazards';
import { Player } from './Player';
import { Road } from './Road';
import {
  BASE_FOV_DEGREES,
  CAMERA_BEHIND_METERS,
  CAMERA_HEIGHT_METERS,
  DRAW_DISTANCE_METERS,
  scenePalette,
} from './scene-config';
import { WorldPrompt } from './WorldPrompt';

/**
 * The run, drawn.
 *
 * The only module that mounts a WebGL canvas. Isolating it here is what lets the
 * screen's own tests run in jsdom, which has no WebGL: they mock this file and
 * assert on the HUD and the overlay, which is all they were ever really testing.
 *
 * ## One render loop
 *
 * `Driver` advances the simulation from inside `useFrame` at priority `-1`, so
 * it runs before every other `useFrame` in the tree. Every mesh below therefore
 * reads a snapshot that is current *this* frame rather than one behind.
 *
 * A second `requestAnimationFrame` chain of our own would be half a frame out of
 * step with this one forever, and the interpolation alpha would be a polite
 * fiction. So there is only this one.
 */

export interface GameCanvasProps {
  readonly snapshot: WorldSnapshot;
  /** Advances the simulation. Returned by `attachGame`. */
  readonly advance: (frameDeltaMs: number) => void;
  readonly theme: MapTheme;
  readonly reducedMotion: boolean;
  /** Rendered instead of the scene when WebGL is unavailable. */
  readonly fallback?: JSX.Element;
}

/** Longest frame the simulation will believe, in seconds. */
const MAX_FRAME_SECONDS = 0.25;

function Driver({ advance }: { advance: (frameDeltaMs: number) => void }): null {
  useFrame((_, delta) => {
    advance(Math.min(delta, MAX_FRAME_SECONDS) * 1000);
  }, -1);

  return null;
}

export function GameCanvas({
  snapshot,
  advance,
  theme,
  reducedMotion,
}: GameCanvasProps): JSX.Element {
  const palette = useMemo(() => scenePalette(theme), [theme]);

  return (
    <Canvas
      // Capped device pixel ratio, so a 3× display does not cost 9× the pixels
      // (spec §20).
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{
        fov: BASE_FOV_DEGREES,
        near: 0.1,
        far: DRAW_DISTANCE_METERS * 1.4,
        position: [0, CAMERA_HEIGHT_METERS, CAMERA_BEHIND_METERS],
      }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <color attach="background" args={[palette.sky]} />
      {/* Fog hides the recycling seam and keeps the horizon clean (spec §13). */}
      <fog attach="fog" args={[palette.fog, DRAW_DISTANCE_METERS * 0.35, DRAW_DISTANCE_METERS]} />

      <ambientLight intensity={palette.lightIntensity * 0.75} />
      <directionalLight position={[12, 24, 8]} intensity={palette.lightIntensity} />

      <Driver advance={advance} />
      <ChaseCamera snapshot={snapshot} reducedMotion={reducedMotion} />

      <Road snapshot={snapshot} palette={palette} reducedMotion={reducedMotion} />
      <Hazards snapshot={snapshot} palette={palette} />
      <Player snapshot={snapshot} reducedMotion={reducedMotion} />
      <WorldPrompt snapshot={snapshot} palette={palette} reducedMotion={reducedMotion} />
    </Canvas>
  );
}
