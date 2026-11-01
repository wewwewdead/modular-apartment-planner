/* global process, console, document */
// The floor-plan canvas dimension guard. A fresh project's floor has every
// annotation switch on, yet the working canvas must draw no derived dimension
// of any class (wall, room, overall chain/totals) while walls are drawn. It
// keeps the live length label on the wall being drawn, the room tags, and any
// dimension placed on purpose with the Dimension tool (M).
//   FLOORPLAN_VERIFY_URL=http://localhost:5199/floorplan node scripts/verify-plan-canvas-dimensions.mjs
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const directory = 'artifacts/floorplan/plan-canvas-dimensions';
await mkdir(directory, { recursive: true });
const url = process.env.FLOORPLAN_VERIFY_URL || 'http://localhost:5199/floorplan';
const CANVAS = 'svg[class*="_svg"]';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [],
  checks = [],
  failures = [];
let page = null;

try {
  page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector(CANVAS, { timeout: 30000 });
  await page.waitForTimeout(1000);
  const svg = page.locator(CANVAS).first();
  const box = await svg.boundingBox();
  assert(box && box.width > 0 && box.height > 0, 'Plan canvas has a box');
  checks.push(
    `canvas ${Math.round(box.width)}×${Math.round(box.height)} at (${Math.round(box.x)}, ${Math.round(box.y)})`,
  );

  const at = (fx, fy) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });
  // The canvas coalesces pointer events through rAF: glide in paced steps,
  // then press and release with a settle after.
  const glideTo = async (p) => {
    for (let step = 1; step <= 4; step += 1) {
      await page.mouse.move(p.x, p.y);
      await page.waitForTimeout(100);
    }
  };
  const clickAt = async (p) => {
    await glideTo(p);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(200);
  };
  const press = async (key) => {
    await page.keyboard.press(key);
    await page.waitForTimeout(200);
  };

  const readCanvas = () =>
    page.evaluate((selector) => {
      const canvas = document.querySelector(selector);
      return {
        walls: canvas.querySelectorAll('[data-type="wall"]').length,
        derived: [...canvas.querySelectorAll('[data-dimension-source="derived"]')].map(
          (g) => `${g.getAttribute('data-dimension-source-type')}: ${g.textContent.trim()}`,
        ),
        manual: canvas.querySelectorAll('[data-dimension-source="manual"]').length,
        manualTexts: [...canvas.querySelectorAll('[data-dimension-source="manual"] text')].map((t) =>
          t.textContent.trim(),
        ),
        annotationTexts: [...canvas.querySelectorAll('.annotations text')].map((t) => t.textContent.trim()),
        previewTexts: [...canvas.querySelectorAll('.wall-preview text')].map((t) => t.textContent.trim()),
      };
    }, CANVAS);

  // No derived figure and no millimetre text among the annotations, and the
  // walls did get placed. `allowManual` lets the manual dimension's own text
  // through once one has been placed on purpose.
  const expectClean = async (label, { allowManual = false } = {}) => {
    const state = await readCanvas();
    const allowed = new Set(allowManual ? state.manualTexts : []);
    const mmTexts = state.annotationTexts.filter((text) => text.includes('mm') && !allowed.has(text));
    const line = `${label}: ${state.walls} wall polygons, ${state.derived.length} derived figures, ${mmTexts.length} stray mm texts (annotation texts: ${JSON.stringify(state.annotationTexts)})`;
    checks.push(line);
    if (state.derived.length) failures.push(`${label}: derived figures on the canvas: ${state.derived.join(' | ')}`);
    if (mmTexts.length) failures.push(`${label}: annotation texts with mm: ${mmTexts.join(' | ')}`);
    if (state.walls < 1) failures.push(`${label}: no wall polygon on the canvas`);
    return state;
  };

  // A four-corner ring at 25 %/75 % of the canvas, closing on the first corner.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await press('w');
  const ring = [at(0.25, 0.25), at(0.75, 0.25), at(0.75, 0.75), at(0.25, 0.75), at(0.25, 0.25)];
  for (let index = 0; index < ring.length; index += 1) {
    if (index === 1) {
      // The rubber band is out between the first and second click, and its
      // single live length label is kept on purpose.
      await glideTo(ring[1]);
      const { previewTexts } = await readCanvas();
      const line = `rubber band before the second click: .wall-preview texts ${JSON.stringify(previewTexts)}`;
      checks.push(line);
      if (previewTexts.length !== 1 || !/mm$/.test(previewTexts[0])) {
        failures.push(`${line} — expected exactly one ending in "mm"`);
      }
    }
    await clickAt(ring[index]);
    if (index >= 1) await expectClean(`ring wall ${index}`);
  }
  await press('Escape');

  // A partition from the top midpoint to the bottom midpoint.
  await press('w');
  await clickAt(at(0.5, 0.25));
  await clickAt(at(0.5, 0.75));
  await expectClean('partition');
  await press('Escape');

  // A short return from the partition's middle, 12 % of the canvas to the right.
  await press('w');
  await clickAt(at(0.5, 0.5));
  await clickAt(at(0.62, 0.5));
  await expectClean('short return');
  await press('Escape');
  await page.waitForTimeout(300);
  const walled = await expectClean('six walls placed');
  assert(walled.walls >= 6, `Six walls placed (found ${walled.walls} wall polygons)`);
  await svg.screenshot({ path: `${directory}/walls.png` });

  // One manual dimension across the ring's top edge with the Dimension tool
  // (M): the first click is the start point, the second the end point.
  await press('m');
  await clickAt(at(0.25, 0.25));
  await clickAt(at(0.75, 0.25));
  await press('Escape');
  await page.waitForTimeout(300);
  const dimensioned = await expectClean('manual dimension placed', { allowManual: true });
  const manualLine = `manual dimension: ${dimensioned.manual} [data-dimension-source="manual"] groups, texts ${JSON.stringify(dimensioned.manualTexts)}`;
  checks.push(manualLine);
  if (dimensioned.manual !== 1) failures.push(`${manualLine} — expected exactly one`);
  if (dimensioned.manualTexts.length !== 1 || !/mm$/.test(dimensioned.manualTexts[0])) {
    failures.push(`${manualLine} — expected one text ending in "mm"`);
  }
  await svg.screenshot({ path: `${directory}/manual-dimension.png` });

  if (errors.length) throw new Error(`Page errors:\n${errors.join('\n')}`);
  if (failures.length) throw new Error(`Plan canvas dimension failures:\n${failures.join('\n')}`);
  await writeFile(`${directory}/verification.json`, JSON.stringify({ status: 'passed', errors, checks }, null, 2));
  console.log('Plan canvas dimension verification passed:\n- ' + checks.join('\n- '));
} catch (error) {
  if (page) await page.screenshot({ path: `${directory}/failure.png` });
  console.error('Checks so far:\n- ' + checks.join('\n- '));
  console.error(errors);
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ status: 'failed', error: error.message, errors, checks, failures }, null, 2),
  );
  process.exitCode = 1;
  console.error(error.message);
} finally {
  await browser.close();
}
