/* global localStorage, process, console, document */
// Phase K: hole rows (docs/sketch-studio-hole-row.md). Add a board; Solid →
// Hole row → top view → hover a corner (vertex snap) → click a grid point
// 20 mm in → move along +X (the rubber row: "4 holes") → ↑ then ↓ (5 → 4)
// → click 150 mm along +X → Shape: arrow, square, grip and the end square →
// drag the end square while typing 50 + Enter → Apply (camera held) → the
// saved hole has row { count 4, pitch 50, direction [1, 0, 0] } → Move
// holes shows 4 handles and the third moves the whole row → Drawings →
// Generate views; the workshop ZIP's detail sheet reads "4 ×" and the pitch.
// Phase L (docs/sketch-studio-live-fields.md): in Shape, *Holes in row* 6
// typed without Enter reshapes the row within 1 s (then back to 4); after
// Apply, *Spacing (mm)* 60 typed without Enter in the tree editor reaches the
// saved model, and one Undo puts 50 back.
//   CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-hole-row.mjs
import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { cadSteps } from './sketch-cad-steps.mjs';

const directory = 'artifacts/sketch-cad/hole-row';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
const errors = [],
  checks = [];
page.on('pageerror', (e) => errors.push(e.message));
const { properties, current, savedWhen, project, view, canvasCenter } = cadSteps(page);
const ribbon = page.locator('.cad-ribbon');
const hud = page.locator('.cad-placement-hud');
const hint = page.locator('.cad-viewport-hint');
const status = properties.getByRole('status');
const placement = () => page.evaluate(() => document.querySelector('.cad-viewport').cadPlacement());
const holeHandles = () => page.evaluate(() => document.querySelector('.cad-viewport').cadHoleHandles());
const handle = async (id) => {
  const found = (await placement()).handles.find((h) => h.id === id);
  assert(found, `The ${id} handle is shown.`);
  return found;
};
const add = (a, b) => a.map((v, i) => v + b[i]);
const near = (a, b, tolerance = 1e-3) => a.every((v, i) => Math.abs(v - b[i]) <= tolerance);
const previewReady = () => expect(status).toHaveText('Preview ready', { timeout: 60000 });
const shot = (name) => page.screenshot({ path: `${directory}/${name}.png` });
// A paced drag that holds the button while typing a value, then Enter.
const dragAndType = async (from, to, typed, steps = 10) => {
  await page.mouse.move(from[0], from[1]);
  await page.waitForTimeout(100);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps);
    await page.waitForTimeout(80);
  }
  await page.keyboard.type(String(typed));
  await page.keyboard.press('Enter');
  await page.mouse.up();
};

try {
  await page.goto(process.env.CAD_VERIFY_URL || 'http://localhost:5180/sketch');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '3D Model & workshop', exact: true }).click();
  await current();
  // The default board (600 × 400 × 18) lands under the view centre: read
  // where; world points below are part points plus its position (not turned).
  await ribbon.getByRole('button', { name: 'Board / plate', exact: true }).click();
  await current();
  const boardModel = await savedWhen((m) => m.instances.length === 1, 'the new board');
  const boardAt = boardModel.instances[0].position;
  const partId = boardModel.instances[0].partId;
  const onBoard = (p) => add(boardAt, p);
  await page.keyboard.press('Escape');

  // 1. Solid → Hole row: Place, then the first hole near a corner.
  await ribbon.getByRole('button', { name: 'Hole row', exact: true }).click();
  await expect(hint).toContainText('Hole row: click where the first hole goes');
  await expect(properties.getByRole('heading', { name: 'Place hole row' })).toBeVisible();
  assert.equal((await placement()).stage, 'place');
  await view('top');
  await page.waitForTimeout(400);
  const corner = await project(onBoard([0, 0, 18]));
  const inward = await project(onBoard([10, 10, 18]));
  const atCorner = [corner[0] + (inward[0] - corner[0]) * 0.2, corner[1] + (inward[1] - corner[1]) * 0.2];
  await page.mouse.move(atCorner[0], atCorner[1], { steps: 4 });
  await expect(hud).toContainText('vertex');
  assert.equal((await placement()).snapKind, 'vertex', 'The corner snaps (vertex).');
  assert(near((await placement()).hover.point, onBoard([0, 0, 18])), 'The hover sits on the corner.');
  // A grid point 20 mm in from that corner (Move grid 1 mm).
  const first = await project(onBoard([20.3, 20.2, 18]));
  await page.mouse.move(first[0], first[1], { steps: 4 });
  await expect(hud).toContainText('grid');
  assert(near((await placement()).hover.point, onBoard([20, 20, 18])), 'The first hole snaps to the grid.');
  await page.mouse.click(first[0], first[1]);
  await expect(hint).toContainText('click where the last hole goes');
  const seeded = await placement();
  assert.equal(seeded.stage, 'place', 'The first click keeps Place.');
  assert.equal(seeded.pick, 'path', 'The last hole is picked on the seed plane.');
  await expect(
    properties.getByText('First hole on Board / plate · top face at (20, 20) · click where the last hole goes'),
  ).toBeVisible();
  checks.push('hole row place: corner hover snapped (vertex), first hole on the grid at (20, 20), Place kept');

  // 2. The rubber row along +X; ↑ then ↓ change the count.
  const last = await project(onBoard([170.4, 20.3, 18]));
  await page.mouse.move(last[0], last[1], { steps: 6 });
  await expect(hud).toContainText('4 holes');
  await expect(hud).toContainText('pitch 50 mm · 150 mm');
  assert.equal(await page.locator('.cad-placement-hud').count(), 1, 'One placement readout element.');
  assert.equal(await page.locator('.cad-viewport-hint').count(), 1, 'One viewport hint element.');
  await shot('01-rubber-row');
  await page.keyboard.press('ArrowUp');
  await expect(hud).toContainText('5 holes');
  assert.equal((await placement()).row.count, 5);
  await page.keyboard.press('ArrowDown');
  await expect(hud).toContainText('4 holes');
  const rubber = (await hud.innerText()).replace(/\s+/g, ' ');
  checks.push(`rubber row: "${rubber}"; ↑ → 5 holes, ↓ → 4 holes`);

  // 3. The second click: the last hole 150 mm along +X → Shape.
  await page.mouse.click(last[0], last[1]);
  await expect(hint).toContainText('Hole row: drag the end square');
  const shaped = await placement();
  assert.equal(shaped.stage, 'shape');
  assert.deepEqual(
    shaped.handles.map((h) => h.id),
    ['distance', 'slide', 'radius', 'row-end'],
  );
  assert.deepEqual(shaped.row, { seed: false, count: 4, pitch: 50, length: 150 });
  await previewReady();
  await expect(
    properties.getByText(
      'Row of 4 holes on Board / plate · top face · from (20, 20) along +X · pitch 50 mm · 150 mm · Ø 6 mm · through all',
    ),
  ).toBeVisible();
  await shot('02-shaped-row');
  checks.push(`shape: handles ${shaped.handles.map((h) => h.id)}; row ${JSON.stringify(shaped.row)}`);

  // 4. Drag the end square further out while typing 50 + Enter: the spacing.
  const end = await handle('row-end');
  assert(near(end.at, onBoard([170, 20, 18])), `The end square sits on the last hole: ${end.at}`);
  await dragAndType([end.x, end.y], await project(onBoard([230, 20, 18])), 50);
  await expect(properties.getByLabel('Spacing (mm)', { exact: true })).toHaveValue('50');
  await previewReady();
  assert.equal((await placement()).row.pitch, 50);
  checks.push('end square: dragged toward 70 mm spacing, typed 50 + Enter → spacing 50');

  // 4b. Phase L: the count applies as you type, without Enter.
  const shapeCount = properties.getByLabel('Holes in row', { exact: true });
  await shapeCount.click();
  await shapeCount.selectText();
  await shapeCount.pressSequentially('6');
  await expect.poll(async () => (await placement()).row.count, { timeout: 1000 }).toBe(6);
  assert.deepEqual((await placement()).row, { seed: false, count: 6, pitch: 50, length: 250 });
  await expect(properties.getByText(/^Row of 6 holes on Board \/ plate .* pitch 50 mm · 250 mm/)).toBeVisible({
    timeout: 1000,
  });
  await expect(shapeCount).toBeFocused();
  await expect(shapeCount).toHaveValue('6');
  await shot('02b-live-count');
  await shapeCount.selectText();
  await shapeCount.pressSequentially('4');
  await expect.poll(async () => (await placement()).row.count, { timeout: 1000 }).toBe(4);
  await shapeCount.press('Enter');
  await previewReady();
  assert.deepEqual((await placement()).row, { seed: false, count: 4, pitch: 50, length: 150 });
  checks.push('live count: "6" typed without Enter → row of 6 (250 mm) within 1 s, focus kept; "4" restores');

  // 5. Apply keeps the camera: zoom off the fit, an off-centre probe.
  const probe = onBoard([600, 400, 18]);
  const fitted = await project(probe);
  const zoomAt = await canvasCenter();
  await page.mouse.move(zoomAt.x, zoomAt.y);
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(300);
  const cameraBefore = await project(probe);
  assert(Math.hypot(cameraBefore[0] - fitted[0], cameraBefore[1] - fitted[1]) > 2, 'The wheel moved the camera.');
  await properties.getByRole('button', { name: 'Apply hole row', exact: true }).click();
  await current();
  const saved = await savedWhen((m) => m.parts[0].features.some((f) => f.type === 'hole'), 'a hole row');
  await page.waitForTimeout(500);
  await current();
  const cameraAfter = await project(probe);
  const cameraDelta = Math.hypot(cameraAfter[0] - cameraBefore[0], cameraAfter[1] - cameraBefore[1]);
  assert(cameraDelta <= 0.5, `Apply hole row moved the camera: (${probe}) shifted ${cameraDelta} px.`);
  const holes = saved.parts[0].features.filter((f) => f.type === 'hole');
  assert.equal(holes.length, 1, 'One feature for the whole row.');
  const row = holes[0];
  assert.deepEqual(row.row, { count: 4, pitch: 50, direction: [1, 0, 0] });
  assert.deepEqual(row.position, [20, 20, 18]);
  assert.deepEqual(row.direction, [0, 0, -1]);
  assert.equal('placement' in row, false, 'A placed row has no placement record.');
  checks.push(
    `applied: one hole feature, row ${JSON.stringify(row.row)}, position (${row.position}), direction (${row.direction}); camera delta ${cameraDelta.toFixed(3)} px`,
  );
  // The tree: one entry, the heading names the count; the Row of holes block.
  await expect(properties.getByRole('heading', { name: 'hole ×4 · feature 2' })).toBeVisible();
  const block = properties.getByRole('group', { name: 'Row of holes' });
  await expect(block.getByLabel('Holes in row', { exact: true })).toHaveValue('4');
  await expect(properties.getByText(/^Cut applied ·/)).toBeVisible();

  // 5b. Phase L: the tree editor's Spacing applies as you type; one Undo.
  const treeSpacing = block.getByLabel('Spacing (mm)', { exact: true });
  await treeSpacing.click();
  await treeSpacing.selectText();
  await treeSpacing.pressSequentially('60');
  const live = await savedWhen(
    (m) => m.parts[0].features.find((f) => f.type === 'hole')?.row?.pitch === 60,
    'the typed spacing 60',
  );
  assert.deepEqual(live.parts[0].features.find((f) => f.type === 'hole').row, { ...row.row, pitch: 60 });
  await expect(treeSpacing).toBeFocused();
  await expect(treeSpacing).toHaveValue('60');
  await expect(block.getByLabel('Row length (mm)', { exact: true })).toHaveValue('180');
  await current();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await current();
  const restored = await savedWhen(
    (m) => m.parts[0].features.find((f) => f.type === 'hole')?.row?.pitch === 50,
    'one Undo of the typed spacing',
  );
  assert.deepEqual(restored.parts[0].features.find((f) => f.type === 'hole').row, row.row);
  await expect(treeSpacing).toHaveValue('50');
  checks.push('live tree spacing: "60" typed without Enter → saved pitch 60, focus kept; one Undo → 50');

  await page.getByRole('button', { name: 'Fit', exact: true }).click();
  await page.waitForTimeout(300);

  // 6. Move holes: four handles; dragging the third moves the whole row.
  await page.locator('.cad-tree').getByRole('button', { name: /Board \/ plate/ }).click();
  await ribbon.getByRole('button', { name: 'Move holes', exact: true }).click();
  await expect.poll(async () => (await holeHandles()).length).toBe(4);
  const handles = await holeHandles();
  assert.deepEqual(
    handles.map((h) => h.index),
    [0, 1, 2, 3],
  );
  assert(near(handles[2].at, onBoard([120, 20, 18])), `The third handle sits on the third hole: ${handles[2].at}`);
  await shot('03-move-holes');
  const third = await project(handles[2].at);
  const moved = await project(onBoard([140, 40, 18]));
  await page.mouse.move(third[0], third[1]);
  await page.mouse.down();
  await page.mouse.move(moved[0], moved[1], { steps: 10 });
  await page.mouse.up();
  await current();
  const afterMove = await savedWhen(
    (m) => m.parts[0].features.find((f) => f.type === 'hole').position[0] !== 20,
    'the row moved',
  );
  const movedRow = afterMove.parts[0].features.find((f) => f.type === 'hole');
  const shift = movedRow.position.map((v, i) => v - row.position[i]);
  assert(shift[0] > 10 && shift[1] > 10, `Dragging the third hole moved the first hole too: ${movedRow.position}`);
  assert(Math.abs(shift[2]) < 1e-6, 'The row stays on the face.');
  assert.deepEqual(movedRow.row, row.row, 'The row itself is unchanged.');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await current();
  const undone = await savedWhen(
    (m) => m.parts[0].features.find((f) => f.type === 'hole').position[0] === 20,
    'undo of the row move',
  );
  assert.deepEqual(undone.parts[0].features.find((f) => f.type === 'hole').position, [20, 20, 18]);
  await page.keyboard.press('Escape');
  checks.push(`move holes: 4 handles; third dragged → first hole moved by (${shift.map((v) => +v.toFixed(3))}); one Undo restores`);

  // 7. Drawings: Generate views, then the detail sheet in the workshop ZIP.
  await page.getByRole('button', { name: 'Drawings', exact: true }).click();
  await ribbon.getByRole('button', { name: 'Generate views', exact: true }).click();
  await page.locator('.cad-sheet-preview svg').waitFor({ timeout: 60000 });
  await shot('04-drawings');
  await page.getByRole('button', { name: 'Manufacture', exact: true }).click();
  const download = page.waitForEvent('download', { timeout: 120000 });
  await ribbon.getByRole('button', { name: 'Workshop ZIP', exact: true }).click();
  const file = await (await download).path();
  const zip = await JSZip.loadAsync(await readFile(file));
  const detail = zip.file(`drawings/detail-${partId.replace(/[^A-Za-z0-9_-]/g, '_')}.svg`);
  assert(detail, `The workshop ZIP has the board's detail sheet: ${Object.keys(zip.files).join(', ')}`);
  const text = await detail.async('string');
  assert(text.includes('4 × Ø6.00 through all'), 'The detail sheet counts the holes: "4 × Ø6.00 through all".');
  assert(text.includes('4 holes, pitch 50.00'), 'The detail sheet gives the pitch.');
  await writeFile(`${directory}/detail-sheet.svg`, text);
  checks.push('drawings: Generate views; the workshop ZIP detail sheet reads "4 × Ø6.00 through all … 4 holes, pitch 50.00"');

  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(`${directory}/verification.json`, JSON.stringify({ status: 'passed', errors, checks }, null, 2));
  console.log('Hole row verification passed:\n- ' + checks.join('\n- '));
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` });
  console.error(
    await page
      .locator('.cad-properties')
      .innerText()
      .catch(() => ''),
  );
  console.error(JSON.stringify(await placement().catch(() => null)));
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}
