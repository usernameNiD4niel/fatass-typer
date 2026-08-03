import type { Canvas2D } from '../render/canvas-surface';
import { isDrawable, packZ, type PerspectiveView, project } from '../render/perspective';
import type { ChaseThreat } from '../../game-core/chase';
import { DOG_HEIGHT_METERS } from './dog-pack';

/**
 * The pack, chasing into the shot (spec §5, §10).
 *
 * In this view the dogs are between the camera and the runner, which is the
 * whole reason the shot works: they grow as they close, and by the time they
 * are level with him they fill the bottom of the frame. Nothing about the rules
 * changes — the gap is still one number — but the player feels it without
 * reading the meter.
 *
 * Drawn before the runner, so he stays in front of them until the moment they
 * actually catch him.
 */

export const DOG_COLORS = {
  bodySafe: '#b98a4e',
  bodyClosing: '#c07a45',
  bodyCritical: '#c25b45',
  belly: '#e8d2ae',
  ear: '#8b6236',
  nose: '#2a2118',
  eye: '#2a2118',
  eyeCritical: '#ffe45c',
  tongue: '#e8697d',
  tooth: '#fdfdfd',
  shadow: 'rgba(0, 0, 0, 0.25)',
  dust: 'rgba(210, 200, 185, 0.5)',
} as const;

const BODY_BY_THREAT: Readonly<Record<ChaseThreat, string>> = {
  safe: DOG_COLORS.bodySafe,
  closing: DOG_COLORS.bodyClosing,
  critical: DOG_COLORS.bodyCritical,
  caught: DOG_COLORS.bodyCritical,
};

/**
 * The three dogs, as offsets from the centre line and depths behind the lead.
 *
 * A wedge, not a row: one dog on his heels and two fanned out and slightly
 * further back, which reads as a pack running someone down rather than as three
 * copies of the same animal.
 */
const PACK = [
  { x: -3.1, back: 0.2 },
  { x: 3.2, back: 0.55 },
  { x: -0.4, back: 1.4 },
] as const;

export interface PackDrawOptions {
  readonly view: PerspectiveView;
  /** Gap remaining, 0 (caught) to 1 (the gap they started with). */
  readonly normalizedGap: number;
  readonly threat: ChaseThreat;
  /** Position in the bounding cycle, 0..1. */
  readonly cyclePhase: number;
}

export function drawPack(context: Canvas2D, options: PackDrawOptions): void {
  const lead = packZ(options.view, options.normalizedGap);

  // Furthest first: the painter's algorithm is all the depth sorting there is.
  // A dog behind the lens is simply not drawn — that is what a healthy lead
  // looks like from inside the shot.
  // Furthest from the lens first.
  [...PACK]
    .map((dog, index) => ({ ...dog, index }))
    .sort((a, b) => b.back - a.back)
    .forEach((dog) => {
      const z = lead + dog.back;
      if (!isDrawable(options.view, z)) return;

      const phase = (options.cyclePhase + dog.index * 0.31) % 1;
      drawDog(context, options, { z, x: dog.x, phase, index: dog.index });
    });
}

function drawDog(
  context: Canvas2D,
  options: PackDrawOptions,
  placement: { z: number; x: number; phase: number; index: number },
): void {
  const { view } = options;
  const bound = Math.sin(placement.phase * Math.PI * 2);
  const feet = project(view, { z: placement.z, x: placement.x, y: Math.max(0, bound) * 0.22 });
  const ground = project(view, { z: placement.z, x: placement.x });
  const heightPx = DOG_HEIGHT_METERS * feet.scale;

  context.fillStyle = DOG_COLORS.shadow;
  context.beginPath();
  context.ellipse(ground.xPx, ground.yPx, heightPx * 0.42, heightPx * 0.14, 0, 0, Math.PI * 2);
  context.fill();

  context.save();
  context.translate(feet.xPx, feet.yPx);
  context.scale(heightPx, heightPx);

  const body = BODY_BY_THREAT[options.threat];

  // Legs, alternating with the bound.
  context.fillStyle = body;
  context.fillRect(-0.36, -0.4, 0.13, 0.4 - bound * 0.06);
  context.fillRect(0.23, -0.4, 0.13, 0.4 + bound * 0.06);

  // Tail, up and swinging — the clearest "this is an animal" cue from behind.
  context.beginPath();
  context.moveTo(-0.04, -0.86);
  context.quadraticCurveTo(0.16 + bound * 0.1, -1.24, 0.02 + bound * 0.14, -1.42);
  context.quadraticCurveTo(0.14, -1.2, 0.1, -0.84);
  context.closePath();
  context.fill();

  // Body: a broad back-on wedge, wider at the shoulders than the hips.
  context.beginPath();
  context.moveTo(-0.4, -0.38);
  context.quadraticCurveTo(-0.48, -0.82, -0.2, -0.92);
  context.lineTo(0.2, -0.92);
  context.quadraticCurveTo(0.48, -0.82, 0.4, -0.38);
  context.closePath();
  context.fill();

  context.fillStyle = DOG_COLORS.belly;
  context.fillRect(-0.12, -0.62, 0.24, 0.22);

  // Head, low and forward, with the muzzle visible past the shoulders.
  context.fillStyle = body;
  context.beginPath();
  context.arc(0, -1.0, 0.22, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = DOG_COLORS.ear;
  context.beginPath();
  context.moveTo(-0.22, -1.08);
  context.lineTo(-0.1, -1.34);
  context.lineTo(-0.01, -1.04);
  context.closePath();
  context.fill();
  context.beginPath();
  context.moveTo(0.22, -1.08);
  context.lineTo(0.1, -1.34);
  context.lineTo(0.01, -1.04);
  context.closePath();
  context.fill();

  context.fillStyle = DOG_COLORS.nose;
  context.beginPath();
  context.arc(0, -0.88, 0.05, 0, Math.PI * 2);
  context.fill();

  // Eyes catch the light once they are close enough to matter.
  if (options.threat === 'critical' || options.threat === 'caught') {
    context.fillStyle = DOG_COLORS.eyeCritical;
    context.beginPath();
    context.arc(-0.1, -1.02, 0.05, 0, Math.PI * 2);
    context.arc(0.1, -1.02, 0.05, 0, Math.PI * 2);
    context.fill();
  }

  context.restore();
}
