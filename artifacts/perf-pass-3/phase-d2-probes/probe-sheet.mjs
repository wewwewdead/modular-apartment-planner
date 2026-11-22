/* global console, document, window, requestAnimationFrame, setTimeout */
// D2.3 browser check: the sheet workspace on the playground — the PDF root is
// there and matches the sheet on screen, a middle-button pan follows the pointer
// and leaves the root alone, a viewport drag moves the viewport and the root
// follows it.
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/johnm/modular apartment planner/package.json');
const { chromium } = require('@playwright/test');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5186/playground', { waitUntil: 'networkidle' });
await page.waitForSelector('svg[class*="_svg"]', { timeout: 60000 });
await page.waitForTimeout(2000);
// Sheet 4 has three viewports.
await page.locator('div', { hasText: /^.*Sheet 4.*$/ }).last().click().catch(() => {});
await page.locator('button', { hasText: /^Sheets$/ }).click();
await page.waitForTimeout(2500);
const settle = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 0)))));
const snap = () =>
  page.evaluate(() => {
    const root = document.querySelector('[data-sheet-export-root="true"]');
    const visible = [...document.querySelectorAll('g.sheet')].find((g) => !root?.contains(g));
    const panGroup = visible?.parentElement;
    const strip = (html) => (html || '').replace(/ stroke="#0f8f74"| stroke-width="1"/g, '');
    return {
      hasRoot: Boolean(root),
      viewports: root ? root.querySelectorAll('.sheet-viewport').length : 0,
      rootHtmlLength: root?.innerHTML.length || 0,
      rootMatchesVisible: root ? strip(root.querySelector('g.sheet')?.outerHTML) === strip(visible?.outerHTML) : false,
      transform: panGroup?.getAttribute('transform'),
      firstViewportRect: visible?.querySelector('.sheet-viewport rect:nth-of-type(1)')?.getAttribute('x'),
      visibleXs: [...(visible?.querySelectorAll('.sheet-viewport') || [])].map((g) => g.querySelector(':scope > rect')?.getAttribute('x') + '/' + g.querySelector(':scope > rect')?.getAttribute('stroke')),
      rootXs: [...(root?.querySelectorAll('.sheet-viewport') || [])].map((g) => g.querySelector(':scope > rect')?.getAttribute('x')),
      rootFirstViewportX: root?.querySelector('.sheet-viewport rect:nth-of-type(1)')?.getAttribute('x'),
    };
  });
const before = await snap();
console.log('before', JSON.stringify(before));
const svg = page.locator('svg[class*="_svg"]').first();
const box = await svg.boundingBox();
const cx = box.x + box.width / 2;
const cy = box.y + box.height / 2;
await page.mouse.move(cx, cy);
await page.mouse.down({ button: 'middle' });
for (let i = 1; i <= 20; i += 1) {
  await page.mouse.move(cx + i * 5, cy + i * 3);
  await settle();
}
await page.mouse.up({ button: 'middle' });
await settle();
const afterPan = await snap();
console.log('after pan', JSON.stringify(afterPan));
// Drag the first viewport 40 px right with the left button.
const vpBox = await page.evaluate(() => {
  const root = document.querySelector('[data-sheet-export-root="true"]');
  const visible = [...document.querySelectorAll('g.sheet')].find((g) => !root?.contains(g));
  const r = visible.querySelector('.sheet-viewport > rect').getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
await page.mouse.move(vpBox.x, vpBox.y);
await page.mouse.down();
for (let i = 1; i <= 10; i += 1) {
  await page.mouse.move(vpBox.x + i * 4, vpBox.y);
  await settle();
}
await page.mouse.up();
await page.waitForTimeout(500);
const afterDrag = await snap();
console.log('after drag', JSON.stringify(afterDrag));
console.log('errors', JSON.stringify(errors));
await browser.close();
