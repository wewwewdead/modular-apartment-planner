/* global process, console, document, window, requestAnimationFrame, setTimeout, PointerEvent, performance */
// D2.4 probe: open the wall detail editor on a playground wall turned fibre
// cement, then pan the elevation with the middle button. Counts what renders
// per pan frame (DevTools-style fiber walk) and the move-to-commit latency.
//   node probe-wall-editor.mjs <label>
import { createRequire } from 'node:module';
import { writeFile, mkdir } from 'node:fs/promises';
const require = createRequire('C:/Users/johnm/modular apartment planner/package.json');
const { chromium } = require('@playwright/test');
const LABEL = process.argv[2] || 'wall';
const DIR = 'C:/Users/johnm/AppData/Local/Temp/claude/C--Users-johnm-modular-apartment-planner/2dc0ba0d-1201-453e-8699-67d6aa73231e/scratchpad/d2';
await mkdir(DIR, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => {
  const counts = new Map();
  let commits = 0;
  const nameOf = (fiber) => {
    const t = fiber.type;
    if (!t || typeof t === 'string' || fiber.tag === 14) return null;
    const raw = t.displayName || t.name || t.type?.displayName || t.type?.name || t.render?.name || null;
    return raw ? raw.replace(/\d+$/, '') : null;
  };
  const visit = (next, prev) => {
    const name = nameOf(next);
    if (name && (!prev || (next.flags & 1) === 1)) counts.set(name, (counts.get(name) || 0) + 1);
    if (prev && next.child === prev.child) return;
    for (let child = next.child; child; child = child.sibling) visit(child, prev ? child.alternate : null);
  };
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    renderers: new Map(),
    inject() { return 1; },
    onCommitFiberRoot(_id, root) {
      if (!window.__countOn) return;
      commits += 1;
      if (window.__lastMove) { (window.__latency ||= []).push(performance.now() - window.__lastMove); window.__lastMove = 0; }
      visit(root.current, root.current.alternate);
    },
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    checkDCE() {},
  };
  window.__commitCounts = () => ({ commits, counts: Object.fromEntries(counts) });
  window.__resetCounts = () => { counts.clear(); commits = 0; window.__latency = []; };
});
await page.goto('http://localhost:5186/playground', { waitUntil: 'networkidle' });
await page.waitForSelector('svg[class*="_svg"]', { timeout: 60000 });
await page.waitForTimeout(3000);

// Select the longest wall on screen by clicking its middle.
const wall = await page.evaluate(() => {
  const canvas = document.querySelector('svg[class*="_svg"]').parentElement.getBoundingClientRect();
  return [...document.querySelectorAll('[data-type="wall"]')]
    .map((n) => ({ id: n.getAttribute('data-id'), r: n.getBoundingClientRect() }))
    .filter(({ r }) => r.left > canvas.left && r.right < canvas.right && r.top > canvas.top + 40 && r.bottom < canvas.bottom - 40)
    .sort((a, b) => Math.max(b.r.width, b.r.height) - Math.max(a.r.width, a.r.height))
    .map(({ id, r }) => ({ id, x: r.left + r.width / 2, y: r.top + r.height / 2 }))[0];
});
await page.mouse.click(wall.x, wall.y);
await page.waitForTimeout(800);
// Fibre cement both faces, then the outside face's editor.
const presetSelect = page.locator('select').filter({ has: page.locator('option[value="fiber_cement"]') }).first();
await presetSelect.selectOption('fiber_cement');
await page.waitForTimeout(1200);
await page.locator('button', { hasText: 'Design Outside Face' }).first().click();
const EDITOR = '[role="dialog"][aria-label="Wall assembly detail editor"]';
await page.waitForSelector(`${EDITOR} svg[data-tool]`, { timeout: 60000 });
await page.waitForTimeout(3000);
const counts0 = await page.evaluate((sel) => {
  const svg = document.querySelector(`${sel} svg[data-tool]`);
  return { nodes: svg.querySelectorAll('*').length, screws: svg.querySelectorAll('[data-fastener-id], circle').length };
}, EDITOR);

const N = 30;
const cdp = await page.context().newCDPSession(page);
await cdp.send('Performance.enable');
const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
const m0 = await metrics();
const frameBox = await page.evaluate((sel) => {
  const r = document.querySelector(sel + ' svg[data-tool]').parentElement.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, EDITOR);
await page.evaluate(() => {
  window.addEventListener('pointermove', () => { if (window.__countOn) window.__lastMove = performance.now(); }, true);
});
const settle = () => page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(res, 0)))));
await page.mouse.move(frameBox.x, frameBox.y);
await page.mouse.down({ button: 'middle' });
await settle();
await page.evaluate(() => { window.__resetCounts(); window.__countOn = true; });
for (let i = 1; i <= N; i += 1) {
  await page.mouse.move(frameBox.x + i * 4, frameBox.y + i * 2);
  await settle();
}
const result = await page.evaluate((sel) => {
  window.__countOn = false;
  const snapshot = window.__commitCounts();
  const svg = document.querySelector(sel + ' svg[data-tool]');
  const lat = [...(window.__latency || [])].sort((a, b) => a - b);
  return { ...snapshot, transform: svg.style.transform, latencyMedian: lat[Math.floor(lat.length / 2)], latencyP90: lat[Math.floor(lat.length * 0.9)] };
}, EDITOR);
await page.mouse.up({ button: 'middle' });
await settle();
const m1 = await metrics();
const cpu = Object.fromEntries(['TaskDuration', 'ScriptDuration', 'LayoutDuration'].map((k) => [k + 'MsPerMove', +(((m1[k] - m0[k]) * 1000) / N).toFixed(2)]));
const watch = ['WallDetailEditorBody', 'WallElevationLayers', 'WallElevationUpperLayers', 'WallElevationAnnotationLayers', 'FastenerGraphic', 'DimensionGraphic', 'WallCanvasGrid', 'WallCanvasRulers', 'WallLivePreview', 'SlabBandGraphic'];
const perFrame = Object.fromEntries(watch.map((name) => [name, +((result.counts[name] || 0) / N).toFixed(2)]));
const summary = { label: LABEL, wall: wall.id, svg: counts0, moves: N, commits: result.commits, transform: result.transform, moveToCommitMs: { median: +(result.latencyMedian || 0).toFixed(2), p90: +(result.latencyP90 || 0).toFixed(2) }, cpu, perFrame, errors };
await writeFile(`${DIR}/wall-${LABEL}.json`, JSON.stringify({ summary, all: result.counts }, null, 2));
console.log(JSON.stringify(summary, null, 1));
await browser.close();
