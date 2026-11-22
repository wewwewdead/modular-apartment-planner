import { describe, expect, it } from 'vitest';
import { RESIZE_SETTLE_MS, createResizeCoalescer } from './resizeCoalescer';

/** A clock and a timer queue the test moves by hand. */
function harness() {
  let time = 0;
  let nextId = 1;
  const timers = new Map();
  const applied = [];
  const coalescer = createResizeCoalescer({
    apply: () => applied.push(time),
    now: () => time,
    setTimer: (callback, delay) => {
      const id = nextId;
      nextId += 1;
      timers.set(id, { at: time + delay, callback });
      return id;
    },
    clearTimer: (id) => timers.delete(id),
  });
  const advance = (ms) => {
    const until = time + ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      time = due[1].at;
      due[1].callback();
    }
    time = until;
  };
  return { coalescer, applied, advance };
}

describe('createResizeCoalescer', () => {
  it('applies a lone resize at once', () => {
    const { coalescer, applied } = harness();
    coalescer.request();
    expect(applied).toEqual([0]);
    expect(coalescer.pending).toBe(false);
  });

  it('turns a splitter drag into two resizes: the first, and one once it settles', () => {
    const { coalescer, applied, advance } = harness();
    // Sixty frames of dragging, one callback each.
    for (let frame = 0; frame < 60; frame += 1) {
      coalescer.request();
      advance(16);
    }
    expect(applied).toEqual([0]);
    expect(coalescer.pending).toBe(true);
    advance(RESIZE_SETTLE_MS);
    expect(applied.length).toBe(2);
    // Landed a settle period after the last callback, not before.
    expect(applied[1]).toBe(59 * 16 + RESIZE_SETTLE_MS);
  });

  it('applies the first resize of a later burst at once again', () => {
    const { coalescer, applied, advance } = harness();
    coalescer.request();
    advance(500);
    coalescer.request();
    expect(applied).toEqual([0, 500]);
  });

  it('defers a second resize that follows the first too closely', () => {
    const { coalescer, applied, advance } = harness();
    coalescer.request();
    advance(40);
    coalescer.request();
    expect(applied).toEqual([0]);
    advance(RESIZE_SETTLE_MS);
    expect(applied).toEqual([0, 40 + RESIZE_SETTLE_MS]);
  });

  it('drops a waiting resize when cancelled', () => {
    const { coalescer, applied, advance } = harness();
    coalescer.request();
    advance(10);
    coalescer.request();
    coalescer.cancel();
    advance(1000);
    expect(applied).toEqual([0]);
  });
});
