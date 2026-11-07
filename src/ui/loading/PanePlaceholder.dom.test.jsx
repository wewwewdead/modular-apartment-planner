/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import PanePlaceholder from './PanePlaceholder';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(process.cwd(), 'src/ui/loading/PanePlaceholder.module.css'), 'utf8');

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const root = (container) => container.querySelector('[data-loading-state]');

describe('PanePlaceholder', () => {
  it('is busy paper first, and words only from 300 ms', () => {
    const { container } = render(
      <PanePlaceholder label="Preparing live preview…" tone="dark" data-preview-pane="ceiling" />,
    );
    const pane = root(container);
    expect(pane.getAttribute('aria-busy')).toBe('true');
    expect(pane.getAttribute('data-loading-state')).toBe('loading');
    expect(pane.getAttribute('data-tone')).toBe('dark');
    expect(pane.getAttribute('data-preview-pane')).toBe('ceiling');
    expect(screen.getByRole('status').getAttribute('data-words')).toBe('scheduled');
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByRole('status').getAttribute('data-words')).toBe('shown');
    // Exactly one live region per region.
    expect(container.querySelectorAll('[aria-live]').length).toBe(1);
  });

  it('draws the caller’s silhouette as inline SVG', () => {
    const { container } = render(
      <PanePlaceholder label="x" silhouette={{ viewBox: '0 0 100 50', children: <rect width="100" height="50" /> }} />,
    );
    const svg = container.querySelector('svg');
    expect(svg.getAttribute('viewBox')).toBe('0 0 100 50');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.querySelector('rect')).toBeTruthy();
  });

  it('reports its phase for scripts', () => {
    const { container, rerender } = render(<PanePlaceholder label="a" state="loading" />);
    rerender(<PanePlaceholder label="b" state="compiling" />);
    expect(root(container).getAttribute('data-loading-state')).toBe('compiling');
  });

  it('takes the error in the same place, with a retry and a way back', () => {
    const onRetry = vi.fn();
    const onBack = vi.fn();
    const { container } = render(
      <PanePlaceholder state="error" error={{ message: 'The preview could not start.', onRetry, onBack }} />,
    );
    expect(root(container).getAttribute('aria-busy')).toBe('false');
    expect(screen.getByRole('alert').textContent).toContain('The preview could not start.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('crossfades out when the content has arrived, then unmounts', () => {
    const { container, rerender } = render(<PanePlaceholder label="x" overlay />);
    rerender(<PanePlaceholder label="x" overlay active={false} />);
    expect(root(container).getAttribute('data-leaving')).toBe('true');
    expect(root(container).getAttribute('aria-busy')).toBe('false');
    act(() => vi.advanceTimersByTime(300));
    expect(root(container)).toBeNull();
  });

  it('holds its breathing outline still under reduced motion', () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*\.silhouette[\s\S]*animation: none/);
    expect(css).toMatch(/paneBreathe 2\.4s/);
  });
});
