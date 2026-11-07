/* global localStorage, process, console */
// Phase P.1 (docs/sketch-studio-angle-bar.md §8.5): a custom angle size and
// the member Length. A fresh model → Start list Angle bar → the member's
// Properties show Length above the fold (1600×1000) → Length 1250 → the saved
// end is 1250 along the axis from start, Size reads 50 × 50 × 1250 → Leg A
// 75, Leg B 40, Thickness 4 → every rebuild current, Standard size Custom,
// the saved radii are the automatic ones → Cutting list row L 75×40×4 ·
// CL 1250.00 mm → Standard size L 40×40×4 fills all five values → no page
// errors. Also: the Length edit is one undo step.
//   CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-angle-custom-size.mjs
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { cadSteps } from './sketch-cad-steps.mjs';
import { angleRadiiFor } from '../src/features/sketchstudio/cad/stockSections.js';

const directory = 'artifacts/sketch-cad/angle-custom-size';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [],
  checks = [];
page.on('pageerror', (e) => errors.push(e.message));
const { properties, current, savedWhen } = cadSteps(page);
const ribbon = page.locator('.cad-ribbon');
const footer = page.locator('.cad-status');
const shot = (name) => page.screenshot({ path: `${directory}/${name}.png` });
// A rebuild after an edit: wait for it to start (or finish at once), then for Model current.
const rebuilt = async () => {
  await page.waitForTimeout(300);
  await current();
  await expect(footer).not.toContainText('Rebuild failed');
};
const memberOf = (model) => model.parts[0].features[0];
const openMember = () =>
  page
    .locator('.cad-tree')
    .getByRole('button', { name: /^1\. member/ })
    .click();
const label = (text) => properties.getByLabel(text, { exact: true });
// Type a value into a Properties field and commit it with Enter.
const fill = async (text, value) => {
  await label(text).fill(String(value));
  await label(text).press('Enter');
};

try {
  await page.goto(process.env.CAD_VERIFY_URL || 'http://localhost:5180/sketch');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '3D Model & workshop', exact: true }).click();
  await current();

  // 1. Start list → Angle bar.
  await page.locator('.cad-start').getByRole('button', { name: 'Angle bar', exact: true }).click();
  await rebuilt();
  let model = await savedWhen((m) => m.instances.length === 1, 'the new angle bar');
  const start = memberOf(model).start;
  checks.push(`Start list Angle bar → start (${start}), end (${memberOf(model).end}), Model current`);

  // 2. The member's Properties: Length first, above the fold, with the end
  // points and the end treatment folded away.
  await openMember();
  const length = label('Length (mm)');
  await expect(length).toHaveValue('700');
  // Where selecting the feature scrolled the panel to, then the worst case:
  // the panel scrolled back to its top.
  const selected = await length.boundingBox();
  await properties.evaluate((el) => (el.scrollTop = 0));
  await page.waitForTimeout(100);
  const box = await length.boundingBox();
  const panel = await properties.boundingBox();
  assert(box && box.y + box.height <= Math.min(1000, panel.y + panel.height), `Length is above the fold: ${box?.y}`);
  const folded = await properties
    .locator('.cad-form > details')
    .evaluateAll((all) => all.map((d) => [d.querySelector('summary').textContent, d.open]));
  assert.deepEqual(folded, [
    ['End points (part mm)', false],
    ['Ends & gaps', false],
  ]);
  await shot('01-properties-length-above-fold');
  checks.push(
    `Properties: Length (mm) 700 at y ${Math.round(selected.y)}–${Math.round(selected.y + selected.height)} px as selected, ${Math.round(box.y)}–${Math.round(box.y + box.height)} px with the panel at its top (window 1000 px, panel bottom ${Math.round(panel.y + panel.height)} px); folded ${JSON.stringify(folded)}`,
  );

  // 3. Length 1250 → end is 1250 along the axis from start; Size readout.
  await fill('Length (mm)', 1250);
  await rebuilt();
  model = await savedWhen((m) => memberOf(m).end[2] - memberOf(m).start[2] === 1250, 'the 1250 mm member');
  assert.deepEqual(memberOf(model).start, start);
  assert.deepEqual(
    memberOf(model).end.map((v, i) => v - start[i]),
    [0, 0, 1250],
  );
  const sizeText = await properties.getByLabel('Part size', { exact: true }).innerText();
  assert(sizeText.startsWith('Size 50 × 50 × 1250 mm'), sizeText);
  await expect(length).toHaveValue('1250');
  checks.push(`Length 1250 → saved end (${memberOf(model).end}) from start (${start}); "${sizeText}"`);
  // The typing session (live value + Enter) is one undo step.
  const files = page.locator('.cad-file-actions');
  await files.getByRole('button', { name: 'Undo', exact: true }).click();
  await savedWhen((m) => memberOf(m).end[2] - memberOf(m).start[2] === 700, 'Undo back to 700');
  await rebuilt();
  await expect(length).toHaveValue('700');
  await files.getByRole('button', { name: 'Redo', exact: true }).click();
  model = await savedWhen((m) => memberOf(m).end[2] - memberOf(m).start[2] === 1250, 'Redo to 1250');
  await rebuilt();
  await expect(length).toHaveValue('1250');
  checks.push('one Undo → Length 700, Redo → 1250 (one undo step per typing session)');

  // 4. A custom unequal size: every step rebuilds; radii follow automatically.
  for (const [field, value] of [
    ['Leg A (width)', 75],
    ['Leg B (height)', 40],
    ['Thickness', 4],
  ]) {
    await fill(field, value);
    await rebuilt();
  }
  model = await savedWhen((m) => memberOf(m).section.wall === 4, 'the L 75×40×4 section');
  const section = memberOf(model).section;
  const auto = angleRadiiFor({ width: 75, height: 40, wall: 4 });
  assert.deepEqual(section, { type: 'angle', width: 75, height: 40, wall: 4, ...auto });
  assert(section.toeRadius < section.wall, 'Toe radius < thickness');
  assert(section.rootRadius + section.toeRadius < Math.min(section.width, section.height) - section.wall);
  await expect(label('Standard size')).toHaveValue('custom');
  await expect(label('Root radius')).toHaveValue(String(auto.rootRadius));
  await expect(label('Toe radius')).toHaveValue(String(auto.toeRadius));
  const sizeCustom = await properties.getByLabel('Part size', { exact: true }).innerText();
  assert(sizeCustom.startsWith('Size 75 × 40 × 1250 mm'), sizeCustom);
  await shot('02-custom-75x40x4');
  checks.push(
    `Leg A 75, Leg B 40, Thickness 4 → ${JSON.stringify(section)} (automatic), Standard size Custom, "${sizeCustom}", no Rebuild failed`,
  );

  // 5. The cutting list names the custom section and the new length.
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Manufacture', exact: true }).click();
  await ribbon.getByRole('button', { name: 'Cutting list', exact: true }).click();
  const row = properties.locator('.cad-cut-row');
  await expect(row).toHaveCount(1);
  await expect(row.locator('span').first()).toHaveText('L 75×40×4');
  await expect(row).toContainText('CL 1250.00 mm');
  await shot('03-cutting-list');
  checks.push(`Cutting list row: "${(await row.innerText()).replace(/\s+/g, ' ')}"`);

  // 6. A Standard size still fills all five values.
  await openMember();
  await label('Standard size').selectOption('L 40×40×4');
  await rebuilt();
  model = await savedWhen((m) => memberOf(m).section.width === 40, 'the L 40×40×4 section');
  assert.deepEqual(memberOf(model).section, {
    type: 'angle',
    width: 40,
    height: 40,
    wall: 4,
    rootRadius: 6,
    toeRadius: 3,
  });
  await expect(label('Standard size')).toHaveValue('L 40×40×4');
  await expect(label('Length (mm)')).toHaveValue('1250');
  await shot('04-standard-40x40x4');
  checks.push(`Standard size L 40×40×4 → ${JSON.stringify(memberOf(model).section)}, Model current`);

  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ status: 'passed', errors, checks, model }, null, 2),
  );
  console.log('Angle custom size verification passed:\n- ' + checks.join('\n- '));
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` });
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}
