/* @vitest-environment jsdom */
/**
 * The timing every loading state shares (§3 rule 5): nothing under the delay,
 * nothing that flickers off before it has been readable, and a timeline that
 * survives a placeholder being swapped for another mid-wait.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { afterPaint, useAfterPaint } from './afterPaint';
import { useDelayedFlag, usePresence } from './timing';
import { ceilingEditorDetail, countOf, formatCount, routeLabel, LOADING_COPY } from './loadingCopy';

const FAKE = { toFake: ['setTimeout', 'clearTimeout', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame'] };

function Flag({ active, ...options }) {
  const shown = useDelayedFlag(active, options);
  return <span data-testid="flag">{shown ? 'on' : 'off'}</span>;
}

function Presence({ present }) {
  const { mounted, leaving } = usePresence(present, 300);
  return <span data-testid="presence">{mounted ? (leaving ? 'leaving' : 'in') : 'gone'}</span>;
}

beforeEach(() => vi.useFakeTimers(FAKE));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useDelayedFlag', () => {
  it('stays off below the delay and turns on at it', () => {
    const { getByTestId } = render(<Flag active delayMs={300} />);
    act(() => vi.advanceTimersByTime(299));
    expect(getByTestId('flag').textContent).toBe('off');
    act(() => vi.advanceTimersByTime(1));
    expect(getByTestId('flag').textContent).toBe('on');
  });

  it('never shows a wait that ends before the delay', () => {
    const { getByTestId, rerender } = render(<Flag active delayMs={300} minVisibleMs={400} />);
    act(() => vi.advanceTimersByTime(200));
    rerender(<Flag active={false} delayMs={300} minVisibleMs={400} />);
    act(() => vi.advanceTimersByTime(1000));
    expect(getByTestId('flag').textContent).toBe('off');
  });

  it('holds for the minimum once shown, even when the wait ends at once', () => {
    const { getByTestId, rerender } = render(<Flag active delayMs={300} minVisibleMs={400} />);
    act(() => vi.advanceTimersByTime(300));
    rerender(<Flag active={false} delayMs={300} minVisibleMs={400} />);
    act(() => vi.advanceTimersByTime(399));
    expect(getByTestId('flag').textContent).toBe('on');
    act(() => vi.advanceTimersByTime(1));
    expect(getByTestId('flag').textContent).toBe('off');
  });

  it('measures the delay from `since`, so a remount mid-wait keeps the timeline', () => {
    const since = performance.now();
    act(() => vi.advanceTimersByTime(350));
    const { getByTestId } = render(<Flag active delayMs={300} since={since} />);
    // Already past the delay on the first render: no second wait.
    expect(getByTestId('flag').textContent).toBe('on');
  });
});

describe('usePresence', () => {
  it('keeps a leaving element for its fade, then drops it', () => {
    const { getByTestId, rerender } = render(<Presence present />);
    expect(getByTestId('presence').textContent).toBe('in');
    rerender(<Presence present={false} />);
    expect(getByTestId('presence').textContent).toBe('leaving');
    act(() => vi.advanceTimersByTime(300));
    expect(getByTestId('presence').textContent).toBe('gone');
  });
});

describe('afterPaint', () => {
  it('resolves after two animation frames', async () => {
    const done = vi.fn();
    afterPaint().then(done);
    await act(async () => {
      vi.advanceTimersToNextFrame();
    });
    expect(done).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersToNextFrame();
    });
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('runs a hook callback after paint, and not at all if unmounted first', async () => {
    const callback = vi.fn();
    function Probe() {
      useAfterPaint(callback, []);
      return null;
    }
    const first = render(<Probe />);
    first.unmount();
    render(<Probe />);
    await act(async () => {
      vi.advanceTimersToNextFrame();
      vi.advanceTimersToNextFrame();
    });
    expect(callback).toHaveBeenCalledTimes(1);
  });
});

describe('loading copy', () => {
  it('formats numbers with thousands separators and the real ellipsis', () => {
    expect(formatCount(2414)).toBe('2,414');
    expect(countOf(1, 'board')).toBe('1 board');
    expect(ceilingEditorDetail(38, 2414)).toBe('Laying out 38 boards and 2,414 screws');
    expect(routeLabel('/floorplan')).toBe('Opening the floor plan…');
    for (const value of Object.values(LOADING_COPY)) {
      if (typeof value !== 'string') continue;
      expect(value).not.toMatch(/\.\.\.|please|!/i);
    }
  });
});
