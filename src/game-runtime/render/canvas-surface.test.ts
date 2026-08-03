import { describe, expect, it } from 'vitest';

import { createFakeCanvasElement, FakeCanvas2D } from '../../test/fake-canvas';
import { clampDevicePixelRatio, MAX_DEVICE_PIXEL_RATIO, resizeSurface } from './canvas-surface';

describe('clampDevicePixelRatio', () => {
  it('passes ordinary ratios through', () => {
    expect(clampDevicePixelRatio(1)).toBe(1);
    expect(clampDevicePixelRatio(1.5)).toBe(1.5);
  });

  it('caps very high ratios', () => {
    expect(clampDevicePixelRatio(4)).toBe(MAX_DEVICE_PIXEL_RATIO);
  });

  it('falls back to 1 for nonsense values', () => {
    expect(clampDevicePixelRatio(0)).toBe(1);
    expect(clampDevicePixelRatio(-2)).toBe(1);
    expect(clampDevicePixelRatio(Number.NaN)).toBe(1);
  });
});

describe('resizeSurface', () => {
  it('sizes the backing store in device pixels and the element in CSS pixels', () => {
    const canvas = createFakeCanvasElement();
    const context = new FakeCanvas2D();

    resizeSurface(canvas, context, { widthPx: 800, heightPx: 450, devicePixelRatio: 2 });

    expect(canvas.width).toBe(1600);
    expect(canvas.height).toBe(900);
    expect(canvas.style.width).toBe('800px');
    expect(canvas.style.height).toBe('450px');
  });

  it('scales the context so the renderer can draw in CSS pixels', () => {
    const context = new FakeCanvas2D();

    resizeSurface(createFakeCanvasElement(), context, {
      widthPx: 800,
      heightPx: 450,
      devicePixelRatio: 2,
    });

    expect(context.callsOf('setTransform')[0]?.args).toEqual([2, 0, 0, 2, 0, 0]);
  });

  it('does not touch the backing store when the size is unchanged', () => {
    const canvas = createFakeCanvasElement();
    const context = new FakeCanvas2D();
    const size = { widthPx: 800, heightPx: 450, devicePixelRatio: 1 };

    resizeSurface(canvas, context, size);
    canvas.width = 800; // a write would clear the canvas; prove none happens
    resizeSurface(canvas, context, size);

    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(450);
  });

  it('never produces a zero-sized surface', () => {
    const canvas = createFakeCanvasElement();

    const applied = resizeSurface(canvas, new FakeCanvas2D(), {
      widthPx: 0,
      heightPx: 0,
      devicePixelRatio: 1,
    });

    expect(applied).toEqual({ widthPx: 1, heightPx: 1, devicePixelRatio: 1 });
    expect(canvas.width).toBe(1);
  });

  it('reports the clamped ratio it actually applied', () => {
    const applied = resizeSurface(createFakeCanvasElement(), new FakeCanvas2D(), {
      widthPx: 640.7,
      heightPx: 360.2,
      devicePixelRatio: 3,
    });

    expect(applied).toEqual({ widthPx: 640, heightPx: 360, devicePixelRatio: 2 });
  });
});
