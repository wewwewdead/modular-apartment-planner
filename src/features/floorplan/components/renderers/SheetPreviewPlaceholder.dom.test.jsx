/* @vitest-environment jsdom */
/**
 * A sheet's 3D viewport while its image renders (§5.6): paper and the frame
 * first, words only past 300 ms, and the settled states in the same place.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import SheetPreviewPlaceholder from './SheetPreviewPlaceholder';

const BOUNDS = { minX: 0, minY: 0, maxX: 20000, maxY: 12000 };

function mount(status) {
  return render(
    <svg>
      <SheetPreviewPlaceholder bounds={BOUNDS} status={status} />
    </svg>,
  );
}

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('SheetPreviewPlaceholder', () => {
  it('draws paper and the frame at once, and words only from 300 ms', () => {
    const { container } = mount('loading');
    const root = container.querySelector('[data-loading-state]');
    expect(root.getAttribute('data-loading-state')).toBe('loading');
    expect(root.getAttribute('aria-busy')).toBe('true');
    expect(container.querySelectorAll('rect').length).toBeGreaterThanOrEqual(3);
    expect(container.querySelector('text')).toBeNull();
    act(() => vi.advanceTimersByTime(300));
    expect(container.querySelector('text').textContent).toBe('Rendering preview…');
  });

  it('keeps the error in the viewport, with its own words', () => {
    const { container } = mount('error');
    expect(container.querySelector('[data-loading-state]').getAttribute('aria-busy')).toBe('false');
    expect(container.querySelector('text').textContent).toBe('3D preview failed to render.');
  });
});
