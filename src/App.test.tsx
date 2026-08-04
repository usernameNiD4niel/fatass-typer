import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from './App';

/**
 * The shell, tested through the screens a player actually sees.
 *
 * Every screen but the splash, the menu, and the width guard is loaded lazily
 * (spec §16), so navigation is asynchronous here: `findBy*` where a screen has
 * to arrive first, `getBy*` only once it has.
 */

/** Boots past the splash, dismisses the first-run tutorial, lands on the menu. */
async function boot(user: ReturnType<typeof userEvent.setup>) {
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Skip' }));

  await waitFor(() => {
    expect(screen.getByRole('heading', { level: 1, name: 'Typing Chase' })).toBeInTheDocument();
  });

  await user.click(await screen.findByRole('button', { name: 'Got it' }));
}

describe('App', () => {
  it('opens on the splash screen', () => {
    render(<App />);

    expect(screen.getByRole('progressbar', { name: 'Loading progress' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Typing Chase' })).toBeInTheDocument();
  });

  it('renders a single main landmark', () => {
    render(<App />);

    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('moves from the splash to the main menu', async () => {
    const user = userEvent.setup();
    await boot(user);

    expect(screen.getByRole('button', { name: 'Maps' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
  });

  it('walks from the main menu into a run', async () => {
    const user = userEvent.setup();
    await boot(user);

    await user.click(screen.getByRole('button', { name: 'Start' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Choose a map' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Map 1: Neighborhood Dash/ }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Neighborhood Dash' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Start run' }));
    expect(
      await screen.findByRole('img', { name: 'The road ahead, the hazards on it, and the runner' }),
    ).toBeInTheDocument();
  });

  it('can back out of a map choice without starting a run', async () => {
    const user = userEvent.setup();
    await boot(user);

    await user.click(screen.getByRole('button', { name: 'Maps' }));
    await user.click(await screen.findByRole('button', { name: /Map 1: Neighborhood Dash/ }));
    await user.click(await screen.findByRole('button', { name: 'Back to maps' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Choose a map' }),
    ).toBeInTheDocument();
  });

  it('returns from Settings to the state it was opened from', async () => {
    const user = userEvent.setup();
    await boot(user);

    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByRole('button', { name: 'Maps' })).toBeInTheDocument();
  });

  it('opens statistics from the menu and comes back', async () => {
    const user = userEvent.setup();
    await boot(user);

    await user.click(screen.getByRole('button', { name: 'Statistics' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Statistics' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('button', { name: 'Maps' })).toBeInTheDocument();
  });

  it('applies a theme choice to the document', async () => {
    const user = userEvent.setup();
    await boot(user);

    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(await screen.findByRole('radio', { name: 'Dark' }));

    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  });

  it('never offers a control for an illegal transition', async () => {
    const user = userEvent.setup();
    await boot(user);

    // Pausing is meaningless outside a run, so no such control exists.
    expect(screen.queryByRole('button', { name: 'PAUSE' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'RESUME' })).not.toBeInTheDocument();
  });

  it('shows the tutorial once, on the first visit to the menu', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Skip' }));

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'How Typing Chase works' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // And it does not come back: dismissing it records that it was seen.
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(await screen.findByRole('button', { name: 'Done' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('offers no Continue on a fresh profile', async () => {
    const user = userEvent.setup();
    await boot(user);

    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
  });
});
