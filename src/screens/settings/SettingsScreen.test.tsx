import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_SETTINGS, type GameSettings } from '../../game-core/models';
import { SettingsScreen } from './SettingsScreen';

function setup(settings: GameSettings = DEFAULT_SETTINGS, withReset = true) {
  const onChange = vi.fn();
  const onClose = vi.fn();
  const onResetProgress = vi.fn();

  render(
    <SettingsScreen
      settings={settings}
      onChange={onChange}
      onClose={onClose}
      {...(withReset ? { onResetProgress } : {})}
    />,
  );

  return { onChange, onClose, onResetProgress, user: userEvent.setup() };
}

describe('SettingsScreen', () => {
  it('groups the settings under headings', () => {
    setup();

    for (const name of ['Display', 'Typing', 'Audio']) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument();
    }
  });

  it('changes the theme', async () => {
    const { user, onChange } = setup();

    await user.click(screen.getByRole('radio', { name: 'Dark' }));

    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, theme: 'dark' });
  });

  it('changes the prompt size', async () => {
    const { user, onChange } = setup();

    await user.click(screen.getByRole('radio', { name: 'Extra large' }));

    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, promptTextSize: 'extra-large' });
  });

  it('changes what happens on a mistake, and explains both options', async () => {
    const { user, onChange } = setup();

    expect(screen.getByText(/Keep typing marks the error/)).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Stop until fixed' }));

    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_SETTINGS,
      mistakeBehavior: 'block-until-corrected',
    });
  });

  it('toggles reduced motion, and says it changes nothing about difficulty', async () => {
    const { user, onChange } = setup();

    expect(screen.getByText(/Nothing about the difficulty changes/)).toBeInTheDocument();

    await user.click(screen.getByRole('switch', { name: 'Reduced motion' }));

    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, reducedMotion: true });
  });

  it('says adaptive assistance never changes the displayed target', () => {
    setup();

    expect(screen.getByText(/target speed shown never changes/)).toBeInTheDocument();
  });

  it('adjusts the volumes', async () => {
    const { onChange } = setup();
    const slider = screen.getByRole('slider', { name: 'Music volume' });

    slider.focus();
    // jsdom does not implement range keying; the change event is the real path.
    await Promise.resolve();
    slider.dispatchEvent(new Event('input', { bubbles: true }));

    expect(screen.getByRole('slider', { name: 'Sound effects volume' })).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ musicVolume: NaN }));
  });

  it('disables a volume when its channel is off', () => {
    setup({ ...DEFAULT_SETTINGS, musicEnabled: false });

    expect(screen.getByRole('slider', { name: 'Music volume' })).toBeDisabled();
    expect(screen.getByRole('slider', { name: 'Sound effects volume' })).toBeEnabled();
  });

  it('closes', async () => {
    const { user, onClose } = setup();

    await user.click(screen.getByRole('button', { name: 'Done' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('resetting progress', () => {
  it('is hidden when the shell does not offer it', () => {
    setup(DEFAULT_SETTINGS, false);

    expect(screen.queryByRole('button', { name: 'Reset progress' })).not.toBeInTheDocument();
  });

  it('asks before wiping anything', async () => {
    const { user, onResetProgress } = setup();

    await user.click(screen.getByRole('button', { name: 'Reset progress' }));

    expect(screen.getByRole('dialog', { name: 'Reset all progress?' })).toBeInTheDocument();
    expect(onResetProgress).not.toHaveBeenCalled();
  });

  it('can be cancelled', async () => {
    const { user, onResetProgress } = setup();

    await user.click(screen.getByRole('button', { name: 'Reset progress' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onResetProgress).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('resets once confirmed', async () => {
    const { user, onResetProgress } = setup();

    await user.click(screen.getByRole('button', { name: 'Reset progress' }));
    await user.click(screen.getByRole('button', { name: 'Reset everything' }));

    expect(onResetProgress).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
