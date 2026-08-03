/**
 * Side-scrolling camera (spec §10).
 *
 * Pure data and arithmetic — it holds no canvas and draws nothing. The world is
 * one-dimensional as far as the camera is concerned: the run is a line of meters
 * and the camera decides which slice of it is on screen.
 *
 * Meters, not pixels, are the unit the rules speak in (chase distance, map
 * length, speed), so the conversion lives here in exactly one place.
 */

export interface CameraConfig {
  /** Zoom. Higher means the MC and obstacles appear larger. */
  readonly pixelsPerMeter: number;
  /**
   * Where the MC sits horizontally, 0..1 of the viewport.
   *
   * Left of centre: the player needs to see what is coming far more than they
   * need to see the dogs behind, but the dogs must stay visible or the chase
   * stops being felt.
   */
  readonly anchorRatio: number;
}

/**
 * Zoom and anchor are chosen together so the pack is on screen at the map's
 * starting gap: a chase the player cannot see is just a timer. At 24px/m the
 * viewport holds ~43m, and an anchor at 0.55 leaves ~24m of it behind the MC.
 */
export const DEFAULT_CAMERA_CONFIG: CameraConfig = {
  pixelsPerMeter: 24,
  anchorRatio: 0.55,
};

export interface Camera {
  readonly config: CameraConfig;
  readonly viewportWidthPx: number;
  readonly viewportHeightPx: number;
  /** The MC's position along the run, in meters. */
  readonly playerMeters: number;
  /** World position of the left screen edge, in meters. */
  readonly leftEdgeMeters: number;
  /** Length of the run, used to stop the camera at the finish line. */
  readonly worldLengthMeters: number;
}

export interface CameraViewport {
  readonly widthPx: number;
  readonly heightPx: number;
}

/** Width of the visible slice of world, in meters. */
export function viewportMeters(camera: Camera): number {
  return camera.viewportWidthPx / camera.config.pixelsPerMeter;
}

/**
 * Places the left edge for a player position, clamped to the run.
 *
 * Both clamps exist to keep empty space off screen: before the start there is no
 * world to show, and past the finish line the camera would drift away from the
 * MC as they cross it. Runs shorter than one viewport just pin to zero.
 */
function clampLeftEdge(
  playerMeters: number,
  config: CameraConfig,
  viewportWidthPx: number,
  worldLengthMeters: number,
): number {
  const visibleMeters = viewportWidthPx / config.pixelsPerMeter;
  const desired = playerMeters - config.anchorRatio * visibleMeters;
  const maximum = Math.max(0, worldLengthMeters - visibleMeters);

  return Math.min(Math.max(0, desired), maximum);
}

export function createCamera(
  viewport: CameraViewport,
  worldLengthMeters: number,
  config: CameraConfig = DEFAULT_CAMERA_CONFIG,
): Camera {
  return {
    config,
    viewportWidthPx: viewport.widthPx,
    viewportHeightPx: viewport.heightPx,
    playerMeters: 0,
    leftEdgeMeters: clampLeftEdge(0, config, viewport.widthPx, worldLengthMeters),
    worldLengthMeters,
  };
}

/** Follows the MC. Called once per rendered frame with the interpolated position. */
export function followPlayer(camera: Camera, playerMeters: number): Camera {
  return {
    ...camera,
    playerMeters,
    leftEdgeMeters: clampLeftEdge(
      playerMeters,
      camera.config,
      camera.viewportWidthPx,
      camera.worldLengthMeters,
    ),
  };
}

/** Reacts to a window resize. Re-clamps, so a wider window cannot reveal the void. */
export function resizeCamera(camera: Camera, viewport: CameraViewport): Camera {
  return {
    ...camera,
    viewportWidthPx: viewport.widthPx,
    viewportHeightPx: viewport.heightPx,
    leftEdgeMeters: clampLeftEdge(
      camera.playerMeters,
      camera.config,
      viewport.widthPx,
      camera.worldLengthMeters,
    ),
  };
}

/** World meters → screen pixels. Off-screen results are legal and expected. */
export function worldToScreenX(camera: Camera, meters: number): number {
  return (meters - camera.leftEdgeMeters) * camera.config.pixelsPerMeter;
}

export function screenToWorldX(camera: Camera, pixels: number): number {
  return camera.leftEdgeMeters + pixels / camera.config.pixelsPerMeter;
}

export interface VisibleRange {
  readonly startMeters: number;
  readonly endMeters: number;
}

/**
 * The slice of world worth drawing.
 *
 * `marginMeters` pads both ends so a wide sprite whose anchor is just off screen
 * still gets drawn instead of popping in at the edge.
 */
export function visibleRange(camera: Camera, marginMeters = 0): VisibleRange {
  return {
    startMeters: camera.leftEdgeMeters - marginMeters,
    endMeters: camera.leftEdgeMeters + viewportMeters(camera) + marginMeters,
  };
}

export function isVisible(camera: Camera, meters: number, marginMeters = 0): boolean {
  const range = visibleRange(camera, marginMeters);

  return meters >= range.startMeters && meters <= range.endMeters;
}
