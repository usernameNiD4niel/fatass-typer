import type { JSX, ReactNode } from 'react';

/**
 * Text for assistive technology only (spec §12).
 *
 * The canvas cannot be read, so anything it communicates visually — a warning,
 * a collision, the end of a run — has to be said somewhere a screen reader can
 * reach. This is that somewhere.
 *
 * The class lives in `global.css` rather than a module because it is a document
 * primitive: it belongs to the same layer as the focus ring.
 */

export interface VisuallyHiddenProps {
  readonly children: ReactNode;
  /** Renders as a live region when set. `off` is a plain hidden label. */
  readonly live?: 'off' | 'polite' | 'assertive';
  readonly id?: string;
}

export function VisuallyHidden({ children, live = 'off', id }: VisuallyHiddenProps): JSX.Element {
  return (
    <span
      className="visually-hidden"
      {...(id === undefined ? {} : { id })}
      {...(live === 'off' ? {} : { 'aria-live': live, role: 'status' })}
    >
      {children}
    </span>
  );
}
