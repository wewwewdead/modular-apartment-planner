/* global localStorage, process, console, document */
// Phase M: hardware in chosen holes (docs/sketch-studio-hardware-holes.md).
// Add a board; Solid → Hole row (4 holes, pitch 50 along +X) → Apply;
// Hardware library → Hex bolt M6, Attach to selected hole cleared → Add
// hardware → top view → click the centres of holes 1, 2 and 4 (read from the
// saved feature) → three chosen, the readout says "chosen" over hole 2 →
// click hole 2 again (two chosen) and once more (three) → Enter → Shape,
// "in 3 holes" → zoom off the fit → Apply (camera held) → the saved model has
// one new part, three instances of it and three concentric connections
// (holeIndex 1 and 3, none on the first) → one Undo removes them all.
// Phase M.1 (docs/sketch-studio-remove-part.md): Redo brings them back →
// the second bolt in the tree → Remove instance (two bolts, two connections)
// → a bolt → Remove part · 2 instances (Suppress disabled, no Remove feature)
// → the board only; never a ".cad-error", always "Model current".
//   CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-hardware-holes.mjs
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { cadSteps } from './sketch-cad-steps.mjs';

const directory = 'artifacts/sketch-cad/hardware-holes';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [],
  checks = [];
page.on('pageerror', (e) => errors.push(e.message));
const { properties, current, savedWhen, project, view, canvasCenter } = cadSteps(page);
const ribbon = page.locator('.cad-ribbon');
const hud = page.locator('.cad-placement-hud');
const hint = page.locator('.cad-viewport-hint');
const status = properties.getByRole('status');
const placement = () => page.evaluate(() => document.querySelector('.cad-viewport').cadPlacement());
const add = (a, b) => a.map((v, i) => v + b[i]);
const scale = (a, s) => a.map((v) => v * s);
const near = (a, b, tolerance = 1e-3) => a.every((v, i) => Math.abs(v - b[i]) <= tolerance);
const previewReady = () => expect(status).toHaveText('Preview ready', { timeout: 60000 });
const shot = (name) => page.screenshot({ path: `${directory}/${name}.png` });

try {
  await page.goto(process.env.CAD_VERIFY_URL || 'http://localhost:5180/sketch');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '3D Model & workshop', exact: true }).click();
  await current();
  // The default board lands under the view centre: read where (not turned).
  await ribbon.getByRole('button', { name: 'Board / plate', exact: true }).click();
  await current();
  const boardModel = await savedWhen((m) => m.instances.length === 1, 'the new board');
  const boardAt = boardModel.instances[0].position;
  const onBoard = (p) => add(boardAt, p);
  await page.keyboard.press('Escape');

  // 1. A hole row: the first hole at (100, 100), the last 150 mm along +X.
  await ribbon.getByRole('button', { name: 'Hole row', exact: true }).click();
  await expect(hint).toContainText('Hole row: click where the first hole goes');
  await view('top');
  await page.waitForTimeout(400);
  const first = await project(onBoard([100.3, 100.2, 18]));
  await page.mouse.move(first[0], first[1], { steps: 4 });
  await expect(hud).toContainText('grid');
  await page.mouse.click(first[0], first[1]);
  await expect(hint).toContainText('click where the last hole goes');
  const last = await project(onBoard([250.4, 100.3, 18]));
  await page.mouse.move(last[0], last[1], { steps: 6 });
  await expect(hud).toContainText('4 holes');
  await page.mouse.click(last[0], last[1]);
  await expect(hint).toContainText('Hole row: drag the end square');
  await previewReady();
  await properties.getByRole('button', { name: 'Apply hole row', exact: true }).click();
  await current();
  const drilled = await savedWhen((m) => m.parts[0].features.some((f) => f.type === 'hole' && f.row), 'a hole row');
  const row = drilled.parts[0].features.find((f) => f.type === 'hole');
  assert.deepEqual(row.row, { count: 4, pitch: 50, direction: [1, 0, 0] });
  // The centres from the saved feature: position + k · pitch · direction.
  const centre = (k) => onBoard(add(row.position, scale(row.row.direction, k * row.row.pitch)));
  checks.push(`hole row: ${row.row.count} × Ø${row.diameter} at (${row.position}), pitch ${row.row.pitch} along +X`);

  // 2. Hardware library: Hex bolt M6, not attached → Place.
  await ribbon.getByRole('button', { name: 'Hardware library', exact: true }).first().click();
  await properties.getByLabel('Hardware type').selectOption('bolt');
  await properties.getByLabel('Metric size').selectOption('M6');
  const attach = properties.getByLabel('Attach to selected hole');
  if (await attach.isVisible()) await attach.uncheck();
  await properties.getByRole('button', { name: 'Add hardware', exact: true }).click();
  await expect(hint).toContainText('Hardware: click the holes it goes in');
  await expect(properties.getByRole('heading', { name: 'Place hardware' })).toBeVisible();
  const before = await savedWhen(() => true, 'the model before Apply');

  // Hover just outside a hole's rim (the centre itself is the open hole): the
  // centre snaps within 8 px. Returns the client point the snap held at.
  const hoverHole = async (k) => {
    for (const d of [4, 4.5, 3.6, 5, 5.5]) {
      const at = await project(add(centre(k), [0, -d, 0]));
      await page.mouse.move(at[0], at[1], { steps: 3 });
      await page.waitForTimeout(60);
      const state = await placement();
      if (state.snapKind === 'hole centre' && near(state.hover.point, centre(k), 1e-3)) return at;
    }
    throw new Error(`Hole ${k + 1}'s centre does not snap.`);
  };
  const clickHole = async (k) => {
    const at = await hoverHole(k);
    await page.mouse.click(at[0], at[1]);
    await page.waitForTimeout(100);
  };
  let at = await hoverHole(1);
  await expect(hud).toContainText('hole centre · Hex bolt M6 · Board / plate top · click to add');
  for (const k of [0, 1, 3]) await clickHole(k);
  await expect.poll(async () => (await placement()).chosen).toBe(3);
  assert.equal((await placement()).stage, 'place', 'Choosing holes keeps Place.');
  await expect(hint).toContainText('Hardware: 3 holes chosen');
  at = await hoverHole(1);
  await expect(hud).toContainText('chosen · click to remove');
  assert.equal(await page.locator('.cad-placement-hud').count(), 1, 'One placement readout element.');
  const list = properties.getByRole('list', { name: 'Chosen holes' });
  await expect(list.getByRole('listitem')).toHaveText([
    /Hole 1 of 4 · Board \/ plate/,
    /Hole 2 of 4 · Board \/ plate/,
    /Hole 4 of 4 · Board \/ plate/,
  ]);
  await expect(properties.getByRole('button', { name: 'Seat in 3 holes', exact: true })).toBeEnabled();
  assert((await placement()).layers.includes('placement-ghost'), 'The chosen holes are ringed.');
  await shot('01-three-chosen');
  checks.push(
    'place: holes 1, 2 and 4 clicked → chosen 3, readout "chosen · click to remove" over hole 2, rings drawn',
  );
  // Hole 2 again removes it; once more puts it back.
  await page.mouse.click(at[0], at[1]);
  await expect.poll(async () => (await placement()).chosen).toBe(2);
  await expect(hud).toContainText('click to add');
  await page.mouse.click(at[0], at[1]);
  await expect.poll(async () => (await placement()).chosen).toBe(3);
  checks.push('toggle: hole 2 clicked again → chosen 2, once more → 3');

  // 3. Enter seats it in the chosen holes.
  await page.keyboard.press('Enter');
  await previewReady();
  assert.equal((await placement()).stage, 'shape');
  assert.deepEqual((await placement()).handles, [], 'A seated part has no handles.');
  await expect(hint).toContainText('Hardware: seated in 3 holes (concentric)');
  await expect(
    properties.getByText(/^Hex bolt M6 in 3 holes on Board \/ plate · holes 1, 2 and 4 of the row$/),
  ).toBeVisible();
  await shot('02-seated');
  checks.push('enter: Shape, "Hex bolt M6 in 3 holes on Board / plate · holes 1, 2 and 4 of the row", no handles');

  // 4. Apply keeps the camera: zoom off the fit, an off-centre probe.
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
  const applied = await savedWhen((m) => m.instances.length === before.instances.length + 3, 'three bolts');
  await page.waitForTimeout(500);
  await current();
  const cameraAfter = await project(probe);
  const cameraDelta = Math.hypot(cameraAfter[0] - cameraBefore[0], cameraAfter[1] - cameraBefore[1]);
  assert(cameraDelta <= 0.5, `Apply hardware moved the camera: (${probe}) shifted ${cameraDelta} px.`);
  assert.equal(applied.parts.length, before.parts.length + 1, 'One new part.');
  const bolt = applied.parts.at(-1);
  assert.equal(bolt.name, 'Hex bolt M6');
  const bolts = applied.instances.slice(before.instances.length);
  assert(
    bolts.every((b) => b.partId === bolt.id),
    'The three instances share one part.',
  );
  const connections = applied.connections.slice(before.connections.length);
  assert.equal(connections.length, 3, 'Three connections.');
  // In the order chosen: hole 2 was removed and chosen again, so it is last.
  const order = [0, 3, 1];
  assert.deepEqual(
    connections.map((c) => [c.type, c.from, c.toFeatureId, c.holeIndex]),
    [
      ['concentric', bolts[0].id, row.id, undefined],
      ['concentric', bolts[1].id, row.id, 3],
      ['concentric', bolts[2].id, row.id, 1],
    ],
  );
  assert.equal('holeIndex' in connections[0], false, 'No holeIndex on the first hole.');
  bolts.forEach((b, i) =>
    assert(near(b.position, centre(order[i]), 1e-3), `Bolt ${i + 1} sits on its hole: ${b.position}`),
  );
  await shot('03-applied');
  checks.push(
    `apply: +1 part "${bolt.name}", +3 instances of it at (${bolts.map((b) => b.position.join(', ')).join(') (')}), connections holeIndex ${connections.map((c) => c.holeIndex ?? '—')}; camera delta ${cameraDelta.toFixed(3)} px`,
  );

  // 5. One Undo removes the part, every instance and every connection.
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await current();
  const undone = await savedWhen((m) => m.instances.length === before.instances.length, 'one Undo');
  assert.equal(undone.parts.length, before.parts.length);
  assert.equal(undone.connections.length, before.connections.length);
  await shot('04-undone');
  checks.push(
    `undo: parts ${undone.parts.length}, instances ${undone.instances.length}, connections ${undone.connections.length} (as before Apply)`,
  );

  // 6. Phase M.1: Redo, then remove one bolt, then the whole part.
  const cadError = page.locator('.cad-error');
  const settled = async (what) => {
    await page.waitForTimeout(500);
    await current();
    assert.equal(await cadError.count(), 0, `No error banner after ${what}: ${await cadError.allInnerTexts()}`);
  };
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  const redone = await savedWhen((m) => m.instances.length === before.instances.length + 3, 'one Redo');
  assert.equal(redone.connections.length, before.connections.length + 3);
  await settled('Redo');
  const treeBolts = page.locator('.cad-tree .cad-tree-item', { hasText: 'Hex bolt M6' });
  await expect(treeBolts).toHaveCount(3);
  await treeBolts.nth(1).click();
  await expect(properties.getByRole('button', { name: 'Remove part · 3 instances', exact: true })).toBeVisible();
  await properties.getByRole('button', { name: 'Remove instance', exact: true }).click();
  const oneGone = await savedWhen((m) => m.instances.length === before.instances.length + 2, 'Remove instance');
  assert.equal(oneGone.connections.length, before.connections.length + 2, 'Two connections remain.');
  assert.equal(oneGone.connections.length, 2);
  assert.deepEqual(
    oneGone.instances.slice(before.instances.length).map((i) => i.id),
    [bolts[0].id, bolts[2].id],
    'The second bolt in the tree is the one removed.',
  );
  assert(
    oneGone.parts.some((p) => p.id === bolt.id),
    'The bolt part stays while bolts remain.',
  );
  await settled('Remove instance');
  checks.push(
    `redo: +3 bolts back; remove instance (2nd bolt in the tree): instances ${oneGone.instances.length}, connections ${oneGone.connections.length}, part kept, no error, Model current`,
  );
  await expect(treeBolts).toHaveCount(2);
  await treeBolts.first().click();
  await expect(properties.getByRole('heading', { name: 'hardware · feature 1' })).toBeVisible();
  await expect(properties.getByRole('button', { name: 'Remove feature', exact: true })).toHaveCount(0);
  await expect(properties.getByRole('button', { name: 'Suppress', exact: true })).toBeDisabled();
  await expect(
    properties.getByText(
      'This is the only active feature of Hex bolt M6: removing it removes the part and its 2 instances. To remove just this one, use Remove instance below.',
      { exact: true },
    ),
  ).toBeVisible();
  await properties.getByRole('button', { name: 'Remove part · 2 instances', exact: true }).click();
  const boardOnly = await savedWhen((m) => m.parts.length === 1, 'Remove part');
  assert.equal(boardOnly.parts.length, 1, 'Parts 1.');
  assert.equal(boardOnly.parts[0].id, boardModel.parts[0].id, 'The board stays.');
  assert.equal(boardOnly.instances.length, 1, 'Instances 1.');
  assert.equal(boardOnly.connections.length, 0, 'Connections 0.');
  await settled('Remove part');
  await expect(treeBolts).toHaveCount(0);
  await shot('05-part-removed');
  checks.push(
    `remove part · 2 instances (Suppress disabled, no Remove feature): parts ${boardOnly.parts.length}, instances ${boardOnly.instances.length}, connections ${boardOnly.connections.length}, no error, Model current`,
  );

  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(`${directory}/verification.json`, JSON.stringify({ status: 'passed', errors, checks }, null, 2));
  console.log('Hardware in chosen holes verification passed:\n- ' + checks.join('\n- '));
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
