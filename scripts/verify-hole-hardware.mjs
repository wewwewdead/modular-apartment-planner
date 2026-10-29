import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { emptyModel } from '../src/features/sketchstudio/cad/model.js';

await mkdir('artifacts/sketch-cad', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const current = () => page.getByText('Model current', { exact: true }).waitFor({ timeout: 60000 });
const recovered = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('apartment-planner-sketch-recovery')).document.model);
const settle = async () => {
  await current();
  await page.waitForTimeout(1200);
};
try {
  await page.goto(process.env.CAD_VERIFY_URL || 'http://127.0.0.1:5180/sketch');
  const model = {
    ...emptyModel(),
    parts: [
      {
        id: 'plate',
        name: 'Test plate',
        material: 'Steel',
        features: [{ id: 'base', type: 'box', width: 100, depth: 80, height: 5 }],
      },
    ],
    instances: [{ id: 'plate-instance', partId: 'plate', position: [0, 0, 0], rotation: [0, 0, 0] }],
  };
  await page.evaluate(
    (model) =>
      localStorage.setItem(
        'apartment-planner-sketch-recovery',
        JSON.stringify({
          kind: 'sketchstudio-workspace',
          version: 2,
          document: {
            id: 'hole-hardware-test',
            name: 'Hole and hardware test',
            version: 4,
            units: 'mm',
            layers: [{ id: 'default', name: 'Default', visible: true, locked: false }],
            entities: [],
            model,
          },
          ui: { workspaceMode: 'model' },
          viewport: { zoom: 1, panX: 0, panY: 0 },
        }),
      ),
    model,
  );
  await page.reload();
  await current();
  await page.getByRole('button', { name: 'Test plate', exact: false }).first().click();
  await page.getByLabel('Standard view').selectOption('top');
  const toolbar = page.locator('.cad-view-toolbar');
  await toolbar.getByRole('button', { name: 'Place holes', exact: true }).click();
  await page.getByLabel('Hole purpose').selectOption('tap');
  await page.getByLabel('Thread size').selectOption('M3');
  await page.getByLabel('Hole snap (mm)').fill('1');
  const box = await page.locator('.cad-viewport canvas').boundingBox();
  const start = { x: box.x + box.width / 2 - 45, y: box.y + box.height / 2 + 30 };
  await page.mouse.click(start.x, start.y);
  await settle();
  let saved = await recovered();
  assert.equal(saved.parts[0].features.length, 2, 'One click creates one hole');
  const hole = saved.parts[0].features[1];
  assert.equal(hole.diameter, 2.5);
  assert.equal(hole.holeSpec.size, 'M3');
  assert(Math.abs(hole.position[2] - 5) < 1e-5);
  assert(Number.isInteger(hole.position[0]) && Number.isInteger(hole.position[1]));
  await page.getByRole('button', { name: 'Finish holes', exact: true }).click();
  await toolbar.getByRole('button', { name: 'Move holes', exact: true }).click();
  await page.getByLabel('Hole snap (mm)').fill('0');
  // Top view spans 160 mm vertically; snapped center is computed from saved coordinates.
  const center = {
    x: box.x + box.width / 2 + ((hole.position[0] - 50) * box.height) / 160,
    y: box.y + box.height / 2 - ((hole.position[1] - 40) * box.height) / 160,
  };
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 43, center.y - 27, { steps: 10 });
  await page.mouse.up();
  await settle();
  saved = await recovered();
  const moved = saved.parts[0].features[1];
  assert(moved.position[0] > hole.position[0] + 1, 'Dragging the hole center moves the actual bore');
  assert(Math.abs(moved.position[2] - 5) < 1e-5);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await settle();
  assert.deepEqual(
    (await recovered()).parts[0].features[1].position,
    hole.position,
    'One undo restores the whole drag',
  );
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await settle();
  const movedCenter = { x: center.x + 43, y: center.y - 27 };
  await page.mouse.move(movedCenter.x, movedCenter.y);
  await page.mouse.down();
  await page.mouse.move(movedCenter.x + 30, movedCenter.y + 15, { steps: 5 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await settle();
  assert.deepEqual((await recovered()).parts[0].features[1].position, moved.position, 'Escape cancels hole drag');
  await page.getByLabel('Lock hole position').check();
  await settle();
  assert(await page.getByRole('button', { name: 'Move hole on surface', exact: true }).isDisabled());
  await page.getByLabel('Lock hole position').uncheck();
  await page.getByRole('button', { name: 'Hardware library', exact: true }).click();
  await page.getByLabel('Hardware type').selectOption('standoff');
  await page.getByLabel('Supplier part number').fill('TEST-M3-SPACER');
  await page.getByLabel('Supplier part number').press('Tab');
  await page.getByRole('button', { name: 'Add hardware', exact: true }).click();
  await settle();
  saved = await recovered();
  assert.equal(saved.parts.length, 2);
  assert.equal(saved.connections[0].toFeatureId, hole.id);
  assert.equal(saved.parts[1].features[0].supplierCode, 'TEST-M3-SPACER');
  await page.screenshot({ path: 'artifacts/sketch-cad/hole-hardware.png', fullPage: true });
  await page.reload();
  await settle();
  assert.equal((await recovered()).connections[0].toFeatureId, hole.id, 'Recovery retains hardware attachment');
  await page.getByRole('button', { name: 'Rear cover example', exact: true }).click();
  await settle();
  assert.equal((await recovered()).parts.length, 3, 'Reference example appends without replacing work');
  await page.getByLabel('Standard view').selectOption('isometric');
  await page.getByRole('button', { name: 'Drawings', exact: true }).click();
  await page.getByRole('button', { name: 'Generate views', exact: true }).click();
  await page.locator('.cad-sheet-preview svg').waitFor({ timeout: 60000 });
  assert((await page.locator('.cad-sheet-preview').textContent()).includes('Hole centers are assumed'));
  await page.screenshot({ path: 'artifacts/sketch-cad/rear-cover-drawing.png', fullPage: true });
  assert.deepEqual(errors, []);
  await writeFile(
    'artifacts/sketch-cad/hole-hardware-checks.json',
    JSON.stringify(
      {
        status: 'passed',
        checks: [
          'surface click',
          'M3 cutting-tap pilot',
          'snap',
          'free drag',
          'undo/redo',
          'Escape',
          'position lock',
          'attached hardware',
          'recovery',
          'rear cover drawing and retained assembly',
        ],
        errors,
      },
      null,
      2,
    ),
  );
  console.log('Hole and hardware browser checks passed.');
} catch (error) {
  await page.screenshot({ path: 'artifacts/sketch-cad/hole-hardware-failure.png', fullPage: true });
  console.error(await page.locator('.cad-error').allTextContents());
  throw error;
} finally {
  await browser.close();
}
