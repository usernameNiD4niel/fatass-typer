import type { Canvas2D, SizableCanvas } from '../game-runtime/render/canvas-surface';

/**
 * A recording 2D context.
 *
 * jsdom implements the `<canvas>` element but not a 2D context, so rendering
 * cannot be tested against the real thing without pulling in node-canvas. The
 * renderer draws through the narrow `Canvas2D` interface precisely so a stub
 * like this can stand in and tests can assert on the draw calls themselves.
 */

export interface DrawCall {
  readonly op: string;
  readonly args: readonly number[];
  /** Fill colour in effect when the call was made. */
  readonly fillStyle: string;
  readonly globalAlpha: number;
}

export class FakeCanvas2D implements Canvas2D {
  fillStyle = '#000000';
  strokeStyle = '#000000';
  lineWidth = 1;
  globalAlpha = 1;

  readonly calls: DrawCall[] = [];

  private record(op: string, ...args: number[]): void {
    this.calls.push({ op, args, fillStyle: this.fillStyle, globalAlpha: this.globalAlpha });
  }

  save(): void {
    this.record('save');
  }

  restore(): void {
    this.record('restore');
  }

  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.record('setTransform', a, b, c, d, e, f);
  }

  clearRect(x: number, y: number, width: number, height: number): void {
    this.record('clearRect', x, y, width, height);
  }

  fillRect(x: number, y: number, width: number, height: number): void {
    this.record('fillRect', x, y, width, height);
  }

  strokeRect(x: number, y: number, width: number, height: number): void {
    this.record('strokeRect', x, y, width, height);
  }

  beginPath(): void {
    this.record('beginPath');
  }

  moveTo(x: number, y: number): void {
    this.record('moveTo', x, y);
  }

  lineTo(x: number, y: number): void {
    this.record('lineTo', x, y);
  }

  closePath(): void {
    this.record('closePath');
  }

  fill(): void {
    this.record('fill');
  }

  stroke(): void {
    this.record('stroke');
  }

  arc(
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number,
    counterclockwise?: boolean,
  ): void {
    this.record('arc', x, y, radius, startAngle, endAngle, counterclockwise === true ? 1 : 0);
  }

  callsOf(op: string): readonly DrawCall[] {
    return this.calls.filter((call) => call.op === op);
  }

  reset(): void {
    this.calls.length = 0;
  }
}

/** A stand-in for the canvas element, holding only the fields sizing touches. */
export function createFakeCanvasElement(): SizableCanvas {
  return { width: 0, height: 0, style: { width: '', height: '' } };
}
