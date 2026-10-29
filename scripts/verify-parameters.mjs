/* global localStorage, process, console */
// Phase C: named parameters. Design parameters → Cabinet → width 900 → Apply
// (snap set there); add a row in the table and rename it inline; paste a list;
// use =width-2*t in the sketcher HUD; delete a used parameter (refused), then
// replace its uses with the number.
//   CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-parameters.mjs
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { cadSteps } from './sketch-cad-steps.mjs';

const directory = 'artifacts/sketch-cad/parameters';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [],
  checks = [];
page.on('pageerror', (e) => errors.push(e.message));
const steps = cadSteps(page);
const { properties, toolbar, status, current, savedWhen } = steps;
const shot = (name) => page.screenshot({ path: `${directory}/${name}.png` });
const values = (model) => Object.fromEntries(model.parameters.map((p) => [p.name, p.value]));

try {
  await page.goto(process.env.CAD_VERIFY_URL || 'http://localhost:5180/sketch');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '3D Model & workshop', exact: true }).click();
  await current();

  // 1. Design parameters from the empty-state screen.
  await page.locator('.cad-empty').getByRole('button', { name: 'Design parameters', exact: true }).click();
  await expect(properties.getByLabel('Preset', { exact: true })).toHaveValue('cabinet');
  await properties.getByLabel('width value', { exact: true }).fill('900');
  await properties.getByLabel('Default snap (mm)', { exact: true }).selectOption('5');
  // Parameters only here; verify-starter-models.mjs covers Apply & build.
  await properties.getByLabel('Build the starter model from these parameters', { exact: true }).uncheck();
  await shot('01-design-parameters');
  await properties.getByRole('button', { name: 'Apply', exact: true }).click();
  let model = await savedWhen((m) => m.parameters.length === 6, 'six parameters');
  assert.deepEqual(values(model), { width: 900, depth: 500, height: 1800, t: 18, backT: 12, toe: 100 });
  await expect(page.getByLabel('Move snap (mm)', { exact: true })).toHaveValue('5');
  await expect(properties.getByRole('heading', { name: 'Named parameters' })).toBeVisible();
  const toeId = model.parameters.find((p) => p.name === 'toe').id;
  checks.push('Design parameters → Cabinet, width 900 → Apply: six parameters in one commit; Snap (mm) reads 5');

  // 2. Add a row with the keyboard, then rename it inline.
  await properties.getByRole('button', { name: 'Add parameter', exact: true }).click();
  await expect(properties.getByLabel('New parameter name', { exact: true })).toBeFocused();
  await page.keyboard.type('shelfGap');
  await page.keyboard.press('Enter');
  await expect(properties.getByLabel('New parameter value', { exact: true })).toBeFocused();
  await page.keyboard.type('=t');
  await expect(properties.getByRole('listbox', { name: 'Parameters' })).toContainText('toe');
  await page.keyboard.type('+2');
  await page.keyboard.press('Enter');
  await expect(properties.getByLabel('New parameter name', { exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(properties.getByLabel('shelfGap resolved', { exact: true })).toHaveText('20');
  const rename = properties.getByLabel('Name of parameter 7', { exact: true });
  await rename.fill('pinInset');
  await rename.press('Enter');
  await expect(properties.getByLabel('pinInset resolved', { exact: true })).toHaveText('20');
  model = await savedWhen((m) => m.parameters.some((p) => p.name === 'pinInset'), 'renamed parameter');
  assert.equal(values(model).pinInset, '=t+2');
  assert(!model.parameters.some((p) => p.name === 'shelfGap'));
  checks.push(
    'Add parameter: shelfGap = =t+2 by keyboard (autocomplete offered t/toe), renamed inline to pinInset, resolved 20',
  );

  // 3. Paste list: one new, one update (same id).
  await properties.getByRole('button', { name: 'Paste list', exact: true }).click();
  await properties.getByLabel('Parameter list', { exact: true }).fill('rail = 60\ntoe = 120');
  await properties.getByRole('button', { name: 'Add / update parameters', exact: true }).click();
  await expect(properties.getByRole('status')).toHaveText('Added 1, updated 1.');
  model = await savedWhen((m) => values(m).rail === 60 && values(m).toe === 120, 'pasted list');
  assert.equal(model.parameters.find((p) => p.name === 'toe').id, toeId, 'toe kept its id');
  await shot('02-parameters-table');
  checks.push('Paste list: rail = 60 added, toe = 120 updated in place (same id)');

  // 4. =width-2*t in the sketcher HUD, with autocomplete.
  await steps.sketchOnPlane('XY');
  await toolbar.getByRole('button', { name: 'Rectangle', exact: true }).click();
  await steps.typeHud(0, 0);
  const c = await steps.canvasCenter();
  await page.mouse.move(c.x + 150, c.y - 100, { steps: 4 });
  await expect(page.getByLabel('Sketch width', { exact: true })).toBeFocused();
  await page.keyboard.type('=wi');
  const hudList = page.locator('.cad-sketch-hud [role="listbox"]');
  await expect(hudList).toContainText('width');
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Sketch width', { exact: true })).toHaveValue('=width');
  await page.keyboard.type('-2*t');
  await expect(page.getByLabel('Width resolves to', { exact: true })).toHaveText('= 864');
  await shot('03-hud-expression');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Sketch height', { exact: true })).toBeFocused();
  await page.keyboard.type('500');
  await page.keyboard.press('Enter');
  await expect(status).toContainText('1 item · closed profile');
  await toolbar.getByRole('button', { name: 'Finish sketch', exact: true }).click();
  await expect(properties).toContainText('Rectangle 864 × 500 at (0, 0)');
  await properties.getByRole('button', { name: 'Extrude', exact: true }).click();
  await steps.applyOperation('Apply extrude', { name: 'Shelf', distance: '=t' });
  const size = page.getByLabel('Part size', { exact: true });
  await expect(size).toContainText('Size 864 × 500 × 18 mm');
  model = await savedWhen((m) => m.parts.length === 1, 'shelf');
  assert.deepEqual(model.sketches[0].profile, { type: 'rectangle', width: 864, height: 500, origin: [0, 0] });
  assert.equal(model.parts[0].features[0].length, '=t');
  await shot('04-shelf-extruded');
  checks.push(
    'HUD: "=wi" + Enter → "=width", then "-2*t" shows "= 864"; rectangle stored as 864 × 500; extrude =t; part size 864 × 500 × 18',
  );

  // 5. Delete t: refused while used; replace uses with the number.
  await page.getByRole('button', { name: /Named parameters/ }).click();
  await properties.getByRole('button', { name: 'Delete t', exact: true }).click();
  await expect(properties.getByRole('alert')).toContainText('t is used by 2 values.');
  await shot('05-delete-refused');
  await properties.getByRole('button', { name: 'Replace uses with number', exact: true }).click();
  await expect(properties.getByRole('button', { name: 'Delete t', exact: true })).toHaveCount(0);
  model = await savedWhen((m) => !m.parameters.some((p) => p.name === 't'), 't removed');
  assert.equal(values(model).pinInset, 20);
  assert.equal(model.parts[0].features[0].length, 18);
  await current();
  await page.locator('.cad-tree-item', { hasText: 'Shelf' }).first().click();
  await expect(size).toContainText('Size 864 × 500 × 18 mm');
  await shot('06-replaced-with-number');
  checks.push(
    'Delete t refused ("t is used by 2 values."); Replace uses with number → t gone, pinInset 20, extrude 18, shelf still 864 × 500 × 18',
  );

  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(`${directory}/verification.json`, JSON.stringify({ status: 'passed', errors, checks }, null, 2));
  console.log('Parameters verification passed:\n- ' + checks.join('\n- '));
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` });
  console.error(await page.locator('body').innerText());
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}
