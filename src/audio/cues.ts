/**
 * The placeholder sound set (spec §11).
 *
 * Synthesised tones, not recordings: nothing here can infringe anything, and a
 * two-hundred-byte table replaces a folder of audio files that would need
 * licensing, loading, and a progress bar.
 *
 * Every cue is short. A game where the player types sixty characters a minute
 * cannot afford a keystroke sound with a tail.
 */

export type SoundCue =
  | 'keystroke'
  | 'mistake'
  | 'promptComplete'
  | 'boost'
  | 'taunt'
  | 'obstacleWarning'
  | 'collision'
  | 'stumble'
  | 'victory'
  | 'gameOver';

export interface CueTone {
  readonly frequency: number;
  /** Semitone-ish glide target. Same as `frequency` means a flat tone. */
  readonly endFrequency?: number;
  readonly durationMs: number;
  readonly type: OscillatorType;
  /** Relative loudness, 0..1, before the player's volume is applied. */
  readonly gain: number;
  /** Milliseconds after the cue starts. Lets a cue be a two-note figure. */
  readonly delayMs?: number;
}

/**
 * Cues are arrays so a sound can be a small figure rather than a single beep.
 *
 * The palette is deliberately consistent: rising intervals for good outcomes,
 * falling for bad, and the two failure sounds differ from each other as much as
 * they differ from success — a stumble and a collision cost different amounts,
 * so they must not sound alike.
 */
export const CUES: Readonly<Record<SoundCue, readonly CueTone[]>> = {
  // Barely there. It fires on every correct character, so anything with
  // personality would become torture inside ten seconds.
  keystroke: [{ frequency: 880, durationMs: 28, type: 'sine', gain: 0.09 }],

  mistake: [{ frequency: 220, endFrequency: 180, durationMs: 70, type: 'square', gain: 0.12 }],

  promptComplete: [
    { frequency: 660, durationMs: 70, type: 'triangle', gain: 0.22 },
    { frequency: 990, durationMs: 90, type: 'triangle', gain: 0.2, delayMs: 60 },
  ],

  boost: [{ frequency: 440, endFrequency: 880, durationMs: 220, type: 'sawtooth', gain: 0.16 }],

  /*
   * The laugh, for when he looks back over his shoulder.
   *
   * Four falling triangle blips on a descending line — the shape of "ha ha ha
   * ha" rather than an imitation of it. Kept quieter than the boost it rides
   * on: it is a flourish, and a flourish that shouts stops being funny on the
   * second run.
   */
  taunt: [
    { frequency: 520, endFrequency: 470, durationMs: 90, type: 'triangle', gain: 0.13 },
    {
      frequency: 470,
      endFrequency: 420,
      durationMs: 90,
      type: 'triangle',
      gain: 0.12,
      delayMs: 130,
    },
    {
      frequency: 430,
      endFrequency: 385,
      durationMs: 90,
      type: 'triangle',
      gain: 0.11,
      delayMs: 260,
    },
    {
      frequency: 390,
      endFrequency: 350,
      durationMs: 120,
      type: 'triangle',
      gain: 0.1,
      delayMs: 390,
    },
  ],

  // Urgent and unmistakable, because it is the only warning the player gets
  // before an obstacle's prompt attaches.
  obstacleWarning: [
    { frequency: 520, durationMs: 90, type: 'square', gain: 0.16 },
    { frequency: 520, durationMs: 90, type: 'square', gain: 0.16, delayMs: 140 },
  ],

  collision: [{ frequency: 160, endFrequency: 70, durationMs: 320, type: 'sawtooth', gain: 0.3 }],

  stumble: [{ frequency: 300, endFrequency: 200, durationMs: 180, type: 'triangle', gain: 0.2 }],

  victory: [
    { frequency: 523, durationMs: 140, type: 'triangle', gain: 0.26 },
    { frequency: 659, durationMs: 140, type: 'triangle', gain: 0.26, delayMs: 130 },
    { frequency: 784, durationMs: 260, type: 'triangle', gain: 0.26, delayMs: 260 },
  ],

  gameOver: [
    { frequency: 392, durationMs: 200, type: 'sawtooth', gain: 0.24 },
    { frequency: 294, durationMs: 200, type: 'sawtooth', gain: 0.24, delayMs: 180 },
    { frequency: 196, durationMs: 500, type: 'sawtooth', gain: 0.24, delayMs: 360 },
  ],
};

export type MusicTrack = 'menu' | 'running';

export interface MusicPattern {
  /** Notes cycled through, in hertz. */
  readonly notes: readonly number[];
  readonly noteMs: number;
  readonly type: OscillatorType;
  readonly gain: number;
}

/**
 * Two loops, both deliberately plain.
 *
 * The menu wanders; the run drives. Neither is trying to be a soundtrack — they
 * are the placeholder spec §11 allows, sized to be replaced by real music
 * without the engine changing.
 */
export const MUSIC: Readonly<Record<MusicTrack, MusicPattern>> = {
  menu: {
    notes: [262, 330, 392, 330],
    noteMs: 600,
    type: 'sine',
    gain: 0.06,
  },
  running: {
    notes: [196, 196, 247, 294],
    noteMs: 300,
    type: 'triangle',
    gain: 0.05,
  },
};

/**
 * The danger layer: one held note under the music that rises as the dogs close.
 *
 * Pitch and volume both move, so it reads as pressure rather than as the music
 * simply getting louder.
 */
export const DANGER_LAYER = {
  baseFrequency: 55,
  topFrequency: 110,
  maxGain: 0.14,
  type: 'sawtooth' as OscillatorType,
};
