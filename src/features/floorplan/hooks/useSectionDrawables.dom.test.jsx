/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';

/*
 * A hidden-line job that throws must not leave the view "loading" forever: the
 * hook says it failed, and a later reader starts the job again rather than
 * stepping the broken one on.
 */

const visibility = vi.hoisted(() => ({ createdJobs: 0, throwing: true }));

vi.mock('@/sections/visibility', () => ({
  peekVisibleSectionDrawables: () => undefined,
  getVisibleSectionDrawables: () => [],
  createSectionVisibilityJob: () => {
    visibility.createdJobs += 1;
    return {
      step() {
        if (visibility.throwing) throw new Error('polygon difference failed');
        return { done: true };
      },
    };
  },
}));

const { useVisibleDrawables } = await import('./useSectionDrawables');

let consoleError;

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  visibility.createdJobs = 0;
  visibility.throwing = true;
});

describe('a hidden-line job that throws', () => {
  it('ends in the failed state instead of loading forever', async () => {
    const scene = { id: 'scene' };
    const { result } = renderHook(() => useVisibleDrawables('section', scene, { deferred: true, viewKey: 'a' }));
    expect(result.current.status).toBe('loading');

    await waitFor(() => expect(result.current.status).toBe('failed'));
    expect(result.current.drawables).toBeNull();
    // Said once, where a developer will see it, rather than lost.
    expect(consoleError).toHaveBeenCalledWith('The hidden-line pass failed:', expect.any(Error));
  });

  it('starts the job afresh for the next reader of the same scene', async () => {
    const scene = { id: 'scene' };
    const first = renderHook(() => useVisibleDrawables('section', scene, { deferred: true, viewKey: 'a' }));
    await waitFor(() => expect(first.result.current.status).toBe('failed'));
    first.unmount();
    const jobsBefore = visibility.createdJobs;

    renderHook(() => useVisibleDrawables('section', scene, { deferred: true, viewKey: 'a' }));
    await waitFor(() => expect(visibility.createdJobs).toBe(jobsBefore + 1));
  });
});
