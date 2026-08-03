import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { WidthGuard } from './WidthGuard';

describe('WidthGuard', () => {
  it('explains what the game needs rather than just refusing', () => {
    render(<WidthGuard minimumWidthPx={1024} />);

    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/physical keyboard/)).toBeInTheDocument();
  });

  it('names the width the player has to reach', () => {
    render(<WidthGuard minimumWidthPx={1024} />);

    // An actionable number: "too narrow" alone leaves nothing to do.
    expect(screen.getByText(/at least 1024px/)).toBeInTheDocument();
  });
});
