/* global document, process, console */
// Phase I (docs/sketch-studio-start-sketch.md): starting a sketch without the
// welcome card. A fresh model shows the three origin plane tiles and the
// Start list; hovering a tile names it, a click is drawing; S starts New
// sketch, the offset moves the tiles, a label click picks a plane; with a
// part the tiles are sized to it, a face is outlined and picked; a drag
// during the pick only orbits.
//   CAD_VERIFY_URL=http://127.0.0.1:5181/sketch node scripts/verify-start-sketch.mjs
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { cadSteps } from './sketch-cad-steps.mjs';

const directory = 'artifacts/sketch-cad/start-sketch';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [],
  checks = [];
page.on('pageerror', (e) => errors.push(e.message));
const { properties, toolbar, status, current, saved, savedWhen, project, typeHud, canvasCenter, drag, canvas } =
  cadSteps(page);
const shot = (name) => page.screenshot({ path: `${directory}/${name}.png` });
const hint = page.locator('.cad-viewport-hint');
const footer = page.locator('.cad-status');
const start = page.locator('.cad-start');
const planes = () => page.evaluate(() => document.querySelector('.cad-viewport').cadPlanes());
// Hover is applied on the next animation frame; poll the viewport state.
const planesWhen = async (predicate, message) => {
  for (let i = 0; i < 50; i++) {
    const state = await planes();
    if (predicate(state)) return state;
    await page.waitForTimeout(50);
  }
  throw new Error(`Origin planes never matched: ${message} (last ${JSON.stringify(await planes())})`);
};
const hover = async (point) => {
  const [x, y] = await project(point);
  await page.mouse.move(x - 6, y - 4);
  await page.mouse.move(x, y, { steps: 3 });
  return [x, y];
};
const PICK_HINT = 'New sketch: click a flat face or an origin plane · Esc cancels';
const REST_HINT = 'Click an origin plane to start a sketch · S starts one anywhere · Solid tab adds a board or tube';
// A typed rectangle from the sketch origin, then Esc Esc to finish.
const typedRectangle = async (width, height) => {
  await toolbar.getByRole('button', { name: 'Rectangle', exact: true }).click();
  await typeHud(0, 0);
  const c = await canvasCenter();
  await page.mouse.move(c.x + 120, c.y - 90, { steps: 4 });
  await typeHud(width, height);
  await expect(status).toContainText('1 item · closed profile');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
};

try {
  await page.goto(process.env.CAD_VERIFY_URL || 'http://127.0.0.1:5181/sketch');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '3D Model & workshop', exact: true }).click();
  await current();

  // 1. A fresh model: no welcome card; tiles, three labels, the Start list, the rest hint.
  await expect(page.locator('.cad-empty')).toHaveCount(0);
  let state = await planesWhen((s) => s.visible, 'tiles shown on a fresh model');
  assert.deepEqual(Object.keys(state.tiles), ['XY', 'XZ', 'YZ']);
  assert.equal(state.size, 400);
  await expect(page.locator('.cad-plane-labels')).toHaveCount(1);
  await expect(page.locator('.cad-plane-label')).toHaveCount(3);
  await expect(page.locator('.cad-plane-label')).toHaveText(['Top · XY', 'Front · XZ', 'Right · YZ']);
  for (const label of await page.locator('.cad-plane-label').all()) await expect(label).toBeVisible();
  await expect(start).toBeVisible();
  for (const name of ['New sketch', 'Board / plate', 'Tube / member', 'Design parameters', 'Import 2D profiles'])
    await expect(start.getByRole('button', { name, exact: true })).toBeVisible();
  await expect(hint).toContainText(REST_HINT);
  await shot('01-fresh-model');
  checks.push('fresh model: no .cad-empty, three 400 mm tiles and three .cad-plane-label chips, Start list, rest hint');

  // 2. Hover the Top tile in its unoccluded quarter from the default
  //    isometric view (+x / −y), then click it: drawing.
  const top = await hover([120, -120, 0]);
  state = await planesWhen((s) => s.hovered === 'XY', 'Top tile hovered');
  await expect(hint).toContainText('Sketch on Top (XY) · click to start');
  await expect(page.locator('.cad-plane-label[data-plane="XY"]')).toHaveClass(/is-hovered/);
  await shot('02-hover-top');
  await page.mouse.click(top[0], top[1]);
  await toolbar.waitFor();
  await expect(footer).toContainText('Sketching');
  state = await planes();
  assert.equal(state.visible, false, 'Tiles hide while drawing.');
  await shot('03-sketching-on-top');
  checks.push(
    'hover the Top tile → "Sketch on Top (XY) · click to start", hovered XY; one click → Sketch tools, Sketching',
  );

  // 3. A 100 × 60 rectangle typed in the HUD, Esc Esc: saved on XY at offset 0; Extrude has focus.
  await typedRectangle(100, 60);
  await expect(properties.getByRole('heading', { name: 'Sketch 1 finished' })).toBeVisible();
  let model = await savedWhen((m) => m.sketches.length === 1, 'first sketch');
  assert.deepEqual(model.sketches[0].support, { type: 'plane', plane: 'XY', offset: 0 });
  assert.equal(model.sketches[0].plane, 'XY');
  assert.deepEqual(model.sketches[0].profile, { type: 'rectangle', width: 100, height: 60, origin: [0, 0] });
  await expect(properties.getByRole('button', { name: 'Extrude', exact: true })).toBeFocused();
  await shot('04-sketch-finished');
  checks.push('typed 100 × 60 rectangle, Esc Esc → support { plane XY, offset 0 }; Extrude has the focus');

  // 4. Back at rest with a sketch but no parts: the tiles are still shown.
  await properties.getByRole('button', { name: 'Done', exact: true }).click();
  await planesWhen((s) => s.visible, 'tiles at rest with a sketch and no parts');
  await expect(start).toBeVisible();
  checks.push('back at rest with one sketch and no parts: tiles and Start list shown');

  // 5. S → the pick; offset 50 moves the tiles; the Front tile hint says +50 mm.
  await page.keyboard.press('s');
  await expect(hint).toContainText(PICK_HINT);
  await expect(footer).toContainText('Pick a face or plane to sketch on');
  await expect(properties.getByRole('heading', { name: 'New sketch', exact: true })).toBeVisible();
  await properties.getByLabel('Plane offset (mm)', { exact: true }).fill('50');
  state = await planesWhen((s) => s.offset === 50, 'offset 50');
  assert.ok(
    state.tiles.XZ.every((p) => p[1] === 50),
    'The Front tile moved to y = 50.',
  );
  assert.ok(state.tiles.XY.every((p) => p[2] === 50) && state.tiles.YZ.every((p) => p[0] === 50));
  await hover([120, 50, 120]);
  await planesWhen((s) => s.hovered === 'XZ', 'Front tile hovered');
  await expect(hint).toContainText('Sketch on Front (XZ, +50 mm) · click to start');
  await shot('05-pick-offset-50');
  checks.push('S → pick hint and "Pick a face or plane to sketch on"; offset 50 moves every tile; Front hint "+50 mm"');

  // 6. Click the Right · YZ label: a sketch on YZ at 50 (finished to read its support).
  await page.getByRole('button', { name: 'Right · YZ', exact: true }).click();
  await toolbar.waitFor();
  await shot('06-sketching-on-right');
  await typedRectangle(40, 30);
  model = await savedWhen((m) => m.sketches.length === 2, 'second sketch');
  assert.deepEqual(model.sketches[1].support, { type: 'plane', plane: 'YZ', offset: 50 });
  assert.equal(model.sketches[1].plane, 'YZ');
  assert.deepEqual(model.sketches[1].origin, [50, 0, 0]);
  await properties.getByRole('button', { name: 'Done', exact: true }).click();
  checks.push('Right · YZ label → sketch with support { plane YZ, offset 50 }, origin (50, 0, 0)');

  // 7. Cancel sketch from a tile: back at rest, nothing saved, tiles shown.
  await page.keyboard.press('s');
  await expect(hint).toContainText(PICK_HINT);
  const right = await hover([0, -120, 120]);
  await planesWhen((s) => s.hovered === 'YZ', 'Right tile hovered');
  await page.mouse.click(right[0], right[1]);
  await toolbar.waitFor();
  await toolbar.getByRole('button', { name: 'Cancel sketch', exact: true }).click();
  await expect(toolbar).toHaveCount(0);
  await planesWhen((s) => s.visible && s.offset === 0, 'tiles back at rest after Cancel sketch');
  assert.equal((await saved()).sketches.length, 2);
  checks.push('Right tile → Cancel sketch: no sketch saved, back at rest with the tiles');

  // 8. Board / plate from the Start list: tiles hide at rest; S brings them back sized 300.
  await start.getByRole('button', { name: 'Board / plate', exact: true }).click();
  await current();
  // It lands centred under the view centre: read where, for the face hover below.
  const boardAt = (await savedWhen((m) => m.instances.length === 1, 'the new board')).instances[0].position;
  assert.equal(boardAt[2], 0, 'The new board sits on the ground.');
  await planesWhen((s) => !s.visible, 'tiles hidden with a part at rest');
  await expect(start).toHaveCount(0);
  await expect(hint).not.toContainText(REST_HINT);
  await shot('07-board-at-rest');
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('s');
  state = await planesWhen((s) => s.visible, 'tiles back for the pick');
  assert.equal(state.size, 300);
  await expect(hint).toContainText(PICK_HINT);
  checks.push('Board / plate → tiles hidden at rest, Start list gone; S → tiles back at 300 mm');

  // 9. Hover the board's top face (off the tiles, which cross at the origin
  //    ±150 mm): outlined, named; click → a face sketch. Part point (525, 300)
  //    is near the board's back-right corner.
  const face = await hover(boardAt.map((v, i) => v + [525, 300, 18][i]));
  state = await planesWhen((s) => s.outline > 0 && !s.hovered, 'top face outlined');
  await expect(hint).toContainText('Sketch on this face of Board / plate · click to start');
  await shot('08-hover-board-face');
  await page.mouse.click(face[0], face[1]);
  await toolbar.waitFor();
  await typedRectangle(50, 50);
  model = await savedWhen((m) => m.sketches.length === 3, 'face sketch');
  assert.equal(model.sketches[2].support.type, 'face');
  assert.equal(model.sketches[2].support.instanceId, model.instances[0].id);
  await properties.getByRole('button', { name: 'Done', exact: true }).click();
  checks.push(
    `board at (${boardAt}): top face hover → outline (${state.outline} segments) + "Sketch on this face of Board / plate"; click → face sketch`,
  );

  // 10. A 60 px drag on the background during the pick orbits, never starts a sketch.
  await page.keyboard.press('s');
  await expect(hint).toContainText(PICK_HINT);
  const box = await canvas.boundingBox();
  await drag([box.x + 80, box.y + 80], [box.x + 140, box.y + 80], 6);
  await page.waitForTimeout(200);
  await expect(toolbar).toHaveCount(0);
  await expect(footer).toContainText('Pick a face or plane to sketch on');
  await page.keyboard.press('Escape');
  await expect(footer).not.toContainText('Pick a face or plane to sketch on');
  await planesWhen((s) => !s.visible, 'Esc cancels the pick');
  await shot('09-after-drag-and-esc');
  checks.push('60 px background drag during the pick → still picking, no sketch; Esc cancels');

  // 11. New inside the 3D workspace stays in it: with the board (and three
  //     sketches) unsaved, New → the in-app confirm → OK gives an empty 3D model.
  assert.equal((await saved()).instances.length, 1);
  await page.locator('.cad-file-actions').getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(page.locator('.cad-workspace')).toBeVisible();
  await current();
  await expect(footer).toContainText('0 definitions · 0 instances');
  await planesWhen((s) => s.visible && s.size === 400, 'tiles on the new empty model');
  await expect(start).toBeVisible();
  await savedWhen((m) => m.instances.length === 0 && m.parts.length === 0, 'an empty model after New');
  await shot('10-after-new');
  checks.push(
    'with a part: New → in-app OK → still .cad-workspace, Model current, tiles visible, Start list, 0 instances',
  );

  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ status: 'passed', errors, checks, model: await saved() }, null, 2),
  );
  console.log('Start-sketch verification passed:\n- ' + checks.join('\n- '));
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` });
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}
