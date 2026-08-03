/**
 * Canvas sizing and the drawing surface.
 *
 * The canvas has two sizes that must not be confused: the CSS size the layout
 * gives it, and the backing-store size in device pixels. Setting only the first
 * gives a blurry canvas on any HiDPI screen; setting only the second gives a
 * canvas that ignores the layout. This module keeps them in step and hands the
 * renderer a context already scaled so it can draw in CSS pixels throughout.
 */

/**
 * The subset of `CanvasRenderingContext2D` the renderer uses.
 *
 * Narrowing the type is what makes the renderer testable: jsdom has no 2D
 * context, so tests pass a recording stub. It also documents exactly which
 * canvas features the placeholder art depends on.
 */
export interface Canvas2D {
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  globalAlpha: number;
  save(): void;
  restore(): void;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  translate(x: number, y: number): void;
  rotate(radians: number): void;
  scale(x: number, y: number): void;
  clearRect(x: number, y: number, width: number, height: number): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  strokeRect(x: number, y: number, width: number, height: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  fill(): void;
  stroke(): void;
  arc(
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number,
    counterclockwise?: boolean,
  ): void;
  ellipse(
    x: number,
    y: number,
    radiusX: number,
    radiusY: number,
    rotation: number,
    startAngle: number,
    endAngle: number,
    counterclockwise?: boolean,
  ): void;
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
}

export interface SurfaceSize {
  readonly widthPx: number;
  readonly heightPx: number;
  readonly devicePixelRatio: number;
}

/**
 * Upper bound on the device pixel ratio we honour.
 *
 * A 3x or 4x backing store quadruples fill cost for a scene made of flat
 * rectangles that gains nothing from it. 2x is the point of diminishing returns
 * and keeps the 60 FPS target reachable on an ordinary laptop (spec §16).
 */
export const MAX_DEVICE_PIXEL_RATIO = 2;

export function clampDevicePixelRatio(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 0) return 1;

  return Math.min(ratio, MAX_DEVICE_PIXEL_RATIO);
}

/** The canvas fields sizing touches. A plain object stands in for tests. */
export interface SizableCanvas {
  width: number;
  height: number;
  readonly style: { width: string; height: string };
}

/**
 * Resizes the backing store and rescales the context.
 *
 * Returns the size actually applied. Assigning `canvas.width` clears the canvas
 * and resets the transform, so this must happen before drawing a frame, never
 * in the middle of one.
 */
export function resizeSurface(
  canvas: SizableCanvas,
  context: Canvas2D,
  size: SurfaceSize,
): SurfaceSize {
  const ratio = clampDevicePixelRatio(size.devicePixelRatio);
  // A zero-width canvas throws in some engines and renders nothing in the rest.
  const widthPx = Math.max(1, Math.floor(size.widthPx));
  const heightPx = Math.max(1, Math.floor(size.heightPx));

  const backingWidth = Math.round(widthPx * ratio);
  const backingHeight = Math.round(heightPx * ratio);

  // Reassigning the same value still clears the canvas — guard it, or a resize
  // observer firing every frame would wipe the scene and reset the transform.
  if (canvas.width !== backingWidth) canvas.width = backingWidth;
  if (canvas.height !== backingHeight) canvas.height = backingHeight;

  canvas.style.width = `${String(widthPx)}px`;
  canvas.style.height = `${String(heightPx)}px`;

  context.setTransform(ratio, 0, 0, ratio, 0, 0);

  return { widthPx, heightPx, devicePixelRatio: ratio };
}
