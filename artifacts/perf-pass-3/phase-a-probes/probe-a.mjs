/* global process, console, document, window, performance, requestAnimationFrame, WebGL2RenderingContext */
// Phase A structural probe: orbit frames, refine run, GL allocations per
// splitter-like resize, framebuffer binds / MSAA resolves per frame.
//   node probe-a.mjs <label> [desktop|web]
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
const require = createRequire('C:/Users/johnm/modular apartment planner/package.json');
const { chromium } = require('@playwright/test');

const LABEL = process.argv[2] || 'run';
const FLAVOUR = process.argv[3] || 'desktop';
const GL = process.argv[4] || 'gpu';
const ORBITS = Number(process.argv[5] || 1);
const OUT = `C:/Users/johnm/AppData/Local/Temp/claude/C--Users-johnm-modular-apartment-planner/2dc0ba0d-1201-453e-8699-67d6aa73231e/scratchpad/probe-${LABEL}-${FLAVOUR}-${GL}.json`;
const URL = 'http://localhost:5181/playground';
const PANE = 'section[data-preview-pane="model"]';

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: GL === 'swiftshader' ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const ua =
  FLAVOUR === 'desktop'
    ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) modular-apartment-planner/1.0.0 Chrome/140.0.0.0 Electron/43.0.0 Safari/537.36'
    : undefined;
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, userAgent: ua });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => {
  window.localStorage.setItem('previewPerf', '1');
  const gl = {
    renderbufferStorageMultisample: 0,
    renderbufferStorage: 0,
    texImage2D: 0,
    texStorage2D: 0,
    blitFramebuffer: 0,
    bindFramebuffer: 0,
    drawArrays: 0,
    drawElements: 0,
    msaaBytes: 0,
  };
  window.__gl = gl;
  const proto = WebGL2RenderingContext.prototype;
  for (const name of ['renderbufferStorage', 'texImage2D', 'texStorage2D', 'blitFramebuffer', 'bindFramebuffer', 'drawArrays', 'drawElements']) {
    const original = proto[name];
    proto[name] = function patched(...args) {
      gl[name] += 1;
      return original.apply(this, args);
    };
  }
  const rsm = proto.renderbufferStorageMultisample;
  window.__msaaAllocs = [];
  proto.renderbufferStorageMultisample = function patched(target, samples, format, width, height) {
    gl.renderbufferStorageMultisample += 1;
    window.__msaaAllocs.push([samples, format, width, height]);
    return rsm.call(this, target, samples, format, width, height);
  };
});
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForSelector(`${PANE} canvas`, { timeout: 30000 });
const perf = (src, arg) =>
  page.evaluate(([s, a]) => new Function('perf', 'arg', `return (${s});`)(window.__previewPerf, a), [src, arg]);
const waitConverged = async (limit = 15000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < limit) {
    const s = await perf('perf && perf.snapshot().progressive');
    if (s && s.samples >= s.targetSamples && s.samples > 0) return s;
    await page.waitForTimeout(100);
  }
  return perf('perf.snapshot().progressive');
};
const glSnap = () => page.evaluate(() => ({ ...window.__gl }));
const glDiff = (a, b) => Object.fromEntries(Object.keys(b).map((k) => [k, b[k] - a[k]]));

await page.waitForTimeout(2500);
const initial = await waitConverged(20000);
const box = await page.locator(`${PANE} canvas`).boundingBox();
const result = { label: LABEL, flavour: FLAVOUR, box, initialConverged: initial };

// ── Orbit: 90 paced moves ───────────────────────────────────────────────────
await perf('perf.reset()');
const g0 = await glSnap();
const cx = box.x + box.width / 2;
const cy = box.y + box.height / 2;
result.governorTrace = [];
for (let o = 0; o < ORBITS; o += 1) {
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 0; i < 90; i += 1) {
    await page.mouse.move(cx + Math.sin((i + o * 7) / 12) * 160, cy + Math.cos(i / 15) * 40);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  result.governorTrace.push(await perf('perf.snapshot().progressive.governor'));
  if (o < ORBITS - 1) await page.waitForTimeout(700);
}
const g1 = await glSnap();
const orbitFrames = await perf('perf.frames()');
const interactive = orbitFrames.filter((f) => f.action === 'interactive');
const interactiveCount = interactive.length;
result.orbit = {
  frames: orbitFrames.length,
  interactive: interactiveCount,
  gl: glDiff(g0, g1),
  perInteractiveFrame: Object.fromEntries(
    Object.entries(glDiff(g0, g1)).map(([k, v]) => [k, +(v / Math.max(1, interactiveCount)).toFixed(2)]),
  ),
  snapshot: await perf('perf.snapshot()'),
};
const converged = await waitConverged(20000);
const g2 = await glSnap();
const refineFrames = (await perf('perf.frames()')).filter((f) => f.action === 'refine');
result.refine = {
  stats: converged,
  refineFrames: refineFrames.length,
  gl: glDiff(g1, g2),
  refineGapMedian: refineFrames.map((f) => f.gapMs).sort((a, b) => a - b)[Math.floor(refineFrames.length / 2)],
};

// ── Resize: 12 window steps like a splitter drag ────────────────────────────
const g3 = await glSnap();
for (let i = 1; i <= 12; i += 1) {
  await page.setViewportSize({ width: 1600 - i * 15, height: 1000 });
  await page.waitForTimeout(20);
}
await page.waitForTimeout(400);
const g4 = await glSnap();
result.resize = { steps: 12, gl: glDiff(g3, g4), stats: await perf('perf.snapshot().progressive') };
await page.setViewportSize({ width: 1600, height: 1000 });
await page.waitForTimeout(300);

// ── Compass writes per frame and backdrop filters ───────────────────────────
result.chrome = await page.evaluate(async (pane) => {
  const filters = [];
  for (const el of document.querySelectorAll(`${pane} *`)) {
    const f = getComputedStyle(el).backdropFilter;
    if (f && f !== 'none') filters.push([el.className, f]);
  }
  let writes = 0;
  const observer = new MutationObserver((list) => (writes += list.length));
  for (const el of document.querySelectorAll(`${pane} *`)) observer.observe(el, { attributes: true, attributeFilter: ['style'] });
  await new Promise((r) => {
    let n = 60;
    const step = () => (n-- <= 0 ? r() : requestAnimationFrame(step));
    requestAnimationFrame(step);
  });
  observer.disconnect();
  return { backdropFilters: filters, styleWritesIn60IdleFrames: writes };
}, PANE);
result.msaaAllocs = (await page.evaluate(() => window.__msaaAllocs)).slice(-12);
result.errors = errors;
await writeFile(OUT, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
await browser.close();
