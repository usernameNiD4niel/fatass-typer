import { useEffect, useRef } from 'react';

/**
 * Typing, with no visible input (spec §8).
 *
 * The old game had a focused `<input>` at the bottom of the screen; the player
 * had to click it before they could play, and the word they were typing lived in
 * a box rather than in the world. Both are gone. The window listens while a run
 * is going, and the word appears next to the hazard it applies to.
 *
 * ## What it must not do
 *
 * Capturing keys globally is easy to get wrong in ways that trap the user, so
 * the rules are explicit:
 *
 *  - Chords with Ctrl, Cmd, or Alt are **ignored without `preventDefault`**.
 *    Ctrl+R still reloads, Cmd+Tab still switches, Ctrl+Shift+I still opens the
 *    devtools. The one exception is Ctrl/Cmd+Enter, which restarts, because it
 *    is the shortcut the screen advertises.
 *  - Anything typed into a real field — the pause overlay, a settings input —
 *    is left alone entirely.
 *  - IME composition is left alone, so a composing keystroke is not counted
 *    twice.
 *  - The listener is attached only while `enabled`. A paused run cannot buffer
 *    keystrokes and dump them on resume.
 *
 * ## Why a ref and not state
 *
 * The buffer changes on every keystroke. Held in React state it would re-render
 * the screen per character, which is exactly the per-frame React work the
 * architecture forbids. The buffer is a ref; the *rules* are the thing that
 * holds the authoritative typing state, and they publish it at ~10Hz like
 * everything else.
 */

export interface TypingCaptureOptions {
  /** Only listen while this is true — in practice, while the run is running. */
  readonly enabled: boolean;
  /**
   * Identifies the current challenge. When it changes the buffer resets, so a
   * character typed at the end of one word does not open the next.
   */
  readonly promptId: string | null;
  /** Receives the whole buffer, which is what the typing engine diffs against. */
  readonly onValue: (wholeValue: string) => void;
  readonly onPause: () => void;
  readonly onRestart: () => void;
}

/** Fields that own their own keystrokes. */
function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;

  const tag = target.tagName;

  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export function useTypingCapture(options: TypingCaptureOptions): void {
  const buffer = useRef('');
  const latest = useRef(options);
  latest.current = options;

  // A new challenge starts from an empty buffer.
  useEffect(() => {
    buffer.current = '';
  }, [options.promptId]);

  useEffect(() => {
    if (!options.enabled) return;

    const onKeyDown = (event: KeyboardEvent): void => {
      const current = latest.current;

      if (event.isComposing) return;
      if (isTextEntry(event.target)) return;

      const chord = event.ctrlKey || event.metaKey || event.altKey;

      if (event.key === 'Escape') {
        event.preventDefault();
        current.onPause();

        return;
      }

      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        current.onRestart();

        return;
      }

      // Every other chord belongs to the browser, not to us.
      if (chord) return;

      if (event.key === 'Backspace') {
        event.preventDefault();
        buffer.current = buffer.current.slice(0, -1);
        current.onValue(buffer.current);

        return;
      }

      // One check rejects Shift, Tab, ArrowLeft, F5, Control, and Dead without
      // needing a list of them: a printable key is exactly one code point.
      if (Array.from(event.key).length !== 1) return;

      // Space would scroll the page.
      if (event.key === ' ') event.preventDefault();

      buffer.current += event.key;
      current.onValue(buffer.current);
    };

    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [options.enabled]);
}
