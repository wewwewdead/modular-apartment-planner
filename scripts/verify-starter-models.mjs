/* global localStorage, process, console */
// Phase D: Design parameters presets build a parametric starter model.
// Cabinet → Apply & build → the carcass appears (8 definitions, 10 instances),
// the drawing's parts list reads Side 2 / Adjustable shelf 2, and width 900
// moves the right side to X 882 and widens the Bottom to 864. Then the Table
// and Steel frame presets each build and reach "Model current".
//   CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-starter-models.mjs
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { cadSteps } from './sketch-cad-steps.mjs';

const directory = 'artifacts/sketch-cad/starter-models';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [],
  checks = [];
page.on('pageerror', (e) => errors.push(e.message));
const { properties, current, savedWhen } = cadSteps(page);
const shot = (name) => page.screenshot({ path: `${directory}/${name}.png` });
const footer = page.locator('.cad-status');
// The Start list in the Properties panel of an empty model (Phase I).
const welcome = page.locator('.cad-start');
const treeItems = (name) => page.locator('.cad-tree-item', { hasText: name });

const freshModel = async () => {
  await page.goto(process.env.CAD_VERIFY_URL || 'http://localhost:5180/sketch');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '3D Model & workshop', exact: true }).click();
  await current();
};
const buildPreset = async (preset) => {
  await welcome.getByRole('button', { name: 'Design parameters', exact: true }).click();
  await properties.getByLabel('Preset', { exact: true }).selectOption(preset);
  await expect(properties.getByLabel('Build the starter model from these parameters', { exact: true })).toBeChecked();
  await properties.getByRole('button', { name: 'Apply & build', exact: true }).click();
  await current();
};

try {
  // 1. Cabinet.
  await freshModel();
  await buildPreset('cabinet');
  await expect(welcome).toHaveCount(0);
  await expect(page.locator('.cad-tree summary', { hasText: 'Assembly' })).toHaveText('Assembly · 10 instances');
  await expect(footer).toContainText('Model current');
  await expect(footer).toContainText('8 definitions · 10 instances');
  await expect(properties.getByRole('status')).toHaveText(
    '6 parameters added · cabinet built with 8 parts (10 instances)',
  );
  let model = await savedWhen((m) => m.instances.length === 10, 'cabinet instances');
  if (model.parts.find((p) => p.name === 'Side').features.filter((f) => f.type === 'hole').length !== 32)
    throw new Error('Side should carry 12 pilot + 20 shelf-pin holes.');
  await shot('01-cabinet-built');
  checks.push(
    'Cabinet → Apply & build: Start list gone, 8 definitions · 10 instances, Model current, result line shown',
  );

  // 2. Parts list on the assembly drawing.
  await page.getByRole('button', { name: 'Drawings', exact: true }).click();
  await page.getByRole('button', { name: 'Generate views', exact: true }).click();
  const sheet = page.locator('.cad-sheet-preview svg');
  await sheet.waitFor({ timeout: 60000 });
  await expect(sheet.locator('[data-part-row="Side"][data-quantity="2"]')).toHaveCount(1);
  await expect(sheet.locator('[data-part-row="Adjustable shelf"][data-quantity="2"]')).toHaveCount(1);
  await expect(sheet.locator('[data-part-row]')).toHaveCount(8);
  await sheet.screenshot({ path: `${directory}/02-cabinet-sheet.png` });
  await page.getByRole('button', { name: 'Split drawing', exact: true }).click();
  checks.push('Assembly drawing parts list: 8 rows incl. Side 2 and Adjustable shelf 2');

  // 3. Width 900 re-sizes the whole carcass.
  await page.getByRole('button', { name: /Named parameters/ }).click();
  const width = properties.getByLabel('width', { exact: true });
  await width.fill('900');
  await width.press('Enter');
  await current();
  await treeItems('Side').nth(1).click();
  const extent = properties.getByLabel('Placed extent', { exact: true });
  await expect(extent).toContainText('X 882–900');
  await expect(
    properties.getByRole('group', { name: 'Position (mm)', exact: true }).getByLabel('X', { exact: true }),
  ).toHaveValue('=width');
  await treeItems('Bottom').first().click();
  await expect(properties.getByLabel('Part size', { exact: true })).toContainText('Size 864 × 500 × 18 mm');
  await expect(extent).toContainText('X 18–882');
  await page.getByRole('button', { name: 'Fit', exact: true }).click();
  await shot('03-cabinet-width-900');
  model = await savedWhen((m) => m.parameters.find((p) => p.name === 'width').value === 900, 'width 900');
  checks.push(
    'width 900: right Side spans X 882–900 (position =width, turned 180°), Bottom 864 × 500 × 18 at X 18–882',
  );

  // 4. Table and steel frame presets.
  for (const [preset, label, instances] of [
    ['table', 'table', 7],
    ['steel-frame', 'steel frame', 9],
  ]) {
    await freshModel();
    await buildPreset(preset);
    await expect(welcome).toHaveCount(0);
    await expect(footer).toContainText('Model current');
    await expect(properties.getByRole('status')).toContainText(`${label} built with`);
    await savedWhen((m) => m.instances.length === instances, `${preset} instances`);
    await page.getByRole('button', { name: 'Fit', exact: true }).click();
    await shot(`04-${preset}-built`);
    checks.push(`${preset} → Apply & build: ${instances} instances, Model current`);
  }

  // 5. Without building: the Start list says the parameters are ready.
  await freshModel();
  await welcome.getByRole('button', { name: 'Design parameters', exact: true }).click();
  await properties.getByLabel('Build the starter model from these parameters', { exact: true }).uncheck();
  await properties.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(properties.getByRole('status')).toHaveText(
    '6 parameters added — next: New sketch or Design parameters → Build',
  );
  // Back to the default panel (a click on empty background): the Start list.
  const box = await page.locator('.cad-viewport canvas').boundingBox();
  await page.mouse.click(box.x + 40, box.y + 40);
  await expect(welcome.locator('p').first()).toHaveText('6 parameters ready · start a sketch to use them');
  await shot('05-parameters-only');
  checks.push('Apply without building: the Start list reads "6 parameters ready · start a sketch to use them"');

  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(`${directory}/verification.json`, JSON.stringify({ status: 'passed', errors, checks }, null, 2));
  console.log('Starter model verification passed:\n- ' + checks.join('\n- '));
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` });
  console.error(await page.locator('body').innerText());
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}
