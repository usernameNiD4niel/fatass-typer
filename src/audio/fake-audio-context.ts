import type {
  AudioContextLike,
  AudioNodeLike,
  AudioParamLike,
  GainNodeLike,
  OscillatorNodeLike,
} from './audio-context';

/**
 * A recording Web Audio context.
 *
 * jsdom has no Web Audio, so the engine draws through the narrow
 * `AudioContextLike` interface precisely so a stub like this can stand in and
 * tests can assert on what was actually played rather than that a mock was
 * called.
 */

export interface PlayedTone {
  readonly type: OscillatorType;
  readonly frequency: number;
  readonly startAt: number;
  stoppedAt: number | null;
  readonly gains: number[];
}

class FakeParam implements AudioParamLike {
  value = 0;
  readonly history: number[] = [];

  setValueAtTime(value: number): void {
    this.value = value;
    this.history.push(value);
  }

  linearRampToValueAtTime(value: number): void {
    this.value = value;
    this.history.push(value);
  }

  exponentialRampToValueAtTime(value: number): void {
    this.value = value;
    this.history.push(value);
  }
}

export class FakeAudioContext implements AudioContextLike {
  currentTime = 0;
  state: 'suspended' | 'running' | 'closed' = 'suspended';
  readonly destination: AudioNodeLike = { connect: () => undefined, disconnect: () => undefined };
  readonly tones: PlayedTone[] = [];
  resumeCount = 0;
  closeCount = 0;

  createOscillator(): OscillatorNodeLike {
    const frequency = new FakeParam();
    const tone: PlayedTone = {
      type: 'sine',
      frequency: 0,
      startAt: 0,
      stoppedAt: null,
      gains: [],
    };

    const record = tone as {
      type: OscillatorType;
      frequency: number;
      startAt: number;
      stoppedAt: number | null;
      gains: number[];
    };

    const oscillator: OscillatorNodeLike = {
      type: 'sine',
      frequency,
      start: (when = 0) => {
        record.type = oscillator.type;
        record.frequency = frequency.history[0] ?? frequency.value;
        record.startAt = when;
        this.tones.push(tone);
      },
      stop: (when = 0) => {
        record.stoppedAt = when;
      },
      connect: (target: AudioNodeLike) => {
        // The gain node the oscillator is wired to owns the envelope, so the
        // tone borrows its history for assertions.
        const gains = (target as { __gains?: number[] }).__gains;
        if (gains !== undefined) record.gains = gains;
      },
      disconnect: () => undefined,
    };

    return oscillator;
  }

  createGain(): GainNodeLike & { readonly __gains: number[] } {
    const gain = new FakeParam();

    // `__gains` lets a connected oscillator borrow this node's envelope history,
    // which is what makes "how loud was that cue?" assertable.
    return {
      gain,
      __gains: gain.history,
      connect: () => undefined,
      disconnect: () => undefined,
    };
  }

  resume(): Promise<void> {
    this.resumeCount += 1;
    this.state = 'running';

    return Promise.resolve();
  }

  close(): Promise<void> {
    this.closeCount += 1;
    this.state = 'closed';

    return Promise.resolve();
  }

  /** Peak gain reached by any tone, for asserting volume behaviour. */
  peakGain(): number {
    return this.tones.reduce((peak, tone) => Math.max(peak, ...tone.gains, 0), 0);
  }
}
