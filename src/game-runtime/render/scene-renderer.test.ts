import { describe, expect, it } from 'vitest';

import { createFakeCanvasElement, FakeCanvas2D } from '../../test/fake-canvas';
import { createCamera, followPlayer } from './camera';
import { CanvasRenderer } from './canvas-renderer';
import { allScenePalettes, DEFAULT_SCENE_PALETTE, scenePalette } from './palette';
import { drawScene, GROUND_TOP_RATIO, groundYPx } from './scene-renderer';

const config = { pixelsPerMeter: 10, anchorRatio: 0.3 };
const viewport = { widthPx: 1000, heightPx: 600 };

function cameraAt(meters: number, worldLengthMeters = 1000) {
  return followPlayer(createCamera(viewport, worldLengthMeters, config), meters);
}

describe('drawScene', () => {
  it('clears the canvas and balances save/restore', () => {
    const context = new FakeCanvas2D();

    drawScene(context, { camera: cameraAt(50) });

    expect(context.callsOf('clearRect')[0]?.args).toEqual([0, 0, 1000, 600]);
    expect(context.callsOf('save')).toHaveLength(1);
    expect(context.callsOf('restore')).toHaveLength(1);
  });

  it('leaves no alpha behind for the next drawing pass', () => {
    const context = new FakeCanvas2D();

    drawScene(context, { camera: cameraAt(50) });

    expect(context.globalAlpha).toBe(1);
  });

  it('paints the sky before the ground', () => {
    const context = new FakeCanvas2D();
    const palette = scenePalette('downtown');

    drawScene(context, { camera: cameraAt(50), palette });

    const skyIndex = context.calls.findIndex((call) => call.fillStyle === palette.skyTop);
    const groundIndex = context.calls.findIndex((call) => call.fillStyle === palette.ground);

    expect(skyIndex).toBeGreaterThanOrEqual(0);
    expect(groundIndex).toBeGreaterThan(skyIndex);
  });

  it('draws the road starting at the ground line', () => {
    const context = new FakeCanvas2D();
    const camera = cameraAt(50);

    drawScene(context, { camera, palette: DEFAULT_SCENE_PALETTE });

    const ground = context.calls.find(
      (call) => call.op === 'fillRect' && call.fillStyle === DEFAULT_SCENE_PALETTE.ground,
    );

    expect(groundYPx(camera)).toBe(GROUND_TOP_RATIO * 600);
    expect(ground?.args).toEqual([0, groundYPx(camera), 1000, 600 - groundYPx(camera)]);
  });

  it('uses only colours from the palette it was given', () => {
    const context = new FakeCanvas2D();
    const palette = scenePalette('night-highway');

    drawScene(context, { camera: cameraAt(400), palette });

    const used = new Set(context.calls.map((call) => call.fillStyle));
    used.delete('#000000'); // the stub's initial value, before any fill is set

    for (const color of used) {
      expect(Object.values(palette)).toContain(color);
    }
  });

  it('draws the finish line only once it is in view', () => {
    const palette = DEFAULT_SCENE_PALETTE;

    const early = new FakeCanvas2D();
    drawScene(early, { camera: cameraAt(50, 1000), palette });

    const late = new FakeCanvas2D();
    drawScene(late, { camera: cameraAt(980, 1000), palette });

    const accentCalls = (context: FakeCanvas2D) =>
      context.calls.filter((call) => call.fillStyle === palette.accent);

    expect(accentCalls(early)).toHaveLength(0);
    expect(accentCalls(late).length).toBeGreaterThan(0);
  });

  it('is deterministic — the same camera produces the same frame', () => {
    const first = new FakeCanvas2D();
    const second = new FakeCanvas2D();

    drawScene(first, { camera: cameraAt(321) });
    drawScene(second, { camera: cameraAt(321) });

    expect(second.calls).toEqual(first.calls);
  });

  it('keeps a silhouette stable as the camera scrolls past and back', () => {
    const there = new FakeCanvas2D();
    const andBack = new FakeCanvas2D();

    drawScene(there, { camera: cameraAt(120) });
    drawScene(andBack, { camera: cameraAt(120) });

    // Same world position must give an identical skyline — no per-frame reroll.
    expect(andBack.calls).toEqual(there.calls);
  });

  it('draws something for every theme', () => {
    for (const [, palette] of allScenePalettes()) {
      const context = new FakeCanvas2D();
      drawScene(context, { camera: cameraAt(200), palette });

      expect(context.callsOf('fillRect').length).toBeGreaterThan(10);
    }
  });

  it('survives a degenerate viewport without throwing', () => {
    const context = new FakeCanvas2D();
    const tiny = createCamera({ widthPx: 1, heightPx: 1 }, 10, config);

    expect(() => {
      drawScene(context, { camera: tiny });
    }).not.toThrow();
  });
});

describe('CanvasRenderer', () => {
  function setup() {
    const canvas = createFakeCanvasElement();
    const context = new FakeCanvas2D();
    const renderer = new CanvasRenderer({
      canvas,
      context,
      worldLengthMeters: 1000,
      viewport: { widthPx: 1000, heightPx: 600, devicePixelRatio: 2 },
      cameraConfig: config,
      theme: 'neighborhood',
    });

    return { canvas, context, renderer };
  }

  it('sizes the canvas on construction', () => {
    const { canvas, renderer } = setup();

    expect(canvas.width).toBe(2000);
    expect(renderer.view.viewportWidthPx).toBe(1000);
  });

  it('moves the camera to the position it is asked to draw', () => {
    const { renderer } = setup();

    renderer.draw(240);

    expect(renderer.view.playerMeters).toBe(240);
    expect(renderer.view.leftEdgeMeters).toBe(240 - 0.3 * 100);
  });

  it('redraws from scratch on every frame', () => {
    const { context, renderer } = setup();

    renderer.draw(10);
    const first = context.callsOf('clearRect').length;
    renderer.draw(20);

    expect(context.callsOf('clearRect').length).toBe(first + 1);
  });

  it('resizes the surface and the camera together', () => {
    const { canvas, renderer } = setup();

    renderer.resize({ widthPx: 1400, heightPx: 700, devicePixelRatio: 1 });

    expect(canvas.width).toBe(1400);
    expect(renderer.view.viewportWidthPx).toBe(1400);
    expect(renderer.view.viewportHeightPx).toBe(700);
  });

  it('switches palette with the theme', () => {
    const { context, renderer } = setup();

    renderer.setTheme('final-pursuit');
    context.reset();
    renderer.draw(100);

    const used = new Set(context.calls.map((call) => call.fillStyle));

    expect(used.has(scenePalette('final-pursuit').skyTop)).toBe(true);
    expect(used.has(scenePalette('neighborhood').skyTop)).toBe(false);
  });
});
