/**
 * The slice of Web Audio the engine uses (spec §11).
 *
 * Narrowed to an interface for the same reason the renderer narrowed
 * `CanvasRenderingContext2D`: jsdom has no Web Audio, so without this the audio
 * system would be untestable, and every test would be asserting that a mock was
 * called rather than that the game makes the right noise at the right time.
 *
 * It also documents exactly how much of the API the placeholder synthesis
 * depends on — which is very little, so real audio files can replace it later
 * without the engine's shape changing.
 */

export interface AudioParamLike {
  value: number;
  setValueAtTime(value: number, startTime: number): void;
  linearRampToValueAtTime(value: number, endTime: number): void;
  exponentialRampToValueAtTime(value: number, endTime: number): void;
}

export interface AudioNodeLike {
  connect(destination: AudioNodeLike): void;
  disconnect(): void;
}

export interface GainNodeLike extends AudioNodeLike {
  readonly gain: AudioParamLike;
}

export interface OscillatorNodeLike extends AudioNodeLike {
  type: OscillatorType;
  readonly frequency: AudioParamLike;
  start(when?: number): void;
  stop(when?: number): void;
}

export interface AudioContextLike {
  readonly currentTime: number;
  readonly destination: AudioNodeLike;
  readonly state: 'suspended' | 'running' | 'closed';
  createOscillator(): OscillatorNodeLike;
  createGain(): GainNodeLike;
  resume(): Promise<void>;
  close(): Promise<void>;
}

/**
 * Creates a real context, or `null` where Web Audio is unavailable.
 *
 * A browser without Web Audio is a browser that plays the game silently, not
 * one that fails to load it.
 */
export function createBrowserAudioContext(): AudioContextLike | null {
  const Constructor = window.AudioContext;
  if (typeof Constructor !== 'function') return null;

  try {
    return new Constructor() as unknown as AudioContextLike;
  } catch {
    return null;
  }
}
