import { describe, expect, it } from 'vitest';
import { FRAME_ACTION } from './refineSchedule';
import {
  INTERACTIVE_SCALE_LADDER,
  STEP_UP_WAIT_CAP,
  STEP_UP_WAIT_GESTURES,
  createRenderScaleGovernor,
  stepDownRung,
} from './renderScaleGovernor';

/*
 * The governor driven by hand-written frame traces, the way the render loop
 * drives it: every animation frame is reported with its timestamp and what it
 * did, in order, and the scale it reports is the one that frame is drawn at.
 *
 * `simulate` stands in for a display and a GPU. A moving frame costs
 * `costMs × scale²` of GPU time (the pixels are the cost), and the next frame
 * arrives on the first vsync after the work is done — which is what Chrome's
 * frame scheduling does with a GPU that is behind. Frames that draw nothing
 * land on the next vsync.
 */
const HZ_60 = 1000 / 60;
const HZ_144 = 1000 / 144;

function createSim({ refreshMs = HZ_60, costMs = 5, submitMs = 2, warm = true } = {}) {
  const governor = createRenderScaleGovernor();
  const log = [];
  let t = 1000;
  let continuous = false;
  let lastDrawMs = 0;

  const vsyncAfter = (ms) => Math.max(1, Math.ceil(ms / refreshMs - 1e-9)) * refreshMs;

  const sim = {
    governor,
    log,
    get t() {
      return t;
    },
    set costMs(value) {
      costMs = value;
    },
    /** Report one frame at the current time and advance by `advanceMs`. */
    frame(action, { sceneDirty = false, advanceMs, gapOverride, submit = submitMs } = {}) {
      const changed = governor.frame({ timestampMs: t, action, sceneDirty, continuous, submitMs: lastDrawMs });
      const scale = governor.scale;
      log.push({ t, action, scale, occlusion: governor.occlusion, changed });
      continuous = true;
      const draws = action === FRAME_ACTION.INTERACTIVE || action === FRAME_ACTION.REFINE;
      lastDrawMs = draws ? submit : 0;
      const gpu = draws ? costMs * scale * scale : 0;
      t += gapOverride ?? advanceMs ?? vsyncAfter(Math.max(gpu, submit * (draws ? 1 : 0)));
      return scale;
    },
    /** A camera gesture of `frames` moving frames. */
    gesture(frames, options = {}) {
      for (let i = 0; i < frames; i += 1) {
        const gapOverride = options.gaps?.[i];
        sim.frame(FRAME_ACTION.INTERACTIVE, { ...options, gapOverride });
      }
    },
    /** The quiet period, a short refine, then the loop stops. */
    rest({ settle = 11, refine = 6 } = {}) {
      for (let i = 0; i < settle; i += 1) sim.frame(FRAME_ACTION.SETTLE);
      for (let i = 0; i < refine; i += 1) sim.frame(FRAME_ACTION.REFINE);
      sim.frame(FRAME_ACTION.IDLE);
      sim.stop();
    },
    /** The loop stops; the next frame starts a new chain. */
    stop(idleMs = 800) {
      continuous = false;
      t += idleMs;
    },
    scales: () => log.map((entry) => entry.scale),
    interactiveScales: () => log.filter((e) => e.action === FRAME_ACTION.INTERACTIVE).map((e) => e.scale),
  };
  // The first world: one frame, the quiet period, a refine. What tells the
  // governor how fast the display is before anyone has touched the camera.
  if (warm) {
    sim.frame(FRAME_ACTION.INTERACTIVE, { sceneDirty: true });
    sim.rest();
  }
  return sim;
}

/** A session of `count` orbits of `frames` frames, each followed by a rest. */
function orbit(sim, count, frames = 90, options) {
  for (let i = 0; i < count; i += 1) {
    sim.gesture(frames, options);
    sim.rest();
  }
}

describe('stepDownRung', () => {
  it('steps far enough that the predicted mean lands within 16 ms, at least one rung', () => {
    // 33 ms at 1.0: 0.85 predicts 24, 0.7 predicts 16.2, 0.58 predicts 11.1.
    expect(INTERACTIVE_SCALE_LADDER[stepDownRung(0, 33.3)]).toBe(0.58);
    // Barely over: one rung, never zero.
    expect(stepDownRung(0, 18.6)).toBe(1);
    // Hopeless: the bottom scale rung, not past it — occlusion is judged there.
    expect(INTERACTIVE_SCALE_LADDER[stepDownRung(0, 200)]).toBe(0.5);
    expect(stepDownRung(0, 200)).toBe(INTERACTIVE_SCALE_LADDER.length - 1);
    // From the bottom scale rung the next step is the one without occlusion.
    expect(stepDownRung(INTERACTIVE_SCALE_LADDER.length - 1, 30)).toBe(INTERACTIVE_SCALE_LADDER.length);
  });
});

describe('render scale governor', () => {
  it('never engages on a machine holding 60 fps', () => {
    const sim = createSim({ costMs: 9 });
    orbit(sim, 40);
    expect(new Set(sim.scales())).toEqual(new Set([1]));
    expect(sim.log.every((entry) => entry.occlusion)).toBe(true);
    expect(sim.governor.snapshot().changes).toBe(0);
  });

  it('never engages at a GPU cost right at the edge of the frame', () => {
    // 16.5 ms of work still lands on the next vsync every time.
    const sim = createSim({ costMs: 16.5 });
    orbit(sim, 40);
    expect(sim.governor.snapshot().changes).toBe(0);
  });

  it('does not step down for a long task in the middle of a 60 fps run', () => {
    const sim = createSim({ costMs: 9 });
    const gaps = [];
    gaps[45] = 250; // one garbage collection, one React commit
    for (let i = 0; i < 20; i += 1) {
      sim.gesture(120, { gaps });
      sim.rest();
    }
    expect(sim.governor.snapshot().changes).toBe(0);
  });

  it('does not step down for two long tasks inside one window either', () => {
    const sim = createSim({ costMs: 9 });
    const gaps = [];
    gaps[30] = 120;
    gaps[40] = 90;
    orbit(sim, 10, 120, { gaps });
    expect(sim.governor.snapshot().changes).toBe(0);
  });

  it('steps a steady 30 fps orbit down mid-gesture, once a full window of it is over budget', () => {
    const sim = createSim({ costMs: 30 });
    sim.gesture(200);
    const scales = sim.interactiveScales();
    // Never on the strength of a single frame or a short run.
    expect(scales.slice(0, 20).every((scale) => scale === 1)).toBe(true);
    // 33.3 ms at 1.0 → 0.58 is the first rung predicted inside 16 ms.
    expect(scales[scales.length - 1]).toBe(0.58);
    // And once there, it holds for the rest of the gesture.
    const firstChange = scales.findIndex((scale) => scale !== 1);
    expect(firstChange).toBeGreaterThanOrEqual(20);
    expect(scales.slice(firstChange).every((scale) => scale === 0.58)).toBe(true);
  });

  it('decides at a gesture start from the window earlier gestures left, not mid-gesture from a part-filled one', () => {
    const sim = createSim({ costMs: 30 });
    // Short orbits, each too short to fill a window on its own.
    for (let i = 0; i < 6; i += 1) {
      sim.gesture(12);
      sim.rest();
    }
    const changes = sim.log.filter((entry) => entry.changed);
    expect(changes.length).toBe(1);
    // The one change landed on the first frame of a gesture.
    const index = sim.log.indexOf(changes[0]);
    expect(sim.log[index].action).toBe(FRAME_ACTION.INTERACTIVE);
    expect(sim.log[index - 1].action).not.toBe(FRAME_ACTION.INTERACTIVE);
  });

  it('holds on a 144 Hz panel running at 72 fps, and on one holding 144', () => {
    const at72 = createSim({ refreshMs: HZ_144, costMs: 13 });
    orbit(at72, 20);
    expect(at72.governor.snapshot().changes).toBe(0);

    const at144 = createSim({ refreshMs: HZ_144, costMs: 4 });
    orbit(at144, 20);
    expect(at144.governor.snapshot().changes).toBe(0);
  });

  it('steps down on a 144 Hz panel that is really getting 40 fps', () => {
    const sim = createSim({ refreshMs: HZ_144, costMs: 24 });
    orbit(sim, 3, 120);
    expect(sim.governor.scale).toBeLessThan(1);
  });

  it('does not chase a display that cannot show 60 fps at all', () => {
    // A 50 Hz panel, and Chrome capping animation frames at 30.
    for (const refreshMs of [20, 1000 / 30]) {
      const sim = createSim({ refreshMs, costMs: 5 });
      orbit(sim, 20);
      expect(sim.governor.snapshot().changes).toBe(0);
    }
  });

  it('judges nothing before it has seen the display interval', () => {
    // No quiet period yet, so a 20 ms gap could be a 50 Hz panel.
    const sim = createSim({ costMs: 30, warm: false });
    sim.gesture(200);
    expect(sim.governor.snapshot().changes).toBe(0);
    // The first quiet period settles it.
    sim.rest();
    sim.gesture(60);
    expect(sim.governor.scale).toBe(0.58);
  });

  it('leaves a frame bound by main-thread submission to the occlusion hysteresis', () => {
    // 30 ms of draw-call submission: the gaps are long, and no resolution helps.
    const sim = createSim({ costMs: 5, submitMs: 30 });
    orbit(sim, 10, 120);
    expect(sim.governor.snapshot().changes).toBe(0);
  });

  it('ignores scene-dirty frames, which are a rebuild rather than GPU load', () => {
    const sim = createSim({ costMs: 5 });
    for (let i = 0; i < 6; i += 1) {
      sim.gesture(120, { sceneDirty: true, advanceMs: 40 });
      sim.rest();
    }
    expect(sim.governor.snapshot().changes).toBe(0);
  });

  it('ignores gaps across a break in the loop', () => {
    const sim = createSim({ costMs: 5 });
    for (let i = 0; i < 60; i += 1) {
      sim.frame(FRAME_ACTION.INTERACTIVE);
      sim.stop(40);
    }
    expect(sim.governor.snapshot().changes).toBe(0);
    expect(sim.governor.snapshot().windowFrames).toBe(0);
  });

  it('drops occlusion only at the bottom scale, still over budget, and gives it back first', () => {
    const sim = createSim({ costMs: 120 });
    orbit(sim, 4, 150);
    expect(sim.governor.scale).toBe(0.5);
    expect(sim.governor.occlusion).toBe(false);
    // Occlusion never went before the scale reached the bottom.
    for (const entry of sim.log) {
      if (!entry.occlusion) expect(entry.scale).toBe(0.5);
    }

    // The model gets lighter; the first step back up restores occlusion at the
    // same scale.
    sim.costMs = 3;
    const before = sim.log.length;
    orbit(sim, STEP_UP_WAIT_GESTURES + 2, 90);
    const firstUp = sim.log.slice(before).find((entry) => entry.changed);
    expect(firstUp).toMatchObject({ scale: 0.5, occlusion: true });
  });

  it('steps back up by trial, and doubles the wait after a failed one up to the cap', () => {
    // 30 ms at 1.0: 0.58 and 0.7 hold 60 fps, 0.85 (21.7 ms) does not.
    const sim = createSim({ costMs: 30 });
    orbit(sim, 2, 120);
    expect(sim.governor.scale).toBe(0.58);

    orbit(sim, STEP_UP_WAIT_GESTURES + 1, 120);
    // The trial at 0.7 succeeded and stuck.
    expect(sim.governor.scale).toBe(0.7);

    const settledAt = sim.log.length;
    orbit(sim, 60, 120);
    // Every trial of 0.85 failed and came back: never 1, and the wait capped.
    expect(sim.scales().slice(settledAt)).not.toContain(1);
    expect(sim.governor.scale).toBe(0.7);
    expect(sim.governor.snapshot().wait).toBe(STEP_UP_WAIT_CAP);
    const trials = sim.log.filter((entry) => entry.changed && entry.scale === 0.85).length;
    // 3, 6, 12, 24, 24 … gestures apart: a handful, not one every few orbits.
    expect(trials).toBeGreaterThan(2);
    expect(trials).toBeLessThan(8);
  });

  it('starts the wait again when the canvas is resized or the world replaced', () => {
    const sim = createSim({ costMs: 30 });
    orbit(sim, 40, 120);
    expect(sim.governor.snapshot().wait).toBeGreaterThan(STEP_UP_WAIT_GESTURES);
    const scale = sim.governor.scale;
    sim.governor.reset();
    expect(sim.governor.snapshot().wait).toBe(STEP_UP_WAIT_GESTURES);
    expect(sim.governor.snapshot().windowFrames).toBe(0);
    // The rung is kept: a resize is not a reason to forget it.
    expect(sim.governor.scale).toBe(scale);
  });

  it('governs a walk, one long gesture with the loop held open', () => {
    const sim = createSim({ costMs: 30 });
    // Standing still first: the loop keeps running on IDLE frames.
    for (let i = 0; i < 30; i += 1) sim.frame(FRAME_ACTION.IDLE);
    sim.gesture(400);
    for (let i = 0; i < 30; i += 1) sim.frame(FRAME_ACTION.SETTLE);
    for (let i = 0; i < 12; i += 1) sim.frame(FRAME_ACTION.REFINE);
    for (let i = 0; i < 30; i += 1) sim.frame(FRAME_ACTION.IDLE);
    expect(sim.governor.scale).toBe(0.58);
    // One mid-walk change, not one per window.
    expect(sim.log.filter((entry) => entry.changed).length).toBe(1);
    // The idle frames told it the display runs at 60.
    expect(sim.governor.snapshot().refreshMs).toBeCloseTo(HZ_60, 1);
  });

  it('reports the gap between two refine frames drawn back to back, and only that', () => {
    const governor = createRenderScaleGovernor();
    governor.frame({ timestampMs: 0, action: FRAME_ACTION.SETTLE, continuous: false });
    governor.frame({ timestampMs: 16, action: FRAME_ACTION.REFINE });
    expect(governor.refineGapMs).toBe(null);
    governor.frame({ timestampMs: 41, action: FRAME_ACTION.REFINE });
    expect(governor.refineGapMs).toBe(25);
    governor.frame({ timestampMs: 300, action: FRAME_ACTION.REFINE, continuous: false });
    expect(governor.refineGapMs).toBe(null);
  });
});
