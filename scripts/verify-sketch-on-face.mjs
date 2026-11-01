/* global localStorage, process, console */
// Builds the wooden desk by hand from an empty model with the in-viewport
// sketcher: sketch on plane → typed rectangle → extrude; sketch on the top's
// underside → typed circle → cut through; leg sketch → extrude; typed
// placements; then generated drawing views.
//   CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-sketch-on-face.mjs
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const directory = 'artifacts/sketch-cad/sketch-on-face';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [],
  checks = [];
page.on('pageerror', (e) => errors.push(e.message));
const current = () => page.getByText('Model current', { exact: true }).waitFor({ timeout: 60000 });
const shot = (name) => page.screenshot({ path: `${directory}/${name}.png` });
const properties = page.locator('.cad-properties');
const toolbar = page.getByRole('toolbar', { name: 'Sketch tools' });
const status = page.locator('.cad-sketch-status');
const canvas = page.locator('.cad-viewport canvas');
const saved = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('apartment-planner-sketch-recovery') || 'null')?.document?.model);
// The recovery copy is written shortly after each edit; poll until it matches.
const savedWhen = async (predicate, message) => {
  for (let i = 0; i < 100; i++) {
    const model = await saved();
    if (model && predicate(model)) return model;
    await page.waitForTimeout(100);
  }
  throw new Error(`Saved model never matched: ${message}`);
};
const canvasCenter = async () => {
  const box = await canvas.boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};
// Type into the focused HUD field, Tab to the next, Enter to apply.
const typeHud = async (first, second) => {
  await page.keyboard.type(String(first));
  if (second != null) {
    await page.keyboard.press('Tab');
    await page.keyboard.type(String(second));
  }
  await page.keyboard.press('Enter');
};
const sketchOnPlane = async (plane, offset = 0) => {
  await page.getByRole('button', { name: 'Sketch', exact: true }).click();
  // New sketch, then the exact plane in the Properties panel (Phase I).
  await page.locator('.cad-ribbon').getByRole('button', { name: 'New sketch', exact: true }).click();
  await properties.getByLabel('Sketch plane', { exact: true }).selectOption(plane);
  await properties.getByLabel('Plane offset (mm)', { exact: true }).fill(String(offset));
  await properties.getByRole('button', { name: 'Start sketch', exact: true }).click();
  await toolbar.waitFor();
};
const applyOperation = async (label, distance) => {
  if (distance != null) {
    const field = properties.getByLabel('Distance (mm)', { exact: true });
    await field.fill(String(distance));
    await field.press('Enter');
  }
  await expect(properties.getByRole('status')).toHaveText('Preview ready', { timeout: 60000 });
  await properties.getByRole('button', { name: label, exact: true }).click();
  await current();
};
const setPosition = async (x, y, z) => {
  const group = properties.getByRole('group', { name: 'Position (mm)', exact: true });
  for (const [axis, value] of [
    ['X', x],
    ['Y', y],
    ['Z', z],
  ]) {
    const field = group.getByLabel(axis, { exact: true });
    if (Number(await field.inputValue()) === value) continue;
    await field.fill(String(value));
    await field.press('Enter');
    await current();
  }
};

try {
  await page.goto(process.env.CAD_VERIFY_URL || 'http://localhost:5180/sketch');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '3D Model & workshop', exact: true }).click();
  await current();
  assert.equal((await saved())?.parts.length ?? 0, 0, 'Start from an empty model.');

  // 1. Desktop: rectangle 1200 × 650 on XY. First corner by clicking the
  //    origin (snap), size typed in the HUD.
  await sketchOnPlane('XY');
  await shot('01-sketch-on-xy');
  await toolbar.getByRole('button', { name: 'Rectangle', exact: true }).click();
  const center = await canvasCenter();
  await page.mouse.move(center.x + 3, center.y - 2);
  await expect(status).toContainText('X 0 · Y 0 mm · origin');
  await page.mouse.click(center.x + 3, center.y - 2);
  await expect(page.getByLabel('Sketch width', { exact: true })).toBeFocused();
  await page.mouse.move(center.x + 120, center.y - 60, { steps: 4 });
  await typeHud(1200, 650);
  await expect(status).toContainText('1 item · closed profile');
  await shot('02-desktop-rectangle');
  await toolbar.getByRole('button', { name: 'Finish sketch', exact: true }).click();
  await expect(properties.getByRole('heading', { name: 'Sketch 1 finished' })).toBeVisible();
  await expect(properties).toContainText('Rectangle 1200 × 650 at (0, 0)');
  await properties.getByRole('button', { name: 'Extrude', exact: true }).click();
  await applyOperation('Apply extrude', 24);
  await shot('03-desktop-extruded');
  let model = await savedWhen((m) => m.parts.length === 1, 'desktop part');
  assert.equal(model.parts.length, 1);
  assert.deepEqual(model.parts[0].features[0], {
    ...model.parts[0].features[0],
    type: 'extrude',
    operation: 'add',
    length: 24,
    reverse: false,
  });
  assert.deepEqual(model.instances[0].position, [0, 0, 0]);
  checks.push('typed 1200 × 650 rectangle on XY, origin snap, extruded 24 as a new part');

  // 2. Ø6 hole from the underside: bottom view, pick the face, typed centre
  //    (60, 60) and radius 3, cut through.
  const top = model.instances[0];
  await page.getByLabel('Standard view').selectOption('bottom');
  await page.getByRole('button', { name: 'Sketch', exact: true }).click();
  await page.locator('.cad-ribbon').getByRole('button', { name: 'New sketch', exact: true }).click();
  const pick = await canvasCenter();
  await page.mouse.click(pick.x, pick.y);
  await toolbar.waitFor();
  await shot('04-sketch-on-underside');
  await toolbar.getByRole('button', { name: 'Circle', exact: true }).click();
  await typeHud(60, 60);
  await expect(page.getByLabel('Sketch radius', { exact: true })).toBeFocused();
  await typeHud(3);
  await expect(status).toContainText('1 item · closed profile');
  await shot('05-hole-circle');
  // Esc ends the tool, Esc again finishes the sketch.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(properties.getByRole('heading', { name: 'Sketch 2 finished' })).toBeVisible();
  await expect(properties).toContainText('Circle Ø6 at (60, 60)');
  await properties.getByRole('button', { name: 'Cut', exact: true }).click();
  await expect(properties.getByLabel('Through all')).toBeChecked();
  await applyOperation('Apply cut');
  await shot('06-hole-cut');
  model = await savedWhen((m) => m.parts[0].features.length === 2, 'hole cut feature');
  const holeSketch = model.sketches[1];
  assert.equal(holeSketch.plane, 'custom');
  assert.deepEqual(holeSketch.normal, [0, 0, -1]);
  assert.deepEqual(holeSketch.xDirection, [-1, 0, 0]);
  assert.deepEqual(holeSketch.origin, [1200, 0, 0], 'Underside origin is the corner seen at lower left.');
  assert.deepEqual(holeSketch.profile, { type: 'circle', radius: 3, center: [60, 60] });
  const cut = model.parts[0].features[1];
  assert.equal(cut.operation, 'cut');
  assert.equal(cut.throughAll, true);
  assert.equal(cut.reverse, true);
  checks.push('picked the underside face; Ø6 at (60, 60) = world (1140, 60); through-all cut into the top');

  // 3. Leg: rectangle 60 × 60 on XY, corner typed at (0, 0), extruded 726.
  await page.getByLabel('Standard view').selectOption('isometric');
  await sketchOnPlane('XY');
  await toolbar.getByRole('button', { name: 'Rectangle', exact: true }).click();
  await typeHud(0, 0);
  const leg = await canvasCenter();
  await page.mouse.move(leg.x + 80, leg.y - 80, { steps: 4 });
  await typeHud(60, 60);
  await shot('07-leg-rectangle');
  await toolbar.getByRole('button', { name: 'Finish sketch', exact: true }).click();
  await properties.getByRole('button', { name: 'Extrude', exact: true }).click();
  await applyOperation('Apply extrude', 726);
  model = await savedWhen((m) => m.parts.length === 2, 'leg part');
  assert.equal(model.parts.length, 2);
  const legInstance = model.instances[1];
  assert.equal(model.parts[1].features[0].length, 726);
  checks.push('typed 60 × 60 leg on XY extruded 726');

  // 4. Placements typed in the Properties panel: top up to 726, four legs.
  await page.locator('.cad-tree-item', { hasText: 'Part 1' }).first().click();
  await setPosition(0, 0, 726);
  await page.locator('.cad-tree-item', { hasText: 'Part 2' }).first().click();
  for (const [x, y] of [
    [1140, 0],
    [0, 590],
    [1140, 590],
  ]) {
    await page.getByRole('button', { name: 'Assemble', exact: true }).click();
    await page.getByRole('button', { name: 'Duplicate instance', exact: true }).click();
    await current();
    await setPosition(x, y, 0);
  }
  model = await savedWhen(
    (m) =>
      m.instances.length === 5 &&
      m.instances.filter((i) => i.position.every((v) => typeof v === 'number')).length === 5,
    'five placed instances',
  );
  const positions = model.instances.map((i) => i.position.map(Number));
  assert.deepEqual(
    positions.sort((a, b) => a[2] - b[2] || a[0] - b[0] || a[1] - b[1]),
    [
      [0, 0, 0],
      [0, 590, 0],
      [1140, 0, 0],
      [1140, 590, 0],
      [0, 0, 726],
    ],
  );
  assert.equal(model.instances.find((i) => i.id === top.id).position[2], 726);
  assert(model.instances.filter((i) => i.partId === legInstance.partId).length === 4);
  await page.getByRole('button', { name: 'Fit', exact: true }).click();
  await shot('08-desk-assembled');
  checks.push('top placed at Z 726, four legs at the corners by typed positions');

  // 5. Re-open the hole sketch from the feature tree and leave it unchanged.
  await page.locator('.cad-tree-item', { hasText: 'Part 1' }).first().click();
  await page.getByRole('button', { name: 'Edit sketch of feature 2', exact: true }).click();
  await toolbar.waitFor();
  await expect(status).toContainText('1 item · closed profile');
  await shot('09-reopened-hole-sketch');
  await toolbar.getByRole('button', { name: 'Cancel sketch', exact: true }).click();
  checks.push('hole sketch reopened from the Parts & features tree');

  // 6. Drawings.
  await current();
  await page.getByRole('button', { name: 'Drawings', exact: true }).click();
  await page.getByRole('button', { name: 'Generate views', exact: true }).click();
  await page.locator('.cad-sheet-preview svg').waitFor({ timeout: 60000 });
  await shot('10-drawing-views');
  await page.locator('.cad-sheet-preview svg').screenshot({ path: `${directory}/sheet.png` });
  checks.push('Generate views produced the sheet SVG');

  // 7. Placement from a face: sketch on the desktop's top face (Z 750), extrude
  //    a 50 × 50 block as a new part; its instance must sit on that face.
  await page.getByLabel('Standard view').selectOption('top');
  await page.getByRole('button', { name: 'Sketch', exact: true }).click();
  await page.locator('.cad-ribbon').getByRole('button', { name: 'New sketch', exact: true }).click();
  const topFace = await canvasCenter();
  await page.mouse.click(topFace.x, topFace.y);
  await toolbar.waitFor();
  await toolbar.getByRole('button', { name: 'Rectangle', exact: true }).click();
  await typeHud(100, 100);
  await page.mouse.move(topFace.x + 200, topFace.y - 200, { steps: 4 });
  await typeHud(50, 50);
  await toolbar.getByRole('button', { name: 'Finish sketch', exact: true }).click();
  await properties.getByRole('button', { name: 'Extrude', exact: true }).click();
  await applyOperation('Apply extrude', 30);
  model = await savedWhen((m) => m.parts.length === 3, 'block part');
  const block = model.instances.at(-1);
  assert.deepEqual(block.position, [0, 0, 750], 'The block instance sits on the top face (Z 750).');
  assert.deepEqual(block.rotation, [0, 0, 0]);
  const blockSketch = model.sketches.at(-1);
  assert.equal(blockSketch.plane, 'XY');
  assert.deepEqual(blockSketch.origin, [0, 0, 0]);
  assert.deepEqual(blockSketch.profile, { type: 'rectangle', width: 50, height: 50, origin: [100, 100] });
  await page.getByLabel('Standard view').selectOption('isometric');
  await page.getByRole('button', { name: 'Fit', exact: true }).click();
  await shot('11-block-on-top-face');
  // Undo the extrude and the sketch: the desk is back to two definitions.
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await current();
  }
  await savedWhen((m) => m.parts.length === 2 && m.sketches.length === 3, 'undo back to the desk');
  checks.push('top-face sketch → new part placed at the face (position 0, 0, 750); two Undos restore the desk');

  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ status: 'passed', errors, checks, model: await saved() }, null, 2),
  );
  console.log('Sketch-on-face desk verification passed:\n- ' + checks.join('\n- '));
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` });
  console.error(await page.locator('body').innerText());
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}
