import { type JSX, useId } from 'react';

import styles from './Control.module.css';
import { classes } from './classes';

/**
 * Toggle (spec §9, §12).
 *
 * `role="switch"` on a real button: screen readers announce it as a switch with
 * an on/off state, and the button gives keyboard operation for free.
 *
 * The state is signalled three ways — the knob's position, a mark on the track,
 * and `aria-checked`. Colour is the least of them on purpose.
 */

export interface ToggleProps {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly label: string;
  /** Why this setting exists, in the player's terms. */
  readonly description?: string;
  readonly disabled?: boolean;
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}: ToggleProps): JSX.Element {
  const labelId = useId();
  const descriptionId = useId();

  return (
    <div className={styles.row}>
      <span className={styles.labelGroup}>
        <span className={styles.label} id={labelId}>
          {label}
        </span>
        {description !== undefined && (
          <span className={styles.description} id={descriptionId}>
            {description}
          </span>
        )}
      </span>

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        {...(description === undefined ? {} : { 'aria-describedby': descriptionId })}
        disabled={disabled}
        onClick={() => {
          onChange(!checked);
        }}
        className={classes(styles.toggle, checked && styles.toggleOn)}
      >
        <span className={classes(styles.mark, !checked && styles.markOff)} aria-hidden="true">
          {checked ? 'ON' : 'OFF'}
        </span>
        <span className={classes(styles.knob, checked && styles.knobOn)} aria-hidden="true" />
      </button>
    </div>
  );
}
