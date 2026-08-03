import { type ChangeEvent, type JSX, useId } from 'react';

import styles from './Control.module.css';

/**
 * Slider (spec §9, §12).
 *
 * A real `<input type="range">`. Arrow keys, Home/End, Page Up/Down, and the
 * screen-reader value announcements are all the browser's, and every one of them
 * would have to be rebuilt — badly — on top of a custom track.
 *
 * The formatted value is shown next to it and mirrored into `aria-valuetext`, so
 * "60%" is announced rather than "0.6".
 */

export interface SliderProps {
  readonly value: number;
  readonly onChange: (value: number) => void;
  readonly label: string;
  readonly description?: string;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly disabled?: boolean;
  /** Turns the raw number into what the player reads. Defaults to a percentage. */
  readonly format?: (value: number) => string;
}

function percent(value: number): string {
  return `${String(Math.round(value * 100))}%`;
}

export function Slider({
  value,
  onChange,
  label,
  description,
  min = 0,
  max = 1,
  step = 0.05,
  disabled = false,
  format = percent,
}: SliderProps): JSX.Element {
  const inputId = useId();
  const descriptionId = useId();
  const formatted = format(value);

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    const next = Number(event.target.value);

    // A range input cannot normally produce NaN, but a programmatic change can.
    if (Number.isFinite(next)) onChange(next);
  }

  return (
    <div className={styles.row}>
      <span className={styles.labelGroup}>
        <label className={styles.label} htmlFor={inputId}>
          {label}
        </label>
        {description !== undefined && (
          <span className={styles.description} id={descriptionId}>
            {description}
          </span>
        )}
      </span>

      <span className={styles.sliderGroup}>
        <input
          id={inputId}
          type="range"
          className={styles.slider}
          value={value}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={handleChange}
          aria-valuetext={formatted}
          {...(description === undefined ? {} : { 'aria-describedby': descriptionId })}
        />
        {/* Visible for everyone; `aria-hidden` because the input already
            announces the same value through `aria-valuetext`. */}
        <span className={styles.value} aria-hidden="true">
          {formatted}
        </span>
      </span>
    </div>
  );
}
