import { type Camera } from '../render/camera';
import { type Canvas2D } from '../render/canvas-surface';
import {
  crouchRatio,
  lateralOffsetRatio,
  type McAnimation,
  type McAnimationState,
  verticalOffsetRatio,
} from './mc-animation';

/**
 * The MC, drawn from vector shapes (spec §10).
 *
 * Heavy-set, expressive, readable at small scale, and comedic without being
 * demeaning: the joke is that he is outrunning three dogs, not that he is heavy.
 * He is drawn upright, capable, and determined — the exaggeration is in the
 * motion, not in the proportions.
 *
 * All geometry is expressed in body units (1.0 = full height, origin at the feet,
 * up is negative) and scaled once by the transform, so changing `heightPx` is the
 * only thing needed to resize him, and replacing this with a sprite sheet later
 * means swapping this file alone.
 */

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

/** The MC's height in world meters. Sets his size relative to obstacles and dogs. */
export const MC_HEIGHT_METERS = 1.75;

export function mcHeightPx(camera: Camera): number {
  return MC_HEIGHT_METERS * camera.config.pixelsPerMeter;
}

export interface McDrawOptions {
  /** Screen x of the MC's centre line, in CSS pixels. */
  readonly xPx: number;
  /** Screen y of the ground he stands on. */
  readonly groundYPx: number;
  /** Full standing height, in pixels. */
  readonly heightPx: number;
  readonly animation: McAnimation;
}

/** Mouth shape, chosen per state. Expression carries most of the readability. */
type Expression = 'determined' | 'strained' | 'shock' | 'delighted' | 'exhausted';

const EXPRESSIONS: Readonly<Record<McAnimationState, Expression>> = {
  idle: 'determined',
  running: 'determined',
  boosting: 'strained',
  jumping: 'strained',
  sliding: 'strained',
  sidestepping: 'strained',
  stumbling: 'shock',
  hit: 'shock',
  victory: 'delighted',
  caught: 'exhausted',
};

/** Body lean in radians. Forward is positive; the run is a chase, so he leans in. */
function leanRadians(animation: McAnimation): number {
  switch (animation.state) {
    case 'boosting':
      return 0.3;
    case 'running':
      return 0.16;
    case 'jumping':
      return 0.1;
    case 'sliding':
      return -0.5;
    case 'sidestepping':
      // Leaning into the step, away from whatever he is dodging.
      return 0.1 - lateralOffsetRatio(animation) * 0.3;
    case 'stumbling':
      // A wobble rather than a fixed pose — he is fighting to stay upright.
      return 0.45 + Math.sin(animation.progress * Math.PI * 3) * 0.18;
    case 'hit':
      return -0.35;
    case 'caught':
      return 0.5;
    default:
      return 0.04;
  }
}

/** Vertical bob, in body units. Sells weight: he lands hard and rises slowly. */
function bobUnits(animation: McAnimation, swing: number): number {
  switch (animation.state) {
    case 'running':
    case 'boosting':
      return Math.abs(swing) * 0.03;
    case 'idle':
      return Math.sin(animation.cyclePhase * Math.PI * 2) * 0.012;
    case 'victory':
      return Math.abs(Math.sin(animation.cyclePhase * Math.PI * 2)) * 0.06;
    default:
      return 0;
  }
}

/** Leg and arm swing, -1..1, from the run cycle. */
function swingFor(animation: McAnimation): number {
  switch (animation.state) {
    case 'running':
      return Math.sin(animation.cyclePhase * Math.PI * 2);
    case 'boosting':
      return Math.sin(animation.cyclePhase * Math.PI * 2) * 1.25;
    case 'stumbling':
      return Math.sin(animation.progress * Math.PI * 4) * 0.6;
    default:
      return 0;
  }
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

/** A limb: a thick line from hip/shoulder to foot/hand. */
function drawLimb(
  context: Canvas2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  width: number,
  color: string,
): void {
  context.strokeStyle = color;
  context.lineWidth = width;
  context.beginPath();
  context.moveTo(fromX, fromY);
  context.lineTo(toX, toY);
  context.stroke();
}

function drawFace(context: Canvas2D, headY: number, expression: Expression): void {
  const eyeY = headY - 0.01;

  context.fillStyle = MC_COLORS.eye;

  if (expression === 'exhausted') {
    // Closed eyes: two short strokes, so "spent" reads without needing colour.
    drawLimb(context, 0.03, eyeY, 0.09, eyeY, 0.012, MC_COLORS.eye);
    drawLimb(context, -0.07, eyeY, -0.02, eyeY, 0.012, MC_COLORS.eye);
  } else {
    const eyeRadius = expression === 'shock' ? 0.026 : 0.018;
    fillEllipse(context, 0.06, eyeY, eyeRadius, eyeRadius, MC_COLORS.eye);
    fillEllipse(context, -0.04, eyeY, eyeRadius * 0.8, eyeRadius, MC_COLORS.eye);
  }

  const mouthY = headY + 0.05;

  context.strokeStyle = MC_COLORS.outline;
  context.lineWidth = 0.014;
  context.beginPath();
  context.moveTo(-0.04, mouthY);

  switch (expression) {
    case 'delighted':
      context.quadraticCurveTo(0.02, mouthY + 0.05, 0.08, mouthY);
      break;
    case 'shock':
      context.quadraticCurveTo(0.02, mouthY + 0.06, 0.08, mouthY);
      context.quadraticCurveTo(0.02, mouthY - 0.02, -0.04, mouthY);
      break;
    case 'strained':
      context.quadraticCurveTo(0.02, mouthY + 0.03, 0.08, mouthY - 0.01);
      break;
    case 'exhausted':
      context.quadraticCurveTo(0.02, mouthY - 0.03, 0.08, mouthY);
      break;
    default:
      context.lineTo(0.08, mouthY);
  }

  context.stroke();
}

/** Motion cues drawn behind the MC while he is moving fast. */
function drawSpeedLines(context: Canvas2D, animation: McAnimation): void {
  if (animation.state !== 'boosting') return;

  context.strokeStyle = MC_COLORS.speedLine;
  context.lineWidth = 0.02;

  for (let line = 0; line < 3; line += 1) {
    const y = -0.75 + line * 0.22;
    const drift = ((animation.cyclePhase + line * 0.33) % 1) * 0.3;

    context.beginPath();
    context.moveTo(-0.42 - drift, y);
    context.lineTo(-0.7 - drift, y);
    context.stroke();
  }
}

/** Dust kicked up by a slide. */
function drawDust(context: Canvas2D, animation: McAnimation): void {
  if (animation.state !== 'sliding') return;

  for (let puff = 0; puff < 3; puff += 1) {
    const spread = animation.progress * 0.35;
    fillEllipse(
      context,
      -0.28 - puff * 0.12 - spread,
      -0.06 - puff * 0.02,
      0.09 - puff * 0.02,
      0.06 - puff * 0.01,
      MC_COLORS.dust,
    );
  }
}

/**
 * Draws the MC.
 *
 * Leaves the context exactly as it was found — the transform, alpha, and styles
 * are all restored, because the scene, the dogs, and the obstacles draw around
 * this call.
 */
export function drawMc(context: Canvas2D, options: McDrawOptions): void {
  const { animation, heightPx } = options;
  const swing = swingFor(animation);
  const lift = verticalOffsetRatio(animation) * 0.55;
  const crouch = crouchRatio(animation);
  const bob = bobUnits(animation, swing);
  // A sidestep moves him across the road, not along it, so it shifts the whole
  // body sideways on screen rather than changing his position in the world.
  const lateralPx = lateralOffsetRatio(animation) * heightPx * 0.35;

  context.save();

  // Shadow stays on the ground and shrinks with height, which is what sells a
  // jump far more than the character's own position does.
  const shadowScale = 1 - verticalOffsetRatio(animation) * 0.45;
  context.save();
  context.translate(options.xPx, options.groundYPx);
  context.scale(heightPx, heightPx);
  fillEllipse(context, 0, 0, 0.26 * shadowScale, 0.05 * shadowScale, MC_COLORS.shadow);
  context.restore();

  context.translate(options.xPx + lateralPx, options.groundYPx - (lift + bob) * heightPx);
  context.scale(heightPx, heightPx);

  drawSpeedLines(context, animation);
  drawDust(context, animation);

  // Crouching squashes the whole body rather than moving parts individually —
  // exaggerated squash is the readable, comedic option (spec §10).
  const squash = 1 - crouch * 0.45;
  context.rotate(leanRadians(animation));
  context.scale(1 + crouch * 0.25, squash);

  const hipY = -0.42;
  const shoulderY = -0.72;

  // Legs. Short and thick, swinging opposite each other.
  const legSwing = swing * 0.22;
  const legLift = animation.state === 'jumping' ? 0.1 : 0;
  drawLimb(context, -0.05, hipY, -0.05 - legSwing, -legLift, 0.1, MC_COLORS.skinShadow);
  drawLimb(context, 0.05, hipY, 0.05 + legSwing, -legLift, 0.1, MC_COLORS.skin);

  // Shoes.
  fillEllipse(context, -0.05 - legSwing, -legLift, 0.07, 0.035, MC_COLORS.shoe);
  fillEllipse(context, 0.05 + legSwing, -legLift, 0.07, 0.035, MC_COLORS.shoe);

  // Shorts.
  fillEllipse(context, 0, hipY + 0.02, 0.17, 0.11, MC_COLORS.shorts);

  // The belly — the silhouette's defining shape, so it is drawn large and round.
  fillEllipse(context, 0.01, -0.5, 0.22, 0.19, MC_COLORS.shirt);
  fillEllipse(context, -0.06, -0.46, 0.11, 0.1, MC_COLORS.shirtShadow);

  // Chest and shoulders.
  fillEllipse(context, 0, -0.68, 0.16, 0.12, MC_COLORS.shirt);

  // Arms. Opposite phase to the legs; raised in victory.
  const armSwing = -swing * 0.2;
  if (animation.state === 'victory') {
    drawLimb(context, -0.12, shoulderY, -0.24, shoulderY - 0.22, 0.075, MC_COLORS.skinShadow);
    drawLimb(context, 0.12, shoulderY, 0.24, shoulderY - 0.22, 0.075, MC_COLORS.skin);
  } else {
    drawLimb(context, -0.12, shoulderY, -0.18 + armSwing, hipY + 0.02, 0.075, MC_COLORS.skinShadow);
    drawLimb(context, 0.12, shoulderY, 0.18 + armSwing, hipY + 0.02, 0.075, MC_COLORS.skin);
  }

  // Head.
  const headY = -0.88;
  fillEllipse(context, 0.01, headY, 0.13, 0.125, MC_COLORS.skin);
  fillEllipse(context, 0.0, headY - 0.08, 0.13, 0.06, MC_COLORS.hair);
  drawFace(context, headY, EXPRESSIONS[animation.state]);

  context.restore();
}
