/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import LoadingBar from './LoadingBar';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(process.cwd(), 'src/ui/loading/LoadingBar.module.css'), 'utf8');

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const bar = (container) => container.querySelector('[data-loading-bar]');

describe('LoadingBar', () => {
  it('answers at once by default — the one element with no delay', () => {
    const { container } = render(<LoadingBar />);
    expect(bar(container)).toBeTruthy();
    expect(bar(container).getAttribute('data-placement')).toBe('viewport');
    // Decorative: the words belong to the status, not to the bar.
    expect(bar(container).getAttribute('aria-hidden')).toBe('true');
  });

  it('can wait out a delay and sit in a region', () => {
    const { container } = render(<LoadingBar placement="region" delayMs={150} />);
    expect(bar(container)).toBeNull();
    act(() => vi.advanceTimersByTime(150));
    expect(bar(container).getAttribute('data-placement')).toBe('region');
  });

  it('fades out rather than cutting, then leaves', () => {
    const { container, rerender } = render(<LoadingBar active />);
    rerender(<LoadingBar active={false} />);
    expect(bar(container).getAttribute('data-leaving')).toBe('true');
    act(() => vi.advanceTimersByTime(300));
    expect(bar(container)).toBeNull();
  });

  it('keeps a reduced-motion rule that leaves it a static band', () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*width: 100%/);
  });
});
