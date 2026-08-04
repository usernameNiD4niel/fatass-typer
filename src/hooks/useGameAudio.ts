import { useEffect, useMemo, useRef } from 'react';

import { AudioEngine, type AudioSettings, type MusicTrack, type SoundCue } from '../audio';
import type { GameSettings } from '../game-core/models';

/**
 * The game's audio, bound to React (spec §11).
 *
 * The engine lives for the life of the app rather than the life of a screen: a
 * new `AudioContext` per navigation would hit the browser's limit within a few
 * minutes of play, and the music would restart every time the player opened
 * settings.
 *
 * Audio only starts once `unlock` has been called from a real user gesture.
 */

export interface GameAudio {
  /** Call from a click or keypress. Safe to call on every interaction. */
  readonly unlock: () => void;
  readonly play: (cue: SoundCue) => void;
  readonly setTrack: (track: MusicTrack | null) => void;
  /** 0 (safe) to 1 (about to crash). */
  readonly setDanger: (level: number) => void;
  readonly isReady: () => boolean;
}

function toAudioSettings(settings: GameSettings): AudioSettings {
  return {
    musicEnabled: settings.musicEnabled,
    soundEffectsEnabled: settings.soundEffectsEnabled,
    musicVolume: settings.musicVolume,
    soundEffectsVolume: settings.soundEffectsVolume,
  };
}

export interface UseGameAudioOptions {
  /** Injected in tests, where jsdom has no Web Audio to speak of. */
  readonly engine?: AudioEngine;
}

export function useGameAudio(settings: GameSettings, options: UseGameAudioOptions = {}): GameAudio {
  const engine = useMemo(
    () => options.engine ?? new AudioEngine({ settings: toAudioSettings(settings) }),
    // Deliberately built once. Settings changes are pushed in below rather than
    // rebuilding the engine, which would cut the music off mid-note.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [options.engine],
  );

  const engineRef = useRef(engine);
  engineRef.current = engine;

  useEffect(() => {
    engine.updateSettings(toAudioSettings(settings));
  }, [
    engine,
    settings.musicEnabled,
    settings.soundEffectsEnabled,
    settings.musicVolume,
    settings.soundEffectsVolume,
    settings,
  ]);

  useEffect(() => {
    return () => {
      // Releasing the context matters: browsers cap how many a page may hold,
      // and a leaked one keeps an audio thread alive after the app is gone.
      engineRef.current.dispose();
    };
  }, []);

  return useMemo(
    () => ({
      unlock: () => {
        engineRef.current.unlock();
      },
      play: (cue) => {
        engineRef.current.play(cue);
      },
      setTrack: (track) => {
        engineRef.current.setTrack(track);
      },
      setDanger: (level) => {
        engineRef.current.setDanger(level);
      },
      isReady: () => engineRef.current.isReady,
    }),
    [],
  );
}
