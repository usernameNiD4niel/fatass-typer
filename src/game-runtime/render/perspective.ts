/**
 * The chase camera (spec §10).
 *
 * A behind-the-runner view down a straight track, the way an endless runner is
 * normally shot: the player sees what is coming rather than watching themselves
 * from the side. The maths is a plain pinhole projection, pure and canvas-free,
 * so it can be tested without a browser.
 *
 * World coordinates, all in metres:
 *
 *   - `z` — distance ahead of the camera. Larger is further away. Nothing at or
 *     behind `NEAR_CLIP_METERS` is drawable; it is behind the lens.
 *   - `x` — lateral offset from the centre of the track. Positive is right.
 *   - `y` — height above the ground. The runner's jump lives here.
 *
 * The camera looks straight down the track, so the horizon is a fixed screen
 * line and raising the camera simply shows more of the ground. That is the one
 * dial worth understanding: `heightMeters` is how high the shot sits, and the
 * default is deliberately a little above head height — high enough to read the
 * lane ahead, low enough that the runner still fills the frame.
 */

export interface PerspectiveConfig {
  /** Camera height above the ground, in metres. */
  readonly heightMeters: number;
  /** Horizontal field of view, in radians. Narrower reads as more zoomed in. */
  readonly fieldOfViewRadians: number;
  /** Where the horizon sits, 0..1 of viewport height from the top. */
  readonly horizonRatio: number;
  /** How far ahead the runner is, in metres. */
  readonly runnerDistanceMeters: number;
  /** Furthest the track is drawn, in metres. Beyond this is haze. */
  readonly drawDistanceMeters: number;
  /** Half-width of the track surface, in metres. */
  readonly trackHalfWidthMeters: number;
}

/**
 * The shot.
 *
 * A little higher and a little further back than a runner strictly needs, which
 * is what makes obstacles readable in time to type their prompt: the whole game
 * depends on seeing the thing before it arrives.
 */
export const DEFAULT_PERSPECTIVE: PerspectiveConfig = {
  heightMeters: 3.2,
  fieldOfViewRadians: Math.PI / 2.6,
  horizonRatio: 0.34,
  runnerDistanceMeters: 10,
  drawDistanceMeters: 190,
  trackHalfWidthMeters: 5.2,
};

/** Anything nearer than this is behind the lens and cannot be drawn. */
export const NEAR_CLIP_METERS = 0.35;

export interface Viewport {
  readonly widthPx: number;
  readonly heightPx: number;
}

export interface PerspectiveView {
  readonly config: PerspectiveConfig;
  readonly widthPx: number;
  readonly heightPx: number;
  /** Screen x of the track centre line. */
  readonly centreXPx: number;
  /** Screen y of the horizon. */
  readonly horizonYPx: number;
  /** Pixels per metre at one metre of depth. */
  readonly focalLengthPx: number;
  /** How far the runner has travelled, in metres. Scrolls the ground detail. */
  readonly travelledMeters: number;
  /** Length of the run, so the finish line can be placed. */
  readonly worldLengthMeters: number;
}

export function createView(
  viewport: Viewport,
  worldLengthMeters: number,
  config: PerspectiveConfig = DEFAULT_PERSPECTIVE,
): PerspectiveView {
  const width = Math.max(1, viewport.widthPx);
  const height = Math.max(1, viewport.heightPx);

  return {
    config,
    widthPx: width,
    heightPx: height,
    centreXPx: width / 2,
    horizonYPx: height * config.horizonRatio,
    // Half the viewport spans half the field of view at one metre out.
    focalLengthPx: width / 2 / Math.tan(config.fieldOfViewRadians / 2),
    travelledMeters: 0,
    worldLengthMeters,
  };
}

export function resizeView(view: PerspectiveView, viewport: Viewport): PerspectiveView {
  return {
    ...createView(viewport, view.worldLengthMeters, view.config),
    travelledMeters: view.travelledMeters,
  };
}

export function advanceView(view: PerspectiveView, travelledMeters: number): PerspectiveView {
  return { ...view, travelledMeters };
}

export interface WorldPoint {
  /** Distance ahead of the camera, in metres. */
  readonly z: number;
  /** Lateral offset from the track centre, in metres. */
  readonly x?: number;
  /** Height above the ground, in metres. */
  readonly y?: number;
}

export interface ScreenPoint {
  readonly xPx: number;
  readonly yPx: number;
  /** Pixels per metre at this depth. Everything drawn scales by it. */
  readonly scale: number;
}

/** Whether a depth can be drawn at all. */
export function isDrawable(view: PerspectiveView, z: number): boolean {
  return z > NEAR_CLIP_METERS && z <= view.config.drawDistanceMeters;
}

/**
 * Projects a world point to the screen.
 *
 * Depths behind the lens are clamped rather than rejected: a caller that has
 * already checked `isDrawable` should never hit it, and one that has not gets a
 * point at the edge of the world instead of an infinity.
 */
export function project(view: PerspectiveView, point: WorldPoint): ScreenPoint {
  const z = Math.max(NEAR_CLIP_METERS, point.z);
  const scale = view.focalLengthPx / z;

  return {
    xPx: view.centreXPx + (point.x ?? 0) * scale,
    yPx: view.horizonYPx + (view.config.heightMeters - (point.y ?? 0)) * scale,
    scale,
  };
}

/** Screen y of the ground at a given depth. */
export function groundYPx(view: PerspectiveView, z: number): number {
  return project(view, { z }).yPx;
}

/** Where the runner stands, in world coordinates. */
export function runnerZ(view: PerspectiveView): number {
  return view.config.runnerDistanceMeters;
}

/**
 * Where the pack sits, for a gap expressed as 0 (caught) to 1 (starting gap).
 *
 * Real geometry would put the dogs behind the lens for most of a run — a
 * sixteen-metre lead is well behind a camera nine metres back — and a chase the
 * player cannot see is just a timer with teeth. So the true gap is compressed
 * into the space between the lens and the runner, keeping its direction:
 *
 *   - **A comfortable lead** puts them right under the camera: large, low in
 *     the frame, and a long way behind him. This is the normal state, and it is
 *     what the shot is for.
 *   - **Losing the lead** walks them up the track towards him, until at zero
 *     they are level with him and the run is over.
 *
 * So the danger cue is convergence, not size: they close the distance on screen
 * exactly as they close it in the rules. The HUD carries the exact number.
 */
export const PACK_TRAIL_MIN_METERS = 0.5;
export const PACK_TRAIL_MAX_METERS = 2.7;

export function packZ(view: PerspectiveView, normalizedGap: number): number {
  const gap = Math.min(1, Math.max(0, normalizedGap));
  const trail = PACK_TRAIL_MIN_METERS + (PACK_TRAIL_MAX_METERS - PACK_TRAIL_MIN_METERS) * gap;

  return runnerZ(view) - trail;
}

/** Depth of the finish line, or `null` when it is not yet in view. */
export function finishZ(view: PerspectiveView, playerMeters: number): number | null {
  const remaining = view.worldLengthMeters - playerMeters;
  const z = remaining + runnerZ(view);

  return isDrawable(view, z) ? z : null;
}
