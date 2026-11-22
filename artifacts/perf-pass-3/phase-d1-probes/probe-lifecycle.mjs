/* global process, console, document, window, requestAnimationFrame, setTimeout, PointerEvent, MutationObserver */
// D1.2: do the Design Engineer stage forms remount during a fixture drag?
// Counts, per stage, how many times the stage's root element is replaced
// during a 30-move fixture drag, and whether a typed draft survives.
//   node probe-lifecycle.mjs <label>
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
const require = createRequire('C:/Users/johnm/modular apartment planner/package.json');
const { chromium } = require('@playwright/test');
const LABEL = process.argv[2] || 'lifecycle';
const OUT = `C:/Users/johnm/AppData/Local/Temp/claude/C--Users-johnm-modular-apartment-planner/2dc0ba0d-1201-453e-8699-67d6aa73231e/scratchpad/d1/lifecycle-${LABEL}.json`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5184/playground', { waitUntil: 'networkidle' });
await page.waitForSelector('svg[class*="_svg"]', { timeout: 30000 });
await page.waitForTimeout(3000);

// Open the Design Engineer section if it is folded.
const opened = await page.evaluate(() => {
  if (document.querySelector('section[aria-label="Project lifecycle"]')) return 'already';
  const header = [...document.querySelectorAll('button')].find((b) => /Design Engineer/.test(b.textContent || ''));
  if (!header) return 'no-header';
  header.click();
  return 'clicked';
});
await page.waitForTimeout(800);

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

const stages = await page.evaluate(() =>
  [...document.querySelectorAll('nav[aria-label="Building lifecycle stages"] button')].map((b) => b.getAttribute('title')),
);

const results = [];
for (let index = 0; index < stages.length; index += 1) {
  await page.evaluate((i) => document.querySelectorAll('nav[aria-label="Building lifecycle stages"] button')[i].click(), index);
  await page.waitForTimeout(400);
  // Type into the first enabled text-ish input of the stage, to see whether a draft survives.
  const typed = await page.evaluate(() => {
    const section = document.querySelector('section[aria-label="Project lifecycle"]');
    const stageRoot = section.lastElementChild;
    const input = [...stageRoot.querySelectorAll('input')].find(
      (el) => !el.disabled && !el.readOnly && (el.type === 'text' || el.type === 'number' || el.type === '') && el.offsetParent,
    );
    if (!input) return null;
    input.setAttribute('data-probe', 'draft');
    return input.getAttribute('aria-label') || input.name || input.id || 'input';
  });
  if (typed) {
    const locator = page.locator('[data-probe="draft"]');
    await locator.click();
    await locator.fill('12.345');
    // Leave the field so a blur-committing field has committed already (its
    // reseed is then not what we measure); a draft field keeps its text.
    await page.evaluate(() => document.activeElement?.blur());
    await page.waitForTimeout(200);
  }
  await page.evaluate(() => {
    const section = document.querySelector('section[aria-label="Project lifecycle"]');
    window.__stageRoot = section.lastElementChild;
    window.__replaced = 0;
    window.__observer?.disconnect();
    window.__observer = new MutationObserver((records) => {
      for (const r of records) for (const n of r.removedNodes) if (n.nodeType === 1) window.__replaced += 1;
    });
    window.__observer.observe(section, { childList: true });
  });
  const before = await page.evaluate(() => document.querySelector('[data-probe="draft"]')?.value ?? null);
  await dragAt(fixture.x, fixture.y, 60);
  await dragAt(fixture.x + 60, fixture.y, -60);
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => ({
    replaced: window.__replaced,
    sameRoot: window.__stageRoot === document.querySelector('section[aria-label="Project lifecycle"]').lastElementChild,
    draft: document.querySelector('[data-probe="draft"]')?.value ?? null,
  }));
  results.push({ stage: stages[index], field: typed, draftBefore: before, ...after });
}
const summary = { label: LABEL, opened, fixture: fixture?.id, results, errors };
await writeFile(OUT, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 1));
await browser.close();
