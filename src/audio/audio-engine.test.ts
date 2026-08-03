import { describe, expect, it } from 'vitest';

import { AudioEngine, type AudioSettings } from './audio-engine';
import { DANGER_LAYER, MUSIC } from './cues';
import { FakeAudioContext } from './fake-audio-context';

const LOUD: AudioSettings = {
  musicEnabled: true,
  soundEffectsEnabled: true,
  musicVolume: 1,
  soundEffectsVolume: 1,
};

/** An engine with a fake context and a hand-cranked interval. */
function setup(settings: AudioSettings = LOUD) {
  const context = new FakeAudioContext();
  let tick: (() => void) | null = null;

  const engine = new AudioEngine({
    settings,
    createContext: () => context,
    setInterval: (handler) => {
      tick = handler;

      return 1;
    },
    clearInterval: () => {
      tick = null;
    },
  });

  return {
    engine,
    context,
    advance: (times = 1) => {
      for (let index = 0; index < times; index += 1) tick?.();
    },
    isLooping: () => tick !== null,
  };
}

describe('before a user gesture', () => {
  it('makes no sound at all', () => {
    const { engine, context } = setup();

    engine.play('victory');
    engine.setTrack('running');
    engine.setDanger(1);

    // Browsers block audio until a gesture; a game that tries anyway either
    // stays silent or spams the console. This simply waits.
    expect(context.tones).toHaveLength(0);
    expect(engine.isReady).toBe(false);
  });

  it('starts the track that was chosen while it was still locked', () => {
    const { engine, context } = setup();

    engine.setTrack('menu');
    expect(context.tones).toHaveLength(0);

    engine.unlock();

    expect(context.tones.length).toBeGreaterThan(0);
  });
});

describe('unlocking', () => {
  it('resumes the context', () => {
    const { engine, context } = setup();

    engine.unlock();

    expect(engine.isReady).toBe(true);
    expect(context.resumeCount).toBe(1);
  });

  it('does not build a second context on the next interaction', () => {
    const { engine, context } = setup();

    engine.unlock();
    engine.unlock();
    engine.unlock();

    expect(context.resumeCount).toBe(3);
    expect(engine.isReady).toBe(true);
  });

  it('stays silent, rather than failing, where Web Audio does not exist', () => {
    const engine = new AudioEngine({ settings: LOUD, createContext: () => null });

    engine.unlock();
    engine.play('collision');
    engine.setTrack('running');

    expect(engine.isReady).toBe(false);
  });
});

describe('sound effects', () => {
  it('plays a cue', () => {
    const { engine, context } = setup();
    engine.unlock();

    engine.play('collision');

    expect(context.tones).toHaveLength(1);
  });

  it('plays a multi-note cue as a figure', () => {
    const { engine, context } = setup();
    engine.unlock();

    engine.play('victory');

    expect(context.tones.length).toBeGreaterThan(2);
    // Staggered, so it reads as a phrase rather than a chord.
    expect(context.tones[1]?.startAt).toBeGreaterThan(context.tones[0]?.startAt ?? 0);
  });

  it('says nothing when effects are switched off', () => {
    const { engine, context } = setup({ ...LOUD, soundEffectsEnabled: false });
    engine.unlock();

    engine.play('victory');

    expect(context.tones).toHaveLength(0);
  });

  it('says nothing at zero volume', () => {
    const { engine, context } = setup({ ...LOUD, soundEffectsVolume: 0 });
    engine.unlock();

    engine.play('victory');

    expect(context.tones).toHaveLength(0);
  });

  it('scales with the effects volume', () => {
    const loud = setup();
    const quiet = setup({ ...LOUD, soundEffectsVolume: 0.25 });

    loud.engine.unlock();
    quiet.engine.unlock();
    loud.engine.play('collision');
    quiet.engine.play('collision');

    expect(quiet.context.peakGain()).toBeLessThan(loud.context.peakGain());
  });

  it('keeps the keystroke cue quieter than anything else', () => {
    // It fires on every correct character; anything with presence would become
    // torture inside ten seconds.
    const keystroke = setup();
    const collision = setup();

    keystroke.engine.unlock();
    collision.engine.unlock();
    keystroke.engine.play('keystroke');
    collision.engine.play('collision');

    expect(keystroke.context.peakGain()).toBeLessThan(collision.context.peakGain());
  });

  it('gives a stumble and a collision different sounds', () => {
    const stumble = setup();
    const collision = setup();

    stumble.engine.unlock();
    collision.engine.unlock();
    stumble.engine.play('stumble');
    collision.engine.play('collision');

    // They cost the player different amounts, so they must not sound alike.
    expect(stumble.context.tones[0]?.frequency).not.toBe(collision.context.tones[0]?.frequency);
  });
});

describe('music', () => {
  it('loops the chosen track', () => {
    const { engine, context, advance } = setup();
    engine.unlock();

    engine.setTrack('menu');
    const afterFirst = context.tones.length;
    advance(3);

    expect(context.tones.length).toBe(afterFirst + 3);
  });

  it('walks through the pattern rather than repeating one note', () => {
    const { engine, context, advance } = setup();
    engine.unlock();
    engine.setTrack('menu');
    advance(2);

    const played = context.tones.slice(0, 3).map((tone) => tone.frequency);

    expect(new Set(played).size).toBeGreaterThan(1);
    expect(MUSIC.menu.notes).toContain(played[0]);
  });

  it('stops when the track is cleared', () => {
    const { engine, isLooping } = setup();
    engine.unlock();
    engine.setTrack('running');
    expect(isLooping()).toBe(true);

    engine.setTrack(null);

    expect(isLooping()).toBe(false);
  });

  it('does not restart when the same track is set again', () => {
    const { engine, context, advance } = setup();
    engine.unlock();

    engine.setTrack('menu');
    advance(1);
    const before = context.tones.length;
    engine.setTrack('menu');

    expect(context.tones.length).toBe(before);
  });

  it('says nothing when music is switched off', () => {
    const { engine, context } = setup({ ...LOUD, musicEnabled: false });
    engine.unlock();

    engine.setTrack('menu');

    expect(context.tones).toHaveLength(0);
  });

  it('stops when music is switched off mid-track, and resumes when switched on', () => {
    const { engine, context, isLooping } = setup();
    engine.unlock();
    engine.setTrack('menu');

    engine.updateSettings({ ...LOUD, musicEnabled: false });
    expect(isLooping()).toBe(false);

    const before = context.tones.length;
    engine.updateSettings(LOUD);

    expect(isLooping()).toBe(true);
    expect(context.tones.length).toBeGreaterThan(before);
  });
});

describe('the danger layer', () => {
  it('runs under the running track', () => {
    const { engine, context } = setup();
    engine.unlock();

    engine.setTrack('running');

    expect(context.tones.some((tone) => tone.type === DANGER_LAYER.type)).toBe(true);
  });

  it('does not run under the menu', () => {
    const { engine, context } = setup();
    engine.unlock();

    engine.setTrack('menu');

    expect(context.tones.some((tone) => tone.frequency === DANGER_LAYER.baseFrequency)).toBe(false);
  });

  it('rises with the threat', () => {
    const { engine, context } = setup();
    engine.unlock();
    engine.setTrack('running');

    const layer = context.tones.find((tone) => tone.frequency === DANGER_LAYER.baseFrequency);
    engine.setDanger(0.2);
    const quiet = layer?.gains.at(-1) ?? 0;
    engine.setDanger(0.9);
    const loud = layer?.gains.at(-1) ?? 0;

    expect(loud).toBeGreaterThan(quiet);
  });

  it('clamps whatever it is handed', () => {
    const { engine, context } = setup();
    engine.unlock();
    engine.setTrack('running');
    const layer = context.tones.find((tone) => tone.frequency === DANGER_LAYER.baseFrequency);

    engine.setDanger(5);
    expect(layer?.gains.at(-1) ?? 0).toBeLessThanOrEqual(DANGER_LAYER.maxGain);

    engine.setDanger(-3);
    expect(layer?.gains.at(-1) ?? 1).toBe(0);
  });
});

describe('disposal', () => {
  it('stops the music and releases the context', () => {
    const { engine, context, isLooping } = setup();
    engine.unlock();
    engine.setTrack('running');

    engine.dispose();

    expect(isLooping()).toBe(false);
    expect(context.closeCount).toBe(1);
    expect(engine.isReady).toBe(false);
  });

  it('goes quiet afterwards rather than throwing', () => {
    const { engine, context } = setup();
    engine.unlock();
    engine.dispose();
    const after = context.tones.length;

    expect(() => {
      engine.play('victory');
      engine.setDanger(1);
    }).not.toThrow();
    expect(context.tones.length).toBe(after);
  });
});
