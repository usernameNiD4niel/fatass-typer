import { type Camera, type CameraConfig, createCamera, followPlayer, resizeCamera } from './camera';
import {
  type Canvas2D,
  resizeSurface,
  type SizableCanvas,
  type SurfaceSize,
} from './canvas-surface';
import { DEFAULT_SCENE_PALETTE, scenePalette, type ScenePalette } from './palette';
import { type ParallaxLayer } from './parallax';
import { drawScene } from './scene-renderer';
import { type MapTheme } from '../../game-core/models/map';

/**
 * Owns the canvas element and the current view.
 *
 * The one stateful object in the render layer: everything below it is pure
 * functions over a camera. Callers (the C5 bridge, then the C7 game view) hold
 * a renderer, call `resize` when the element changes size, and `draw` once per
 * frame from `GameLoop`'s render callback.
 */

export interface CanvasRendererOptions {
  readonly canvas: SizableCanvas;
  readonly context: Canvas2D;
  readonly worldLengthMeters: number;
  readonly viewport: SurfaceSize;
  readonly cameraConfig?: CameraConfig;
  readonly theme?: MapTheme;
  readonly layers?: readonly ParallaxLayer[];
}

export class CanvasRenderer {
  private readonly canvas: SizableCanvas;
  private readonly context: Canvas2D;
  private readonly layers: readonly ParallaxLayer[] | undefined;

  private camera: Camera;
  private palette: ScenePalette;

  constructor(options: CanvasRendererOptions) {
    this.canvas = options.canvas;
    this.context = options.context;
    this.layers = options.layers;
    this.palette = options.theme ? scenePalette(options.theme) : DEFAULT_SCENE_PALETTE;

    const size = resizeSurface(this.canvas, this.context, options.viewport);
    this.camera = createCamera(
      { widthPx: size.widthPx, heightPx: size.heightPx },
      options.worldLengthMeters,
      options.cameraConfig,
    );
  }

  /** Current camera, for the modules that draw on top of the scene. */
  get view(): Camera {
    return this.camera;
  }

  setTheme(theme: MapTheme): void {
    this.palette = scenePalette(theme);
  }

  /** Re-sizes the backing store and the camera together. */
  resize(size: SurfaceSize): void {
    const applied = resizeSurface(this.canvas, this.context, size);
    this.camera = resizeCamera(this.camera, {
      widthPx: applied.widthPx,
      heightPx: applied.heightPx,
    });
  }

  /**
   * Draws one frame for the given MC position.
   *
   * Takes the interpolated position rather than reading a simulation state:
   * the renderer stays ignorant of the rules, which is what lets `game-core`
   * be replaced without touching this file.
   */
  draw(playerMeters: number): void {
    this.camera = followPlayer(this.camera, playerMeters);
    drawScene(this.context, {
      camera: this.camera,
      palette: this.palette,
      ...(this.layers ? { layers: this.layers } : {}),
    });
  }
}
