import { Canvas, useFrame } from '@react-three/fiber';
import { useMemo, type JSX } from 'react';
import { ACESFilmicToneMapping, SRGBColorSpace } from 'three';

import type { WorldSnapshot } from '../game-bridge';
import type { MapTheme } from '../game-core/models';
import { AmbientTraffic } from './AmbientTraffic';
import { ChaseCamera } from './ChaseCamera';
import { Coins } from './Coins';
import { lightingRig, SHADOW_BIAS, SHADOW_BOX } from './lighting';
import { Player } from './Player';
import { Powerups } from './Powerups';
import { Racers } from './Racers';
import { RivalBadges } from './RivalBadges';
import { Road } from './Road';
import {
  BASE_FOV_DEGREES,
  CAMERA_BEHIND_METERS,
  CAMERA_HEIGHT_METERS,
  DRAW_DISTANCE_METERS,
  type RunnerLook,
  scenePalette,
} from './scene-config';
import { BestLine } from './BestLine';
import { Sky } from './Sky';
import { Pursuer } from './Pursuer';
import { ScorePopups } from './ScorePopups';
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
  /** What the player is wearing. Colours only — see `RunnerLook`. */
  readonly look?: RunnerLook;
  /** Which typing flourish is equipped. A name the prompt's stylesheet switches on. */
  readonly effectName?: string;
  /**
   * Furthest the player has ever got on this map, in metres.
   *
   * Drawn as a gate across the road. Zero draws nothing — a first run has
   * nothing to chase (plan 2.2).
   */
  readonly bestDistanceMeters?: number;
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
  look,
  effectName,
  bestDistanceMeters = 0,
}: GameCanvasProps): JSX.Element {
  const palette = useMemo(() => scenePalette(theme), [theme]);
  const rig = useMemo(() => lightingRig(palette, reducedMotion), [palette, reducedMotion]);

  return (
    <Canvas
      // Capped device pixel ratio, so a 3× display does not cost 9× the pixels
      // (spec §20).
      dpr={[1, 2]}
      /*
       * Soft shadows, not hard ones.
       *
       * PCF-soft costs a few extra taps and hides the fact that the shadow map
       * is only 1024 across. VSM is sharper and leaks light through the runner's
       * own limbs, which is exactly where anybody would be looking.
       */
      shadows="soft"
      gl={{
        antialias: true,
        powerPreference: 'high-performance',
        /*
         * ACES filmic tone mapping is the single largest quality gain available
         * here, and it costs nothing. Without it, a physically based material lit
         * by a bright sun clips to flat white wherever it faces the light; with
         * it, the highlights roll off and the road keeps its shading.
         */
        toneMapping: ACESFilmicToneMapping,
        toneMappingExposure: 1.05,
        outputColorSpace: SRGBColorSpace,
      }}
      camera={{
        fov: BASE_FOV_DEGREES,
        near: 0.1,
        far: DRAW_DISTANCE_METERS * 1.4,
        position: [0, CAMERA_HEIGHT_METERS, CAMERA_BEHIND_METERS],
      }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <color attach="background" args={[palette.sky]} />
      {/*
        Fog hides the recycling seam and keeps the horizon clean (spec §13).

        It starts further out than it used to. With a real sky behind it, fog
        beginning a third of the way down the road ate the view the sky was
        added to provide — and the two met in a visible band.
      */}
      <fog attach="fog" args={[palette.fog, DRAW_DISTANCE_METERS * 0.5, DRAW_DISTANCE_METERS]} />

      <Sky palette={palette} reducedMotion={reducedMotion} />

      {/*
        Sky above, road bounce below. See `lighting.ts` for why this replaced the
        ambient light rather than joining it.
      */}
      <hemisphereLight
        args={[rig.skyColor, rig.groundColor, rig.hemisphereIntensity]}
        position={[0, 30, 0]}
      />
      <directionalLight
        position={[...rig.sunPosition]}
        intensity={rig.sunIntensity}
        castShadow
        shadow-mapSize={[rig.shadowMapSize, rig.shadowMapSize]}
        shadow-bias={SHADOW_BIAS}
        shadow-camera-left={SHADOW_BOX.left}
        shadow-camera-right={SHADOW_BOX.right}
        shadow-camera-top={SHADOW_BOX.top}
        shadow-camera-bottom={SHADOW_BOX.bottom}
        shadow-camera-near={SHADOW_BOX.near}
        shadow-camera-far={SHADOW_BOX.far}
      />

      <Driver advance={advance} />
      <ChaseCamera snapshot={snapshot} reducedMotion={reducedMotion} />

      <Road snapshot={snapshot} palette={palette} reducedMotion={reducedMotion} />
      {/*
        Traffic on the flanking carriageways. It is scenery — nothing here can
        be hit or typed at — but it is what makes speed legible now that
        nothing comes at the player. See `AmbientTraffic.tsx`.
      */}
      <AmbientTraffic snapshot={snapshot} palette={palette} reducedMotion={reducedMotion} />
      <Coins snapshot={snapshot} reducedMotion={reducedMotion} />
      <Powerups snapshot={snapshot} reducedMotion={reducedMotion} />
      <Player
        snapshot={snapshot}
        reducedMotion={reducedMotion}
        {...(look === undefined ? {} : { look })}
      />
      {/*
        The two opponents. Drawn from the snapshot like everything else — see
        `Racers.tsx` for why they can be run through.
      */}
      <Racers snapshot={snapshot} reducedMotion={reducedMotion} />
      {/*
        How far each opponent is, beside the runner rather than in the top bar
        — see `RivalBadges.tsx` for why the HUD was the wrong place for it.
      */}
      <RivalBadges snapshot={snapshot} />
      <Pursuer snapshot={snapshot} reducedMotion={reducedMotion} />
      <BestLine snapshot={snapshot} bestDistanceMeters={bestDistanceMeters} />
      <WorldPrompt
        snapshot={snapshot}
        palette={palette}
        reducedMotion={reducedMotion}
        {...(look === undefined ? {} : { look })}
        {...(effectName === undefined ? {} : { effectName })}
      />
      <ScorePopups snapshot={snapshot} reducedMotion={reducedMotion} />
    </Canvas>
  );
}
