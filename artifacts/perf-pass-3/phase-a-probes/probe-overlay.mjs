/* global process */
/* global console, document, window, requestAnimationFrame, setTimeout, PointerEvent */
// Overlay builds vs skips: a fixture drag (the dragged fixture is the
// selection, so every rebuild must rebuild its overlay), then a wall selected
// and the drag undone / redone (rebuilds that leave the wall as it was).
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/johnm/modular apartment planner/package.json');
const { chromium } = require('@playwright/test');
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5181/playground', { waitUntil: 'networkidle' });
await page.waitForSelector('svg[class*="_svg"]', { timeout: 30000 });
await page.waitForTimeout(4000);
const counts = () => page.evaluate(() => ({ builds: window.__overlayBuilds || 0, skips: window.__overlaySkips || 0 }));
const fixture = await page.evaluate(() => {
  // (the first fixture inside the visible canvas, with its id)
  const canvas = document.querySelector('svg[class*="_svg"]').parentElement.getBoundingClientRect();
  return [...document.querySelectorAll('[data-type="fixture"]')]
    .map((n) => {
      const r = n.getBoundingClientRect();
      return { id: n.getAttribute('data-id'), x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })
    .filter((f) => f.x > canvas.left + 40 && f.x < canvas.right - 120 && f.y > canvas.top + 60 && f.y < canvas.bottom - 60)[0];
});
const drag = (x0, y0, dx, n = 20) =>
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
const sel = () => page.evaluate(() => [...document.querySelectorAll('[data-selected="true"], [aria-selected="true"], [class*="selected"]')].map((n) => n.getAttribute('data-type') || n.getAttribute('data-id') || n.className.baseVal || n.className).slice(0, 4));
const fixturePos = () => page.evaluate((id) => { const n = document.querySelector('[data-type="fixture"][data-id="' + id + '"]'); const r = n.getBoundingClientRect(); return Math.round(r.left); }, fixture.id);
const panelText = () => page.evaluate(() => (document.querySelector('[class*="PropertiesPanel"], aside[class*="properties"], [class*="propertiesPanel"]')?.innerText || '').slice(0, 80));
const log = [];
const c0 = await counts();
await drag(fixture.x, fixture.y, 60);
await page.waitForTimeout(400);
const c1 = await counts();
log.push(['after drag', await fixturePos(), await panelText()]);
// Select a wall by clicking its hit polygon centre.
const wallPoint = await page.evaluate(() => {
  const walls = [...document.querySelectorAll('[data-type="wall"]')];
  for (const w of walls) {
    const r = w.getBoundingClientRect();
    if (r.width > 60) return { x: r.left + r.width / 2, y: r.top + r.height / 2, id: w.getAttribute('data-id') };
  }
  return null;
});
if (process.env.CLICK_WALL === "1") await page.mouse.click(wallPoint.x, wallPoint.y);
await page.waitForTimeout(400);
const c2 = await counts();
log.push(['selected after wall click', await sel()]);
for (let i = 0; i < 3; i += 1) {
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);
  log.push(['after undo', await counts(), await fixturePos()]);
  await page.keyboard.press('Control+y');
  await page.waitForTimeout(250);
  log.push(['after redo', await counts(), await fixturePos()]);
}
const c3 = await counts();
console.log(JSON.stringify(log));
console.log(JSON.stringify({ start: c0, afterDrag: c1, afterSelectWall: c2, afterUndoRedo: c3, wall: wallPoint?.id, errors }));
await browser.close();
