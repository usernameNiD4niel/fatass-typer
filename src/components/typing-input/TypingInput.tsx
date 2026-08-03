import { type ChangeEvent, type JSX, type KeyboardEvent, useEffect, useRef, useState } from 'react';

import { classes } from '../ui';
import styles from './TypingInput.module.css';
import { isIgnoredKey, MAX_INPUT_LENGTH, normalizeInput, shouldSubmit } from './normalize';

/**
 * The typing field (spec §5, CLAUDE.md §5 step C6).
 *
 * A real, focused `<input>` — **not** a global `keydown` listener. That is not a
 * detail: text construction is the browser's job. Only a real field gets IME
 * composition, dead keys, `Backspace` semantics, autocorrect suppression, and
 * the on-screen keyboards assistive technology provides. A `keydown` handler
 * reimplements all of that badly and locks out anyone not typing on a
 * physical US layout.
 *
 * The component holds no game rules. It normalises the value, sends it through
 * the bridge as `submitInput`, and reports nothing else.
 */

/**
 * Where commands go.
 *
 * Narrower than `GameBridge` on purpose: the field needs `send` and nothing
 * else, and a screen that has not attached a bridge yet can pass a stub rather
 * than the component having to cope with `null` on every keystroke.
 */
export interface CommandSink {
  send(command: unknown): boolean;
}

export interface TypingInputProps {
  readonly bridge: CommandSink;
  /** Turns the field off between prompts and while paused. */
  readonly disabled?: boolean;
  /**
   * Changes when a new prompt starts. The field clears on change, so the next
   * prompt does not inherit the last one's text.
   */
  readonly promptId?: string | null;
  /** Description of the prompt, for the field's accessible name. */
  readonly label?: string;
  readonly placeholder?: string;
  /** Called with the normalised value, for the local echo the HUD renders. */
  readonly onValueChange?: (value: string) => void;
  /** Escape must reach the pause handler rather than being eaten by the field. */
  readonly onEscape?: () => void;
}

/** Milliseconds are taken at the edge, so `game-core` never reads a clock. */
function now(): number {
  return performance.now();
}

export function TypingInput({
  bridge,
  disabled = false,
  promptId = null,
  label = 'Type the prompt',
  placeholder = 'Start typing…',
  onValueChange,
  onEscape,
}: TypingInputProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [hasFocus, setHasFocus] = useState(false);

  // A new prompt starts from an empty field. Sent through the bridge too, so the
  // typing engine's idea of the previous value cannot drift from the DOM's.
  useEffect(() => {
    setValue('');
    onValueChange?.('');

    if (!disabled) inputRef.current?.focus();
    // `onValueChange` is intentionally excluded: an inline callback would reset
    // the field on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptId, disabled]);

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    if (disabled) return;

    const next = normalizeInput(event.target.value);

    // Always mirror the normalised text back, so a stripped character never
    // lingers on screen as something the player thinks they typed.
    setValue(next);

    if (!shouldSubmit(value, next)) return;

    onValueChange?.(next);
    bridge.send({ type: 'submitInput', value: next, timestampMs: now() });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Escape') {
      // Not swallowed — pause is more important than anything typed.
      onEscape?.();

      return;
    }

    if (isIgnoredKey(event.key)) event.preventDefault();
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="text"
        className={classes(
          styles.field,
          !hasFocus && !disabled && styles.fieldUnfocused,
          disabled && styles.disabled,
        )}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          setHasFocus(true);
        }}
        onBlur={() => {
          setHasFocus(false);
        }}
        disabled={disabled}
        aria-label={label}
        aria-describedby="typing-input-hint"
        placeholder={placeholder}
        maxLength={MAX_INPUT_LENGTH}
        // Every browser assistant that guesses at text would fight the player.
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="done"
      />

      <p
        id="typing-input-hint"
        className={classes(styles.hint, !hasFocus && !disabled && styles.hintWarning)}
        aria-live="polite"
      >
        {disabled
          ? 'Typing is paused.'
          : hasFocus
            ? 'Type the prompt shown above.'
            : 'Click the field or press Tab to keep typing.'}
      </p>
    </div>
  );
}
