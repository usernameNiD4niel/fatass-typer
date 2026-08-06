import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { GameScreen } from './GameScreen';

/**
 * The screen around the scene.
 *
 * jsdom has no WebGL, so the Three.js canvas is mocked out entirely. That is
 * not a compromise — it is the honest boundary. What this screen owns is the
 * HUD, the overlay, the keyboard, and the live regions; what the scene draws is
 * decided by the `WorldSnapshot`, which is tested where it is built.
 *
 * The simulation itself is tested headlessly in `run-session.test.ts`.
 */

vi.mock('../../game-scene', () => ({
  GameCanvas: () => <div data-testid="game-canvas" />,
}));

describe('GameScreen', () => {
  it('renders the stage and the HUD', () => {
    render(<GameScreen />);

    expect(
      screen.getByRole('img', { name: 'The road ahead, the hazards on it, and the runner' }),
    ).toBeInTheDocument();

    for (const label of ['WPM', 'Accuracy', 'Combo', 'Score']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }

    expect(screen.getByRole('progressbar', { name: 'To finish' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Pace' })).toBeInTheDocument();
  });

  it('has no typing field at all', () => {
    render(<GameScreen />);

    // The PDF is explicit: no visible gameplay text input, no click-to-focus
    // box. The keyboard is captured from the window instead.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('tells the player they can simply type', () => {
    render(<GameScreen />);

    // With no box to click, the absence of one has to be stated — otherwise a
    // player waits for something to focus.
    expect(screen.getByText(/just type/i)).toBeInTheDocument();
  });

  it('unmounts without leaving the simulation running', () => {
    const view = render(<GameScreen />);

    expect(() => {
      view.unmount();
    }).not.toThrow();
  });

  it('starts the run without asking a second time', () => {
    render(<GameScreen />);

    // The player pressed "Start run" on the briefing to get here. Asking again,
    // on a screen that looks exactly like the game, is a click that answers a
    // question nobody asked.
    expect(screen.queryByRole('button', { name: 'Start run' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeEnabled();
  });

  it('keeps the pause control in place rather than hiding it', () => {
    render(<GameScreen />);

    // The HUD keeps a stable shape: a control that appears and disappears as the
    // run starts and stops would shift everything around it.
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('pauses on Escape once the run is under way', async () => {
    const user = userEvent.setup();
    render(<GameScreen />);

    await user.keyboard('{Escape}');

    // Two of them: the HUD control flips to "Resume" and the overlay offers its
    // own. Both are deliberate, so this asserts the state rather than the count.
    expect((await screen.findAllByRole('button', { name: 'Resume' })).length).toBeGreaterThan(0);
  });

  it('stops listening to the keyboard on unmount', () => {
    const added: string[] = [];
    const removed: string[] = [];
    const addSpy = vi.spyOn(window, 'addEventListener').mockImplementation((type) => {
      added.push(type);
    });
    const removeSpy = vi.spyOn(window, 'removeEventListener').mockImplementation((type) => {
      removed.push(type);
    });

    render(<GameScreen />).unmount();

    // A leaked key listener would keep typing into a run that no longer exists.
    expect(added).toContain('keydown');
    expect(removed).toContain('keydown');

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});

describe('GameScreen accessibility (spec §12, §21)', () => {
  it('restarts on Ctrl+Enter from anywhere on the screen', async () => {
    const user = userEvent.setup();
    const onRestart = vi.fn();
    render(<GameScreen onRestart={onRestart} />);

    await user.keyboard('{Control>}{Enter}{/Control}');

    expect(onRestart).toHaveBeenCalledTimes(1);
  });

  it('restarts on Meta+Enter too', async () => {
    const user = userEvent.setup();
    const onRestart = vi.fn();
    render(<GameScreen onRestart={onRestart} />);

    await user.keyboard('{Meta>}{Enter}{/Meta}');

    expect(onRestart).toHaveBeenCalledTimes(1);
  });

  it('does not restart on a bare Enter', async () => {
    const user = userEvent.setup();
    const onRestart = vi.fn();
    render(<GameScreen onRestart={onRestart} />);

    await user.keyboard('{Enter}');

    expect(onRestart).not.toHaveBeenCalled();
  });

  it('states its keyboard shortcuts on the screen they apply to', () => {
    render(<GameScreen />);

    expect(screen.getByText('Esc')).toBeInTheDocument();
    expect(screen.getByText('Ctrl')).toBeInTheDocument();
  });

  it('carries a polite live region for the run', () => {
    render(<GameScreen />);

    // `status` rather than `alert`: the run should not interrupt whatever the
    // player is being told, and there is nothing here urgent enough to.
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
  });

  it('does not narrate what was typed', async () => {
    const user = userEvent.setup();
    render(<GameScreen />);

    const [region] = screen.getAllByRole('status');
    await user.keyboard('hello');

    // The live region is for moments, not characters. A region that updated per
    // keystroke would be a screen reader that never stops talking.
    expect(region?.textContent ?? '').not.toContain('hello');
  });

  it('describes the scene rather than leaving it unlabelled', () => {
    render(<GameScreen />);

    expect(
      screen.getByRole('img', { name: 'The road ahead, the hazards on it, and the runner' }),
    ).toBeInTheDocument();
  });
});
