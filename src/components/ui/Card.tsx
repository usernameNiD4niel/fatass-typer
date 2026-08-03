import type { HTMLAttributes, JSX, ReactNode } from 'react';

import { classes } from './classes';
import styles from './Surface.module.css';

/**
 * Card (spec §9).
 *
 * Content that sits in the page. A card is a `<section>` by default; give it
 * `onSelect` and it becomes a real `<button>` instead — an interactive card must
 * be reachable by keyboard, and the element that provides that is a button, not
 * a `<div>` with a click handler.
 */

interface CommonProps {
  readonly title?: string;
  /** Heading level for the title. Cards nest, so the caller owns the outline. */
  readonly titleLevel?: 2 | 3 | 4;
  readonly selected?: boolean;
}

export interface CardProps extends CommonProps, Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** Makes the card a button. Without it the card is inert content. */
  readonly onSelect?: never;
  readonly disabled?: never;
}

export interface SelectableCardProps extends CommonProps {
  readonly onSelect: () => void;
  readonly disabled?: boolean;
  /** Accessible name when the visible title is not the whole story. */
  readonly label?: string;
  readonly className?: string;
  readonly children?: ReactNode;
}

function Title({ title, level }: { title: string; level: 2 | 3 | 4 }): JSX.Element {
  const Heading = `h${String(level)}` as 'h2' | 'h3' | 'h4';

  return <Heading className={styles.title}>{title}</Heading>;
}

export function Card({
  title,
  titleLevel = 3,
  selected = false,
  className,
  children,
  ...rest
}: CardProps): JSX.Element {
  return (
    <section {...rest} className={classes(styles.card, selected && styles.cardSelected, className)}>
      {title !== undefined && <Title title={title} level={titleLevel} />}
      {children}
    </section>
  );
}

/** A card the player can choose — map selection in step E3 is built from these. */
export function SelectableCard({
  title,
  titleLevel = 3,
  selected = false,
  disabled = false,
  label,
  className,
  onSelect,
  children,
}: SelectableCardProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onSelect}
      /*
       * `aria-disabled`, not `disabled` (spec §12).
       *
       * A disabled button leaves the tab order, and these cards carry the very
       * information a player needs when they cannot choose one — what a locked
       * map is, and what would unlock it. Announced as unavailable, still
       * reachable, and inert to clicks and Enter alike.
       */
      aria-disabled={disabled}
      onKeyDown={
        disabled
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') event.preventDefault();
            }
          : undefined
      }
      // Selection is state, not styling: a screen reader has to hear it too.
      aria-pressed={selected}
      {...(label === undefined ? {} : { 'aria-label': label })}
      className={classes(
        styles.card,
        styles.cardInteractive,
        disabled && styles.cardDisabled,
        selected && styles.cardSelected,
        className,
      )}
    >
      {title !== undefined && <Title title={title} level={titleLevel} />}
      {children}
    </button>
  );
}
