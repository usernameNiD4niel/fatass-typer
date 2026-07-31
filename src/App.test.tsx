import { render, screen } from '@testing-library/react';
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
});
