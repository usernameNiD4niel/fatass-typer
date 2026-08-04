import type { AudioContextLike, GainNodeLike, OscillatorNodeLike } from './audio-context';
import { createBrowserAudioContext } from './audio-context';
import { CUES, DANGER_LAYER, MUSIC, type MusicTrack, type SoundCue } from './cues';

/**
 * The audio system (spec §11).
 *
 * Two rules shape the whole design:
 *
 *   1. **Nothing sounds before the player asks for it.** Browsers block audio
 *      until a user gesture, and a game that fights that ends up either silent
 *      or console-spamming. The engine stays dormant until `unlock()` is called
 *      from a real interaction, and every method before that is a safe no-op.
 *   2. **Silence is always an acceptable outcome.** No Web Audio, a context that
 *      refuses to start, a node that throws — the game keeps running. Audio is
 *      the one subsystem whose failure must never be visible.
 */

export interface AudioSettings {
  readonly musicEnabled: boolean;
  readonly soundEffectsEnabled: boolean;
  /** 0..1. */
  readonly musicVolume: number;
  /** 0..1. */
  readonly soundEffectsVolume: number;
}

export const SILENT_SETTINGS: AudioSettings = {
  musicEnabled: false,
  soundEffectsEnabled: false,
  musicVolume: 0,
  soundEffectsVolume: 0,
};

export interface AudioEngineOptions {
  readonly settings: AudioSettings;
  /** Injected so tests can drive a fake context — jsdom has no Web Audio. */
  readonly createContext?: () => AudioContextLike | null;
  /** Injected for the same reason: a test should not wait 600ms for a note. */
  readonly setInterval?: (handler: () => void, ms: number) => number;
  readonly clearInterval?: (handle: number) => void;
}

export class AudioEngine {
  private settings: AudioSettings;
  private readonly createContext: () => AudioContextLike | null;
  private readonly schedule: (handler: () => void, ms: number) => number;
  private readonly cancel: (handle: number) => void;

  private context: AudioContextLike | null = null;
  private track: MusicTrack | null = null;
  private musicHandle: number | null = null;
  private noteIndex = 0;
  private dangerOscillator: OscillatorNodeLike | null = null;
  private dangerGain: GainNodeLike | null = null;
  private danger = 0;

  constructor(options: AudioEngineOptions) {
    this.settings = options.settings;
    this.createContext = options.createContext ?? createBrowserAudioContext;
    this.schedule = options.setInterval ?? ((handler, ms) => window.setInterval(handler, ms));
    this.cancel =
      options.clearInterval ??
      ((handle) => {
        window.clearInterval(handle);
      });
  }

  /** True once a user gesture has started the audio context. */
  get isReady(): boolean {
    return this.context !== null && this.context.state !== 'closed';
  }

  /**
   * Starts the audio context. **Must be called from a user gesture.**
   *
   * Safe to call repeatedly — the second click of a session should not build a
   * second context.
   */
  unlock(): void {
    if (this.context !== null) {
      void this.context.resume().catch(() => undefined);

      return;
    }

    const context = this.createContext();
    if (context === null) return;

    this.context = context;
    void context.resume().catch(() => undefined);

    // A track chosen before unlocking starts now, so the caller never has to
    // sequence "unlock, then ask for music" itself.
    if (this.track !== null) this.startMusicLoop();
  }

  updateSettings(settings: AudioSettings): void {
    const wasMusicOn = this.settings.musicEnabled;
    this.settings = settings;

    if (!settings.musicEnabled) this.stopMusicLoop();
    else if (!wasMusicOn && this.track !== null) this.startMusicLoop();

    this.applyDangerGain();
  }

  /** Switches the background loop. `null` stops it. */
  setTrack(track: MusicTrack | null): void {
    if (this.track === track) return;

    this.track = track;
    this.noteIndex = 0;
    this.stopMusicLoop();

    if (track !== null) this.startMusicLoop();
  }

  /**
   * How much danger the run is in, 0 (safe) to 1 (about to crash).
   *
   * Called at the bridge's ~10Hz, so it has to be cheap and idempotent.
   */
  setDanger(level: number): void {
    this.danger = Math.min(1, Math.max(0, level));
    this.applyDangerGain();
  }

  /** Plays a one-shot cue. Silent when effects are off or nothing is unlocked. */
  play(cue: SoundCue): void {
    if (!this.settings.soundEffectsEnabled || this.settings.soundEffectsVolume <= 0) return;

    const context = this.context;
    if (context === null) return;

    for (const tone of CUES[cue]) {
      const startAt = context.currentTime + (tone.delayMs ?? 0) / 1000;
      this.tone({
        frequency: tone.frequency,
        endFrequency: tone.endFrequency ?? tone.frequency,
        durationMs: tone.durationMs,
        type: tone.type,
        gain: tone.gain * this.settings.soundEffectsVolume,
        startAt,
      });
    }
  }

  /** Stops everything and releases the context. */
  dispose(): void {
    this.stopMusicLoop();
    this.stopDangerLayer();

    const context = this.context;
    this.context = null;
    this.track = null;

    if (context !== null) void context.close().catch(() => undefined);
  }

  /* ---------------------------------------------------------------------- */

  private tone(input: {
    frequency: number;
    endFrequency: number;
    durationMs: number;
    type: OscillatorType;
    gain: number;
    startAt: number;
  }): void {
    const context = this.context;
    if (context === null || input.gain <= 0) return;

    try {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const endAt = input.startAt + input.durationMs / 1000;

      oscillator.type = input.type;
      oscillator.frequency.setValueAtTime(input.frequency, input.startAt);
      if (input.endFrequency !== input.frequency) {
        oscillator.frequency.linearRampToValueAtTime(input.endFrequency, endAt);
      }

      // A short attack and a ramp to near-zero: a tone that stops abruptly
      // clicks, and a click on every keystroke would be unbearable.
      gain.gain.setValueAtTime(0, input.startAt);
      gain.gain.linearRampToValueAtTime(input.gain, input.startAt + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, endAt);

      oscillator.connect(gain);
      gain.connect(context.destination);

      oscillator.start(input.startAt);
      oscillator.stop(endAt + 0.02);
    } catch {
      // Silence is an acceptable outcome; a thrown audio node is not a reason
      // to interrupt a run.
    }
  }

  private startMusicLoop(): void {
    const track = this.track;
    if (track === null || this.context === null) return;
    if (!this.settings.musicEnabled || this.settings.musicVolume <= 0) return;
    if (this.musicHandle !== null) return;

    const pattern = MUSIC[track];

    const playNote = (): void => {
      const note = pattern.notes[this.noteIndex % pattern.notes.length];
      this.noteIndex += 1;
      if (note === undefined || this.context === null) return;

      this.tone({
        frequency: note,
        endFrequency: note,
        // Slightly shorter than the step, so notes articulate instead of
        // running into one continuous drone.
        durationMs: pattern.noteMs * 0.8,
        type: pattern.type,
        gain: pattern.gain * this.settings.musicVolume,
        startAt: this.context.currentTime,
      });
    };

    playNote();
    this.musicHandle = this.schedule(playNote, pattern.noteMs);
    this.startDangerLayer();
  }

  private stopMusicLoop(): void {
    if (this.musicHandle !== null) {
      this.cancel(this.musicHandle);
      this.musicHandle = null;
    }

    this.stopDangerLayer();
  }

  /**
   * The danger layer is a single held oscillator rather than repeated notes: it
   * has to be able to rise continuously as the gap closes.
   */
  private startDangerLayer(): void {
    const context = this.context;
    if (context === null || this.dangerOscillator !== null) return;
    if (this.track !== 'running') return;

    try {
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = DANGER_LAYER.type;
      oscillator.frequency.setValueAtTime(DANGER_LAYER.baseFrequency, context.currentTime);
      gain.gain.setValueAtTime(0, context.currentTime);

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(context.currentTime);

      this.dangerOscillator = oscillator;
      this.dangerGain = gain;
      this.applyDangerGain();
    } catch {
      this.dangerOscillator = null;
      this.dangerGain = null;
    }
  }

  private stopDangerLayer(): void {
    const oscillator = this.dangerOscillator;
    const gain = this.dangerGain;
    this.dangerOscillator = null;
    this.dangerGain = null;

    try {
      oscillator?.stop();
      oscillator?.disconnect();
      gain?.disconnect();
    } catch {
      // Already stopped, or a context that has gone away.
    }
  }

  private applyDangerGain(): void {
    const context = this.context;
    const gain = this.dangerGain;
    const oscillator = this.dangerOscillator;
    if (context === null || gain === null || oscillator === null) return;

    const audible = this.settings.musicEnabled ? this.settings.musicVolume : 0;

    try {
      // Ramped rather than set, so the pressure swells instead of stepping at
      // the bridge's 10Hz.
      gain.gain.linearRampToValueAtTime(
        DANGER_LAYER.maxGain * this.danger * audible,
        context.currentTime + 0.2,
      );
      oscillator.frequency.linearRampToValueAtTime(
        DANGER_LAYER.baseFrequency +
          (DANGER_LAYER.topFrequency - DANGER_LAYER.baseFrequency) * this.danger,
        context.currentTime + 0.2,
      );
    } catch {
      // Same reasoning as `tone`.
    }
  }
}
