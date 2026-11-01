/* global localStorage, process, console, document */
// Phase N: the screw library (docs/sketch-studio-screw-library.md §10).
// Add a board; Solid → Hole row (4 holes, pitch 50 along +X) → Apply;
// Hardware library → Countersunk socket screw M6, Attach cleared → Add
// hardware → top view → click holes 1 and 3 (read from the saved feature) →
// the readout names the screw → Enter → Apply (camera held) → one part
// "Countersunk socket screw M6" (head countersunk, drive hex-socket, drive
// size 4), two instances, two concentric connections (holeIndex 2 on the
// second). Then a wood screw 4.0 with a round head and a Torx drive, and a set
// screw M6 with a cone point, each seated on the board top away from the
// holes. Undo × 3 → the board and its hole row only. One isometric screenshot
// per added screw; never a ".cad-error", always "Model current".
//   CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-screw-library.mjs
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { cadSteps } from './sketch-cad-steps.mjs';

const directory = 'artifacts/sketch-cad/screw-library';
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
const cadError = page.locator('.cad-error');
const placement = () => page.evaluate(() => document.querySelector('.cad-viewport').cadPlacement());
const add = (a, b) => a.map((v, i) => v + b[i]);
const scale = (a, s) => a.map((v) => v * s);
const near = (a, b, tolerance = 1e-3) => a.every((v, i) => Math.abs(v - b[i]) <= tolerance);
const previewReady = () => expect(status).toHaveText('Preview ready', { timeout: 60000 });
const shot = (name) => page.screenshot({ path: `${directory}/${name}.png` });
const settled = async (what) => {
  await page.waitForTimeout(400);
  await current();
  assert.equal(await cadError.count(), 0, `No error banner after ${what}: ${await cadError.allInnerTexts()}`);
};
// An isometric look zoomed in at a screw (wheel at the cursor), then back to
// the top view for clicking (a standard view refits).
const isometricShot = async (name, at) => {
  await view('isometric');
  await page.waitForTimeout(600);
  await current();
  for (let i = 0; i < 8; i++) {
    const point = await project(at);
    await page.mouse.move(point[0], point[1]);
    await page.mouse.wheel(0, -400);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(400);
  await shot(name);
  await view('top');
  await page.waitForTimeout(400);
};

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
  const board = boardModel.parts[0].features[0];
  const top = Number(board.height);
  const onBoard = (p) => add(boardAt, p);
  await page.keyboard.press('Escape');

  // 1. A hole row: the first hole at (100, 100), the last 150 mm along +X.
  await ribbon.getByRole('button', { name: 'Hole row', exact: true }).click();
  await expect(hint).toContainText('Hole row: click where the first hole goes');
  await view('top');
  await page.waitForTimeout(400);
  const first = await project(onBoard([100.3, 100.2, top]));
  await page.mouse.move(first[0], first[1], { steps: 4 });
  await expect(hud).toContainText('grid');
  await page.mouse.click(first[0], first[1]);
  await expect(hint).toContainText('click where the last hole goes');
  const last = await project(onBoard([250.4, 100.3, top]));
  await page.mouse.move(last[0], last[1], { steps: 6 });
  await expect(hud).toContainText('4 holes');
  await page.mouse.click(last[0], last[1]);
  await previewReady();
  await properties.getByRole('button', { name: 'Apply hole row', exact: true }).click();
  await current();
  const drilled = await savedWhen((m) => m.parts[0].features.some((f) => f.type === 'hole' && f.row), 'a hole row');
  const row = drilled.parts[0].features.find((f) => f.type === 'hole');
  assert.deepEqual(row.row, { count: 4, pitch: 50, direction: [1, 0, 0] });
  const centre = (k) => onBoard(add(row.position, scale(row.row.direction, k * row.row.pitch)));
  checks.push(`hole row: ${row.row.count} × Ø${row.diameter} at (${row.position}), pitch ${row.row.pitch} along +X`);

  // 2. Hardware library: the grouped type list; Countersunk socket screw M6.
  const openLibrary = async (kind, size) => {
    await ribbon.getByRole('button', { name: 'Hardware library', exact: true }).first().click();
    await properties.getByLabel('Hardware type').selectOption(kind);
    if (size) await properties.getByLabel('Metric size').selectOption(size);
    const attach = properties.getByLabel('Attach to selected hole');
    if (await attach.isVisible()) await attach.uncheck();
  };
  await openLibrary('countersunk-socket', 'M6');
  const groups = await properties
    .getByLabel('Hardware type')
    .evaluate((select) => [...select.querySelectorAll('optgroup')].map((g) => g.label));
  assert.deepEqual(groups, [
    'Bolts, nuts & spacers',
    'Machine screws',
    'Socket screws',
    'Tapping & self-drilling',
    'Wood & construction',
    'Special',
  ]);
  await expect(properties.getByLabel('Head style')).toHaveCount(0);
  await expect(properties.getByLabel('Drive', { exact: true })).toHaveValue('hex-socket');
  await expect(properties.getByLabel('Overall length (mm)')).toHaveValue('16');
  await properties.getByRole('button', { name: 'Add hardware', exact: true }).click();
  await expect(hint).toContainText('Hardware: click the holes it goes in');
  await expect(properties.getByRole('heading', { name: 'Place hardware' })).toBeVisible();
  const before = await savedWhen(() => true, 'the model before Apply');
  checks.push(
    `library: six groups (${groups.join(' / ')}), countersunk socket M6: no Head style, Drive hex-socket, Overall length 16`,
  );

  // Hover just outside a hole's rim: the centre snaps within 8 px.
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
  await hoverHole(0);
  await expect(hud).toContainText('hole centre · Countersunk socket screw M6 · Board / plate top');
  for (const k of [0, 2]) await clickHole(k);
  await expect.poll(async () => (await placement()).chosen).toBe(2);
  await expect(hint).toContainText('Hardware: 2 holes chosen');
  checks.push('place: readout "hole centre · Countersunk socket screw M6 · Board / plate top"; holes 1 and 3 chosen');

  // 3. Enter seats it; Apply keeps the camera.
  await page.keyboard.press('Enter');
  await previewReady();
  assert.equal((await placement()).stage, 'shape');
  await expect(hint).toContainText('Hardware: seated in 2 holes (concentric)');
  const probe = onBoard([600, 400, top]);
  const zoomAt = await canvasCenter();
  await page.mouse.move(zoomAt.x, zoomAt.y);
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(300);
  const cameraBefore = await project(probe);
  await properties.getByRole('button', { name: 'Apply hardware', exact: true }).click();
  await current();
  const seated = await savedWhen((m) => m.instances.length === before.instances.length + 2, 'two screws');
  await page.waitForTimeout(500);
  await settled('Apply countersunk socket screws');
  const cameraAfter = await project(probe);
  const cameraDelta = Math.hypot(cameraAfter[0] - cameraBefore[0], cameraAfter[1] - cameraBefore[1]);
  assert(cameraDelta <= 0.5, `Apply hardware moved the camera: ${cameraDelta} px.`);
  assert.equal(seated.parts.length, before.parts.length + 1, 'One new part.');
  const csk = seated.parts.at(-1);
  assert.equal(csk.name, 'Countersunk socket screw M6');
  assert.equal(csk.features.length, 1);
  const cskFeature = csk.features[0];
  assert.equal(cskFeature.kind, 'countersunk-socket');
  assert.equal(cskFeature.head, 'countersunk');
  assert.equal(cskFeature.drive, 'hex-socket');
  assert.equal(cskFeature.driveSize, 4);
  assert.equal(cskFeature.point, 'blunt');
  assert.deepEqual([cskFeature.headDiameter, cskFeature.headHeight], [13.44, 3.72]);
  const screws = seated.instances.slice(before.instances.length);
  assert(
    screws.every((s) => s.partId === csk.id),
    'The two instances share one part.',
  );
  const connections = seated.connections.slice(before.connections.length);
  assert.deepEqual(
    connections.map((c) => [c.type, c.from, c.toFeatureId, c.holeIndex]),
    [
      ['concentric', screws[0].id, row.id, undefined],
      ['concentric', screws[1].id, row.id, 2],
    ],
  );
  assert.equal('holeIndex' in connections[0], false, 'No holeIndex on the first hole.');
  [0, 2].forEach((k, i) =>
    assert(near(screws[i].position, centre(k), 1e-3), `Screw ${i + 1} sits on hole ${k + 1}: ${screws[i].position}`),
  );
  await isometricShot('01-countersunk-socket-M6', centre(1));
  checks.push(
    `apply: +1 part "${csk.name}" (head ${cskFeature.head}, drive ${cskFeature.drive} ${cskFeature.driveSize}, dk ${cskFeature.headDiameter}, k ${cskFeature.headHeight}), 2 instances at (${screws.map((s) => s.position.join(', ')).join(') (')}), holeIndex ${connections.map((c) => c.holeIndex ?? '—')}; camera delta ${cameraDelta.toFixed(3)} px`,
  );

  // A free seat: hover then click a plain spot of the board top, Apply.
  const seatOnBoard = async (at, name) => {
    const point = await project(onBoard(at));
    await page.mouse.move(point[0], point[1], { steps: 4 });
    await page.waitForTimeout(150);
    await expect(hud).toContainText(`${name} · Board / plate top`);
    await page.mouse.click(point[0], point[1]);
    await previewReady();
    assert.equal((await placement()).stage, 'shape');
    const was = await savedWhen(() => true, `the model before ${name}`);
    await properties.getByRole('button', { name: 'Apply hardware', exact: true }).click();
    await current();
    const now = await savedWhen((m) => m.instances.length === was.instances.length + 1, name);
    await settled(`Apply ${name}`);
    const part = now.parts.at(-1);
    const instance = now.instances.at(-1);
    assert.equal(part.name, name);
    assert.equal(instance.partId, part.id);
    // Seated on the board top, pointing into it (not turned).
    assert(Math.abs(instance.position[2] - (boardAt[2] + top)) < 1e-3, `${name} on the top: ${instance.position}`);
    assert.deepEqual(instance.rotation, [0, 0, 0]);
    return { part, instance };
  };

  // 4. A wood screw 4.0, round head, Torx.
  await openLibrary('wood');
  await expect(properties.getByLabel('Metric size')).toHaveValue('4.0');
  await expect(properties.getByLabel('Head style')).toHaveValue('countersunk');
  await expect(properties.getByLabel('Head height (mm)')).toHaveValue('2.2');
  await properties.getByLabel('Head style').selectOption('round');
  await expect(properties.getByLabel('Head height (mm)')).toHaveValue('2.6');
  await expect(properties.getByLabel('Point', { exact: true })).toHaveCount(0);
  await properties.getByLabel('Drive', { exact: true }).selectOption('torx');
  await expect(properties.getByLabel('Drive size (mm)')).toHaveValue('3.86');
  await properties.getByRole('button', { name: 'Add hardware', exact: true }).click();
  await expect(properties.getByRole('heading', { name: 'Place hardware' })).toBeVisible();
  const wood = await seatOnBoard([320, 260, top], 'Wood screw 4.0');
  const woodFeature = wood.part.features[0];
  assert.equal(woodFeature.kind, 'wood');
  assert.equal(woodFeature.head, 'round');
  assert.equal(woodFeature.drive, 'torx');
  assert.equal(woodFeature.driveSize, 3.86);
  assert.equal(woodFeature.headHeight, 2.6);
  await isometricShot('02-wood-screw-round-torx', wood.instance.position);
  checks.push(
    `wood: size 4.0, Head style countersunk → round (head height 2.2 → 2.6), Drive torx (3.86) → "${wood.part.name}" at (${wood.instance.position.join(', ')})`,
  );

  // 5. A set screw M6, cone point.
  await openLibrary('set-screw', 'M6');
  await expect(properties.getByLabel('Head style')).toHaveCount(0);
  await expect(properties.getByLabel('Point', { exact: true })).toHaveValue('flat');
  await properties.getByLabel('Point', { exact: true }).selectOption('cone');
  await expect(properties.getByLabel('Point diameter (mm)')).toHaveCount(0);
  await properties.getByRole('button', { name: 'Add hardware', exact: true }).click();
  await expect(properties.getByRole('heading', { name: 'Place hardware' })).toBeVisible();
  const set = await seatOnBoard([460, 260, top], 'Socket set screw (grub screw) M6');
  const setFeature = set.part.features[0];
  assert.equal(setFeature.kind, 'set-screw');
  assert.equal(setFeature.point, 'cone');
  assert.equal(setFeature.head, 'none');
  assert.equal(setFeature.drive, 'hex-socket');
  await isometricShot('03-set-screw-cone', set.instance.position);
  checks.push(`set screw: M6, Point flat → cone → "${set.part.name}" at (${set.instance.position.join(', ')})`);

  // 6. Undo × 3: the board and its hole row only.
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await page.waitForTimeout(300);
  }
  const undone = await savedWhen(
    (m) => m.instances.length === before.instances.length && m.parts.length === before.parts.length,
    'three Undos',
  );
  assert.equal(undone.connections.length, before.connections.length);
  assert(
    undone.parts[0].features.some((f) => f.type === 'hole' && f.row),
    'The hole row stays.',
  );
  await settled('Undo × 3');
  await shot('04-undone');
  checks.push(
    `undo × 3: parts ${undone.parts.length}, instances ${undone.instances.length}, connections ${undone.connections.length} (as before the screws)`,
  );

  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(`${directory}/verification.json`, JSON.stringify({ status: 'passed', errors, checks }, null, 2));
  console.log('Screw library verification passed:\n- ' + checks.join('\n- '));
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
