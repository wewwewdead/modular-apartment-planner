/* global localStorage, process, console, document */
// Phase J: direct placement for Hole, Pocket, Transform and hardware
// (docs/sketch-studio-cut-placement.md). Add a board; Hole → top view → click
// near a corner (vertex snap) → drag the depth arrow up to a blind depth and
// back past the far face (Through all) → Apply; Pocket → click → corner grip
// → typed depth 3 → Apply; Edit hole with preview shows the handles;
// Transform → gizmo drag → Apply; Hardware library → Add hardware (not
// attached) → click the board → Apply: it stands on the board.
//   CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-cut-placement.mjs
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { cadSteps } from './sketch-cad-steps.mjs';

const directory = 'artifacts/sketch-cad/cut-placement';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [],
  checks = [];
page.on('pageerror', (e) => errors.push(e.message));
const { properties, current, savedWhen, project, view, drag, canvasCenter } = cadSteps(page);
const ribbon = page.locator('.cad-ribbon');
const hud = page.locator('.cad-placement-hud');
const hint = page.locator('.cad-viewport-hint');
const status = properties.getByRole('status');
const placement = () => page.evaluate(() => document.querySelector('.cad-viewport').cadPlacement());
const handle = async (id) => {
  const found = (await placement()).handles.find((h) => h.id === id);
  assert(found, `The ${id} handle is shown.`);
  return found;
};
const add = (a, b) => a.map((v, i) => v + b[i]);
const near = (a, b, tolerance = 1e-3) => a.every((v, i) => Math.abs(v - b[i]) <= tolerance);
const previewReady = () => expect(status).toHaveText('Preview ready', { timeout: 60000 });
const board = () =>
  page
    .locator('.cad-tree')
    .getByRole('button', { name: /Board \/ plate/ })
    .click();
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
  // The default board: 600 × 400 × 18, centred under the view centre (the
  // origin on this untouched view). Read where it landed: the world points
  // below are part points plus its position (it is not turned).
  await ribbon.getByRole('button', { name: 'Board / plate', exact: true }).click();
  await current();
  const boardAt = (await savedWhen((m) => m.instances.length === 1, 'the new board')).instances[0].position;
  assert.deepEqual(boardAt, [-300, -200, 0], 'A first board on an untouched view is centred on the origin.');
  const onBoard = (p) => add(boardAt, p);
  await page.keyboard.press('Escape');

  // 1. Hole with nothing needed but the click: top view, near a corner.
  await ribbon.getByRole('button', { name: 'Hole', exact: true }).click();
  await expect(hint).toContainText('Hole: click a flat face to drill there');
  assert.equal((await placement()).stage, 'place');
  await view('top');
  await page.waitForTimeout(400);
  const corner = await project(onBoard([600, 400, 18]));
  const inward = await project(onBoard([590, 390, 18]));
  const at = [corner[0] + (inward[0] - corner[0]) * 0.25, corner[1] + (inward[1] - corner[1]) * 0.25];
  await page.mouse.move(at[0], at[1], { steps: 4 });
  await expect(hud).toContainText('vertex');
  const hovered = await placement();
  assert.equal(hovered.snapKind, 'vertex');
  assert.equal(hovered.cut, true, 'The hole ghost is a cut (red).');
  assert(near(hovered.hover.point, onBoard([600, 400, 18])), `Hover snaps to the corner: ${hovered.hover.point}`);
  assert.equal(await page.locator('.cad-placement-hud').count(), 1, 'One placement readout element.');
  const hoverText = (await hud.innerText()).replace(/\s+/g, ' ');
  await page.screenshot({ path: `${directory}/01-hole-hover-corner.png` });
  await page.mouse.click(at[0], at[1]);
  await expect(hint).toContainText('Hole: drag the arrow for the depth');
  const placed = await placement();
  assert.deepEqual(
    placed.handles.map((h) => h.id),
    ['distance', 'slide', 'radius'],
  );
  assert.equal(placed.throughAll, true, 'A new hole starts through all.');
  await previewReady();
  await expect(properties.getByText('On Board / plate · top face · Ø 6 mm at (600, 400) · through all')).toBeVisible();
  checks.push(
    `hole place: hover readout "${hoverText}", snapped to the corner; handles ${placed.handles.map((h) => h.id)}`,
  );

  // The depth arrow, seen from the side: up to a blind depth, then past the far face.
  await view('isometric');
  await page.waitForTimeout(400);
  let arrow = await handle('distance');
  assert.equal(arrow.value, 18);
  await drag([arrow.x, arrow.y], await project(add(arrow.at, [0, 0, 9])), 10);
  await expect(properties.getByLabel('Cut extent', { exact: true })).toHaveValue('blind');
  const blind = Number(await properties.getByLabel('Depth (mm)', { exact: true }).inputValue());
  assert(blind > 5 && blind < 13, `The arrow set a blind depth (${blind} mm).`);
  await previewReady();
  arrow = await handle('distance');
  const past = await project(add(arrow.at, [0, 0, -(18 - blind) - 8]));
  await page.mouse.move(arrow.x, arrow.y);
  await page.waitForTimeout(100);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(arrow.x + ((past[0] - arrow.x) * i) / 10, arrow.y + ((past[1] - arrow.y) * i) / 10);
    await page.waitForTimeout(80);
  }
  await expect(hud).toContainText('Through all');
  assert.equal((await placement()).throughAll, true);
  await page.screenshot({ path: `${directory}/02-hole-through-all.png` });
  await page.mouse.up();
  await expect(properties.getByLabel('Cut extent', { exact: true })).toHaveValue('through');
  await previewReady();
  await properties.getByRole('button', { name: 'Apply hole', exact: true }).click();
  await current();
  const holed = await savedWhen((m) => m.parts[0].features.some((f) => f.type === 'hole'), 'a hole on the board');
  const hole = holed.parts[0].features.find((f) => f.type === 'hole');
  assert.deepEqual(hole.position, [600, 400, 18]);
  assert.deepEqual(hole.direction, [0, 0, -1]);
  assert.equal(hole.throughAll, true);
  assert.equal('placement' in hole, false, 'A placed hole has no placement record.');
  checks.push(
    `hole applied: position (${hole.position}), direction (${hole.direction}), throughAll ${hole.throughAll}, no placement; arrow dragged to ${blind} mm blind, then past the far face = "Through all"`,
  );
  // The tree editor keeps the location fieldset and Move hole on surface.
  await expect(properties.getByText(/^Cut applied ·/)).toBeVisible();
  await expect(properties.getByLabel('Cut placement', { exact: true })).toHaveValue('coordinates');
  await expect(properties.getByRole('button', { name: 'Move hole on surface', exact: true })).toBeVisible();

  // 2. Edit hole with preview: the handles sit on the stored hole; Esc cancels.
  await properties.getByRole('button', { name: 'Edit hole with preview', exact: true }).click();
  await previewReady();
  const editing = await placement();
  assert.deepEqual(
    editing.handles.map((h) => h.id),
    ['distance', 'slide', 'radius'],
  );
  assert(near(editing.handles[1].at, onBoard([600, 400, 18])), 'The slide square sits on the hole centre.');
  await page.keyboard.press('Escape');
  assert.equal((await placement()).active, false);
  assert.equal((await placement()).orbit, true);
  checks.push('edit hole with preview: arrow, square and grip at the stored hole; Esc cancels, orbit enabled');

  // 3. Pocket: click the face centre, drag the corner grip, type 3 during the depth drag.
  await ribbon.getByRole('button', { name: 'Pocket', exact: true }).click();
  await expect(hint).toContainText('Pocket: click a flat face');
  const middle = await project(onBoard([300, 200, 18]));
  await page.mouse.move(middle[0] + 2, middle[1] + 1, { steps: 4 });
  await expect(hud).toContainText('face centre');
  await page.mouse.click(middle[0] + 2, middle[1] + 1);
  await previewReady();
  // The face centre moved a hair off (300, 200) when the corner hole cut the face.
  // The grip sits on the back-right corner, as Extrude's.
  const grip = await handle('corner');
  assert(near(grip.at, onBoard([306, 210, 18]), 0.05), `The corner grip sits on the 12 × 20 corner: ${grip.at}`);
  await drag([grip.x, grip.y], await project(onBoard([316, 216, 18])), 8);
  await expect(properties.getByLabel('Pocket width (mm)', { exact: true })).not.toHaveValue('12');
  const width = Number(await properties.getByLabel('Pocket width (mm)', { exact: true }).inputValue());
  const length = Number(await properties.getByLabel('Pocket length (mm)', { exact: true }).inputValue());
  assert(width >= 30 && width <= 34 && length >= 30 && length <= 34, `Corner grip size ${width} × ${length}`);
  await previewReady();
  const depth = await handle('distance');
  await dragAndType([depth.x, depth.y], await project(add(depth.at, [0, 0, -4])), 3);
  await expect(properties.getByLabel('Depth (mm)', { exact: true })).toHaveValue('3');
  await expect(properties.getByLabel('Cut extent', { exact: true })).toHaveValue('blind');
  await previewReady();
  await page.screenshot({ path: `${directory}/03-pocket.png` });
  await properties.getByRole('button', { name: 'Apply pocket', exact: true }).click();
  await current();
  const pocketed = await savedWhen((m) => m.parts[0].features.some((f) => f.type === 'pocket'), 'a pocket');
  const pocket = pocketed.parts[0].features.find((f) => f.type === 'pocket');
  assert.equal(pocket.width, width);
  assert.equal(pocket.height, length);
  assert.equal(pocket.depth, 3);
  assert.equal(pocket.throughAll, false);
  assert(near(pocket.position, [300, 200, 18], 0.05), `Pocket at the face centre: ${pocket.position}`);
  assert.deepEqual(pocket.direction, [0, 0, -1]);
  checks.push(
    `pocket: face-centre click, corner grip → ${pocket.width} × ${pocket.height} mm, typed depth ${pocket.depth} during the arrow drag`,
  );

  // 4. Hardware without a hole to attach: click the board top, Apply.
  await board();
  await ribbon.getByRole('button', { name: 'Hardware library', exact: true }).first().click();
  await properties.getByLabel('Hardware type').selectOption('standoff');
  const attach = properties.getByLabel('Attach to selected hole');
  if (await attach.isVisible()) await attach.uncheck();
  await properties.getByRole('button', { name: 'Add hardware', exact: true }).click();
  // Phase M: Place chooses holes first; a plain face with none chosen seats a single one.
  await expect(hint).toContainText('Hardware: click the holes it goes in');
  await expect(hint).toContainText('a flat face or empty ground seats a single one');
  const seat = await project(onBoard([450, 100, 18]));
  await page.mouse.move(seat[0], seat[1], { steps: 4 });
  await page.mouse.click(seat[0], seat[1]);
  await previewReady();
  await expect(properties.getByText(/^Threaded standoff M3 on Board \/ plate · top face at/)).toBeVisible();
  await page.screenshot({ path: `${directory}/04-hardware.png` });
  // Apply keeps the camera: zoom off the fit framing first, then a probe off
  // the view centre (the board's back-right corner; a centred zoom leaves the
  // centre in place) must project to the same pixel once the model is current.
  const probe = onBoard([600, 400, 18]);
  const fitted = await project(probe);
  const zoomAt = await canvasCenter();
  await page.mouse.move(zoomAt.x, zoomAt.y);
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(300);
  const cameraBefore = await project(probe);
  assert(Math.hypot(cameraBefore[0] - fitted[0], cameraBefore[1] - fitted[1]) > 2, 'The wheel moved the camera.');
  await properties.getByRole('button', { name: 'Apply hardware', exact: true }).click();
  await current();
  const seated = await savedWhen((m) => m.instances.length === 2, 'a hardware instance');
  await page.waitForTimeout(500);
  await current();
  const cameraAfter = await project(probe);
  const cameraDelta = Math.hypot(cameraAfter[0] - cameraBefore[0], cameraAfter[1] - cameraBefore[1]);
  assert(cameraDelta <= 0.5, `Apply hardware moved the camera: (${probe}) shifted ${cameraDelta} px.`);
  checks.push(
    `camera held on Apply hardware: zoomed off the fit, world (${probe}) at (${cameraBefore.map((v) => v.toFixed(1))}) px before and after, delta ${cameraDelta.toFixed(3)} px`,
  );
  // Back to the fit framing the transform step below was written against.
  await page.getByRole('button', { name: 'Fit', exact: true }).click();
  const standoff = seated.instances[1];
  assert.deepEqual(standoff.rotation, [0, 0, 0]);
  assert.equal(standoff.position[2], 18, 'The seating plane sits on the board top (z = 18).');
  assert.equal(seated.parts[1].features[0].kind, 'standoff');
  checks.push(
    `hardware: Add hardware (not attached) → click the board top → standoff at (${standoff.position}), rotation (${standoff.rotation})`,
  );

  // 5. Transform: the gizmo on the board's own ghost; drag its X arrow.
  await board();
  await ribbon.getByRole('button', { name: 'Transform', exact: true }).click();
  await expect(hint).toContainText("Transform: drag the part's ghost");
  await expect.poll(async () => Boolean((await placement()).tool3d)).toBe(true);
  const before = (await placement()).tool3d.pivot;
  let grab = null;
  for (let d = 10; d <= 400 && !grab; d += 10) {
    const spot = await project(add(before, [d, 0, 0]));
    await page.mouse.move(spot[0], spot[1]);
    await page.waitForTimeout(40);
    if ((await page.evaluate(() => document.querySelector('.cad-viewport').cadGizmo().axis)) === 'X') grab = d;
  }
  assert(grab, 'The transform gizmo shows an X arrow.');
  await drag(await project(add(before, [grab, 0, 0])), await project(add(before, [grab + 120, 0, 0])), 10);
  await expect.poll(async () => (await placement()).tool3d.pivot[0] - before[0]).toBeGreaterThan(60);
  await previewReady();
  await page.screenshot({ path: `${directory}/05-transform.png` });
  await properties.getByRole('button', { name: 'Apply transform', exact: true }).click();
  await current();
  const transformed = await savedWhen((m) => m.parts[0].features.some((f) => f.type === 'transform'), 'a transform');
  const transform = transformed.parts[0].features.find((f) => f.type === 'transform');
  assert(transform.position[0] > 60, `The board moved along X in part coordinates: ${transform.position}`);
  assert.equal(transform.position[1], 0);
  assert.equal(transform.position[2], 0);
  checks.push(`transform: X-arrow gizmo drag on the board's ghost → position (${transform.position})`);

  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(`${directory}/verification.json`, JSON.stringify({ status: 'passed', errors, checks }, null, 2));
  console.log('Cut placement verification passed:\n- ' + checks.join('\n- '));
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
