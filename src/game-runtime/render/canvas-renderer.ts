import {
  type Canvas2D,
  resizeSurface,
  type SizableCanvas,
  type SurfaceSize,
} from './canvas-surface';
import { DEFAULT_SCENE_PALETTE, scenePalette, type ScenePalette } from './palette';
import {
  advanceView,
  createView,
  type PerspectiveConfig,
  type PerspectiveView,
  resizeView,
} from './perspective';
import { drawTrack } from './track-renderer';
import { type MapTheme } from '../../game-core/models/map';

/**
 * Owns the canvas element and the current shot.
 *
 * The one stateful object in the render layer: everything below it is pure
 * functions over a view. Callers hold a renderer, call `resize` when the element
 * changes size, and `draw` once per frame from `GameLoop`'s render callback.
 * Actors are drawn on top by the host, using `view`.
 */

export interface CanvasRendererOptions {
  readonly canvas: SizableCanvas;
  readonly context: Canvas2D;
  readonly worldLengthMeters: number;
  readonly viewport: SurfaceSize;
  readonly perspective?: PerspectiveConfig;
  readonly theme?: MapTheme;
  /** Holds the scenery still for a player who asked for less motion (spec §12). */
  readonly reducedMotion?: boolean;
}

export class CanvasRenderer {
  private readonly canvas: SizableCanvas;
  private readonly context: Canvas2D;
  private readonly reducedMotion: boolean;

  private perspective: PerspectiveView;
  private palette: ScenePalette;

  constructor(options: CanvasRendererOptions) {
    this.canvas = options.canvas;
    this.context = options.context;
    this.reducedMotion = options.reducedMotion ?? false;
    this.palette = options.theme ? scenePalette(options.theme) : DEFAULT_SCENE_PALETTE;

    const size = resizeSurface(this.canvas, this.context, options.viewport);
    this.perspective = createView(
      { widthPx: size.widthPx, heightPx: size.heightPx },
      options.worldLengthMeters,
      options.perspective,
    );
  }

  /** The current shot, for the modules that draw actors on top of the scene. */
  get view(): PerspectiveView {
    return this.perspective;
  }

  setTheme(theme: MapTheme): void {
    this.palette = scenePalette(theme);
  }

  /** Re-sizes the backing store and the view together. */
  resize(size: SurfaceSize): void {
    const applied = resizeSurface(this.canvas, this.context, size);
    this.perspective = resizeView(this.perspective, {
      widthPx: applied.widthPx,
      heightPx: applied.heightPx,
    });
  }

  /**
   * Draws the world for the given runner position.
   *
   * Takes the interpolated position rather than reading a simulation state: the
   * renderer stays ignorant of the rules, which is what lets `game-core` be
   * replaced without touching this file.
   */
  draw(playerMeters: number): void {
    this.perspective = advanceView(this.perspective, playerMeters);
    drawTrack(this.context, {
      view: this.perspective,
      palette: this.palette,
      playerMeters,
      reducedMotion: this.reducedMotion,
    });
  }
}
