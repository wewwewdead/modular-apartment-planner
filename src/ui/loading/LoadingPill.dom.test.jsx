/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import LoadingPill from './LoadingPill';

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const words = () => screen.getByRole('status').getAttribute('data-words');

describe('LoadingPill', () => {
  it('is a polite live region from the start, but shows its words only after the delay', () => {
    render(<LoadingPill label="Reading plan.json…" />);
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toContain('Reading plan.json…');
    // Scheduled: due by CSS at the delay, marked shown once the timer agrees.
    expect(words()).toBe('scheduled');
    act(() => vi.advanceTimersByTime(300));
    expect(words()).toBe('shown');
  });

  it('leaves at once when the wait ends unseen', () => {
    const { rerender } = render(<LoadingPill label="Opening…" />);
    act(() => vi.advanceTimersByTime(100));
    rerender(<LoadingPill active={false} label="Opening…" />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('stays at least 400 ms once its words have appeared', () => {
    const { rerender } = render(<LoadingPill label="Opening…" />);
    act(() => vi.advanceTimersByTime(300));
    rerender(<LoadingPill active={false} label="Opening…" />);
    act(() => vi.advanceTimersByTime(399));
    expect(words()).toBe('shown');
    act(() => vi.advanceTimersByTime(1));
    expect(words()).toBe('hidden');
    act(() => vi.advanceTimersByTime(300));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('adds the detail line from 2 s, or at once when asked', () => {
    const { rerender } = render(<LoadingPill label="Building the model…" detail="Compiling materials for 3 floors" />);
    expect(screen.queryByText('Compiling materials for 3 floors')).toBeNull();
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByText('Compiling materials for 3 floors')).toBeTruthy();
    rerender(<LoadingPill label="x" detail="y" showDetail />);
    expect(screen.getByText('y')).toBeTruthy();
  });

  it('admits a long wait at 10 s and offers the way out', () => {
    const onClick = vi.fn();
    render(<LoadingPill label="Reading plan.json…" action={{ label: 'Cancel', onClick }} />);
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    act(() => vi.advanceTimersByTime(10000));
    expect(screen.getByText('This is taking longer than expected.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
