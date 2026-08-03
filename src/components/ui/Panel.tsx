import type { HTMLAttributes, JSX, ReactNode } from 'react';

import { classes } from './classes';
import styles from './Surface.module.css';

/**
 * Panel (spec §9).
 *
 * A surface that floats above the page — pause overlays, results, settings
 * groups. Translucent, but only mildly: the spec is explicit that readability
 * beats the glass effect, so the fill is high-opacity and the blur is light.
 */

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  readonly tight?: boolean;
  readonly children: ReactNode;
}

export function Panel({ tight = false, className, children, ...rest }: PanelProps): JSX.Element {
  return (
    <div {...rest} className={classes(styles.panel, tight && styles.panelTight, className)}>
      {children}
    </div>
  );
}
