/* global localStorage, process, console, document */
// Shop floor SF-3 (docs/sketch-studio-shop-floor.md §6.4): kiosk-class parts,
// driven the way a newcomer would. Draw → Flanged panel: 600 × 1400 outside,
// 40 mm return flanges on all four edges, a 12° crease at 600, two windows
// (the form's preview shows the face, the blank and the brake's verdict) →
// Cut the blank — I will bend it (the laser cuts it, the five etched lines
// on it) → Bend. First the wrong order: the crease's etched line first, then
// a flange's — the station refuses the two tabs (no longer in line); one tab
// clicked out of the hit, the other collides with the bed, with advice that
// names bending the flanges first; the crease step removed. Then the five
// etched lines in order, one click and the pedal each: every hit clear, the
// left and right flanges one stroke of two tabs each. The folded size equals
// the form's report. Unfold, fold; reload: the part, its 7 bends in 5 strokes.
// No page errors, no .cad-error.
//   CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-shop-floor-sf3.mjs
// Screenshots: artifacts/sketch-cad/shop-floor-sf3 (or SF3_SHOTS), at 1600 × 1000 and 1366 × 768.
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { cadSteps } from './sketch-cad-steps.mjs';

const directory = process.env.SF3_SHOTS || 'artifacts/sketch-cad/shop-floor-sf3';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [],
  checks = [],
  measured = {};
page.on('pageerror', (e) => errors.push(e.message));
const { properties, savedWhen, route, shopMore } = cadSteps(page);
const footer = page.locator('.cad-status');
const bed = page.getByRole('figure', { name: 'Laser bed' });
const modelCurrent = () => expect(footer).toContainText('Model current', { timeout: 60000 });
const station = (name) => route.getByRole('button', { name, exact: true });
const shop = () => page.evaluate(() => document.querySelector('.cad-viewport').cadShop());
const fill = async (scope, label, value) => {
  const field = scope.getByLabel(label, { exact: true });
  await field.fill(String(value));
  await field.press('Enter');
};
const noErrorLine = async (where) =>
  assert.equal(await page.locator('.cad-error').count(), 0, `no error line ${where}`);
// `each(width)`: checks made at each window size, before its screenshot.
const shots = async (name, each = null) => {
  await page.mouse.move(5, 600);
  await page.waitForTimeout(250);
  if (each) await each(1600);
  await page.screenshot({ path: `${directory}/${name}-1600.png` });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.waitForTimeout(350);
  if (each) await each(1366);
  await page.screenshot({ path: `${directory}/${name}-1366.png` });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.waitForTimeout(350);
};
// Two rectangles that do not intersect (boundingBox()es).
const disjoint = (p, q) =>
  p.x + p.width <= q.x || q.x + q.width <= p.x || p.y + p.height <= q.y || q.y + q.height <= p.y;
// The SF-3 audit (SF-4 Part A): the press brake's side view and flat-blank cards never overlap.
const cardsApart = async (width) => {
  const side = await page.getByRole('figure', { name: 'Side view' }).boundingBox();
  const flat = await page.getByRole('figure', { name: 'Flat blank' }).boundingBox();
  assert(side && flat, 'both brake cards shown');
  assert(
    disjoint(side, flat),
    `at ${width}: side view ${JSON.stringify(side)} overlaps the flat blank ${JSON.stringify(flat)}`,
  );
  (measured.cards ||= []).push(
    `${width}: side ${Math.round(side.y)}–${Math.round(side.y + side.height)}, flat ${Math.round(flat.y)}–${Math.round(flat.y + flat.height)}`,
  );
};
// The panel preview's edge labels stand clear of the face outline (SF-3 audit, SF-4 Part A).
const labelsClear = async (width) => {
  const face = await page.getByRole('img', { name: 'Finished face' }).locator('.cad-panel-face').boundingBox();
  const labels = page.getByRole('img', { name: 'Finished face' }).locator('.cad-panel-edge text');
  const count = await labels.count();
  assert.equal(count, 4);
  for (let i = 0; i < count; i++) {
    const box = await labels.nth(i).boundingBox();
    assert(
      disjoint(box, face),
      `at ${width}: edge label ${i + 1} ${JSON.stringify(box)} lies over the face ${JSON.stringify(face)}`,
    );
  }
};
// "Folded 600 × 1394.89 × 164.14 mm …" → [x, y, z].
const sizeOf = (text) =>
  text
    .match(/([\d.]+) × ([\d.]+) × ([\d.]+)/)
    .slice(1, 4)
    .map(Number);

try {
  await page.goto(process.env.CAD_VERIFY_URL || 'http://localhost:5173/sketch');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '3D Model & workshop', exact: true }).click();
  await modelCurrent();

  // 1. Draw → Flanged panel: the kiosk face frame.
  await page.getByRole('button', { name: 'Shop', exact: true }).click();
  const draw = properties.getByRole('region', { name: 'Draw' });
  await draw.getByRole('button', { name: /^Flanged panel/ }).click();
  const form = draw.getByRole('group', { name: 'Flanged panel' });
  const preview = page.getByRole('figure', { name: 'Panel preview' });
  await expect(preview).toBeVisible();
  await fill(form, 'Width W (mm)', 600);
  await fill(form, 'Height H (mm)', 1400);
  await fill(form, 'Flange depth (mm)', 40);
  // Flanges by clicking the edges in the preview (the face's own edges).
  for (let i = 1; i <= 4; i++) await preview.getByRole('button', { name: `Edge ${i}`, exact: true }).click();
  await expect(preview.getByRole('button', { name: /^Edge \d: flange 40 mm up$/ })).toHaveCount(4);
  await form.getByRole('button', { name: 'Add crease', exact: true }).click();
  await fill(form, 'Crease 1 height (mm)', 600);
  await fill(form, 'Crease 1 angle (°)', 12);
  await form.getByRole('button', { name: 'Add window', exact: true }).click();
  await form.getByRole('button', { name: 'Add window', exact: true }).click();
  for (const [k, y, h] of [
    [1, 1000, 560],
    [2, 300, 400],
  ]) {
    await fill(form, `Window ${k} Y (mm)`, y);
    await fill(form, `Window ${k} width (mm)`, 440);
    await fill(form, `Window ${k} height (mm)`, h);
  }
  const verdict = preview.getByRole('status', { name: 'Panel verdict' });
  await expect(verdict).toContainText('5 hits');
  await expect(verdict).toContainText('every hit clears, in this order.');
  measured.reportFolded = sizeOf(await verdict.innerText());
  measured.reportBlank = await form.getByLabel('Blank', { exact: true }).innerText();
  await shots('01-panel-form', labelsClear);
  // The endings are pinned in the footer: in view at 1366 × 768.
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.waitForTimeout(300);
  const endingBox = await draw
    .getByRole('button', { name: 'Cut the blank — I will bend it', exact: true })
    .boundingBox();
  assert(endingBox && endingBox.y + endingBox.height <= 768, 'the ending is in view at 1366 × 768');
  await page.setViewportSize({ width: 1600, height: 1000 });
  checks.push(
    `form: blank ${measured.reportBlank}, report folded ${measured.reportFolded.join(' × ')} mm, "${await verdict.innerText()}"`,
  );

  // 2. Cut the blank — I will bend it: the laser cuts it, the five etched lines on it.
  await draw.getByRole('button', { name: 'Cut the blank — I will bend it', exact: true }).click();
  await expect(bed).toHaveAttribute('data-state', 'cutting', { timeout: 8000 });
  await expect(bed).toHaveAttribute('data-state', 'cut', { timeout: 30000 });
  let model = await savedWhen((m) => m.parts.length === 1 && m.parts[0].features[0].marks?.length === 5, 'the panel');
  const feature = model.parts[0].features[0];
  assert.equal(feature.bends.length, 0);
  assert(
    feature.marks.every((m) => m.bend?.angle && m.bend?.direction),
    'the marks carry their bends',
  );
  await modelCurrent();
  await shots('02-laser-cut');
  checks.push(`laser: cut, ${feature.marks.length} etched lines with their bends, no bends yet`);

  // 3. Bend, the wrong order first.
  await properties
    .getByRole('region', { name: 'Laser station' })
    .getByRole('button', { name: 'Next: Bend', exact: true })
    .click();
  const brake = properties.getByRole('region', { name: 'Press brake' });
  const map = page.getByRole('figure', { name: 'Flat blank' });
  await expect(map.getByRole('button', { name: /^Etched line \d/ })).toHaveCount(5);
  const pedal = () => brake.getByRole('button', { name: 'Bend', exact: true });
  const strokeDone = async (count) => {
    await page.waitForFunction(
      () => document.querySelector('.cad-viewport').cadShop().station?.stroking === false,
      null,
      {
        timeout: 10000,
      },
    );
    await savedWhen((m) => m.parts[0].features[0].bends.length === count, `${count} bends`);
    await page.waitForTimeout(200);
  };
  // The crease's etched line (5): one click sets the line, the angle and Flip sheet.
  await map.getByRole('button', { name: /^Etched line 5/ }).click();
  await expect(brake.getByLabel('Bend angle (°)', { exact: true })).toHaveValue('12');
  await expect(brake.getByLabel('Flip sheet', { exact: true })).toBeChecked();
  await expect(brake.getByRole('status', { name: 'Collision check' })).toContainText('Clear through the stroke');
  await pedal().click();
  await strokeDone(1);
  // Then the left flange's etched line: its two tabs are no longer in line.
  await map.getByRole('button', { name: /^Etched line 1/ }).click();
  await expect(brake.getByRole('alert').first()).toContainText('no longer in line');
  await expect(pedal()).toBeDisabled();
  await shots('03-brake-not-in-line');
  const segments = map.getByRole('button', { name: /^Segment \d of 2$/ });
  await expect(segments).toHaveCount(2);
  // One tab clicked out of the hit: the other alone hits the bed, tilted by the crease.
  await segments.nth(1).click();
  await expect(segments.nth(1)).toHaveAttribute('aria-pressed', 'false');
  const collision = brake.getByRole('alert', { name: 'Collision' });
  await expect(collision).toContainText('hits the bed');
  await expect(collision).toContainText('Bend this one before bend 1 (DOWN 12°');
  measured.creaseFirst = await collision.innerText();
  const side = (await shop()).station;
  assert.equal(side.collision?.tool, 'bed');
  assert.equal(side.ranges.length, 1, 'the die stands under the one tab');
  await shots('04-brake-crease-first-refused');
  checks.push(
    `crease first: two tabs refused (no longer in line); one tab: "${measured.creaseFirst.replace(/\s+/g, ' ')}"`,
  );
  // Take the crease step out again.
  await brake
    .getByRole('list', { name: 'Sequence' })
    .getByRole('listitem', { name: 'Step 1' })
    .getByRole('button', { name: 'Remove', exact: true })
    .click();
  await savedWhen((m) => m.parts[0].features[0].bends.length === 0, 'the crease removed');
  // The line is still on etched line 1: the tab clicked out goes back into the hit.
  await segments.nth(1).click();
  await expect(segments.nth(1)).toHaveAttribute('aria-pressed', 'true');

  // 4. The five etched lines in order: one click and the pedal each.
  const strokes = [];
  for (let k = 1; k <= 5; k++) {
    if (k > 1) await map.getByRole('button', { name: new RegExp(`^Etched line ${k}`) }).click();
    await expect(brake.getByRole('status', { name: 'Collision check' })).toContainText('Clear through the stroke');
    const tabs = await brake.getByLabel('Tabs', { exact: true }).count();
    strokes.push(tabs ? await brake.getByLabel('Tabs', { exact: true }).innerText() : '1 tab');
    if (k === 1) {
      const view = (await shop()).station;
      measured.firstStrokeRanges = view.ranges;
      await shots('05-brake-left-flange-stroke', cardsApart);
    }
    const before = (await savedWhen(() => true, 'any')).parts[0].features[0].bends.length;
    await pedal().click();
    await strokeDone(before + (k <= 2 ? 2 : 1));
  }
  model = await savedWhen((m) => m.parts[0].features[0].bends.length === 7, 'seven bends');
  const bends = model.parts[0].features[0].bends;
  const strokeIds = bends.filter((b) => b.stroke).map((b) => b.stroke);
  assert.equal(new Set(strokeIds).size, 2, 'two strokes of two tabs');
  const sequence = brake.getByRole('list', { name: 'Sequence' });
  await expect(sequence.getByRole('listitem')).toHaveCount(5);
  await expect(sequence.getByRole('listitem', { name: 'Step 1' })).toContainText('1 · UP 90° R1.6 · 2 flanges');
  await expect(sequence.locator('.cad-brake-check')).toHaveText(['ok', 'ok', 'ok', 'ok', 'ok']);
  await expect(station('Bend')).toHaveAttribute('aria-description', '5 hits');
  const folded = sizeOf(await brake.getByLabel('Folded size', { exact: true }).innerText());
  measured.brakeFolded = folded;
  folded.forEach((v, i) =>
    assert(Math.abs(v - measured.reportFolded[i]) < 0.051, `folded ${i}: ${v} vs ${measured.reportFolded[i]}`),
  );
  await shots('06-brake-done', cardsApart);
  checks.push(
    `five etched lines, one click + pedal each: strokes ${JSON.stringify(strokes)}; first stroke tooling runs ${JSON.stringify(measured.firstStrokeRanges?.map((r) => r.map((v) => Math.round(v))))}; folded ${folded.join(' × ')} = report ${measured.reportFolded.join(' × ')}`,
  );
  await noErrorLine('at the brake');

  // 5. Unfold and fold; reload.
  await brake.getByRole('button', { name: 'Leave press brake', exact: true }).click();
  await page.locator('.cad-tree, .cad-job-board').first().waitFor();
  await page
    .getByRole('region', { name: 'Job board' })
    .getByRole('button', { name: /^Flanged panel/ })
    .click();
  await shopMore('Unfold');
  await page.waitForFunction(() => document.querySelector('.cad-viewport').cadShop().flat === true, null, {
    timeout: 5000,
  });
  measured.unfoldBends = (await shop()).bends.length;
  await shots('07-unfolded');
  await shopMore('Fold');
  await page.waitForFunction(() => document.querySelector('.cad-viewport').cadShop().instanceId === null, null, {
    timeout: 5000,
  });
  await page.waitForTimeout(1200);
  await page.reload();
  const workshop = page.getByRole('button', { name: '3D Model & workshop', exact: true });
  if (await workshop.isVisible().catch(() => false)) await workshop.click();
  await modelCurrent();
  model = await savedWhen((m) => m.parts.length === 1, 'after reload');
  assert.equal(model.parts[0].features[0].bends.length, 7);
  assert.equal(new Set(model.parts[0].features[0].bends.map((b) => b.stroke).filter(Boolean)).size, 2);
  await page.getByRole('button', { name: 'Shop', exact: true }).click();
  await expect(station('Bend')).toHaveAttribute('aria-description', '5 hits');
  await noErrorLine('after reload');
  checks.push(`unfold shows ${measured.unfoldBends} bend lines; reload: 7 bends in 5 strokes, route "5 hits"`);
  assert.deepEqual(errors, [], 'no page errors');
  await writeFile(`${directory}/report.json`, JSON.stringify({ checks, measured }, null, 2));
  console.log(JSON.stringify({ checks, measured }, null, 2));
  console.log('verify-shop-floor-sf3: PASS');
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` }).catch(() => {});
  console.error(JSON.stringify({ checks, measured, errors }, null, 2));
  console.error('verify-shop-floor-sf3: FAIL', error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
