import { type JSX, type KeyboardEvent, type ReactNode, useEffect, useId, useRef } from 'react';

import { Button } from './Button';
import styles from './Modal.module.css';

/**
 * Modal (spec §9, §12).
 *
 * Four things make a dialog usable rather than merely visible, and all four are
 * here because leaving any one out strands a keyboard user:
 *
 *   1. Focus moves *into* the dialog when it opens.
 *   2. Tab cycles inside it and cannot escape to the page behind.
 *   3. Escape closes it.
 *   4. Focus returns to whatever opened it.
 *
 * Built on a plain element rather than `<dialog>`: `showModal` still varies
 * across browsers in how it handles focus restoration and scroll locking, and
 * the behaviour above is short enough to own outright.
 */

export interface ModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly description?: string;
  readonly children?: ReactNode;
  readonly footer?: ReactNode;
  /** Hides the close button for a dialog the player must answer. */
  readonly dismissible?: boolean;
  readonly closeLabel?: string;
}

/** Everything inside `root` that a Tab press can reach. */
function focusableWithin(root: HTMLElement): HTMLElement[] {
  const selector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ');

  return [...root.querySelectorAll<HTMLElement>(selector)].filter(
    (element) => element.getAttribute('aria-hidden') !== 'true',
  );
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  dismissible = true,
  closeLabel = 'Close',
}: ModalProps): JSX.Element | null {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;

    // Remembered before focus moves, and restored on close: a player who opened
    // this from a button expects to land back on that button.
    const previouslyFocused = document.activeElement;
    const dialog = dialogRef.current;

    const [first] = dialog ? focusableWithin(dialog) : [];
    (first ?? dialog)?.focus();

    return () => {
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [open]);

  if (!open) return null;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape' && dismissible) {
      event.stopPropagation();
      onClose();

      return;
    }

    if (event.key !== 'Tab') return;

    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusable = focusableWithin(dialog);
    if (focusable.length === 0) {
      // Nothing to move to: keep focus on the dialog rather than letting Tab
      // wander into the page behind it.
      event.preventDefault();

      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && (active === first || active === dialog)) {
      event.preventDefault();
      last?.focus();

      return;
    }

    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  return (
    <div
      className={styles.backdrop}
      onMouseDown={(event) => {
        // Only a click that both starts and ends on the backdrop dismisses:
        // dragging a selection out of the dialog should not close it.
        if (dismissible && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        {...(description === undefined ? {} : { 'aria-describedby': descriptionId })}
        tabIndex={-1}
        className={styles.dialog}
        onKeyDown={handleKeyDown}
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
      >
        <div className={styles.header}>
          <div>
            <h2 className={styles.title} id={titleId}>
              {title}
            </h2>
            {description !== undefined && (
              <p className={styles.description} id={descriptionId}>
                {description}
              </p>
            )}
          </div>
          {dismissible && (
            <Button variant="ghost" size="small" onClick={onClose} aria-label={closeLabel}>
              ✕
            </Button>
          )}
        </div>

        {children !== undefined && <div className={styles.body}>{children}</div>}
        {footer !== undefined && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>
  );
}
