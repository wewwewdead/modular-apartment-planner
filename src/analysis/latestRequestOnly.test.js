import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleLatestRequestOnly } from './latestRequestOnly';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('handleLatestRequestOnly', () => {
  it('solves a lone request', () => {
    const solve = vi.fn();
    const onmessage = handleLatestRequestOnly(solve);
    onmessage({ data: { id: 1, value: 'a' } });
    expect(solve).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(solve).toHaveBeenCalledWith({ id: 1, value: 'a' });
  });

  it('skips requests a newer one overtook before their solve began', () => {
    const solve = vi.fn();
    const onmessage = handleLatestRequestOnly(solve);
    // Three posts queued behind a running solve arrive back to back.
    onmessage({ data: { id: 2 } });
    onmessage({ data: { id: 3 } });
    onmessage({ data: { id: 4 } });
    vi.runAllTimers();
    expect(solve).toHaveBeenCalledTimes(1);
    expect(solve).toHaveBeenCalledWith({ id: 4 });
  });

  it('solves each request that arrives after the previous one started', () => {
    const solve = vi.fn();
    const onmessage = handleLatestRequestOnly(solve);
    onmessage({ data: { id: 5 } });
    vi.runAllTimers();
    onmessage({ data: { id: 6 } });
    vi.runAllTimers();
    expect(solve.mock.calls.map(([request]) => request.id)).toEqual([5, 6]);
  });
});
