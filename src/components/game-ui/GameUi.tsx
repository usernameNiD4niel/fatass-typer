import type { JSX, ReactNode } from 'react';

import { classes } from '../ui';
import styles from './GameUi.module.css';

/**
 * The menus' own chrome.
 *
 * `components/ui` is the neutral kit: a Button is a Button wherever it lands.
 * This is the layer above it — the framed panels, label plates, stat tiles and
 * meters that make the menus read as a game's front end.
 *
 * Every screen in the shell is built from these five, which is the point. Six
 * screens each inventing their own panel is how a menu ends up looking like six
 * different programs, and it is what this replaced.
 *
 * Nothing here holds state or knows a rule. They take what to show and show it.
 */

/** How a figure is doing, when that is a thing worth saying. */
export type Tone = 'neutral' | 'good' | 'warn' | 'bad';

const TILE_TONE: Readonly<Record<Tone, string | undefined>> = {
  neutral: undefined,
  good: styles.tileGood,
  warn: styles.tileWarn,
  bad: styles.tileBad,
};

const FILL_TONE: Readonly<Record<Tone, string | undefined>> = {
  neutral: undefined,
  good: styles.meterFillGood,
  warn: styles.meterFillWarn,
  bad: styles.meterFillBad,
};

export interface PanelProps {
  /** The plate on the rail. Omit for a panel that is only a frame. */
  readonly title?: string | undefined;
  /** Heading level. Screens own their own outline, so the caller decides. */
  readonly titleLevel?: 2 | 3;
  /** A short fact belonging to the panel — a count, a total, a "3 of 6". */
  readonly meta?: string | undefined;
  /** The one panel that is the point of the screen. Ringed, not recoloured. */
  readonly feature?: boolean;
  readonly className?: string | undefined;
  readonly children: ReactNode;
}

/** A framed panel with a label plate. The menus' unit of structure. */
export function Panel({
  title,
  titleLevel = 2,
  meta,
  feature = false,
  className,
  children,
}: PanelProps): JSX.Element {
  const Heading = titleLevel === 2 ? 'h2' : 'h3';

  return (
    <section className={classes(styles.panel, feature && styles.panelFeature, className)}>
      {title !== undefined && (
        <div className={styles.panelRail}>
          <Heading className={styles.panelTitle}>{title}</Heading>
          {meta !== undefined && <span className={styles.panelMeta}>{meta}</span>}
        </div>
      )}
      <div className={styles.panelBody}>{children}</div>
    </section>
  );
}

export interface ScreenHeadProps {
  /** The small line above the title. Says where in the game you are. */
  readonly eyebrow?: string | undefined;
  readonly title: string;
  readonly subtitle?: string | undefined;
  /** Anything that belongs beside the title — a credit balance, a control. */
  readonly aside?: ReactNode | undefined;
}

/** The top of a screen. Same shape on every one of them, deliberately. */
export function ScreenHead({ eyebrow, title, subtitle, aside }: ScreenHeadProps): JSX.Element {
  return (
    <header className={styles.head}>
      <div className={styles.headText}>
        {eyebrow !== undefined && <p className={styles.eyebrow}>{eyebrow}</p>}
        <h1 className={styles.headTitle}>{title}</h1>
        {subtitle !== undefined && <p className={styles.headSubtitle}>{subtitle}</p>}
      </div>
      {aside}
    </header>
  );
}

export interface StatTileProps {
  readonly label: string;
  readonly value: string;
  readonly note?: string | undefined;
  readonly tone?: Tone;
  /** For the one figure a screen is actually about. */
  readonly large?: boolean;
  /**
   * The value is a name rather than a figure.
   *
   * A tile is sized for numbers — "1840", "94%" — and a map called
   * "Neighborhood Dash" set at that size wraps onto three lines and stops
   * looking like a value at all. This drops it to body size and lets it wrap
   * like the words it is.
   */
  readonly compact?: boolean;
}

/**
 * One figure, labelled.
 *
 * Rendered as `<div>`s rather than a `<dl>` pair so a caller can put tiles in a
 * grid, a panel or a row without inheriting a definition list's structure. The
 * screens that genuinely have a term-and-definition list still use one.
 */
export function StatTile({
  label,
  value,
  note,
  tone = 'neutral',
  large = false,
  compact = false,
}: StatTileProps): JSX.Element {
  return (
    <div className={classes(styles.tile, TILE_TONE[tone])}>
      <p className={styles.tileLabel}>{label}</p>
      <p
        className={classes(
          styles.tileValue,
          large && styles.tileValueLarge,
          compact && styles.tileValueCompact,
        )}
      >
        {value}
      </p>
      {note !== undefined && <p className={styles.tileNote}>{note}</p>}
    </div>
  );
}

/** A grid of tiles that reflows on its own. */
export function StatTiles({ children }: { children: ReactNode }): JSX.Element {
  return <div className={styles.tiles}>{children}</div>;
}

export interface MeterProps {
  readonly label: string;
  /** The figure, as words. Shown as given — the caller owns the units. */
  readonly value: string;
  /** 0..1. Clamped, so a record-breaking run cannot overflow the track. */
  readonly fraction: number;
  readonly tone?: Tone;
}

/**
 * A labelled bar.
 *
 * The number is always written out beside it. A bar alone is a shape a player
 * has to estimate, and every figure in this game is one they might want to
 * compare with a target (spec §12).
 */
export function Meter({ label, value, fraction, tone = 'neutral' }: MeterProps): JSX.Element {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));

  return (
    <div className={styles.meter}>
      <p className={styles.meterHead}>
        <span>{label}</span>
        <span className={styles.meterValue}>{value}</span>
      </p>
      {/*
        `aria-hidden`: the bar is a second rendering of the value already read
        out on the line above it, and announcing both says everything twice.
      */}
      <div className={styles.meterTrack} aria-hidden="true">
        <div
          className={classes(styles.meterFill, FILL_TONE[tone])}
          style={{ width: `${String(clamped * 100)}%` }}
        />
      </div>
    </div>
  );
}

export interface TabRailProps<T extends string> {
  readonly label: string;
  readonly tabs: readonly T[];
  readonly active: T;
  readonly render: (tab: T) => string;
  readonly onSelect: (tab: T) => void;
}

/** The segmented control the wardrobe and the statistics screen both wanted. */
export function TabRail<T extends string>({
  label,
  tabs,
  active,
  render,
  onSelect,
}: TabRailProps<T>): JSX.Element {
  return (
    <div className={styles.tabs} role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={tab === active}
          className={styles.tab}
          onClick={() => {
            onSelect(tab);
          }}
        >
          {render(tab)}
        </button>
      ))}
    </div>
  );
}
