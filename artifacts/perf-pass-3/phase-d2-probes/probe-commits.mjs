/* global process, console, document, window, requestAnimationFrame, setTimeout, PointerEvent */
// D2 probe: which components render per fixture-drag frame on the playground.
// A DevTools-hook stand-in walks each committed fiber tree and counts, per named
// component, the fibers whose props or state are not the alternate's (rendered
// this commit). Memo bail-outs keep the old props object, so they do not count.
//   node probe-commits.mjs <label> [phase]
import { createRequire } from 'node:module';
import { writeFile, mkdir } from 'node:fs/promises';
const require = createRequire('C:/Users/johnm/modular apartment planner/package.json');
const { chromium } = require('@playwright/test');
const LABEL = process.argv[2] || 'probe';
const PHASE = process.argv[3] === 'phase';
const STAGE = process.argv[4] || null;
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
    if (!t || typeof t === 'string' || fiber.tag === 14) return null; // 14: the memo wrapper; its inner fiber is the render
    const raw = t.displayName || t.name || t.type?.displayName || t.type?.name || t.render?.name || null;
    return raw ? raw.replace(/\d+$/, '') : null;
  };
  // As React DevTools decides it: a fiber rendered when it mounted or carries
  // PerformedWork; a subtree whose child pointer is the previous tree's was not
  // touched by this commit at all and is skipped.
  const visit = (next, prev) => {
    const name = nameOf(next);
    if (name && (!prev || (next.flags & 1) === 1)) counts.set(name, (counts.get(name) || 0) + 1);
    if (prev && next.child === prev.child) return;
    for (let child = next.child; child; child = child.sibling) visit(child, prev ? child.alternate : null);
  };
  const walk = (root) => visit(root, root.alternate);
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    renderers: new Map(),
    inject(renderer) { this.renderers.set(1, renderer); return 1; },
    onCommitFiberRoot(_id, root) {
      if (!window.__countOn) return;
      commits += 1;
      if (window.__lastMove) { (window.__latency ||= []).push(performance.now() - window.__lastMove); window.__lastMove = 0; }
      walk(root.current);
    },
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    checkDCE() {},
  };
  window.__commitCounts = () => ({ commits, counts: Object.fromEntries(counts) });
  window.__resetCounts = () => { counts.clear(); commits = 0; };
});
await page.goto('http://localhost:5186/playground', { waitUntil: 'networkidle' });
await page.waitForSelector('svg[class*="_svg"]', { timeout: 60000 });
await page.waitForTimeout(4000);

if (PHASE) {
  // A phase view on: the first phase, Single. Through the store, as the phase selector would.
  await page.evaluate(() => {
    const select = [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => /phase/i.test(o.textContent)));
    return Boolean(select);
  });
}

if (STAGE) {
  await page.evaluate((stage) => [...document.querySelectorAll('nav[aria-label="Building lifecycle stages"] button')].find((b) => b.title.startsWith(stage + ' '))?.click(), STAGE);
  await page.waitForTimeout(1500);
}
const fixture = await page.evaluate(() => {
  const canvas = document.querySelector('svg[class*="_svg"]').parentElement.getBoundingClientRect();
  return [...document.querySelectorAll('[data-type="fixture"]')]
    .map((n) => {
      const r = n.getBoundingClientRect();
      return { id: n.getAttribute('data-id'), x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })
    .filter((f) => f.x > canvas.left + 10 && f.x < canvas.right - 10 && f.y > canvas.top + 60 && f.y < canvas.bottom - 60)[0];
});
const N = 30;
const cdp = await page.context().newCDPSession(page);
await cdp.send('Performance.enable');
const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
const m0 = await metrics();
const result = await page.evaluate(
  async ({ x0, y0, dx, n }) => {
    const svg = document.querySelector('svg[class*="_svg"]');
    const ev = (x, y, buttons) => ({ bubbles: true, clientX: x, clientY: y, button: 0, buttons, pointerId: 1, pointerType: 'mouse', isPrimary: true });
    const settle = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 0))));
    svg.dispatchEvent(new PointerEvent('pointerdown', ev(x0, y0, 1)));
    await settle();
    window.__resetCounts();
    window.__countOn = true;
    const t0 = performance.now();
    for (let i = 1; i <= n; i += 1) {
      window.__lastMove = performance.now();
      svg.dispatchEvent(new PointerEvent('pointermove', ev(x0 + (dx * i) / n, y0, 1)));
      await settle();
    }
    const elapsed = performance.now() - t0;
    window.__countOn = false;
    const snapshot = window.__commitCounts();
    svg.dispatchEvent(new PointerEvent('pointerup', ev(x0 + dx, y0, 0)));
    window.dispatchEvent(new PointerEvent('pointerup', ev(x0 + dx, y0, 0)));
    await settle();
    const lat = [...(window.__latency || [])].sort((a, b) => a - b);
    return { ...snapshot, elapsed, latencyMedian: lat[Math.floor(lat.length / 2)], latencyP90: lat[Math.floor(lat.length * 0.9)] };
  },
  { x0: fixture.x, y0: fixture.y, dx: 60, n: N },
);
const m1 = await metrics();
const cpu = Object.fromEntries(['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration'].map((k) => [k + 'MsPerMove', +(((m1[k] - m0[k]) * 1000) / N).toFixed(2)]));
const watch = [
  'Sidebar', 'SunStudyPanel', 'DaylightPanel', 'SolarAccessPanel', 'ProjectLifecyclePanel', 'Toolbar', 'PropertiesPanel',
  'SvgCanvas', 'FloorScene', 'FloorPlanLayer', 'WallRenderer', 'DraftingWallItem', 'PresentationWallItem',
  'FixtureRenderer', 'PresentationFixtureItem', 'DraftingFixtureItem', 'DoorRenderer', 'DoorItem', 'WindowItem',
  'ColumnItem', 'RoomItem', 'StairItem',
];
const perFrame = Object.fromEntries(watch.map((name) => [name, +((result.counts[name] || 0) / N).toFixed(2)]));
const summary = { label: LABEL, fixture: fixture?.id, moves: N, commits: result.commits, msPerMove: +(result.elapsed / N).toFixed(1), cpu, moveToCommitMs: { median: +result.latencyMedian.toFixed(2), p90: +result.latencyP90.toFixed(2) }, perFrame, errors };
await writeFile(`${DIR}/commits-${LABEL}.json`, JSON.stringify({ summary, all: result.counts }, null, 2));
console.log(JSON.stringify(summary, null, 1));
await browser.close();
