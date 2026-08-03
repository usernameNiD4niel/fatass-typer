import { type ActiveObstacle, obstaclePressure, obstacleProgress } from '../../game-core/obstacles';
import { type Camera, isVisible, worldToScreenX } from '../render/camera';
import { type Canvas2D } from '../render/canvas-surface';

/**
 * Obstacles, drawn from vector shapes (spec §5, §10).
 *
 * The player must be able to see what they are being asked to avoid. A prompt
 * with nothing attached to it on screen is just a typing test with a penalty:
 * the obstacle is what makes the deadline make sense, and its shape is what
 * makes the avoidance move readable.
 *
 * Each definition gets its own silhouette, sized in world meters so it scales
 * with the camera exactly as the MC and the dogs do.
 */

export const OBSTACLE_COLORS = {
  crate: '#b07f43',
  crateEdge: '#7d5628',
  barrier: '#d8d3c8',
  barrierStripe: '#d1483f',
  puddle: 'rgba(110, 160, 200, 0.75)',
  puddleSheen: 'rgba(235, 245, 255, 0.6)',
  bin: '#4f6b57',
  binLid: '#39503f',
  signPost: '#6a6f78',
  signFace: '#e8c34a',
  post: '#8a8f98',
  shadow: 'rgba(0, 0, 0, 0.22)',
  warning: '#ffb020',
  pressureSafe: '#3ec98a',
  pressureWarning: '#ffb020',
  pressureCritical: '#f2696b',
} as const;

/** Height of each obstacle in world meters. The MC is 1.75m. */
const HEIGHT_METERS: Readonly<Record<string, number>> = {
  crate: 0.95,
  'low-barrier': 0.7,
  puddle: 0.12,
  'trash-bin': 1.05,
  'hanging-sign': 2.5,
  'roadwork-barrier': 1.0,
  'narrow-passage': 2.3,
};

const DEFAULT_HEIGHT_METERS = 0.9;

export function obstacleHeightPx(camera: Camera, obstacleId: string): number {
  return (HEIGHT_METERS[obstacleId] ?? DEFAULT_HEIGHT_METERS) * camera.config.pixelsPerMeter;
}

function fillEllipse(
  context: Canvas2D,
  x: number,
  y: number,
  radiusX: number,
  radiusY: number,
  color: string,
): void {
  context.fillStyle = color;
  context.beginPath();
  context.ellipse(x, y, radiusX, radiusY, 0, 0, Math.PI * 2);
  context.fill();
}

/**
 * Draws the obstacle body in unit space: 1.0 is its own height, the origin is on
 * the ground, and up is negative. Same convention as the MC and the dogs, so a
 * definition's size is the only thing that varies.
 */
function drawBody(context: Canvas2D, obstacleId: string): void {
  switch (obstacleId) {
    case 'crate':
      context.fillStyle = OBSTACLE_COLORS.crate;
      context.fillRect(-0.5, -1, 1, 1);
      context.strokeStyle = OBSTACLE_COLORS.crateEdge;
      context.lineWidth = 0.08;
      context.strokeRect(-0.5, -1, 1, 1);
      // Diagonal planks, so the shape reads as a crate and not a plain box.
      context.beginPath();
      context.moveTo(-0.5, -1);
      context.lineTo(0.5, 0);
      context.moveTo(0.5, -1);
      context.lineTo(-0.5, 0);
      context.stroke();

      return;

    case 'low-barrier':
      context.fillStyle = OBSTACLE_COLORS.barrier;
      context.fillRect(-0.7, -1, 1.4, 0.35);
      context.fillStyle = OBSTACLE_COLORS.barrierStripe;
      context.fillRect(-0.45, -1, 0.28, 0.35);
      context.fillRect(0.17, -1, 0.28, 0.35);
      context.fillStyle = OBSTACLE_COLORS.signPost;
      context.fillRect(-0.6, -0.7, 0.12, 0.7);
      context.fillRect(0.48, -0.7, 0.12, 0.7);

      return;

    case 'puddle':
      fillEllipse(context, 0, -0.5, 1.6, 0.5, OBSTACLE_COLORS.puddle);
      fillEllipse(context, -0.4, -0.6, 0.5, 0.16, OBSTACLE_COLORS.puddleSheen);

      return;

    case 'trash-bin':
      context.fillStyle = OBSTACLE_COLORS.bin;
      context.fillRect(-0.35, -0.9, 0.7, 0.9);
      context.fillStyle = OBSTACLE_COLORS.binLid;
      context.fillRect(-0.42, -1, 0.84, 0.14);

      return;

    case 'hanging-sign':
      // Overhead: the post runs the full height and the sign hangs low enough
      // that the MC has to duck under it, which is what makes a slide read.
      context.fillStyle = OBSTACLE_COLORS.signPost;
      context.fillRect(0.42, -1, 0.1, 1);
      context.fillRect(-0.5, -1, 1, 0.08);
      context.fillStyle = OBSTACLE_COLORS.signFace;
      context.fillRect(-0.45, -0.92, 0.8, 0.34);

      return;

    case 'roadwork-barrier':
      context.fillStyle = OBSTACLE_COLORS.barrier;
      context.fillRect(-0.75, -1, 1.5, 0.3);
      context.fillRect(-0.75, -0.55, 1.5, 0.22);
      context.fillStyle = OBSTACLE_COLORS.barrierStripe;
      context.fillRect(-0.5, -1, 0.3, 0.3);
      context.fillRect(0.2, -1, 0.3, 0.3);
      context.fillRect(-0.15, -0.55, 0.3, 0.22);
      context.fillStyle = OBSTACLE_COLORS.signPost;
      context.fillRect(-0.08, -0.35, 0.16, 0.35);

      return;

    case 'narrow-passage':
      // Two posts with a gap — the thing to be threaded, not jumped.
      context.fillStyle = OBSTACLE_COLORS.post;
      context.fillRect(-0.75, -1, 0.28, 1);
      context.fillRect(0.47, -1, 0.28, 1);

      return;

    default:
      context.fillStyle = OBSTACLE_COLORS.crate;
      context.fillRect(-0.4, -1, 0.8, 1);
  }
}

/** A chevron above an obstacle whose prompt has not attached yet. */
function drawWarning(context: Canvas2D, heightPx: number): void {
  context.fillStyle = OBSTACLE_COLORS.warning;
  context.beginPath();
  context.moveTo(0, -1.35 * heightPx);
  context.lineTo(0.18 * heightPx, -1.62 * heightPx);
  context.lineTo(-0.18 * heightPx, -1.62 * heightPx);
  context.closePath();
  context.fill();
}

/**
 * A bar above an obstacle whose deadline is running.
 *
 * Length *and* colour both carry the urgency, so the cue survives
 * colour-blindness (spec §12).
 */
function drawPressureBar(
  context: Canvas2D,
  obstacle: ActiveObstacle,
  elapsedMs: number,
  heightPx: number,
): void {
  const remaining = 1 - obstacleProgress(obstacle, elapsedMs);
  const pressure = obstaclePressure(obstacle, elapsedMs);
  const width = 0.9 * heightPx;
  const y = -1.5 * heightPx;

  context.fillStyle = OBSTACLE_COLORS.shadow;
  context.fillRect(-width / 2, y, width, 0.09 * heightPx);

  context.fillStyle =
    pressure === 'critical' || pressure === 'expired'
      ? OBSTACLE_COLORS.pressureCritical
      : pressure === 'warning'
        ? OBSTACLE_COLORS.pressureWarning
        : OBSTACLE_COLORS.pressureSafe;
  context.fillRect(-width / 2, y, width * remaining, 0.09 * heightPx);
}

export interface DrawObstacleOptions {
  readonly camera: Camera;
  readonly groundYPx: number;
  readonly obstacle: ActiveObstacle;
  /** Run time, for the deadline bar. */
  readonly elapsedMs: number;
}

export function drawObstacle(context: Canvas2D, options: DrawObstacleOptions): void {
  const { obstacle, camera } = options;
  const id = obstacle.definition.id;
  const heightPx = obstacleHeightPx(camera, id);
  const x = worldToScreenX(camera, obstacle.impactMeters);

  context.save();
  context.translate(x, options.groundYPx);

  // Ground shadow first, in screen units, so it does not stretch with the body.
  fillEllipse(context, 0, 0, heightPx * 0.5, heightPx * 0.1, OBSTACLE_COLORS.shadow);

  if (obstacle.status === 'active') {
    drawPressureBar(context, obstacle, options.elapsedMs, heightPx);
  } else if (obstacle.status === 'approaching') {
    drawWarning(context, heightPx);
  }

  context.save();
  context.scale(heightPx, heightPx);
  drawBody(context, id);
  context.restore();

  context.restore();
}

export interface DrawObstaclesOptions {
  readonly camera: Camera;
  readonly groundYPx: number;
  readonly obstacles: readonly ActiveObstacle[];
  readonly elapsedMs: number;
}

/** Draws every obstacle currently on screen. Off-screen ones are skipped. */
export function drawObstacles(context: Canvas2D, options: DrawObstaclesOptions): void {
  for (const obstacle of options.obstacles) {
    // A generous margin: a wide obstacle whose centre is just off screen still
    // has to be drawn, or it pops in at the edge.
    if (!isVisible(options.camera, obstacle.impactMeters, 4)) continue;

    drawObstacle(context, {
      camera: options.camera,
      groundYPx: options.groundYPx,
      obstacle,
      elapsedMs: options.elapsedMs,
    });
  }
}
