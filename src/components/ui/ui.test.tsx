import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Button } from './Button';
import { Card, SelectableCard } from './Card';
import { classes } from './classes';
import { Modal } from './Modal';
import { Panel } from './Panel';
import { Slider } from './Slider';
import { Toggle } from './Toggle';

/**
 * The primitives are tested through the accessibility tree — by role, name, and
 * state — rather than by class name. That is how assistive technology sees them,
 * and it is the part that must not regress; the styling is free to change.
 */

describe('classes', () => {
  it('joins what it is given and drops what it is not', () => {
    expect(classes('a', undefined, false, null, 'b')).toBe('a b');
    expect(classes()).toBe('');
  });
});

describe('Button', () => {
  it('is a real button with an accessible name', () => {
    render(<Button>Start run</Button>);

    expect(screen.getByRole('button', { name: 'Start run' })).toBeInTheDocument();
  });

  it('does not submit forms by accident', () => {
    render(<Button>Save</Button>);

    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('can still be a submit button when asked', () => {
    render(<Button type="submit">Save</Button>);

    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });

  it('calls back on click and on Enter', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Button onClick={onClick}>Go</Button>);

    await user.click(screen.getByRole('button'));
    // The click leaves it focused, so Enter is the keyboard path on the same
    // control rather than a second click.
    await user.keyboard('{Enter}');

    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('ignores clicks while disabled', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <Button onClick={onClick} disabled>
        Go
      </Button>,
    );

    await user.click(screen.getByRole('button'));

    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('is reachable by keyboard', async () => {
    const user = userEvent.setup();
    render(<Button>Go</Button>);

    await user.tab();

    expect(screen.getByRole('button')).toHaveFocus();
  });

  it('renders every variant and size without losing its name', () => {
    for (const variant of ['primary', 'secondary', 'ghost', 'danger'] as const) {
      for (const size of ['small', 'medium', 'large'] as const) {
        const view = render(
          <Button variant={variant} size={size}>
            {`${variant}-${size}`}
          </Button>,
        );

        expect(screen.getByRole('button', { name: `${variant}-${size}` })).toBeInTheDocument();
        view.unmount();
      }
    }
  });
});

describe('Card', () => {
  it('is a section with its title as a heading', () => {
    render(<Card title="Neighborhood Dash">Target 20 WPM</Card>);

    expect(
      screen.getByRole('heading', { level: 3, name: 'Neighborhood Dash' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Target 20 WPM')).toBeInTheDocument();
  });

  it('lets the caller own the heading level, because cards nest', () => {
    render(<Card title="Statistics" titleLevel={2} />);

    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
  });

  it('is not focusable when it is only content', async () => {
    const user = userEvent.setup();
    render(<Card title="Inert">body</Card>);

    await user.tab();

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('SelectableCard', () => {
  it('is a button, so it is keyboard reachable', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<SelectableCard title="Map 1" onSelect={onSelect} />);

    await user.tab();
    await user.keyboard('{Enter}');

    expect(screen.getByRole('button', { name: /Map 1/ })).toHaveFocus();
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('announces selection rather than only showing it', () => {
    render(<SelectableCard title="Map 1" onSelect={vi.fn()} selected />);

    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
  });

  it('does not fire while disabled', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<SelectableCard title="Locked map" onSelect={onSelect} disabled />);

    await user.click(screen.getByRole('button'));

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('stays reachable by keyboard while unavailable (spec §12)', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<SelectableCard title="Locked map" onSelect={onSelect} disabled />);
    const card = screen.getByRole('button');

    await user.tab();

    // A `disabled` button leaves the tab order — and a locked map card is
    // exactly where the unlock requirement is written.
    expect(card).toHaveFocus();
    expect(card).toHaveAttribute('aria-disabled', 'true');
  });

  it('ignores Enter and Space while unavailable', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<SelectableCard title="Locked map" onSelect={onSelect} disabled />);

    screen.getByRole('button').focus();
    await user.keyboard('{Enter} ');

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('takes an explicit label when the title is not the whole story', () => {
    render(
      <SelectableCard
        title="Map 2"
        label="Map 2, locked — needs 85% accuracy"
        onSelect={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Map 2, locked — needs 85% accuracy' }),
    ).toBeInTheDocument();
  });
});

describe('Panel', () => {
  it('renders its children', () => {
    render(<Panel>Paused</Panel>);

    expect(screen.getByText('Paused')).toBeInTheDocument();
  });
});

describe('Toggle', () => {
  it('is announced as a switch with a state', () => {
    render(<Toggle checked={false} onChange={vi.fn()} label="Reduced motion" />);

    const toggle = screen.getByRole('switch', { name: 'Reduced motion' });

    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('toggles on click and on Space', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Toggle checked={false} onChange={onChange} label="Music" />);

    await user.click(screen.getByRole('switch'));
    await user.keyboard(' ');

    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('reports the state in text as well as colour', () => {
    const view = render(<Toggle checked onChange={vi.fn()} label="Music" />);

    expect(screen.getByRole('switch')).toHaveTextContent('ON');

    view.rerender(<Toggle checked={false} onChange={vi.fn()} label="Music" />);

    expect(screen.getByRole('switch')).toHaveTextContent('OFF');
  });

  it('carries its description into the accessibility tree', () => {
    render(
      <Toggle
        checked={false}
        onChange={vi.fn()}
        label="Reduced motion"
        description="Removes animation and screen shake."
      />,
    );

    expect(screen.getByRole('switch')).toHaveAccessibleDescription(
      'Removes animation and screen shake.',
    );
  });

  it('does not fire while disabled', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Toggle checked={false} onChange={onChange} label="Music" disabled />);

    await user.click(screen.getByRole('switch'));

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('Slider', () => {
  it('is a labelled range input', () => {
    render(<Slider value={0.5} onChange={vi.fn()} label="Music volume" />);

    expect(screen.getByRole('slider', { name: 'Music volume' })).toBeInTheDocument();
  });

  it('announces the formatted value, not the raw number', () => {
    render(<Slider value={0.6} onChange={vi.fn()} label="Music volume" />);

    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', '60%');
  });

  it('accepts a custom format', () => {
    render(
      <Slider
        value={22}
        onChange={vi.fn()}
        label="Prompt size"
        min={12}
        max={36}
        step={1}
        format={(value) => `${String(value)}px`}
      />,
    );

    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', '22px');
    expect(screen.getByText('22px')).toBeInTheDocument();
  });

  it('reports a new value as a number, and holds it', () => {
    // jsdom does not implement range-input key handling, so the arrow keys
    // cannot be exercised here — that behaviour belongs to the native element,
    // which is exactly why this is not a custom track. What is ours is the
    // change handling, and that is what this drives.
    function Harness(): React.JSX.Element {
      const [value, setValue] = useState(0.5);

      return <Slider value={value} onChange={setValue} label="Volume" step={0.1} />;
    }

    render(<Harness />);
    const slider = screen.getByRole('slider');

    fireEvent.change(slider, { target: { value: '0.7' } });

    expect(slider).toHaveValue('0.7');
    expect(slider).toHaveAttribute('aria-valuetext', '70%');
  });

  it('ignores a change that is not a finite number', () => {
    const onChange = vi.fn();
    render(<Slider value={0.5} onChange={onChange} label="Volume" />);

    fireEvent.change(screen.getByRole('slider'), { target: { value: 'nonsense' } });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('is keyboard reachable', async () => {
    const user = userEvent.setup();
    render(<Slider value={0.5} onChange={vi.fn()} label="Volume" />);

    await user.tab();

    expect(screen.getByRole('slider')).toHaveFocus();
  });

  it('does not move while disabled', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Slider value={0.5} onChange={onChange} label="Volume" disabled />);

    await user.click(screen.getByRole('slider'));
    await user.keyboard('{ArrowRight}');

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('Modal', () => {
  function open(props: Partial<Parameters<typeof Modal>[0]> = {}) {
    const onClose = vi.fn();
    const view = render(
      <Modal open onClose={onClose} title="Quit run?" {...props}>
        <button type="button">Inside</button>
      </Modal>,
    );

    return { onClose, view, user: userEvent.setup() };
  }

  it('renders nothing when closed', () => {
    render(
      <Modal open={false} onClose={vi.fn()} title="Quit run?">
        body
      </Modal>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('is a modal dialog named by its title', () => {
    open();

    expect(screen.getByRole('dialog', { name: 'Quit run?' })).toHaveAttribute('aria-modal', 'true');
  });

  it('carries its description into the accessibility tree', () => {
    open({ description: 'Your progress will be lost.' });

    expect(screen.getByRole('dialog')).toHaveAccessibleDescription('Your progress will be lost.');
  });

  it('moves focus into itself when it opens', () => {
    open();

    const dialog = screen.getByRole('dialog');

    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('closes on Escape', async () => {
    const { onClose, user } = open();

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when the backdrop is clicked, but not the dialog itself', async () => {
    const { onClose, user } = open();

    await user.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole('dialog').parentElement as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps Tab inside the dialog', async () => {
    const { user } = open({
      footer: (
        <>
          <Button>Cancel</Button>
          <Button variant="danger">Quit</Button>
        </>
      ),
    });

    const dialog = screen.getByRole('dialog');
    const buttons = within(dialog).getAllByRole('button');

    // Forward from the last focusable wraps to the first, not out to the page.
    buttons[buttons.length - 1]?.focus();
    await user.tab();
    expect(buttons[0]).toHaveFocus();

    // And backwards from the first wraps to the last.
    await user.tab({ shift: true });
    expect(buttons[buttons.length - 1]).toHaveFocus();
  });

  it('returns focus to whatever opened it', async () => {
    const user = userEvent.setup();

    function Harness(): React.JSX.Element {
      const [isOpen, setOpen] = useState(false);

      return (
        <>
          <Button
            onClick={() => {
              setOpen(true);
            }}
          >
            Open
          </Button>
          <Modal
            open={isOpen}
            onClose={() => {
              setOpen(false);
            }}
            title="Quit run?"
          />
        </>
      );
    }

    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open' });

    await user.click(opener);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('cannot be dismissed when the player has to answer', async () => {
    const { onClose, user } = open({ dismissible: false });

    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('dialog').parentElement as HTMLElement);

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
  });

  it('offers a labelled close control when it is dismissible', async () => {
    const { onClose, user } = open();

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
