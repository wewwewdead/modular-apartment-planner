import { describe, expect, it } from 'vitest';
import {
  FRAME_ACTION,
  REFINE_PRESIZE_LEAD_MS,
  REFINE_QUIET_PERIOD_MS,
  nextFrameAction,
  shouldPresizeRefine,
  wantsAnotherFrame,
} from './refineSchedule';

const frame = (overrides) =>
  nextFrameAction({ moved: false, sceneDirty: false, converged: false, nowMs: 1000, lastMovementMs: 0, ...overrides });

describe('nextFrameAction', () => {
  it('draws an interactive frame whenever the camera moved', () => {
    expect(frame({ moved: true })).toBe(FRAME_ACTION.INTERACTIVE);
  });

  it('draws an interactive frame when something other than the camera changed', () => {
    expect(frame({ sceneDirty: true })).toBe(FRAME_ACTION.INTERACTIVE);
  });

  it('prefers an interactive frame over refining, even when converged', () => {
    expect(frame({ moved: true, converged: true })).toBe(FRAME_ACTION.INTERACTIVE);
  });

  it('goes idle once converged and still', () => {
    expect(frame({ converged: true })).toBe(FRAME_ACTION.IDLE);
  });

  it('holds the frame while the camera has only just stopped', () => {
    expect(frame({ nowMs: 1000, lastMovementMs: 1000 })).toBe(FRAME_ACTION.SETTLE);
    expect(frame({ nowMs: 1000, lastMovementMs: 1000 - (REFINE_QUIET_PERIOD_MS - 1) })).toBe(FRAME_ACTION.SETTLE);
  });

  it('starts refining once the quiet period has elapsed', () => {
    expect(frame({ nowMs: 1000, lastMovementMs: 1000 - REFINE_QUIET_PERIOD_MS })).toBe(FRAME_ACTION.REFINE);
    expect(frame({ nowMs: 5000, lastMovementMs: 0 })).toBe(FRAME_ACTION.REFINE);
  });

  it('never strands the preview when the clock runs backwards', () => {
    // A negative "still for" would otherwise compare below the quiet period
    // forever and the image would never resolve.
    expect(frame({ nowMs: 500, lastMovementMs: 900 })).toBe(FRAME_ACTION.REFINE);
  });
});

describe('a burst of wheel events', () => {
  /**
   * The case this module exists for. Wheel ticks arrive every ~60 ms; each one
   * moves the camera and resets the accumulation. Refining between them meant
   * the picture softened part-way and then snapped back, over and over.
   */
  it('never refines between wheel ticks', () => {
    const tickIntervalMs = 60;
    let lastMovementMs = 0;
    const actions = [];

    for (let tick = 0; tick < 6; tick += 1) {
      const tickAt = tick * tickIntervalMs;
      actions.push(
        nextFrameAction({ moved: true, sceneDirty: false, converged: false, nowMs: tickAt, lastMovementMs }),
      );
      lastMovementMs = tickAt;
      // Every animation frame in the gap before the next tick.
      for (let offset = 16; offset < tickIntervalMs; offset += 16) {
        actions.push(
          nextFrameAction({
            moved: false,
            sceneDirty: false,
            converged: false,
            nowMs: tickAt + offset,
            lastMovementMs,
          }),
        );
      }
    }

    expect(actions).not.toContain(FRAME_ACTION.REFINE);
    expect(new Set(actions)).toEqual(new Set([FRAME_ACTION.INTERACTIVE, FRAME_ACTION.SETTLE]));
  });

  it('refines as soon as the scrolling actually stops', () => {
    const lastMovementMs = 300;
    expect(
      nextFrameAction({
        moved: false,
        sceneDirty: false,
        converged: false,
        nowMs: 300 + REFINE_QUIET_PERIOD_MS,
        lastMovementMs,
      }),
    ).toBe(FRAME_ACTION.REFINE);
  });

  it('waits longer than the gap between wheel events', () => {
    // If the quiet period ever drops below a typical wheel cadence the flicker
    // comes straight back.
    expect(REFINE_QUIET_PERIOD_MS).toBeGreaterThan(100);
  });
});

describe('shouldPresizeRefine', () => {
  const presize = (overrides) =>
    shouldPresizeRefine({ action: FRAME_ACTION.SETTLE, nowMs: 1000, lastMovementMs: 1000, ...overrides });

  it('never fires on a frame that draws', () => {
    for (const action of [FRAME_ACTION.INTERACTIVE, FRAME_ACTION.REFINE, FRAME_ACTION.IDLE]) {
      expect(presize({ action, lastMovementMs: 0 })).toBe(false);
    }
  });

  it('leaves a momentary pause mid-gesture alone', () => {
    // The whole point of not doing this on the first settle frame: a pause this
    // short is about to be followed by another interactive frame, which would
    // immediately size the chain back down again.
    expect(presize({ lastMovementMs: 1000 })).toBe(false);
    expect(presize({ lastMovementMs: 1000 - 20 })).toBe(false);
  });

  it('fires in the last stretch before the refine starts', () => {
    expect(presize({ lastMovementMs: 1000 - (REFINE_QUIET_PERIOD_MS - REFINE_PRESIZE_LEAD_MS) })).toBe(true);
    expect(presize({ lastMovementMs: 1000 - (REFINE_QUIET_PERIOD_MS - 1) })).toBe(true);
  });

  it('leaves enough lead for a frame to land inside it at 30 fps', () => {
    // A window shorter than a frame would be stepped straight over and the
    // first refine sample would pay for the resize after all.
    expect(REFINE_PRESIZE_LEAD_MS).toBeGreaterThan(1000 / 30);
    expect(REFINE_PRESIZE_LEAD_MS).toBeLessThan(REFINE_QUIET_PERIOD_MS);
  });
});

describe('wantsAnotherFrame', () => {
  it('keeps the loop alive for everything except idle', () => {
    expect(wantsAnotherFrame(FRAME_ACTION.INTERACTIVE)).toBe(true);
    expect(wantsAnotherFrame(FRAME_ACTION.SETTLE)).toBe(true);
    expect(wantsAnotherFrame(FRAME_ACTION.REFINE)).toBe(true);
    expect(wantsAnotherFrame(FRAME_ACTION.IDLE)).toBe(false);
  });

  it('keeps asking for frames through a settle, or the refine would never start', () => {
    // SETTLE draws nothing. If it also stopped the loop, the preview would sit
    // on an unrefined frame until the next unrelated event woke it up.
    expect(wantsAnotherFrame(FRAME_ACTION.SETTLE)).toBe(true);
  });
});
