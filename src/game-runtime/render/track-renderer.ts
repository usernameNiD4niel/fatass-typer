import type { Canvas2D } from './canvas-surface';
import { DEFAULT_SCENE_PALETTE, type ScenePalette } from './palette';
import {
  finishZ,
  isDrawable,
  NEAR_CLIP_METERS,
  type PerspectiveView,
  project,
} from './perspective';

/**
 * The world the runner is running through (spec §10).
 *
 * Sky, horizon, track, lane markings, the scenery flying past, and the finish
 * line — everything that is not an actor. Flat vector shapes still: the point
 * of the perspective rewrite is the shot, not the fidelity, and shapes are what
 * a theme swap can recolour for free.
 *
 * Everything is drawn back to front, because a painter's algorithm is the whole
 * depth handling a 2D canvas gets.
 */

/** Spacing of the dashed centre markings, in metres. */
const LANE_DASH_SPACING = 6;
const LANE_DASH_LENGTH = 2.6;

/** Spacing of the scenery posts along each side, in metres. */
const SCENERY_SPACING = 12;

/** How many depth slices the track surface is built from. */
const TRACK_SLICES = 26;

export interface TrackSceneOptions {
  readonly view: PerspectiveView;
  readonly palette?: ScenePalette;
  /** Distance travelled, used to scroll the markings and scenery. */
  readonly playerMeters: number;
  /** Holds the scenery still for a player who asked for less motion (spec §12). */
  readonly reducedMotion?: boolean;
}

/** A deterministic 0..1 from an integer, so scenery does not shimmer. */
function noise(seed: number): number {
  const mixed = Math.sin(seed * 91.7) * 43758.5453;

  return mixed - Math.floor(mixed);
}

export function drawTrack(context: Canvas2D, options: TrackSceneOptions): void {
  const { view } = options;
  const palette = options.palette ?? DEFAULT_SCENE_PALETTE;
  const scroll = options.reducedMotion === true ? 0 : options.playerMeters;

  drawSky(context, view, palette);
  drawGround(context, view, palette);
  drawSurface(context, view, palette);
  drawLaneMarkings(context, view, palette, scroll);
  drawScenery(context, view, palette, scroll);

  const finish = finishZ(view, options.playerMeters);
  if (finish !== null) drawFinishLine(context, view, palette, finish);
}

function drawSky(context: Canvas2D, view: PerspectiveView, palette: ScenePalette): void {
  context.fillStyle = palette.skyTop;
  context.fillRect(0, 0, view.widthPx, view.horizonYPx);

  // Stepped bands rather than a gradient: `Canvas2D` is deliberately the narrow
  // subset of the real context (CLAUDE.md §3), and four rectangles read as a
  // sky perfectly well at this scale.
  const bandHeight = view.horizonYPx * 0.18;
  for (let index = 0; index < 4; index += 1) {
    context.globalAlpha = 0.25 + index * 0.2;
    context.fillStyle = palette.skyBand;
    context.fillRect(0, view.horizonYPx - bandHeight * (4 - index), view.widthPx, bandHeight + 1);
  }
  context.globalAlpha = 1;

  drawClouds(context, view);
  drawSkyline(context, view, palette);

  // Haze along the horizon, so the skyline sits *in* the distance rather than
  // being pasted on top of it.
  context.globalAlpha = 0.35;
  context.fillStyle = palette.skyBand;
  context.fillRect(0, view.horizonYPx - view.heightPx * 0.03, view.widthPx, view.heightPx * 0.03);
  context.globalAlpha = 1;
}

/** Three soft shapes, fixed in place. They mark the sky, not the speed. */
function drawClouds(context: Canvas2D, view: PerspectiveView): void {
  context.fillStyle = 'rgba(255, 255, 255, 0.55)';

  for (let index = 0; index < 3; index += 1) {
    const x = view.widthPx * (0.12 + noise(index * 5) * 0.76);
    const y = view.horizonYPx * (0.18 + noise(index * 9) * 0.4);
    const radius = view.heightPx * (0.02 + noise(index * 13) * 0.018);

    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.arc(x + radius, y + radius * 0.25, radius * 0.8, 0, Math.PI * 2);
    context.arc(x - radius, y + radius * 0.3, radius * 0.7, 0, Math.PI * 2);
    context.fill();
  }
}

/** A silhouette on the horizon. Purely to give the vanishing point something to be. */
function drawSkyline(context: Canvas2D, view: PerspectiveView, palette: ScenePalette): void {
  const count = 26;
  const width = view.widthPx / count;

  context.fillStyle = palette.far;
  for (let index = 0; index < count; index += 1) {
    const height = view.heightPx * (0.03 + noise(index) * 0.09);
    context.fillRect(index * width, view.horizonYPx - height, width * 0.86, height);
  }
}

function drawGround(context: Canvas2D, view: PerspectiveView, palette: ScenePalette): void {
  context.fillStyle = palette.near;
  context.fillRect(0, view.horizonYPx, view.widthPx, view.heightPx - view.horizonYPx);
}

/**
 * The track surface.
 *
 * Built from depth slices rather than one trapezoid so the alternating bands
 * give speed something to read against — a flat quad going past looks static
 * however fast the world moves.
 */
function drawSurface(context: Canvas2D, view: PerspectiveView, palette: ScenePalette): void {
  const half = view.config.trackHalfWidthMeters;
  const far = view.config.drawDistanceMeters;

  const farLeft = project(view, { z: far, x: -half });
  const farRight = project(view, { z: far, x: half });
  const nearLeft = project(view, { z: NEAR_CLIP_METERS + 0.05, x: -half });
  const nearRight = project(view, { z: NEAR_CLIP_METERS + 0.05, x: half });

  context.fillStyle = palette.ground;
  context.beginPath();
  context.moveTo(farLeft.xPx, farLeft.yPx);
  context.lineTo(farRight.xPx, farRight.yPx);
  context.lineTo(nearRight.xPx, nearRight.yPx);
  context.lineTo(nearLeft.xPx, nearLeft.yPx);
  context.closePath();
  context.fill();

  // Kerbs, which are what actually tell the eye where the track ends.
  context.fillStyle = palette.groundEdge;
  drawEdge(context, view, -half);
  drawEdge(context, view, half);
}

function drawEdge(context: Canvas2D, view: PerspectiveView, x: number): void {
  const far = view.config.drawDistanceMeters;
  const inner = x < 0 ? x + 0.45 : x - 0.45;

  const farOuter = project(view, { z: far, x });
  const farInner = project(view, { z: far, x: inner });
  const nearInner = project(view, { z: NEAR_CLIP_METERS + 0.05, x: inner });
  const nearOuter = project(view, { z: NEAR_CLIP_METERS + 0.05, x });

  context.beginPath();
  context.moveTo(farOuter.xPx, farOuter.yPx);
  context.lineTo(farInner.xPx, farInner.yPx);
  context.lineTo(nearInner.xPx, nearInner.yPx);
  context.lineTo(nearOuter.xPx, nearOuter.yPx);
  context.closePath();
  context.fill();
}

/**
 * Dashed centre markings.
 *
 * The dashes are placed in world space and scroll with the runner, so the sense
 * of speed comes from the same number the rules use rather than from an
 * animation timer that could drift away from it.
 */
function drawLaneMarkings(
  context: Canvas2D,
  view: PerspectiveView,
  palette: ScenePalette,
  scroll: number,
): void {
  const offset = ((scroll % LANE_DASH_SPACING) + LANE_DASH_SPACING) % LANE_DASH_SPACING;

  context.fillStyle = palette.groundMarking;
  for (let index = 0; index < TRACK_SLICES; index += 1) {
    const near = index * LANE_DASH_SPACING - offset + NEAR_CLIP_METERS + 0.4;
    const far = near + LANE_DASH_LENGTH;
    if (!isDrawable(view, near)) continue;

    for (const x of [-2.1, 2.1]) {
      const nearLeft = project(view, { z: near, x: x - 0.16 });
      const nearRight = project(view, { z: near, x: x + 0.16 });
      const farLeft = project(view, { z: far, x: x - 0.16 });
      const farRight = project(view, { z: far, x: x + 0.16 });

      context.beginPath();
      context.moveTo(farLeft.xPx, farLeft.yPx);
      context.lineTo(farRight.xPx, farRight.yPx);
      context.lineTo(nearRight.xPx, nearRight.yPx);
      context.lineTo(nearLeft.xPx, nearLeft.yPx);
      context.closePath();
      context.fill();
    }
  }
}

/** Posts and blocks flying past on both sides. The speed cue nearest the eye. */
function drawScenery(
  context: Canvas2D,
  view: PerspectiveView,
  palette: ScenePalette,
  scroll: number,
): void {
  const offset = ((scroll % SCENERY_SPACING) + SCENERY_SPACING) % SCENERY_SPACING;
  const half = view.config.trackHalfWidthMeters;

  for (let index = 0; index < 18; index += 1) {
    const z = index * SCENERY_SPACING - offset + 4;
    if (!isDrawable(view, z)) continue;

    // Stable per-object variation: the index in world space, not on screen, so
    // a block keeps its size as it approaches.
    const seed = Math.round((scroll + z) / SCENERY_SPACING);

    for (const side of [-1, 1]) {
      const height = 2.2 + noise(seed * 3 + side) * 4.5;
      const width = 0.9 + noise(seed * 7 + side) * 1.4;
      const x = side * (half + 1.4 + noise(seed * 11 + side) * 2.2);

      const top = project(view, { z, x, y: height });
      const base = project(view, { z, x });
      const widthPx = width * base.scale;

      context.fillStyle = index % 2 === 0 ? palette.mid : palette.far;
      context.fillRect(top.xPx - widthPx / 2, top.yPx, widthPx, base.yPx - top.yPx);
    }
  }
}

/** The finish line, drawn as a banner across the track. */
function drawFinishLine(
  context: Canvas2D,
  view: PerspectiveView,
  palette: ScenePalette,
  z: number,
): void {
  const half = view.config.trackHalfWidthMeters;
  const base = project(view, { z });
  const left = project(view, { z, x: -half });
  const right = project(view, { z, x: half });
  const top = project(view, { z, y: 5.4 });

  // Chequered strip on the ground.
  const stripHeight = Math.max(2, 0.9 * base.scale);
  const squares = 12;
  const squareWidth = (right.xPx - left.xPx) / squares;
  for (let index = 0; index < squares; index += 1) {
    context.fillStyle = index % 2 === 0 ? '#ffffff' : '#1c1f24';
    context.fillRect(
      left.xPx + index * squareWidth,
      base.yPx - stripHeight,
      squareWidth,
      stripHeight,
    );
  }

  // Banner overhead, so the finish is visible long before it is underfoot.
  context.fillStyle = palette.accent;
  context.fillRect(left.xPx, top.yPx, right.xPx - left.xPx, Math.max(2, 0.7 * base.scale));
}
