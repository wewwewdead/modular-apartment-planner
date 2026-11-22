/* global process, console, document, window, performance, requestAnimationFrame, setTimeout, PointerEvent */
// A4: a fixture drag on the playground (3 floors, 2 with content, a truss and a
// roof) with the 3D preview visible; reads the previewPerf rebuild ring.
//   node probe-drag.mjs <label>
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
const require = createRequire('C:/Users/johnm/modular apartment planner/package.json');
const { chromium } = require('@playwright/test');
const LABEL = process.argv[2] || 'drag';
const OUT = `C:/Users/johnm/AppData/Local/Temp/claude/C--Users-johnm-modular-apartment-planner/2dc0ba0d-1201-453e-8699-67d6aa73231e/scratchpad/d1/drag-${LABEL}.json`;
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const ua =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) modular-apartment-planner/1.0.0 Chrome/140.0.0.0 Electron/43.0.0 Safari/537.36';
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, userAgent: ua });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => window.localStorage.setItem('previewPerf', '1'));
await page.goto('http://localhost:5184/playground', { waitUntil: 'networkidle' });
await page.waitForSelector('svg[class*="_svg"]', { timeout: 30000 });
await page.waitForTimeout(4000);
const perf = (src) => page.evaluate((s) => new Function('perf', `return (${s});`)(window.__previewPerf), src);

const fixture = await page.evaluate(() => {
  const canvas = document.querySelector('svg[class*="_svg"]').parentElement.getBoundingClientRect();
  const walls = [...document.querySelectorAll('[data-type="wall"]')].map((n) => n.getBoundingClientRect());
  const clearance = (b) =>
    Math.min(...walls.map((w) => Math.hypot(Math.max(w.left - b.x, 0, b.x - w.right), Math.max(w.top - b.y, 0, b.y - w.bottom))));
  return [...document.querySelectorAll('[data-type="fixture"]')]
    .map((n) => {
      const r = n.getBoundingClientRect();
      return { id: n.getAttribute('data-id'), x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })
    .filter((f) => f.x > canvas.left + 10 && f.x < canvas.right - 10 && f.y > canvas.top + 60 && f.y < canvas.bottom - 60)
    .sort((a, b) => clearance(b) - clearance(a))[0];
});
const dragAt = (x0, y0, dx, n = 30) =>
  page.evaluate(
    async ({ x0, y0, dx, n }) => {
      const svg = document.querySelector('svg[class*="_svg"]');
      const ev = (x, y, buttons) => ({ bubbles: true, clientX: x, clientY: y, button: 0, buttons, pointerId: 1, pointerType: 'mouse', isPrimary: true });
      const settle = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 0))));
      svg.dispatchEvent(new PointerEvent('pointerdown', ev(x0, y0, 1)));
      await settle();
      for (let i = 1; i <= n; i += 1) {
        svg.dispatchEvent(new PointerEvent('pointermove', ev(x0 + (dx * i) / n, y0, 1)));
        await settle();
      }
      svg.dispatchEvent(new PointerEvent('pointerup', ev(x0 + dx, y0, 0)));
      window.dispatchEvent(new PointerEvent('pointerup', ev(x0 + dx, y0, 0)));
      await settle();
    },
    { x0, y0, dx, n },
  );
await perf('perf.reset()');
await dragAt(fixture.x, fixture.y, 60);
await dragAt(fixture.x + 60, fixture.y, -60);
await page.waitForTimeout(800);
const rebuilds = await perf("perf.rebuilds()");
const overlayMs = await page.evaluate(() => window.__overlayMs || []);
const keyDiffs = await page.evaluate(() => {
  const c = {};
  for (const d of window.__keyDiffs || []) c[d] = (c[d] || 0) + 1;
  return c;
});
if (Object.keys(keyDiffs).length) console.log('KEYDIFFS', JSON.stringify(keyDiffs));
const median = (xs) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null);
const summary = {
  label: LABEL,
  fixture: fixture?.id,
  rebuilds: rebuilds.length,
  descriptorsTotal: rebuilds.reduce((a, r) => a + r.descriptors, 0),
  descriptorMsPerDescriptorMedian: median(rebuilds.filter((r) => r.descriptors).map((r) => r.descriptorMs / r.descriptors)),
  descriptorMaxMs: Math.max(...rebuilds.map((r) => r.descriptorMaxMs)),
  buildMsMedian: median(rebuilds.map((r) => r.buildMs)),
  buildMsMax: Math.max(...rebuilds.map((r) => r.buildMs)),
  objectsPerDescriptor: median(rebuilds.filter((r) => r.descriptors).map((r) => r.descriptorObjects / r.descriptors)),
  regeneratedPerDescriptorMedian: median(rebuilds.filter((r) => r.descriptors).map((r) => r.regeneratedObjects / r.descriptors)),
  errors,
  overlayMs: overlayMs.length ? { count: overlayMs.length, median: median(overlayMs), max: Math.max(...overlayMs) } : null,
};
await writeFile(OUT, JSON.stringify({ summary, rebuilds }, null, 2));
console.log(JSON.stringify(summary, null, 1));
await browser.close();
