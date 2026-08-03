import { describe, expect, it } from 'vitest';

import {
  type CameraConfig,
  createCamera,
  followPlayer,
  isVisible,
  resizeCamera,
  screenToWorldX,
  viewportMeters,
  visibleRange,
  worldToScreenX,
} from './camera';

const config: CameraConfig = { pixelsPerMeter: 10, anchorRatio: 0.25 };
const viewport = { widthPx: 1000, heightPx: 600 };
const WORLD = 500;

function camera(playerMeters = 0) {
  return followPlayer(createCamera(viewport, WORLD, config), playerMeters);
}

describe('camera', () => {
  it('converts the viewport to meters', () => {
    expect(viewportMeters(camera())).toBe(100);
  });

  it('pins to the start of the run instead of showing empty world', () => {
    // The anchor would put the left edge at -25m.
    expect(camera(0).leftEdgeMeters).toBe(0);
    expect(camera(10).leftEdgeMeters).toBe(0);
  });

  it('follows the MC once past the anchor point', () => {
    expect(camera(100).leftEdgeMeters).toBe(75);
    expect(worldToScreenX(camera(100), 100)).toBe(250);
  });

  it('holds the MC at the anchor while scrolling', () => {
    const anchorPx = config.anchorRatio * viewport.widthPx;

    for (const meters of [30, 100, 250, 380]) {
      expect(worldToScreenX(camera(meters), meters)).toBeCloseTo(anchorPx);
    }
  });

  it('stops at the finish line so the MC can run into view of it', () => {
    const atEnd = camera(WORLD);

    expect(atEnd.leftEdgeMeters).toBe(WORLD - 100);
    // The MC drifts right of the anchor rather than the camera showing the void.
    expect(worldToScreenX(atEnd, WORLD)).toBe(1000);
  });

  it('pins to zero when the run is shorter than the viewport', () => {
    const short = followPlayer(createCamera(viewport, 40, config), 35);

    expect(short.leftEdgeMeters).toBe(0);
  });

  it('round-trips world and screen coordinates', () => {
    const view = camera(200);

    expect(screenToWorldX(view, worldToScreenX(view, 213.5))).toBeCloseTo(213.5);
  });

  it('re-clamps on resize', () => {
    const widened = resizeCamera(camera(100), { widthPx: 2000, heightPx: 600 });

    // 200m now fit on screen, so a 500m run can only scroll to 300m.
    expect(viewportMeters(widened)).toBe(200);
    expect(widened.leftEdgeMeters).toBe(50);
    expect(widened.viewportHeightPx).toBe(600);
  });

  it('keeps the player position across a resize', () => {
    expect(resizeCamera(camera(180), { widthPx: 1200, heightPx: 700 }).playerMeters).toBe(180);
  });

  it('reports the visible range, with an optional margin', () => {
    expect(visibleRange(camera(200))).toEqual({ startMeters: 175, endMeters: 275 });
    expect(visibleRange(camera(200), 20)).toEqual({ startMeters: 155, endMeters: 295 });
  });

  it('culls by visibility, keeping the margin band', () => {
    const view = camera(200);

    expect(isVisible(view, 200)).toBe(true);
    expect(isVisible(view, 174)).toBe(false);
    expect(isVisible(view, 174, 5)).toBe(true);
    expect(isVisible(view, 400)).toBe(false);
  });

  it('never moves the camera backwards as the player advances', () => {
    let previous = -1;

    for (let meters = 0; meters <= WORLD; meters += 7) {
      const edge = camera(meters).leftEdgeMeters;
      expect(edge).toBeGreaterThanOrEqual(previous);
      previous = edge;
    }
  });
});
