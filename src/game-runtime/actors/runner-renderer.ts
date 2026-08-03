import type { Canvas2D } from '../render/canvas-surface';
import { type PerspectiveView, project, runnerZ } from '../render/perspective';
import {
  crouchRatio,
  lateralOffsetRatio,
  type McAnimation,
  verticalOffsetRatio,
} from './mc-animation';

/**
 * The runner, seen from behind (spec §10).
 *
 * The side-on view is gone: in a chase shot the player is looking *past* the
 * runner at what is coming, and the runner's job is to be a readable silhouette
 * that does not cover the track. So he sits low in the frame, and the pose that
 * matters most — the jump — reads as him rising out of it.
 *
 * Geometry is in body units (1.0 = full height, origin at the feet, up is
 * negative) and scaled once by the projection, so the whole figure resizes with
 * one number and a sprite sheet could replace this file alone.
 */

/** The palette. Scene colour, not UI colour — tokens never reach the canvas. */
export const MC_COLORS = {
  skin: '#e8b48c',
  skinShadow: '#c9906a',
  shirt: '#3f7fd4',
  shirtShadow: '#2f62a8',
  shorts: '#2f3a4d',
  shoe: '#d94f4f',
  hair: '#4a3526',
  outline: '#1d2430',
  eye: '#1d2430',
  shadow: 'rgba(0, 0, 0, 0.25)',
  speedLine: 'rgba(255, 255, 255, 0.7)',
  dust: 'rgba(220, 220, 220, 0.55)',
} as const;

/** His height in world metres. Sets his size relative to obstacles and dogs. */
export const MC_HEIGHT_METERS = 1.75;

/** How high a jump lifts him, in metres. */
export const JUMP_HEIGHT_METERS = 1.8;

/** How far a sidestep moves him, in metres. */
export const SIDESTEP_METERS = 1.9;

export interface RunnerDrawOptions {
  readonly view: PerspectiveView;
  readonly animation: McAnimation;
}

export function runnerWorldPoint(options: RunnerDrawOptions): {
  z: number;
  x: number;
  y: number;
} {
  const { animation } = options;

  return {
    z: runnerZ(options.view),
    x: lateralOffsetRatio(animation) * SIDESTEP_METERS,
    y: verticalOffsetRatio(animation) * JUMP_HEIGHT_METERS,
  };
}

export function drawRunner(context: Canvas2D, options: RunnerDrawOptions): void {
  const { view, animation } = options;
  const point = runnerWorldPoint(options);
  const feet = project(view, point);
  const crouch = crouchRatio(animation);
  const heightPx = MC_HEIGHT_METERS * feet.scale * (1 - crouch * 0.35);

  // The shadow stays on the ground while he does not, which is what sells the
  // jump — a figure that rises with its own shadow just gets bigger.
  const groundPoint = project(view, { z: point.z, x: point.x });
  drawShadow(context, groundPoint.xPx, groundPoint.yPx, heightPx, point.y);

  context.save();
  context.translate(feet.xPx, feet.yPx);
  context.scale(heightPx, heightPx);

  drawBody(context, animation);

  context.restore();
}

function drawShadow(
  context: Canvas2D,
  xPx: number,
  yPx: number,
  heightPx: number,
  heightMeters: number,
): void {
  const lift = Math.min(1, heightMeters / JUMP_HEIGHT_METERS);
  const width = heightPx * 0.42 * (1 - lift * 0.35);

  context.fillStyle = MC_COLORS.shadow;
  context.globalAlpha = 1 - lift * 0.45;
  context.beginPath();
  context.ellipse(xPx, yPx, width, width * 0.28, 0, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;
}

/**
 * The figure itself, from behind.
 *
 * A back view is mostly shoulders, and that is the point: broad, solid, and
 * unmistakably a person running away from something.
 */
function drawBody(context: Canvas2D, animation: McAnimation): void {
  const swing = Math.sin(animation.cyclePhase * Math.PI * 2);
  const airborne = verticalOffsetRatio(animation) > 0.05;
  // A slight vertical bob, so a run cycle is visible even head-on from behind.
  const bob = airborne ? 0 : Math.abs(Math.cos(animation.cyclePhase * Math.PI * 2)) * 0.035;

  context.translate(0, bob);

  // Legs: alternating behind him, tucked under him in the air.
  context.fillStyle = MC_COLORS.shorts;
  drawLeg(context, -0.15, airborne ? -0.16 : swing * 0.16);
  drawLeg(context, 0.15, airborne ? -0.16 : -swing * 0.16);

  context.fillStyle = MC_COLORS.shoe;
  drawShoe(context, -0.15, airborne ? -0.16 : swing * 0.16);
  drawShoe(context, 0.15, airborne ? -0.16 : -swing * 0.16);

  // Torso: broad shoulders tapering to the hips, leaning into the run.
  context.fillStyle = MC_COLORS.shirt;
  context.beginPath();
  context.moveTo(-0.22, -0.42);
  context.quadraticCurveTo(-0.32, -0.68, -0.27, -0.86);
  context.quadraticCurveTo(0, -0.94, 0.27, -0.86);
  context.quadraticCurveTo(0.32, -0.68, 0.22, -0.42);
  context.closePath();
  context.fill();

  // Shadow down the spine and along the hem, which is what stops the back
  // reading as a flat rectangle at this size.
  context.fillStyle = MC_COLORS.shirtShadow;
  context.fillRect(-0.025, -0.84, 0.05, 0.42);
  context.fillRect(-0.22, -0.46, 0.44, 0.04);

  // Arms, close to the body and swinging opposite the legs.
  context.fillStyle = MC_COLORS.skin;
  drawArm(context, -0.28, airborne ? -0.2 : -swing * 0.16);
  drawArm(context, 0.28, airborne ? -0.2 : swing * 0.16);

  // Neck.
  context.fillStyle = MC_COLORS.skinShadow;
  context.fillRect(-0.05, -0.94, 0.1, 0.06);

  // Head. While boosting he looks back over his shoulder at the dogs, which is
  // the only moment his face is visible at all.
  if (animation.state === 'boosting' || animation.locomotion === 'boosting') {
    drawTauntingHead(context, animation);
  } else {
    drawHeadFromBehind(context);
  }
}

function drawHeadFromBehind(context: Canvas2D): void {
  context.fillStyle = MC_COLORS.skin;
  context.beginPath();
  context.arc(0, -1.02, 0.115, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = MC_COLORS.hair;
  context.beginPath();
  context.arc(0, -1.04, 0.12, Math.PI * 0.9, Math.PI * 2.1);
  context.fill();
  context.fillRect(-0.12, -1.05, 0.24, 0.07);
}

/**
 * The look back.
 *
 * Three-quarter profile over the left shoulder, one eye and a wide grin. The
 * joke is the whole point of the chase — he is enjoying this — and it only ever
 * appears while he is pulling away, so it reads as earned rather than as smug.
 */
function drawTauntingHead(context: Canvas2D, animation: McAnimation): void {
  // A slow bob through the run cycle, so the look is alive rather than pasted.
  const tilt = Math.sin(animation.cyclePhase * Math.PI * 2) * 0.012;

  context.save();
  context.translate(-0.055, tilt);

  context.fillStyle = MC_COLORS.skin;
  context.beginPath();
  context.arc(0, -1.02, 0.125, 0, Math.PI * 2);
  context.fill();

  // Hair covers the back of the skull, leaving the face turned to the left.
  context.fillStyle = MC_COLORS.hair;
  context.beginPath();
  context.arc(0.02, -1.04, 0.128, Math.PI * 1.55, Math.PI * 0.75);
  context.fill();

  // Ear, on the side now facing us.
  context.fillStyle = MC_COLORS.skinShadow;
  context.beginPath();
  context.arc(0.075, -1.0, 0.035, 0, Math.PI * 2);
  context.fill();

  // One eye, looking back down the road.
  context.fillStyle = MC_COLORS.eye;
  context.beginPath();
  context.arc(-0.075, -1.04, 0.022, 0, Math.PI * 2);
  context.fill();

  // The grin: a wide open arc with a band of teeth across the top, which is
  // what makes it a laugh rather than a smile.
  context.fillStyle = MC_COLORS.outline;
  context.beginPath();
  context.arc(-0.045, -0.985, 0.07, 0, Math.PI);
  context.closePath();
  context.fill();

  context.fillStyle = '#ffffff';
  context.fillRect(-0.113, -0.985, 0.135, 0.022);

  // A cheek, raised the way a real laugh raises one.
  context.fillStyle = MC_COLORS.skinShadow;
  context.beginPath();
  context.arc(-0.085, -1.012, 0.028, 0, Math.PI * 2);
  context.fill();

  context.restore();
}

/** `swing` is how far this leg is forward, in body units. Positive lifts it. */
function drawLeg(context: Canvas2D, x: number, swing: number): void {
  const lift = Math.max(0, swing) * 0.9;
  context.fillRect(x - 0.065, -0.46 + lift, 0.13, 0.46 - lift);
}

function drawShoe(context: Canvas2D, x: number, swing: number): void {
  const lift = Math.max(0, swing) * 0.9;
  // Kept above the origin: the origin is the ground, and a shoe drawn through
  // it pokes out below the contact shadow.
  context.fillRect(x - 0.09, -0.065 + lift, 0.18, 0.065);
}

function drawArm(context: Canvas2D, x: number, swing: number): void {
  context.fillRect(x - 0.05, -0.8 + swing * 0.12, 0.1, 0.3);
}
