/* global localStorage, process, console, document, URL */
// Shop trim ST-1 (docs/sketch-studio-shop-trim.md §5): the shop without its
// Weld and Assembly stations, driven through the UI. A fresh model → Shop:
// the route bar shows five stations, 1–5 → an old file saved with seams,
// weldments and assembly steps (the kiosk as it stood before, fixtures/
// kiosk-before-shop-trim.json) opens with every part where it stood, painted
// and printed, its seams and steps left out → Example: kiosk loads with its
// parts in the same places, painted, printed, no seam → in the Shop tab two
// parts are cut and bent, one dragged until it snaps flush to the other,
// turned, the two grouped from Shop → More, moved as one, and the group
// painted in one pick → Shop → More → Add bought-in item… → Replay plays the
// product to its finished scene. No page errors, no .cad-error.
//   CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-shop-trim-st1.mjs
// Screenshots: artifacts/sketch-cad/shop-trim-st1 (or ST1_SHOTS).
import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { cadSteps } from './sketch-cad-steps.mjs';

const directory = process.env.ST1_SHOTS || 'artifacts/sketch-cad/shop-trim-st1';
await mkdir(directory, { recursive: true });
const oldKiosk = JSON.parse(
  await readFile(new URL('../src/features/sketchstudio/cad/fixtures/kiosk-before-shop-trim.json', import.meta.url)),
);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [],
  checks = [],
  measured = {};
page.on('pageerror', (e) => errors.push(e.message));
const { properties, savedWhen, project, setPosition, view, route, shopStation, shopMore, drag } = cadSteps(page);
const footer = page.locator('.cad-status');
const canvas = page.locator('.cad-viewport canvas');
const modelCurrent = () => expect(footer).toContainText('Model current', { timeout: 90000 });
const shot = (name) => page.screenshot({ path: `${directory}/${name}.png` });
const bodies = () => page.evaluate(() => document.querySelector('.cad-viewport').cadViewMode().bodies);
const film = () => page.evaluate(() => document.querySelector('.cad-workspace').cadFilm());
const noErrorLine = async (where) =>
  assert.equal(await page.locator('.cad-error').count(), 0, `no error line ${where}`);
const fill = async (scope, label, value) => {
  const field = scope.getByLabel(label, { exact: true });
  await field.fill(String(value));
  await field.press('Enter');
};
const fit = async () => {
  await page.getByRole('button', { name: 'Fit', exact: true }).click();
  await page.waitForTimeout(400);
};
const fresh = async () => {
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '3D Model & workshop', exact: true }).click();
  await modelCurrent();
};
// Where each instance stands, in model order, and what it is and has (ids differ between a file and a loaded example).
const poses = (model) =>
  model.instances.map((i) => ({
    part: model.parts.find((p) => p.id === i.partId).name,
    name: i.name,
    position: i.position,
    rotation: i.rotation,
    group: model.groups.find((g) => g.id === i.groupId)?.name || null,
    finish: model.finishes.find((f) => f.instanceId === i.id)?.name || null,
    prints: model.prints.filter((p) => p.instanceId === i.id).map((p) => p.text),
  }));
// The selection's parts, as the Properties panel lists them (a group or several parts).
const selectedParts = () => properties.getByRole('list', { name: 'Selected parts' }).getByRole('button');

try {
  await page.goto(process.env.CAD_VERIFY_URL || 'http://localhost:5180/sketch');
  await fresh();

  // 1. The route bar: five stations, numbered 1–5, then Replay and More.
  await page.getByRole('button', { name: 'Shop', exact: true }).click();
  await expect(route.getByRole('button')).toHaveText([
    /^1.*Draw/,
    /^2.*Cut/,
    /^3.*Bend/,
    /^4.*Paint/,
    /^5.*Print/,
    /^Replay$/,
    /More/,
  ]);
  await expect(route.getByRole('button', { name: 'Weld', exact: true })).toHaveCount(0);
  await expect(route.getByRole('button', { name: 'Assembly', exact: true })).toHaveCount(0);
  await route.getByRole('button', { name: 'More', exact: true }).click();
  const more = page.getByRole('group', { name: 'More shop commands' });
  for (const label of ['Group', 'Ungroup', 'Mate faces', 'Add bought-in item…'])
    await expect(more.getByRole('button', { name: label, exact: true })).toBeVisible();
  await shot('01-route-five-stations');
  await page.keyboard.press('Escape');
  checks.push(
    'route: Draw 1, Cut 2, Bend 3, Paint 4, Print 5, Replay, More (Group, Ungroup, Mate faces, Add bought-in item…)',
  );

  // 2. An old file (the kiosk as saved before ST-1: 14 seams, a weldment, 4 assembly steps) opens.
  assert.equal(oldKiosk.welds.length, 14);
  assert.equal(oldKiosk.assembly.length, 4);
  await page.evaluate((model) => {
    const workspace = JSON.parse(localStorage.getItem('apartment-planner-sketch-recovery'));
    workspace.document.model = model;
    workspace.ui = { ...workspace.ui, workspaceMode: 'model' };
    localStorage.setItem('apartment-planner-sketch-recovery', JSON.stringify(workspace));
  }, oldKiosk);
  await page.reload();
  const workshop = page.getByRole('button', { name: '3D Model & workshop', exact: true });
  if (await workshop.isVisible().catch(() => false)) await workshop.click();
  await modelCurrent();
  let model = await savedWhen((m) => m.instances.length === 37 && !('welds' in m), 'the old file, opened');
  assert.equal(model.assembly, undefined, 'its assembly steps left out');
  assert.deepEqual(
    model.groups,
    oldKiosk.groups.map((group) => Object.fromEntries(Object.entries(group).filter(([key]) => key !== 'weldment'))),
    'its groups kept, the weldment flag dropped',
  );
  assert.deepEqual(poses(model), poses(oldKiosk), 'every part where it stood, painted and printed');
  await page.waitForFunction(() => document.querySelector('.cad-viewport').cadViewMode().bodies.length === 37, null, {
    timeout: 30000,
  });
  await noErrorLine('opening the old file');
  await page.getByRole('button', { name: 'Shop', exact: true }).click();
  await expect(route.getByRole('button', { name: 'Paint', exact: true })).toHaveAttribute(
    'aria-description',
    'RAL 9005, RAL 9003',
  );
  await view('isometric');
  await fit();
  await page.mouse.move(5, 500);
  await shot('02-old-file-opened');
  checks.push(
    'old file: 37 instances at the same poses, groups, finishes and prints; 14 seams and 4 steps left out; no error',
  );

  // 3. Example: kiosk on a fresh model: the same parts in the same places, painted, printed, no seam.
  await fresh();
  await shopMore('Example: kiosk');
  model = await savedWhen((m) => m.instances.length === 37, 'the kiosk');
  await modelCurrent();
  assert.equal(model.welds, undefined, 'no seam');
  assert.equal(model.assembly, undefined, 'no assembly step');
  assert.deepEqual(poses(model), poses(oldKiosk), 'the example stands where the kiosk stood before ST-1');
  assert.deepEqual([model.finishes.length, model.prints.length, model.connections.length], [11, 2, 24]);
  await page.waitForFunction(() => document.querySelector('.cad-viewport').cadViewMode().bodies.length === 37, null, {
    timeout: 30000,
  });
  await expect(route.getByRole('button', { name: 'Print', exact: true })).toHaveAttribute(
    'aria-description',
    '2 prints',
  );
  await noErrorLine('loading the kiosk');
  await fit();
  await page.mouse.move(5, 500);
  await shot('03-kiosk-example');
  checks.push(
    'Example: kiosk: 37 instances at the fixture poses, 11 finishes, 2 prints, 24 fastener connections, no seam, no step',
  );

  // 4. In the Shop tab: two 100 × 60 blanks of 1.5 SPCC, each cut and bent into an L.
  await fresh();
  const cutAndBend = async () => {
    await shopStation('Draw');
    const draw = properties.getByRole('region', { name: 'Draw' });
    await draw.getByRole('button', { name: /^Rectangle/ }).click();
    await fill(draw, 'Width W (mm)', 100);
    await fill(draw, 'Height H (mm)', 60);
    await draw.getByRole('button', { name: 'Cut this rectangle', exact: true }).click();
    const panel = properties.getByRole('region', { name: 'Cut from sheet' });
    await panel.getByLabel('Sheet stock', { exact: true }).selectOption('spcc');
    await fill(panel, 'Custom thickness (mm)', 1.5);
    await panel.getByRole('button', { name: 'Cut on the laser', exact: true }).click();
    await expect(page.getByRole('figure', { name: 'Laser bed' })).toHaveAttribute('data-state', 'cut', {
      timeout: 20000,
    });
    await properties
      .getByRole('region', { name: 'Laser station' })
      .getByRole('button', { name: 'Leave laser', exact: true })
      .click();
    await modelCurrent();
    const form = properties.getByLabel('Sheet metal', { exact: true });
    await form.getByLabel('Blank edge', { exact: true }).selectOption('left');
    await fill(form, 'Distance D (mm)', 20);
    await form.getByRole('button', { name: 'Add bend', exact: true }).click();
    await modelCurrent();
  };
  await cutAndBend();
  await cutAndBend();
  model = await savedWhen(
    (m) => m.instances.length === 2 && m.parts.every((p) => p.features[0].bends?.length === 1),
    'two bent parts',
  );
  const [first, second] = model.instances.map((i) => i.id);
  const bodyOf = async (id) => (await bodies()).find((b) => b.id === id);
  // The second one (selected: it was cut last) 60 mm clear of the first along X.
  let A = await bodyOf(first),
    B = await bodyOf(second);
  const start = model.instances[1].position;
  await setPosition(start[0] + (A.bounds[1][0] - B.bounds[0][0]) + 60, start[1], start[2]);
  await modelCurrent();
  await view('top');
  await fit();
  B = await bodyOf(second);
  const gapBefore = B.bounds[0][0] - A.bounds[1][0];
  // Move part (the gizmo's centre) toward the first until 3 mm short: snapping closes the gap.
  const movePart = page.getByRole('button', { name: 'Move part', exact: true });
  if ((await movePart.getAttribute('aria-pressed')) !== 'true') await movePart.click();
  await expect(movePart).toHaveAttribute('aria-pressed', 'true');
  const centre = B.bounds[0].map((v, k) => (v + B.bounds[1][k]) / 2);
  await drag(await project(centre), await project([centre[0] - gapBefore + 3, centre[1], centre[2]]));
  model = await savedWhen((m) => m.instances[1].position[0] !== start[0], 'the dragged part');
  await modelCurrent();
  B = await bodyOf(second);
  const gapAfter = B.bounds[0][0] - A.bounds[1][0];
  assert(Math.abs(gapAfter) < 0.01, `snapped flush: gap ${gapAfter} mm (was ${gapBefore} mm)`);
  await page.mouse.move(5, 500);
  await shot('04-snapped-flush');
  measured.snap = { gapBefore: Number(gapBefore.toFixed(3)), gapAfter: Number(gapAfter.toFixed(4)) };
  // Rotate part: the ring gizmo on, ] six times = 90° about Z.
  await page.getByRole('button', { name: 'Rotate part', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Rotate part', exact: true })).toHaveAttribute('aria-pressed', 'true');
  for (let i = 0; i < 6; i++) await page.keyboard.press(']');
  model = await savedWhen((m) => Math.abs(Number(m.instances[1].rotation[2]) - 90) < 1e-6, 'the turned part');
  await modelCurrent();
  await page.getByRole('button', { name: 'Move part', exact: true }).click();
  checks.push(
    `two parts cut and bent; the second dragged ${measured.snap.gapBefore} → snapped flush (gap ${measured.snap.gapAfter} mm), turned 90° about Z`,
  );

  // Both selected (Ctrl+A), Shop → More → Group; then moved as one.
  await page.mouse.move(5, 500);
  await page.keyboard.press('Control+a');
  await expect(selectedParts()).toHaveCount(2);
  await shopMore('Group');
  model = await savedWhen((m) => m.groups?.length === 1 && m.instances.every((i) => i.groupId), 'the group');
  const group = model.groups[0];
  const before = model.instances.map((i) => i.position.map(Number));
  A = await bodyOf(first);
  await page.mouse.click(...(await project(A.bounds[0].map((v, k) => (v + A.bounds[1][k]) / 2))));
  await expect(selectedParts()).toHaveCount(2);
  const moves = properties.getByRole('group', { name: 'Move by (mm)' });
  await fill(moves, 'Move by X (mm)', 50);
  await moves.getByRole('button', { name: 'Move', exact: true }).click();
  model = await savedWhen(
    (m) => m.instances.every((i, k) => Math.abs(Number(i.position[0]) - before[k][0] - 50) < 1e-6),
    'the group moved as one',
  );
  await modelCurrent();
  checks.push(`grouped from Shop → More ("${group.name}"), moved as one: both +50 mm in X`);

  // The group painted in one pick: Paint, click one part, "Paint the whole …", RAL 9005.
  await shopStation('Paint');
  const paint = properties.getByRole('region', { name: 'Paint booth' });
  A = await bodyOf(first);
  await page.mouse.click(...(await project(A.bounds[0].map((v, k) => (v + A.bounds[1][k]) / 2))));
  await paint.getByRole('button', { name: `Paint the whole ${group.name} (2 parts)`, exact: true }).click();
  await paint.getByRole('button', { name: 'RAL 9005 Jet black', exact: true }).click();
  await paint.getByRole('button', { name: 'Paint', exact: true }).click();
  model = await savedWhen((m) => m.finishes?.length === 2, 'the group painted');
  assert(model.finishes.every((f) => f.name === 'RAL 9005 Jet black'));
  await paint.getByRole('button', { name: 'Leave paint booth', exact: true }).click();
  await view('isometric');
  await fit();
  await page.mouse.move(5, 500);
  await shot('05-group-painted');
  await noErrorLine('putting the parts together');
  checks.push('the group painted in one pick: 2 finishes RAL 9005');

  // 5. Shop → More → Add bought-in item…: under the view centre, selected, in its colour; then grouped with the product.
  await shopMore('Add bought-in item…');
  const bought = properties.getByRole('region', { name: 'Bought-in item' });
  await bought.getByLabel('Item name', { exact: true }).fill('Display');
  await bought.getByLabel('Item colour', { exact: true }).fill('#1b1e22');
  await bought.getByRole('button', { name: 'Add the item', exact: true }).click();
  model = await savedWhen((m) => m.parts.some((p) => p.purchased), 'the bought-in item');
  await modelCurrent();
  const item = model.parts.find((p) => p.purchased);
  assert.deepEqual(item.purchased, { colour: '#1b1e22', reference: '' });
  const placed = model.instances.find((i) => i.partId === item.id);
  assert.equal(Number(placed.position[2]), 0, 'on the ground');
  await expect(properties.getByRole('heading', { name: /Display/ })).toBeVisible();
  // Nothing in it is made here: no product of its own (no card, the route stays on the
  // one product), and the status line says what to do next.
  const board = page.getByRole('region', { name: 'Job board' });
  await expect(board.getByRole('region', { name: 'Product Group 1' })).toBeVisible();
  await expect(board.getByRole('region', { name: 'Product Display' })).toHaveCount(0);
  await expect(route.locator('.cad-route-subject strong')).toHaveText('Group 1');
  const note = 'Display is in the view. Move it into place, then group it with its product (More → Group).';
  await expect(page.locator('.cad-status')).toContainText(note);
  await page.mouse.move(5, 500);
  await shot('06-bought-in-item');
  await page.mouse.move(5, 500);
  await page.keyboard.press('Control+a');
  await expect(selectedParts()).toHaveCount(3);
  await shopMore('Group');
  model = await savedWhen((m) => m.groups?.length === 2, 'the product with its bought-in item');
  await modelCurrent();
  await expect(board.getByRole('region', { name: 'Product Display' })).toHaveCount(0);
  await expect(page.locator('.cad-status')).not.toContainText(note);
  checks.push(
    `bought-in item "${item.name}" added from Shop → More at ${placed.position.join(', ')}: no product card, route on "Group 1", status "${note}"; then grouped with the product`,
  );

  // 6. Replay: the product's film, to its finished scene (the display comes on there).
  const replay = route.getByRole('button', { name: 'Replay', exact: true });
  await expect(replay).toBeEnabled();
  await replay.click();
  const panel = properties.getByRole('region', { name: 'Replay' });
  await expect(panel).toBeVisible();
  let f = await film();
  measured.film = { scenes: f.count, seconds: f.seconds, stations: f.scenes.map((s) => s.station) };
  assert.deepEqual(measured.film.stations, ['cut', 'cut', 'bend', 'bend', 'paint', 'finished']);
  assert(f.hidden.includes(placed.id), 'the bought-in item waits for the finished scene');
  await panel.getByRole('group', { name: 'Replay speed' }).getByRole('button', { name: '4×', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.cad-workspace').cadFilm().stage === 'ended', null, {
    timeout: 30000,
  });
  f = await film();
  assert.equal(f.scene.station, 'finished');
  assert.deepEqual(f.hidden, [], 'everything in the view at the finish');
  await page.mouse.move(5, 500);
  await shot('07-replay-finished');
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await noErrorLine('after the replay');
  checks.push(
    `replay: ${f.count} scenes (${measured.film.stations.join(', ')}), ${f.seconds} s at 1×, ends on "${f.scene.title}"`,
  );

  // The canvas still answers (nothing left a tool open).
  assert(await canvas.isVisible());
  assert.deepEqual(errors, [], 'no page errors');
  await writeFile(`${directory}/verification.json`, JSON.stringify({ status: 'passed', checks, measured }, null, 2));
  console.log('Shop trim ST-1 verification passed:\n- ' + checks.join('\n- '));
  console.log('Measured:', JSON.stringify(measured, null, 2));
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` }).catch(() => {});
  console.error(JSON.stringify({ checks, measured, errors }, null, 2));
  throw error;
} finally {
  await browser.close();
}
