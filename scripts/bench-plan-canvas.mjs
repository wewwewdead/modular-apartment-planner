/* global process, console, document, window, performance, requestAnimationFrame, setTimeout, PointerEvent, WheelEvent */
// Plan-canvas smoothness bench. Per style (presentation, drafting) and zoom
// (fitted, 20 notches in): a traced 60-frame pan (raster + paint + main-frame
// ms per frame), continuous-pan fps (median of three one-second runs),
// wheel-zoom main-thread ms per notch, and a fixture drag's settle time with
// the 3D preview visible and with the canvas focused. Writes
// artifacts/floorplan/perf/bench-<label>.json.
//   FLOORPLAN_BENCH_URL=http://localhost:5199/playground node scripts/bench-plan-canvas.mjs <label>
// Numbers from a dev server carry React's development overhead; bench the
// production build too (`npm run build && npx vite preview --port 5200`).
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const LABEL = process.argv[2] || 'run';
const OUT = 'artifacts/floorplan/perf';
await mkdir(OUT, { recursive: true });
const URL = `${process.env.FLOORPLAN_BENCH_URL || 'http://localhost:5199/playground'}?renderProfile=1`;
const CANVAS = 'svg[class*="_svg"]';
const ZOOMS = [0, 20]; // wheel notches from the fitted plan (×1.1 each)

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: [
    '--use-angle=d3d11',
    '--enable-gpu',
    '--ignore-gpu-blocklist',
    // Frames as fast as they can be made, so a frame's time is its work.
    '--disable-frame-rate-limit',
    '--disable-gpu-vsync',
  ],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const log = (...a) => console.log(...a);
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return {
    mean: +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(2),
    p95: +s[Math.floor(s.length * 0.95)].toFixed(2),
    max: +s[s.length - 1].toFixed(2),
  };
};
const clickLabel = async (label) => {
  const ok = await page.evaluate((l) => {
    const n = document.querySelector(`[aria-label="${l}"]`);
    n?.click();
    return Boolean(n);
  }, label);
  if (!ok) throw new Error(`no control ${label}`);
  await page.waitForTimeout(450);
};
const visibleCanvas = () =>
  page.evaluate(() => {
    const c = document.querySelector('svg[class*="_svg"]').parentElement.getBoundingClientRect();
    return { x: c.left, y: c.top, width: c.width, height: c.height };
  });
const planRect = () =>
  page.evaluate(() => {
    const boxes = [...document.querySelectorAll('[data-type="wall"]')].map((n) => n.getBoundingClientRect());
    const minX = Math.min(...boxes.map((b) => b.left));
    const minY = Math.min(...boxes.map((b) => b.top));
    const maxX = Math.max(...boxes.map((b) => b.right));
    const maxY = Math.max(...boxes.map((b) => b.bottom));
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  });

const wheel = (notches, cx, cy, settleAfter = true) =>
  page.evaluate(
    async ({ notches, cx, cy, settleAfter }) => {
      const svg = document.querySelector('svg[class*="_svg"]');
      const settle = () =>
        new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 0))));
      const samples = [];
      for (let i = 0; i < Math.abs(notches); i += 1) {
        const t0 = performance.now();
        svg.dispatchEvent(
          new WheelEvent('wheel', {
            bubbles: true,
            cancelable: true,
            clientX: cx,
            clientY: cy,
            deltaY: notches > 0 ? -100 : 100,
          }),
        );
        await settle();
        samples.push(performance.now() - t0);
      }
      // Past the zoom gesture's commit delay, so the store has caught up.
      if (settleAfter) await new Promise((r) => setTimeout(r, 260));
      return samples;
    },
    { notches, cx, cy, settleAfter },
  );
const middleDrag = (x0, y0, x1, y1) =>
  page.evaluate(
    async ({ x0, y0, x1, y1 }) => {
      const svg = document.querySelector('svg[class*="_svg"]');
      const ev = (x, y, buttons) => ({
        bubbles: true,
        clientX: x,
        clientY: y,
        button: 1,
        buttons,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
      });
      const settle = () =>
        new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 0))));
      svg.dispatchEvent(new PointerEvent('pointerdown', ev(x0, y0, 4)));
      await settle();
      svg.dispatchEvent(new PointerEvent('pointermove', ev(x1, y1, 4)));
      await settle();
      svg.dispatchEvent(new PointerEvent('pointerup', ev(x1, y1, 0)));
      window.dispatchEvent(new PointerEvent('pointerup', ev(x1, y1, 0)));
      await settle();
      await new Promise((r) => setTimeout(r, 60));
    },
    { x0, y0, x1, y1 },
  );
const fitPlan = async () => {
  const view = await visibleCanvas();
  const cx = view.x + view.width / 2;
  const cy = view.y + view.height / 2;
  for (let i = 0; i < 24; i += 1) {
    const plan = await planRect();
    const ratio = Math.max(plan.width / view.width, plan.height / view.height);
    if (ratio > 0.84 * 1.1) await wheel(-1, cx, cy);
    else if (ratio < 0.84 / 1.1) await wheel(1, cx, cy);
    else break;
  }
  const plan = await planRect();
  await middleDrag(plan.x + plan.width / 2, plan.y + plan.height / 2, cx, cy);
};
// 60 settled pan frames out and back (traced by the caller).
const settledPan = (cx, cy) =>
  page.evaluate(
    async ({ cx, cy }) => {
      const svg = document.querySelector('svg[class*="_svg"]');
      const ev = (x, y, buttons) => ({
        bubbles: true,
        clientX: x,
        clientY: y,
        button: 1,
        buttons,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
      });
      const settle = () =>
        new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 0))));
      window.__MAP_RENDER_PROFILE__?.reset?.();
      svg.dispatchEvent(new PointerEvent('pointerdown', ev(cx, cy, 4)));
      await settle();
      const samples = [];
      for (let i = 1; i <= 60; i += 1) {
        const k = i <= 30 ? i : 60 - i;
        const t0 = performance.now();
        svg.dispatchEvent(new PointerEvent('pointermove', ev(cx + k * 4, cy + k * 2, 4)));
        await settle();
        samples.push(performance.now() - t0);
      }
      svg.dispatchEvent(new PointerEvent('pointermove', ev(cx, cy, 4)));
      await settle();
      svg.dispatchEvent(new PointerEvent('pointerup', ev(cx, cy, 0)));
      window.dispatchEvent(new PointerEvent('pointerup', ev(cx, cy, 0)));
      await settle();
      const prof = window.__MAP_RENDER_PROFILE__?.snapshot?.() || [];
      const canvas = prof.find((r) => r.component === 'SvgCanvas');
      return { samples, commits: canvas?.commits ?? 0, commitMs: canvas?.avgActualMs ?? 0 };
    },
    { cx, cy },
  );
const continuousPan = (cx, cy, ms = 1000) =>
  page.evaluate(
    async ({ cx, cy, ms }) => {
      const svg = document.querySelector('svg[class*="_svg"]');
      const ev = (x, y, buttons) => ({
        bubbles: true,
        clientX: x,
        clientY: y,
        button: 1,
        buttons,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
      });
      const settle = () =>
        new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 0))));
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      svg.dispatchEvent(new PointerEvent('pointerdown', ev(cx, cy, 4)));
      await settle();
      let x = cx;
      let y = cy;
      let dir = 1;
      let frames = 0;
      const gaps = [];
      const start = performance.now();
      let last = start;
      while (performance.now() - start < ms) {
        x += dir * 3;
        y += dir * 1.5;
        if (x > cx + 120) dir = -1;
        if (x < cx - 120) dir = 1;
        svg.dispatchEvent(new PointerEvent('pointermove', ev(x, y, 4)));
        await frame();
        const now = performance.now();
        gaps.push(now - last);
        last = now;
        frames += 1;
      }
      svg.dispatchEvent(new PointerEvent('pointermove', ev(cx, cy, 4)));
      await settle();
      svg.dispatchEvent(new PointerEvent('pointerup', ev(cx, cy, 0)));
      window.dispatchEvent(new PointerEvent('pointerup', ev(cx, cy, 0)));
      await settle();
      gaps.sort((a, b) => a - b);
      return { fps: frames / (ms / 1000), p95: gaps[Math.floor(gaps.length * 0.95)] };
    },
    { cx, cy, ms },
  );
const dragAt = (x0, y0, dx, n = 20) =>
  page.evaluate(
    async ({ x0, y0, dx, n }) => {
      const svg = document.querySelector('svg[class*="_svg"]');
      const ev = (x, y, buttons) => ({
        bubbles: true,
        clientX: x,
        clientY: y,
        button: 0,
        buttons,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
      });
      const settle = () =>
        new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 0))));
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      svg.dispatchEvent(new PointerEvent('pointerdown', ev(x0, y0, 1)));
      await settle();
      const samples = [];
      for (let i = 1; i <= n; i += 1) {
        const t0 = performance.now();
        svg.dispatchEvent(new PointerEvent('pointermove', ev(x0 + (dx * i) / n, y0, 1)));
        await settle();
        samples.push(performance.now() - t0);
        await frame();
      }
      svg.dispatchEvent(new PointerEvent('pointerup', ev(x0 + dx, y0, 0)));
      window.dispatchEvent(new PointerEvent('pointerup', ev(x0 + dx, y0, 0)));
      await settle();
      return samples;
    },
    { x0, y0, dx, n },
  );
const traceSums = (buffer) => {
  const events = JSON.parse(buffer.toString()).traceEvents || [];
  let raster = 0;
  let paint = 0;
  let main = 0;
  for (const e of events) {
    if (e.ph !== 'X' || !e.dur) continue;
    if (e.name === 'RasterTask') raster += e.dur / 1000;
    else if (e.name === 'Paint') paint += e.dur / 1000;
    else if (e.name === 'ProxyMain::BeginMainFrame') main += e.dur / 1000;
  }
  return { raster, paint, main };
};
// The fixture standing clearest of every wall, and inside the visible canvas.
const clearFixture = () =>
  page.evaluate(() => {
    const canvas = document.querySelector('svg[class*="_svg"]').parentElement.getBoundingClientRect();
    const walls = [...document.querySelectorAll('[data-type="wall"]')].map((n) => n.getBoundingClientRect());
    const clearance = (b) =>
      Math.min(
        ...walls.map((w) =>
          Math.hypot(Math.max(w.left - b.x, 0, b.x - w.right), Math.max(w.top - b.y, 0, b.y - w.bottom)),
        ),
      );
    return [...document.querySelectorAll('[data-type="fixture"]')]
      .map((n) => {
        const r = n.getBoundingClientRect();
        return { id: n.getAttribute('data-id'), x: r.left + r.width / 2, y: r.top + r.height / 2 };
      })
      .filter((f) => f.x > canvas.left + 10 && f.x < canvas.right - 10 && f.y > canvas.top + 60 && f.y < canvas.bottom - 60)
      .sort((a, b) => clearance(b) - clearance(a))[0];
  });

const out = { label: LABEL, url: URL, pan: [], drag: {} };
try {
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForSelector(CANVAS, { timeout: 30000 });
  await page.waitForTimeout(800);
  await clickLabel('Auto-detect Rooms');
  await clickLabel('Hide Sidebar');
  await page.waitForTimeout(2600);

  // ── Fixture drag with the 3D preview visible (split view), then focused ──
  await fitPlan();
  let fixture = await clearFixture();
  const visible = [...(await dragAt(fixture.x, fixture.y, 60)), ...(await dragAt(fixture.x + 60, fixture.y, -60))];
  out.drag.previewVisible = stats(visible);
  log(`fixture drag, preview visible:  ${JSON.stringify(out.drag.previewVisible)}  (${fixture.id})`);

  await clickLabel('Hide Properties');
  await clickLabel('Focus canvas');
  await page.waitForTimeout(600);
  await fitPlan();
  fixture = await clearFixture();
  const focused = [...(await dragAt(fixture.x, fixture.y, 60)), ...(await dragAt(fixture.x + 60, fixture.y, -60))];
  out.drag.canvasFocused = stats(focused);
  log(`fixture drag, canvas focused:   ${JSON.stringify(out.drag.canvasFocused)}`);

  const view = await visibleCanvas();
  const cx = view.x + view.width / 2;
  const cy = view.y + view.height / 2;

  for (const style of ['presentation', 'drafting']) {
    const current = await page.locator(CANVAS).first().getAttribute('data-plan-style');
    if (current !== style) await clickLabel('Presentation style');
    for (const notches of ZOOMS) {
      await fitPlan();
      if (notches) await wheel(notches, cx, cy);
      await page.waitForTimeout(300);
      const zoom = await page.evaluate(() => (document.body.innerText.match(/Zoom:\s*(\d+%)/) || [])[1]);
      await browser.startTracing(page, {
        screenshots: false,
        categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'cc', 'blink'],
      });
      const settled = await settledPan(cx, cy);
      const sums = traceSums(await browser.stopTracing());
      const fpsRuns = [];
      const p95Runs = [];
      for (let r = 0; r < 3; r += 1) {
        const c = await continuousPan(cx, cy);
        fpsRuns.push(c.fps);
        p95Runs.push(c.p95);
      }
      const zoomSamples = [];
      for (let r = 0; r < 3; r += 1) {
        zoomSamples.push(...(await wheel(5, cx, cy, false)), ...(await wheel(-5, cx, cy, false)));
      }
      await page.waitForTimeout(300);
      const row = {
        style,
        notches,
        zoom,
        settleMs: stats(settled.samples),
        rasterMsPerFrame: +(sums.raster / 62).toFixed(2),
        paintMsPerFrame: +(sums.paint / 62).toFixed(2),
        mainFrameMsPerFrame: +(sums.main / 62).toFixed(2),
        commitsDuringPan: settled.commits,
        fps: +median(fpsRuns).toFixed(0),
        gapP95: +median(p95Runs).toFixed(1),
        zoomNotchMs: stats(zoomSamples),
      };
      out.pan.push(row);
      log(
        `${style.padEnd(12)} ${String(zoom).padStart(5)} | pan settle mean ${row.settleMs.mean} p95 ${row.settleMs.p95} | ` +
          `raster ${row.rasterMsPerFrame} paint ${row.paintMsPerFrame} mainframe ${row.mainFrameMsPerFrame} ms/frame | ` +
          `canvas commits ${row.commitsDuringPan} | continuous ${row.fps} fps (gap p95 ${row.gapP95}) | ` +
          `zoom notch mean ${row.zoomNotchMs.mean} p95 ${row.zoomNotchMs.p95} max ${row.zoomNotchMs.max}`,
      );
    }
  }
  await writeFile(`${OUT}/bench-${LABEL}.json`, JSON.stringify(out, null, 2));
  log(`written ${OUT}/bench-${LABEL}.json`);
} catch (e) {
  log('BENCH ERROR:', e?.stack || e);
  process.exitCode = 1;
} finally {
  log('page errors:', errors.length ? `${errors.length} (${[...new Set(errors)].join(' | ')})` : 'none');
  await browser.close();
}
