import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { GameBridge, type GameCommand, type GameHost } from '../../game-bridge';
import { TypingInput } from './TypingInput';

/** Captures the commands the field sends, exactly as the runtime would see them. */
class CapturingHost implements GameHost {
  readonly commands: GameCommand[] = [];

  handle(command: GameCommand): void {
    this.commands.push(command);
  }
}

function setup(props: Partial<Parameters<typeof TypingInput>[0]> = {}) {
  const host = new CapturingHost();
  const bridge = new GameBridge({ host });
  const user = userEvent.setup();
  const view = render(<TypingInput bridge={bridge} {...props} />);

  const submitted = () =>
    host.commands
      .filter((command) => command.type === 'submitInput')
      .map((command) => command.value);

  return { host, bridge, user, view, submitted };
}

describe('TypingInput', () => {
  it('is a real focusable text input, not a hidden keydown trap', () => {
    setup();
    const field = screen.getByRole('textbox', { name: 'Type the prompt' });

    expect(field).toBeInTheDocument();
    expect(field).toHaveFocus();
  });

  it('sends the whole value on every keystroke, not the key', async () => {
    const { user, submitted } = setup();

    await user.type(screen.getByRole('textbox'), 'cat');

    expect(submitted()).toEqual(['c', 'ca', 'cat']);
  });

  it('handles backspace by sending the shortened value', async () => {
    const { user, submitted } = setup();

    await user.type(screen.getByRole('textbox'), 'cat{Backspace}');

    expect(submitted()).toEqual(['c', 'ca', 'cat', 'ca']);
  });

  it('handles spaces and punctuation', async () => {
    const { user, submitted } = setup();

    await user.type(screen.getByRole('textbox'), "it's on.");

    expect(submitted().at(-1)).toBe("it's on.");
  });

  it('sends a timestamp with every input', async () => {
    const { host, user } = setup();

    await user.type(screen.getByRole('textbox'), 'a');

    const command = host.commands[0];

    expect(command?.type).toBe('submitInput');
    expect(command).toMatchObject({ timestampMs: expect.any(Number) as number });
  });

  it('ignores keys a prompt can never contain', async () => {
    const { user, submitted } = setup();

    await user.type(screen.getByRole('textbox'), 'a{Enter}{PageDown}b');

    expect(submitted()).toEqual(['a', 'ab']);
  });

  it('lets Escape reach the pause handler instead of eating it', async () => {
    const onEscape = vi.fn();
    const { user } = setup({ onEscape });

    await user.type(screen.getByRole('textbox'), '{Escape}');

    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('normalises pasted text before it crosses the bridge', async () => {
    const { user, submitted } = setup();

    await user.click(screen.getByRole('textbox'));
    // A single-line input drops newlines itself; what survives a paste and still
    // needs cleaning is the invisible stuff — here a non-breaking space.
    await user.paste(`two${String.fromCharCode(0x00a0)}words`);

    expect(submitted()).toEqual(['two words']);
    expect(screen.getByRole('textbox')).toHaveValue('two words');
  });

  it('mirrors the value back to the parent', async () => {
    const onValueChange = vi.fn();
    const { user } = setup({ onValueChange });

    await user.type(screen.getByRole('textbox'), 'hi');

    expect(onValueChange).toHaveBeenLastCalledWith('hi');
  });

  it('clears and refocuses when a new prompt starts', async () => {
    const onValueChange = vi.fn();
    const { user, view, bridge } = setup({ promptId: 'prompt-1', onValueChange });

    await user.type(screen.getByRole('textbox'), 'old');
    view.rerender(
      <TypingInput bridge={bridge} promptId="prompt-2" onValueChange={onValueChange} />,
    );

    expect(screen.getByRole('textbox')).toHaveValue('');
    expect(onValueChange).toHaveBeenLastCalledWith('');
  });

  it('does not clear when the parent re-renders with the same prompt', async () => {
    const { user, view, bridge } = setup({ promptId: 'prompt-1' });

    await user.type(screen.getByRole('textbox'), 'keep');
    view.rerender(<TypingInput bridge={bridge} promptId="prompt-1" />);

    expect(screen.getByRole('textbox')).toHaveValue('keep');
  });

  it('accepts nothing while disabled', async () => {
    const { user, submitted } = setup({ disabled: true });
    const field = screen.getByRole('textbox');

    expect(field).toBeDisabled();
    await user.type(field, 'nope');

    expect(submitted()).toHaveLength(0);
    expect(screen.getByText('Typing is paused.')).toBeInTheDocument();
  });

  it('tells the player when the field has lost focus', async () => {
    const { user } = setup();

    await user.tab();

    expect(screen.getByText('Click the field or press Tab to keep typing.')).toBeInTheDocument();
  });

  it('turns off the browser assistants that would type for the player', () => {
    setup();
    const field = screen.getByRole('textbox');

    expect(field).toHaveAttribute('autocomplete', 'off');
    expect(field).toHaveAttribute('spellcheck', 'false');
  });

  it('describes itself for assistive technology', () => {
    setup({ label: 'Type: the quick fox' });
    const field = screen.getByRole('textbox', { name: 'Type: the quick fox' });

    expect(field).toHaveAccessibleDescription();
  });
});
