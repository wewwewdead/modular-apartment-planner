/* global process, console, window, WebGL2RenderingContext */
// Governor + refine-budget check in the real app, with a simulated GPU-bound
// machine: a frame that drew holds back the next animation frame by
// K ms × (rendered pixels / canvas pixels), quantised to the real vsync —
// what Chrome does when the GPU is behind. Frames that drew nothing are not
// held, so SETTLE frames still show the true display interval.
//   node probe-gov.mjs <label> <K ms> [orbits]
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
const require = createRequire('C:/Users/johnm/modular apartment planner/package.json');
const { chromium } = require('@playwright/test');

const LABEL = process.argv[2] || 'gov';
const K = Number(process.argv[3] || 30);
const ORBITS = Number(process.argv[4] || 6);
const OUT = `C:/Users/johnm/AppData/Local/Temp/claude/C--Users-johnm-modular-apartment-planner/2dc0ba0d-1201-453e-8699-67d6aa73231e/scratchpad/gov-${LABEL}.json`;
const PANE = 'section[data-preview-pane="model"]';
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
await page.addInitScript((k) => {
  window.localStorage.setItem('previewPerf', '1');
  window.__slowGpuK = 0;
  window.__slowK = k;
  let draws = 0;
  const proto = WebGL2RenderingContext.prototype;
  for (const name of ['drawElements', 'drawArrays']) {
    const original = proto[name];
    proto[name] = function patched(...args) {
      draws += 1;
      return original.apply(this, args);
    };
  }
  const realRaf = window.requestAnimationFrame.bind(window);
  let heldUntil = 0;
  window.requestAnimationFrame = (callback) =>
    realRaf(function step(timestamp) {
      if (timestamp < heldUntil) {
        realRaf(step);
        return;
      }
      const before = draws;
      callback(timestamp);
      if (window.__slowGpuK > 0 && draws > before) {
        const stats = window.__previewPerf?.snapshot?.().progressive;
        const ratio = stats ? (stats.renderSize[0] * stats.renderSize[1]) / (stats.drawingBuffer[0] * stats.drawingBuffer[1]) : 1;
        heldUntil = timestamp + window.__slowGpuK * ratio;
      }
    });
}, K);
await page.goto('http://localhost:5181/playground', { waitUntil: 'networkidle' });
await page.waitForSelector(`${PANE} canvas`, { timeout: 30000 });
const perf = (src, arg) =>
  page.evaluate(([s, a]) => new Function('perf', 'arg', `return (${s});`)(window.__previewPerf, a), [src, arg]);
const waitConverged = async (limit = 30000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < limit) {
    const s = await perf('perf && perf.snapshot().progressive');
    if (s && s.samples >= s.targetSamples && s.samples > 0) return s;
    await page.waitForTimeout(100);
  }
  return perf('perf.snapshot().progressive');
};
await page.waitForTimeout(2500);
await waitConverged();
await page.evaluate(() => (window.__slowGpuK = window.__slowK));
const box = await page.locator(`${PANE} canvas`).boundingBox();
const cx = box.x + box.width / 2;
const cy = box.y + box.height / 2;
const result = { label: LABEL, K, orbits: [] };
for (let o = 0; o < ORBITS; o += 1) {
  await perf('perf.reset()');
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 0; i < 70; i += 1) {
    await page.mouse.move(cx + Math.sin((i + o * 7) / 12) * 160, cy + Math.cos(i / 15) * 40);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  const during = await perf('perf.snapshot()');
  const settled = await waitConverged();
  result.orbits.push({
    interactiveGap: during.interactiveGap,
    interactiveScaleAtEnd: during.progressive.interactiveScale,
    renderSizeAtEnd: during.progressive.renderSize,
    governor: during.progressive.governor,
    settled: {
      renderSize: settled.renderSize,
      renderScale: settled.renderScale,
      samples: settled.samples,
      targetSamples: settled.targetSamples,
    },
  });
  console.log(JSON.stringify(result.orbits[o]));
}
result.errors = errors;
await writeFile(OUT, JSON.stringify(result, null, 2));
await browser.close();
