/* global console, document, window, MutationObserver */
// Compass needle style writes: during an orbit, and during the refine after it.
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/johnm/modular apartment planner/package.json');
const { chromium } = require('@playwright/test');
const PANE = 'section[data-preview-pane="model"]';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ua =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) modular-apartment-planner/1.0.0 Chrome/140.0.0.0 Electron/43.0.0 Safari/537.36';
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, userAgent: ua });
await page.addInitScript(() => window.localStorage.setItem('previewPerf', '1'));
await page.goto('http://localhost:5181/playground', { waitUntil: 'networkidle' });
await page.waitForSelector(`${PANE} canvas`);
await page.waitForTimeout(5000);
await page.evaluate((pane) => {
  const needle = document.querySelector(`${pane} [class*="_needle_"]`);
  window.__needleWrites = [];
  new MutationObserver((list) => {
    for (const m of list) window.__needleWrites.push([performance.now(), needle.style.getPropertyValue('--compass-heading')]);
  }).observe(needle, { attributes: true, attributeFilter: ['style'] });
}, PANE);
const box = await page.locator(`${PANE} canvas`).boundingBox();
await page.evaluate(() => window.__previewPerf.reset());
await page.evaluate(() => (window.__needleWrites.length = 0));
const cx = box.x + box.width / 2;
const cy = box.y + box.height / 2;
await page.mouse.move(cx, cy);
await page.mouse.down();
for (let i = 0; i < 40; i += 1) {
  await page.mouse.move(cx + i * 4, cy);
  await page.waitForTimeout(16);
}
await page.mouse.up();
const releasedAt = await page.evaluate(() => performance.now());
await page.waitForTimeout(3000);
const out = await page.evaluate((t) => {
  const frames = window.__previewPerf.frames();
  const writes = window.__needleWrites;
  const sample = writes.filter(([at]) => at > t).slice(-6).map(([, v]) => v);
  return {
    interactiveFrames: frames.filter((f) => f.action === 'interactive').length,
    refineFrames: frames.filter((f) => f.action === 'refine').length,
    settleFrames: frames.filter((f) => f.action === 'settle').length,
    writesDuringOrbit: writes.filter(([at]) => at <= t).length,
    writesAfterRelease: writes.filter(([at]) => at > t).length,
    sample,
    distinctHeadingsAfterRelease: new Set(writes.filter(([at]) => at > t).map(([, v]) => v)).size,
  };
}, releasedAt);
console.log(JSON.stringify(out));
await browser.close();
