/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import BusyButton from './BusyButton';
import Skeleton from './Skeleton';

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('BusyButton', () => {
  it('is an ordinary button until busy', () => {
    render(<BusyButton busyLabel="Opening…">Load</BusyButton>);
    const button = screen.getByRole('button', { name: 'Load' });
    expect(button.disabled).toBe(false);
    expect(button.getAttribute('aria-busy')).toBe('false');
    // The idle button's text is its label alone.
    expect(button.textContent).toBe('Load');
  });

  it('goes busy at once, disabled, with the spinner and the verb', () => {
    render(
      <BusyButton busy busyLabel="Opening…">
        Load
      </BusyButton>,
    );
    const button = screen.getByRole('button');
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.querySelector('[data-label]').getAttribute('data-label')).toBe('Opening…');
    expect(button.querySelector('[aria-hidden="true"]').textContent).toBe('Load');
  });

  it('holds the busy look at least 400 ms', () => {
    const { rerender } = render(
      <BusyButton busy busyLabel="Opening…">
        Load
      </BusyButton>,
    );
    rerender(<BusyButton busyLabel="Opening…">Load</BusyButton>);
    act(() => vi.advanceTimersByTime(399));
    expect(screen.getByRole('button').getAttribute('aria-busy')).toBe('true');
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole('button').getAttribute('aria-busy')).toBe('false');
  });

  it('renders its error inline beside it', () => {
    render(
      <BusyButton busyLabel="Opening…" error="This isn't a project file (.json) or archive (.apz).">
        Open
      </BusyButton>,
    );
    expect(screen.getByRole('alert').textContent).toMatch(/isn't a project file/);
  });
});

describe('Skeleton', () => {
  it('renders rows, fields and text, hidden from assistive tech', () => {
    const { container } = render(
      <Skeleton>
        <Skeleton.Row />
        <Skeleton.Field />
        <Skeleton.Text lines={3} />
      </Skeleton>,
    );
    const root = container.querySelector('[data-skeleton]');
    expect(root.getAttribute('aria-hidden')).toBe('true');
    expect(root.children.length).toBe(3);
    expect(root.lastChild.children.length).toBe(3);
  });
});
