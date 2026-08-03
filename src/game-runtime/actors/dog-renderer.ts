import { type ChaseThreat } from '../../game-core/chase';
import { type Camera, worldToScreenX } from '../render/camera';
import { type Canvas2D } from '../render/canvas-surface';
import { DOG_HEIGHT_METERS, type DogPackView, type DogView } from './dog-pack';

/**
 * The dogs, drawn from vector shapes (spec §10).
 *
 * Energetic rather than graphic: bright colours, floppy ears, a wagging-turned-
 * urgent tail. The threat is communicated by how close and how hard they are
 * running, not by teeth and blood.
 *
 * Danger escalates on three levels, and each level adds a cue that survives
 * colour-blindness and a small screen (spec §12): posture, dust, and motion.
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

export function dogHeightPx(camera: Camera): number {
  return DOG_HEIGHT_METERS * camera.config.pixelsPerMeter;
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

function drawLeg(context: Canvas2D, x: number, hipY: number, swing: number, color: string): void {
  context.strokeStyle = color;
  context.lineWidth = 0.09;
  context.beginPath();
  context.moveTo(x, hipY);
  context.lineTo(x + swing, 0);
  context.stroke();
}

/** Dust behind a dog that is closing. The first cue that something changed. */
function drawDust(context: Canvas2D, dog: DogView, threat: ChaseThreat): void {
  if (threat === 'safe') return;

  const puffs = threat === 'closing' ? 2 : 3;

  for (let puff = 0; puff < puffs; puff += 1) {
    const drift = ((dog.cyclePhase + puff * 0.3) % 1) * 0.5;
    fillEllipse(
      context,
      -0.55 - drift,
      -0.06 - puff * 0.03,
      0.1 + puff * 0.02,
      0.07,
      DOG_COLORS.dust,
    );
  }
}

/** The face. Bared teeth and lit eyes only once the dogs are genuinely close. */
function drawHead(context: Canvas2D, dog: DogView, threat: ChaseThreat, headX: number): void {
  const headY = -0.62;
  const critical = threat === 'critical' || threat === 'caught';

  // Ears flatten back as the dog commits to the sprint.
  const earSweep = 0.1 + dog.lungeRatio * 0.16;
  fillEllipse(context, headX - 0.13 - earSweep, headY - 0.1, 0.11, 0.07, DOG_COLORS.ear);

  fillEllipse(context, headX, headY, 0.17, 0.13, BODY_BY_THREAT[threat]);
  // Muzzle.
  fillEllipse(context, headX + 0.15, headY + 0.04, 0.11, 0.07, DOG_COLORS.belly);
  fillEllipse(context, headX + 0.25, headY + 0.03, 0.035, 0.03, DOG_COLORS.nose);

  fillEllipse(
    context,
    headX + 0.06,
    headY - 0.03,
    0.028,
    critical ? 0.034 : 0.026,
    critical ? DOG_COLORS.eyeCritical : DOG_COLORS.eye,
  );

  // The jaw snaps open and shut on its own rhythm once they are on top of you.
  if (critical) {
    const snap = (Math.sin(dog.cyclePhase * Math.PI * 4) + 1) / 2;
    const openness = 0.02 + snap * 0.07;

    context.fillStyle = DOG_COLORS.tongue;
    context.beginPath();
    context.moveTo(headX + 0.1, headY + 0.06);
    context.lineTo(headX + 0.27, headY + 0.05 + openness);
    context.lineTo(headX + 0.1, headY + 0.1 + openness);
    context.closePath();
    context.fill();

    context.fillStyle = DOG_COLORS.tooth;
    context.fillRect(headX + 0.19, headY + 0.05, 0.022, 0.03);
  } else if (threat === 'closing') {
    // Tongue out, no teeth: working hard, not yet on top of the MC.
    fillEllipse(context, headX + 0.19, headY + 0.1, 0.05, 0.03, DOG_COLORS.tongue);
  }
}

export interface DogDrawOptions {
  /** Screen x of the dog's centre. */
  readonly xPx: number;
  readonly groundYPx: number;
  /** Height of a scale-1.0 dog, in pixels. */
  readonly heightPx: number;
  readonly dog: DogView;
  readonly threat: ChaseThreat;
}

/** Draws one dog. Geometry is in body units, origin at the paws. */
export function drawDog(context: Canvas2D, options: DogDrawOptions): void {
  const { dog, threat } = options;
  const height = options.heightPx * dog.scale;
  const swing = Math.sin(dog.cyclePhase * Math.PI * 2);
  // A bounding gait: the whole body leaves the ground on the stride.
  const bound = Math.abs(Math.sin(dog.cyclePhase * Math.PI * 2)) * (0.04 + dog.lungeRatio * 0.06);

  context.save();

  context.save();
  context.translate(options.xPx, options.groundYPx);
  context.scale(height, height);
  fillEllipse(context, 0, 0, 0.3, 0.05, DOG_COLORS.shadow);
  context.restore();

  context.translate(
    options.xPx,
    options.groundYPx - bound * height + dog.laneOffset * options.heightPx * 0.25,
  );
  context.scale(height, height);

  drawDust(context, dog, threat);

  // Stretched forward as they lunge — the silhouette itself reads as urgency.
  context.scale(1 + dog.lungeRatio * 0.12, 1 - dog.lungeRatio * 0.05);

  const body = BODY_BY_THREAT[threat];

  // Back legs, then body, then front legs, so the near pair reads on top.
  drawLeg(context, -0.22, -0.42, -swing * 0.2, DOG_COLORS.ear);
  drawLeg(context, 0.2, -0.42, swing * 0.22, DOG_COLORS.ear);

  // Tail: raised and rigid when hunting, loose otherwise.
  context.strokeStyle = body;
  context.lineWidth = 0.06;
  context.beginPath();
  context.moveTo(-0.34, -0.5);
  context.quadraticCurveTo(
    -0.52,
    -0.55 - dog.lungeRatio * 0.15,
    -0.6,
    -0.42 - dog.lungeRatio * 0.25 + swing * 0.05,
  );
  context.stroke();

  fillEllipse(context, 0, -0.46, 0.34, 0.2, body);
  fillEllipse(context, 0.02, -0.38, 0.24, 0.12, DOG_COLORS.belly);

  drawLeg(context, -0.1, -0.44, -swing * 0.24, body);
  drawLeg(context, 0.28, -0.44, swing * 0.26, body);

  drawHead(context, dog, threat, 0.32);

  context.restore();
}

export interface DogPackDrawOptions {
  readonly camera: Camera;
  readonly groundYPx: number;
  readonly pack: DogPackView;
}

/** Draws the whole pack, furthest dog first so the leader is on top. */
export function drawDogPack(context: Canvas2D, options: DogPackDrawOptions): void {
  const heightPx = dogHeightPx(options.camera);

  // Reverse order: the lead dog is drawn last and therefore over the others.
  for (const dog of [...options.pack.dogs].reverse()) {
    drawDog(context, {
      xPx: worldToScreenX(options.camera, dog.worldMeters),
      groundYPx: options.groundYPx,
      heightPx,
      dog,
      threat: options.pack.threat,
    });
  }
}
