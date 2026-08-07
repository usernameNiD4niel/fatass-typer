# `audio/` — synthesised sound (spec §11)

Every sound in the game is generated at runtime from oscillators. There are no
audio files, and therefore nothing copyrighted, nothing to preload, and nothing
to add to the asset manifest.

## Contract

- No DOM beyond `AudioContext` itself, which is reached through the narrow
  `AudioContextLike` interface in `audio-context.ts`. jsdom has no Web Audio, so
  that interface is what makes this layer testable at all — `FakeAudioContext`
  records what was actually played, and the tests assert on tones rather than on
  mock call counts.
- React never imports the engine directly; `hooks/useGameAudio.ts` is the seam.

## Two rules the whole design follows

1. **Nothing sounds before the player asks for it.** Browsers block audio until a
   user gesture. The engine stays dormant until `unlock()` is called from a real
   interaction — in the app that is the Start button on the game screen — and
   every method before that is a safe no-op. A track chosen while still locked
   starts on unlock, so callers never have to sequence it themselves.
2. **Silence is always an acceptable outcome.** No Web Audio, a context that
   refuses to resume, a node that throws — the run carries on. Audio is the one
   subsystem whose failure must never be visible to the player.

## Pieces

| File                    | What it holds                                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| `audio-context.ts`      | The narrow interface + `createBrowserAudioContext()`, which returns `null` where Web Audio is absent |
| `cues.ts`               | The `SoundCue` union and the tone tables — cues, the two music patterns, the danger layer            |
| `audio-engine.ts`       | `AudioEngine`: `unlock` / `play` / `setTrack` / `setDanger` / `updateSettings` / `dispose`           |
| `fake-audio-context.ts` | Recording stub used by tests (`tones`, `peakGain()`, `resumeCount`, `closeCount`)                    |

## Cues

**In a run:** `keystroke` · `mistake` · `promptComplete` · `boost` · `taunt` ·
`obstacleWarning` · `collision` · `stumble` · `victory` · `gameOver`.

**In the menus:** `uiMove` · `uiSelect`.

`keystroke` is deliberately the quietest thing in the game — it fires on every
correct character, and anything with presence would become torture inside ten
seconds. `stumble` and `collision` are pitched apart on purpose: they cost the
player different amounts, so they must not sound alike.

`uiMove` is a *detent*, not a note — a short downward tick with no tail, quieter
even than `keystroke`. It is the other cue that repeats: running the length of
the map carousel fires it seven times in two seconds, and anything with pitch
would become a tune the player did not ask for. `uiSelect` is the one menu
action with a consequence, so it is a rising figure — and deliberately a
different interval and register from `promptComplete`, because the palette is
meant to be learnable and "I finished a word" should not be remembered as the
same sound as "I chose a map".

## Music and the danger layer

Two patterns, `menu` and `running`, played as a stepped note loop. Under
`running` only, a single held oscillator forms the danger layer: its gain and
pitch both rise with `setDanger(0..1)`, ramped over 200ms so the pressure swells
rather than stepping.

## Settings

`musicEnabled`, `soundEffectsEnabled`, `musicVolume`, `soundEffectsVolume` are
pushed in with `updateSettings`. Switching music off stops the loop mid-track and
switching it back on resumes it; the engine is never rebuilt for a settings
change, which would cut the music off and, over a session, exhaust the browser's
`AudioContext` limit.
