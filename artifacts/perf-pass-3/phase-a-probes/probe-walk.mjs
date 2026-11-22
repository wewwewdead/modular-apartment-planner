/* global console, window, WebGL2RenderingContext, HTMLAnchorElement */
// Walk mode under a simulated GPU-bound machine (see probe-gov.mjs): the walk
// is governed, its refine follows the governed scale (no reallocation on
// stopping), and Save image re-renders the settled walk at full resolution.
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/johnm/modular apartment planner/package.json');
const { chromium } = require('@playwright/test');
const PANE = 'section[data-preview-pane="model"]';
const K = Number(process.argv[2] || 30);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ua =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) modular-apartment-planner/1.0.0 Chrome/140.0.0.0 Electron/43.0.0 Safari/537.36';
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, userAgent: ua });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript((k) => {
  window.localStorage.setItem('previewPerf', '1');
  window.__slowGpuK = 0;
  window.__slowK = k;
  window.__msaaAllocs = 0;
  let draws = 0;
  const proto = WebGL2RenderingContext.prototype;
  for (const name of ['drawElements', 'drawArrays']) {
    const original = proto[name];
    proto[name] = function patched(...args) {
      draws += 1;
      return original.apply(this, args);
    };
  }
  const rsm = proto.renderbufferStorageMultisample;
  proto.renderbufferStorageMultisample = function patched(...args) {
    window.__msaaAllocs += 1;
    return rsm.apply(this, args);
  };
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
  window.__savedImages = [];
  const original = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function click() {
    if (this.download) {
      window.__savedImages.push({ name: this.download, length: this.href.length });
      return;
    }
    original.call(this);
  };
}, K);
await page.goto('http://localhost:5181/playground', { waitUntil: 'networkidle' });
await page.waitForSelector(`${PANE} canvas`);
await page.waitForTimeout(5000);
const stats = () => page.evaluate(() => window.__previewPerf.snapshot().progressive);
const waitConverged = async (limit = 20000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < limit) {
    const s = await stats();
    if (s.samples >= s.targetSamples && s.samples > 0) return s;
    await page.waitForTimeout(100);
  }
  return stats();
};
await page.getByRole('button', { name: 'Walk', exact: true }).click();
await page.waitForTimeout(800);
const box = await page.locator(`${PANE} canvas`).boundingBox();
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
await page.waitForTimeout(500);
const locked = await page.evaluate(() => Boolean(document.pointerLockElement));
await page.keyboard.press('KeyC');
await page.waitForTimeout(300);
await waitConverged();
await page.evaluate(() => (window.__slowGpuK = window.__slowK));
const log = [];
for (let walk = 0; walk < 3; walk += 1) {
  await page.evaluate(() => window.__previewPerf.reset());
  const key = walk % 2 ? 'KeyS' : 'KeyW';
  await page.keyboard.down(key);
  await page.waitForTimeout(1500);
  await page.keyboard.up(key);
  const moving = await stats();
  const actions = await page.evaluate(() => { const c = {}; for (const f of window.__previewPerf.frames()) c[f.action] = (c[f.action] || 0) + 1; return c; });
  const camera = await page.evaluate(() => window.__previewPerf.camera().position.map(Math.round));
  const allocsBeforeStop = await page.evaluate(() => window.__msaaAllocs);
  const settled = await waitConverged();
  const allocsAfterStop = await page.evaluate(() => window.__msaaAllocs);
  log.push({
    walk,
    actions,
    camera,
    interactiveScale: moving.interactiveScale,
    movingRenderSize: moving.renderSize,
    settledRenderSize: settled.renderSize,
    settledScale: settled.renderScale,
    samples: settled.samples,
    msaaAllocsOnStop: allocsAfterStop - allocsBeforeStop,
    governor: moving.governor,
  });
}
// Leave pointer lock (Escape leaves walk), so use the button-free path: the
// viewport's own capture through Save image needs the walk still on, so press
// Save image via its label while still walking — unlock first with a click?
await page.evaluate(() => document.exitPointerLock?.());
await page.waitForTimeout(300);
const beforeSave = await stats();
const saveEnabled = await page.evaluate(() => {
  const b = document.querySelector('[aria-label="Save image"]');
  return Boolean(b && !b.disabled);
});
await page.evaluate(() => document.querySelector('[aria-label="Save image"]')?.click());
await page.waitForTimeout(500);
const afterSave = await stats();
const saved = await page.evaluate(() => window.__savedImages);
const navigation = await page.evaluate(() => window.__previewPerf.snapshot().navigationMode);
console.log(JSON.stringify({ locked, navigation, log, saveEnabled, beforeSave: { renderScale: beforeSave.renderScale, renderSize: beforeSave.renderSize, samples: beforeSave.samples }, afterSave: { renderScale: afterSave.renderScale, renderSize: afterSave.renderSize, samples: afterSave.samples }, saved, errors }, null, 1));
await browser.close();
