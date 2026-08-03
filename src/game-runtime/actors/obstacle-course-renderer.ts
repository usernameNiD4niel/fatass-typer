import type { ActiveObstacle } from '../../game-core/obstacles';
import type { ObstacleAction } from '../../game-core/models';
import type { Canvas2D } from '../render/canvas-surface';
import { isDrawable, type PerspectiveView, project, runnerZ } from '../render/perspective';

/**
 * Obstacles, coming down the track (spec §5, §10).
 *
 * The one thing this has to get right is legibility at distance: an obstacle
 * the player notices late is a prompt they cannot finish in time, and the
 * timing budget already assumes they saw it when it spawned. So each kind has a
 * distinct silhouette and each carries a coloured band matching the action it
 * demands — over it, under it, or around it.
 *
 * Drawn furthest first, and only while in front of the lens.
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

/** How the three actions are colour-coded, alongside their distinct shapes. */
export const ACTION_COLORS: Readonly<Record<ObstacleAction, string>> = {
  jump: '#ffb020',
  slide: '#4aa3ff',
  sidestep: '#3ec98a',
};

export interface ObstacleCourseOptions {
  readonly view: PerspectiveView;
  readonly obstacles: readonly ActiveObstacle[];
  /** The runner's interpolated position, in metres. */
  readonly playerMeters: number;
}

/** Depth of an obstacle in camera space. */
export function obstacleZ(view: PerspectiveView, obstacle: ActiveObstacle, playerMeters: number): number {
  return obstacle.impactMeters - playerMeters + runnerZ(view);
}

export function drawObstacleCourse(context: Canvas2D, options: ObstacleCourseOptions): void {
  const drawable = options.obstacles
    .map((obstacle) => ({ obstacle, z: obstacleZ(options.view, obstacle, options.playerMeters) }))
    .filter((entry) => isDrawable(options.view, entry.z))
    .sort((a, b) => b.z - a.z);

  for (const entry of drawable) {
    drawOne(context, options.view, entry.obstacle, entry.z);
  }
}

function drawOne(
  context: Canvas2D,
  view: PerspectiveView,
  obstacle: ActiveObstacle,
  z: number,
): void {
  const ground = project(view, { z });
  const scale = ground.scale;
  const action = obstacle.definition.action;

  // Contact shadow first, so the object is planted rather than floating.
  context.fillStyle = OBSTACLE_COLORS.shadow;
  context.beginPath();
  context.ellipse(ground.xPx, ground.yPx, scale * 1.5, scale * 0.4, 0, 0, Math.PI * 2);
  context.fill();

  switch (action) {
    case 'jump':
      drawJumpObstacle(context, view, z, obstacle.definition.id);
      break;
    case 'slide':
      drawSlideObstacle(context, view, z);
      break;
    case 'sidestep':
      drawSidestepObstacle(context, view, z);
      break;
  }

  drawActionBand(context, view, z, action);
}

/** Waist-high and solid: something to go over. */
function drawJumpObstacle(
  context: Canvas2D,
  view: PerspectiveView,
  z: number,
  id: string,
): void {
  const height = id === 'crate' ? 1.15 : 0.85;
  const halfWidth = 1.5;

  const topLeft = project(view, { z, x: -halfWidth, y: height });
  const bottomRight = project(view, { z, x: halfWidth });

  context.fillStyle = id === 'crate' ? OBSTACLE_COLORS.crate : OBSTACLE_COLORS.barrier;
  context.fillRect(
    topLeft.xPx,
    topLeft.yPx,
    bottomRight.xPx - topLeft.xPx,
    bottomRight.yPx - topLeft.yPx,
  );

  context.fillStyle = id === 'crate' ? OBSTACLE_COLORS.crateEdge : OBSTACLE_COLORS.barrierStripe;
  context.fillRect(
    topLeft.xPx,
    topLeft.yPx,
    bottomRight.xPx - topLeft.xPx,
    Math.max(1, 0.14 * topLeft.scale),
  );
}

/** Overhead, with a gap beneath: something to go under. */
function drawSlideObstacle(context: Canvas2D, view: PerspectiveView, z: number): void {
  const halfWidth = 2.4;
  const top = project(view, { z, x: -halfWidth, y: 3.2 });
  const bottom = project(view, { z, x: halfWidth, y: 1.5 });
  const post = project(view, { z, x: -halfWidth });

  context.fillStyle = OBSTACLE_COLORS.signPost;
  context.fillRect(top.xPx, top.yPx, Math.max(1, 0.2 * top.scale), post.yPx - top.yPx);
  context.fillRect(
    bottom.xPx - Math.max(1, 0.2 * top.scale),
    top.yPx,
    Math.max(1, 0.2 * top.scale),
    post.yPx - top.yPx,
  );

  context.fillStyle = OBSTACLE_COLORS.signFace;
  context.fillRect(top.xPx, top.yPx, bottom.xPx - top.xPx, bottom.yPx - top.yPx);
}

/** Blocking one side: something to go around. */
function drawSidestepObstacle(context: Canvas2D, view: PerspectiveView, z: number): void {
  const left = project(view, { z, x: -2.6, y: 1.6 });
  const right = project(view, { z, x: -0.2 });

  context.fillStyle = OBSTACLE_COLORS.post;
  context.fillRect(left.xPx, left.yPx, right.xPx - left.xPx, right.yPx - left.yPx);

  context.fillStyle = OBSTACLE_COLORS.barrierStripe;
  context.fillRect(left.xPx, left.yPx, right.xPx - left.xPx, Math.max(1, 0.18 * left.scale));
}

/**
 * A coloured band on the ground in front of the obstacle.
 *
 * Colour alone never carries meaning here — the silhouette already says which
 * action is needed (spec §12) — but a band the runner is about to cross is the
 * clearest possible "now".
 */
function drawActionBand(
  context: Canvas2D,
  view: PerspectiveView,
  z: number,
  action: ObstacleAction,
): void {
  const near = project(view, { z: Math.max(z - 1.4, 0.4), x: -view.config.trackHalfWidthMeters });
  const nearRight = project(view, {
    z: Math.max(z - 1.4, 0.4),
    x: view.config.trackHalfWidthMeters,
  });
  const far = project(view, { z, x: -view.config.trackHalfWidthMeters });
  const farRight = project(view, { z, x: view.config.trackHalfWidthMeters });

  context.globalAlpha = 0.35;
  context.fillStyle = ACTION_COLORS[action];
  context.beginPath();
  context.moveTo(far.xPx, far.yPx);
  context.lineTo(farRight.xPx, farRight.yPx);
  context.lineTo(nearRight.xPx, nearRight.yPx);
  context.lineTo(near.xPx, near.yPx);
  context.closePath();
  context.fill();
  context.globalAlpha = 1;
}
