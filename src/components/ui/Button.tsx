import type { ButtonHTMLAttributes, JSX, ReactNode, Ref } from 'react';

import styles from './Button.module.css';
import { classes } from './classes';

/**
 * Button (spec §9, §12).
 *
 * A real `<button>`, always. Every accessible name, keyboard behaviour, and
 * assistive-technology affordance comes free from the element; a styled `<div>`
 * would need all of it reimplemented and would still be worse.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'small' | 'medium' | 'large';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly fullWidth?: boolean;
  readonly children: ReactNode;
  /**
   * Plain prop, not `forwardRef` — React 19 passes refs to function components
   * directly. Callers need it to move focus, which overlays and dialogs must do.
   */
  readonly ref?: Ref<HTMLButtonElement>;
}

const VARIANT_CLASS: Readonly<Record<ButtonVariant, string | undefined>> = {
  primary: styles.primary,
  secondary: styles.secondary,
  ghost: styles.ghost,
  danger: styles.danger,
};

const SIZE_CLASS: Readonly<Record<ButtonSize, string | undefined>> = {
  small: styles.small,
  medium: undefined,
  large: styles.large,
};

export function Button({
  variant = 'secondary',
  size = 'medium',
  fullWidth = false,
  className,
  children,
  ...rest
}: ButtonProps): JSX.Element {
  return (
    <button
      // Explicit, because an unset `type` inside a form is "submit" — a default
      // that has caused more accidental form submissions than it has saved
      // keystrokes. Callers who want submit pass it.
      type="button"
      {...rest}
      className={classes(
        styles.button,
        VARIANT_CLASS[variant],
        SIZE_CLASS[size],
        fullWidth && styles.fullWidth,
        className,
      )}
    >
      {children}
    </button>
  );
}
