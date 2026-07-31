import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders the game title', () => {
    render(<App />);

    expect(screen.getByRole('heading', { level: 1, name: 'Typing Chase' })).toBeInTheDocument();
  });

  it('renders a single main landmark', () => {
    render(<App />);

    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('starts in Boot and offers only the legal transition', () => {
    render(<App />);

    expect(screen.getByText('Boot')).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'BOOT_COMPLETE' })).toBeInTheDocument();
  });

  it('walks the machine from Boot into a run', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'BOOT_COMPLETE' }));
    expect(screen.getByText('MainMenu')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'OPEN_MAP_SELECTION' }));
    await user.click(screen.getByRole('button', { name: 'SELECT_MAP' }));
    expect(screen.getByText('PreRunCountdown')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'COUNTDOWN_COMPLETE' }));
    expect(screen.getByText('Running')).toBeInTheDocument();
  });

  it('returns from Settings to the state it was opened from', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'BOOT_COMPLETE' }));
    await user.click(screen.getByRole('button', { name: 'OPEN_MAP_SELECTION' }));
    await user.click(screen.getByRole('button', { name: 'OPEN_SETTINGS' }));

    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText(/returns to MapSelection/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'CLOSE_SETTINGS' }));
    expect(screen.getByText('MapSelection')).toBeInTheDocument();
  });

  it('never offers a control for an illegal transition', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'BOOT_COMPLETE' }));

    // Pausing is meaningless outside a run, so no such control exists.
    expect(screen.queryByRole('button', { name: 'PAUSE' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'RESUME' })).not.toBeInTheDocument();
  });
});
