import { useFrame, useThree } from '@react-three/fiber';
import { useRef, type JSX } from 'react';
import { PerspectiveCamera, Vector3 } from 'three';

import type { WorldSnapshot } from '../game-bridge';
import {
  BASE_FOV_DEGREES,
  CAMERA_BEHIND_METERS,
  CAMERA_HEIGHT_METERS,
  CAMERA_TARGET_AHEAD_METERS,
  laneCenterX,
} from './scene-config';

/**
 * The chase camera (spec §12).
 *
 * Follows the player from behind, smoothly and without jitter. Three behaviours
 * on top of that, all subtle and all switchable off:
 *
 *  - It **leads toward the safe lane** when a car challenge is active — enough
 *    to nudge the eye, never enough to answer the question for the player.
 *  - Field of view **opens slightly with speed**, so going faster feels like it.
 *  - A collision **shakes it briefly**, spent within a few frames.
 *
 * Reduced motion disables the lead, the shake, and the field-of-view change, and
 * keeps the follow. The follow is not an effect; without it there is no game to
 * look at.
 */

export interface ChaseCameraProps {
  readonly snapshot: WorldSnapshot;
  readonly reducedMotion: boolean;
}

/** How quickly the camera converges on its target position, per second. */
const FOLLOW_RATE = 6;

/** How far toward the safe lane the camera drifts, in lane widths. */
const LEAD_FRACTION = 0.3;

const SHAKE_METERS = 0.34;

const target = new Vector3();

export function ChaseCamera({ snapshot, reducedMotion }: ChaseCameraProps): JSX.Element {
  const { camera } = useThree();
  const lookAt = useRef(new Vector3(0, 1, -CAMERA_TARGET_AHEAD_METERS));
  const shakeSeed = useRef(0);
  /** The speed-driven field of view, without the punch. See `useFrame`. */
  const easedFov = useRef(BASE_FOV_DEGREES);

  useFrame((_, delta) => {
    const playerX = laneCenterX(snapshot.lanePosition);

    const leadLane = snapshot.challenge?.safeLane ?? null;
    const lead =
      reducedMotion || leadLane === null ? 0 : (laneCenterX(leadLane) - playerX) * LEAD_FRACTION;

    target.set(
      playerX + lead,
      CAMERA_HEIGHT_METERS + snapshot.jumpHeightMeters * 0.35,
      CAMERA_BEHIND_METERS,
    );

    // Exponential smoothing, framerate-independent. A plain lerp would follow
    // faster on a 144Hz monitor than on a 60Hz one.
    const blend = 1 - Math.exp(-FOLLOW_RATE * delta);
    camera.position.lerp(target, blend);

    if (!reducedMotion && snapshot.impulse.shake > 0) {
      shakeSeed.current += delta * 60;
      const amount = snapshot.impulse.shake * SHAKE_METERS;
      camera.position.x += Math.sin(shakeSeed.current * 2.7) * amount;
      camera.position.y += Math.sin(shakeSeed.current * 3.9) * amount * 0.6;
    }

    lookAt.current.set(playerX + lead * 1.4, 1.1, -CAMERA_TARGET_AHEAD_METERS);
    camera.lookAt(lookAt.current);

    if (camera instanceof PerspectiveCamera) {
      /*
       * The bias eases; the punch does not.
       *
       * The bias is how fast the player is going, and easing it is what stops
       * the view breathing on every small speed change. The punch is the moment
       * they cleared something, and easing it would blunt the one thing it
       * exists to sell — so it is added on top of the eased value, and its own
       * decay in the runtime host is what takes it away.
       *
       * The eased value is tracked separately rather than read back off the
       * camera, because the camera's `fov` includes the punch: easing towards
       * the target from a punched value would drag the punch into the next
       * frame's smoothing and leave the view permanently wide.
       */
      const wanted = BASE_FOV_DEGREES + (reducedMotion ? 0 : snapshot.impulse.fovBias);
      easedFov.current += (wanted - easedFov.current) * Math.min(1, delta * 4);

      const punched = easedFov.current + (reducedMotion ? 0 : snapshot.impulse.punch);
      if (Math.abs(camera.fov - punched) > 0.01) {
        camera.fov = punched;
        camera.updateProjectionMatrix();
      }
    }
  });

  return <></>;
}
