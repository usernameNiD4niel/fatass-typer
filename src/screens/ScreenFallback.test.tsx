import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ScreenFallback } from './ScreenFallback';

describe('ScreenFallback', () => {
  it('says what is loading', () => {
    render(<ScreenFallback label="run" />);

    expect(screen.getByText('Loading the run…')).toBeInTheDocument();
  });

  it('announces itself politely', () => {
    render(<ScreenFallback />);

    // A screen that changes without a word is a screen a non-sighted player has
    // no way to notice (spec §12).
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('is a landmark with a name', () => {
    render(<ScreenFallback />);

    expect(screen.getByRole('region', { name: 'Loading' })).toBeInTheDocument();
  });
});
