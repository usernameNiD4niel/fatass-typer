import { type JSX, useId, useState } from 'react';

import { Button, Card, Modal, Slider, Toggle } from '../../components/ui';
import type {
  GameSettings,
  MistakeBehavior,
  PromptTextSize,
  ThemePreference,
} from '../../game-core/models';
import styles from './Settings.module.css';

/**
 * Settings (spec §9, §12).
 *
 * Every control says what it *does*, not just what it is called: several of
 * these change how the game feels, and a player should not have to experiment
 * to find out which.
 *
 * Presentational — it takes settings and emits a new object. Where they are
 * stored is the shell's business.
 */

export interface SettingsScreenProps {
  readonly settings: GameSettings;
  readonly onChange: (settings: GameSettings) => void;
  readonly onClose: () => void;
  /** Wipes stored progress. Real now that progress persists — see plan 2.1. */
  readonly onResetProgress?: () => void;
}

const THEME_LABELS: Readonly<Record<ThemePreference, string>> = {
  system: 'Match system',
  light: 'Light',
  dark: 'Dark',
};

const SIZE_LABELS: Readonly<Record<PromptTextSize, string>> = {
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
  'extra-large': 'Extra large',
};

const MISTAKE_LABELS: Readonly<Record<MistakeBehavior, string>> = {
  'allow-and-mark': 'Keep typing',
  'block-until-corrected': 'Stop until fixed',
};

/** A labelled row of mutually exclusive choices, built from real radio inputs. */
function ChoiceRow<T extends string>({
  label,
  description,
  value,
  options,
  labels,
  onSelect,
}: {
  label: string;
  description: string;
  value: T;
  options: readonly T[];
  labels: Readonly<Record<T, string>>;
  onSelect: (value: T) => void;
}): JSX.Element {
  const groupName = useId();
  const descriptionId = useId();

  return (
    <fieldset className={styles.group} aria-describedby={descriptionId}>
      <div className={styles.groupHead}>
        {/* A legend, so assistive technology groups the options under it. */}
        <legend className={styles.label}>{label}</legend>
        <span className={styles.description} id={descriptionId}>
          {description}
        </span>
      </div>

      <div className={styles.choices} role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <label key={option}>
            <input
              type="radio"
              name={groupName}
              value={option}
              checked={value === option}
              onChange={() => {
                onSelect(option);
              }}
            />{' '}
            {labels[option]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function SettingsScreen({
  settings,
  onChange,
  onClose,
  onResetProgress,
}: SettingsScreenProps): JSX.Element {
  const [confirmingReset, setConfirmingReset] = useState(false);

  function update(patch: Partial<GameSettings>): void {
    onChange({ ...settings, ...patch });
  }

  return (
    <section className={styles.screen} aria-label="Settings">
      <header className={styles.header}>
        <h1 className={styles.title}>Settings</h1>
        <p className={styles.subtitle}>These apply immediately and affect every run.</p>
      </header>

      <Card title="Display" titleLevel={2}>
        <ChoiceRow
          label="Theme"
          description="Match system follows your operating system."
          value={settings.theme}
          options={['system', 'light', 'dark']}
          labels={THEME_LABELS}
          onSelect={(theme) => {
            update({ theme });
          }}
        />

        <ChoiceRow
          label="Prompt size"
          description="How large the words you are typing appear."
          value={settings.promptTextSize}
          options={['small', 'medium', 'large', 'extra-large']}
          labels={SIZE_LABELS}
          onSelect={(promptTextSize) => {
            update({ promptTextSize });
          }}
        />

        <Toggle
          label="Reduced motion"
          description="Removes animation and camera movement. Nothing about the difficulty changes."
          // `null` means "follow the system"; the toggle shows what is in effect.
          checked={settings.reducedMotion === true}
          onChange={(reducedMotion) => {
            update({ reducedMotion });
          }}
        />
      </Card>

      <Card title="Typing" titleLevel={2}>
        <ChoiceRow
          label="When you make a mistake"
          description="Keep typing marks the error and lets you carry on. Stop until fixed blocks further progress until you correct it."
          value={settings.mistakeBehavior}
          options={['allow-and-mark', 'block-until-corrected']}
          labels={MISTAKE_LABELS}
          onSelect={(mistakeBehavior) => {
            update({ mistakeBehavior });
          }}
        />

        <Toggle
          label="Case sensitive"
          description="Off by default: capital letters are not required to match."
          checked={settings.caseSensitive}
          onChange={(caseSensitive) => {
            update({ caseSensitive });
          }}
        />

        <Toggle
          label="Adaptive assistance"
          description="Small timing adjustments after repeated failures. The target speed shown never changes."
          checked={settings.adaptiveAssistanceEnabled}
          onChange={(adaptiveAssistanceEnabled) => {
            update({ adaptiveAssistanceEnabled });
          }}
        />
      </Card>

      <Card title="Audio" titleLevel={2}>
        <Toggle
          label="Music"
          checked={settings.musicEnabled}
          onChange={(musicEnabled) => {
            update({ musicEnabled });
          }}
        />
        <Slider
          label="Music volume"
          value={settings.musicVolume}
          disabled={!settings.musicEnabled}
          onChange={(musicVolume) => {
            update({ musicVolume });
          }}
        />

        <Toggle
          label="Sound effects"
          checked={settings.soundEffectsEnabled}
          onChange={(soundEffectsEnabled) => {
            update({ soundEffectsEnabled });
          }}
        />
        <Slider
          label="Sound effects volume"
          value={settings.soundEffectsVolume}
          disabled={!settings.soundEffectsEnabled}
          onChange={(soundEffectsVolume) => {
            update({ soundEffectsVolume });
          }}
        />
      </Card>

      {onResetProgress !== undefined && (
        <Card title="Progress" titleLevel={2}>
          <div className={styles.danger}>
            <p className={styles.description}>
              Your progress is saved in this browser and survives closing the tab. Resetting erases
              every unlock, best score and recorded run, and cannot be undone.
            </p>
            <Button
              variant="danger"
              onClick={() => {
                setConfirmingReset(true);
              }}
            >
              Reset progress
            </Button>
          </div>
        </Card>
      )}

      <div className={styles.actions}>
        <Button variant="primary" size="large" onClick={onClose}>
          Done
        </Button>
      </div>

      {/* Destructive and irreversible, so it asks first (spec §9). */}
      <Modal
        open={confirmingReset}
        onClose={() => {
          setConfirmingReset(false);
        }}
        title="Reset all progress?"
        description="Unlocked maps, best scores, and your lifetime records will be cleared. This cannot be undone."
        footer={
          <>
            <Button
              onClick={() => {
                setConfirmingReset(false);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setConfirmingReset(false);
                onResetProgress?.();
              }}
            >
              Reset everything
            </Button>
          </>
        }
      />
    </section>
  );
}
