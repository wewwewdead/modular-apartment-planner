/* global localStorage, document, window, performance, requestAnimationFrame, MutationObserver, DOMPoint */
// Temporary probe (HO-2 build). Deleted after.
import { chromium, expect } from '@playwright/test';
import { cadSteps } from './sketch-cad-steps.mjs';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const { properties, current, savedWhen, shopStation } = cadSteps(page);
const fill = async (scope, label, value) => {
  const field = scope.getByLabel(label, { exact: true });
  await field.fill(String(value));
  await field.press('Enter');
};
const station = () => page.evaluate(() => document.querySelector('.cad-viewport').cadShop().station);
const nextFrame = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))));
await page.goto('http://localhost:5180/sketch');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.getByRole('button', { name: '3D Model & workshop', exact: true }).click();
await current();
await page.getByRole('button', { name: 'Shop', exact: true }).click();
const draw = properties.getByRole('region', { name: 'Draw' });
await draw.getByRole('button', { name: /^Rectangle/ }).click();
await fill(draw, 'Width W (mm)', 300);
await fill(draw, 'Height H (mm)', 100);
await draw.getByRole('button', { name: 'Cut this rectangle', exact: true }).click();
const cut = properties.getByRole('region', { name: 'Cut from sheet' });
await cut.getByLabel('Sheet stock', { exact: true }).selectOption('spcc');
await fill(cut, 'Custom thickness (mm)', 1.5);
await cut.getByRole('button', { name: 'Cut on the laser', exact: true }).click();
await expect(page.getByRole('figure', { name: 'Laser bed' })).toHaveAttribute('data-state', 'cut', { timeout: 20000 });
await savedWhen((m) => m.parts.some((p) => p.features[0]?.type === 'sheetmetal'), 'the blank');
await shopStation('Bend');
const panel = properties.getByRole('region', { name: 'Press brake' });
const map = page.getByRole('figure', { name: 'Flat blank' });
await map.getByRole('button', { name: 'Gauge edge 2', exact: true }).click();
await fill(panel, 'Backgauge L (mm)', 170);
await page.waitForTimeout(800);
const install = () =>
  page.evaluate(() => {
    const record = (window.__drag = { moves: [], start: null, work: [] });
    window.__dragMove = () => { record.start = performance.now(); record.work.push(['move', record.start]); };
    window.addEventListener('pointermove', window.__dragMove, { capture: true });
    window.__dragObserver = new MutationObserver(() => {
      if (record.start == null) return;
      const start = record.start;
      record.start = null;
      const dom = performance.now() - start; record.work.push(['dom', performance.now()]);
      requestAnimationFrame(() => record.moves.push({ dom, frame: performance.now() - start }));
    });
    window.__dragObserver.observe(document.querySelector('[aria-label="Flat pattern"]'), {
      subtree: true, childList: true, characterData: true, attributes: true,
    });
  });
const collect = () =>
  page.evaluate(() => {
    window.removeEventListener('pointermove', window.__dragMove, { capture: true });
    window.__dragObserver.disconnect();
    const v = window.__drag.moves.map((m) => m.dom);
    const w = window.__drag.work; let t0 = w[0][1];
    const trace = w.slice(0, 40).map(([k, t]) => { const r = k + '@' + Math.round(t - t0); if (k === 'move') t0 = t; return r; }).join(' ');
    return Number((v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)) + ' ' + trace;
  });
for (const variant of (process.env.VARIANTS || 'base,noReadout,base,noReadout').split(',')) {
  await page.evaluate((v) => { window.__noReadout = v === 'noReadout'; window.__noThrottle = v === 'noThrottle'; window.__flush = v === 'flush'; }, variant);
  const s = await station();
  const f = s.reach.fingers[0];
  const back = await page.evaluate(() => {
    const el = document.querySelector('.cad-viewport');
    const y = el.cadShop().station.fingerDistance;
    const a = el.cadProject([0, y + 45, 1002]), b = el.cadProject([0, y + 145, 1002]);
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return [(b[0] - a[0]) / d, (b[1] - a[1]) / d, 100 / d];
  });
  await page.mouse.move(...f);
  await page.mouse.down();
  await page.mouse.move(f[0] + back[0] * 5, f[1] + back[1] * 5);
  await nextFrame();
  await install();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await cdp.send('Profiler.start');
  for (let i = 1; i <= 30; i++) {
    const px = 5 + i / back[2];
    await page.mouse.move(f[0] + back[0] * px, f[1] + back[1] * px);
    await nextFrame();
  }
  const { profile } = await cdp.send('Profiler.stop');
  await page.mouse.up();
  console.log(variant, (await collect()).slice(0, 6));
  const self = new Map();
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const dt = profile.timeDeltas; let i = 0;
  for (const id of profile.samples) { const n = byId.get(id); const k = n.callFrame.functionName + ' ' + n.callFrame.url.split('/').pop() + ':' + n.callFrame.lineNumber; self.set(k, (self.get(k) || 0) + (dt[i++] || 0) / 1000); }
  console.log([...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${v.toFixed(0)}ms ${k}`).join(String.fromCharCode(10)));
  await fill(panel, 'Backgauge L (mm)', 170);
  await page.waitForTimeout(600);
}
await browser.close();
