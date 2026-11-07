/* global localStorage, process, console, document */
// Phase O: the rivet library (docs/sketch-studio-rivet-library.md §10).
// Add a board; Solid → Hole row (4 holes, pitch 50 along +X) → Apply;
// Hardware library → Blind rivet, open end (pop rivet) 4.8, Attach cleared →
// Add hardware → top view → click holes 1 and 3 (read from the saved feature)
// → the readout names the rivet → Enter → Apply (camera held) → one part
// "Blind rivet, open end (pop rivet) 4.8" (head dome, state set, grip 5), two
// instances, two concentric connections (holeIndex 2 on the second). Then a
// solid rivet 4 with a countersunk head as supplied, and a blind rivet nut M6
// with a hexagon body, each seated on the board top away from the holes.
// Undo × 3 → the board and its hole row only. One isometric screenshot per
// added rivet, plus a front X-ray view of the set blind rivet so its bulb shows
// through the board; never a ".cad-error", always "Model current".
//   CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-rivet-library.mjs
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { cadSteps } from './sketch-cad-steps.mjs';

const directory = 'artifacts/sketch-cad/rivet-library';
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
const modes = page.getByRole('group', { name: 'See-through mode' });
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
// A standard view zoomed in at a point, then back to the top view for clicking
// (a standard view refits). The wheel zooms towards the orbit target, not the
// cursor: a right-drag pan first brings the point to the canvas centre, and
// again whenever it drifts.
const zoomedShot = async (name, at, viewName = 'isometric', steps = 16) => {
  await view(viewName);
  await page.waitForTimeout(600);
  await current();
  const middle = await canvasCenter();
  for (let i = 0; i < steps; i++) {
    const point = await project(at);
    if (Math.hypot(point[0] - middle.x, point[1] - middle.y) > 40) {
      await page.mouse.move(point[0], point[1]);
      await page.mouse.down({ button: 'right' });
      await page.mouse.move(middle.x, middle.y, { steps: 6 });
      await page.mouse.up({ button: 'right' });
      await page.waitForTimeout(80);
    }
    await page.mouse.move(middle.x, middle.y);
    await page.mouse.wheel(0, -400);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(400);
  await shot(name);
  await view('top');
  await page.waitForTimeout(400);
};
const setMode = async (label, mode) => {
  await modes.getByRole('button', { name: label, exact: true }).click();
  await expect(page.locator('.cad-viewport')).toHaveAttribute('data-view-mode', mode);
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

  // 2. Hardware library: nine groups; Blind rivet, open end (pop rivet) 4.8.
  const openLibrary = async (kind, size) => {
    await ribbon.getByRole('button', { name: 'Hardware library', exact: true }).first().click();
    await properties.getByLabel('Hardware type').selectOption(kind);
    if (size) await properties.getByLabel('Metric size').selectOption(size);
    const attach = properties.getByLabel('Attach to selected hole');
    if (await attach.isVisible()) await attach.uncheck();
  };
  await openLibrary('blind-open', '4.8');
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
    'Blind rivets',
    'Solid, tubular & special rivets',
    'Blind rivet nuts & studs',
  ]);
  const typeCount = await properties.getByLabel('Hardware type').locator('option').count();
  assert.equal(typeCount, 46);
  await expect(properties.getByLabel('Head style')).toHaveValue('dome');
  await expect(properties.getByLabel('State', { exact: true })).toHaveValue('set');
  await expect(properties.getByLabel('Drive', { exact: true })).toHaveCount(0);
  await expect(properties.getByLabel('Point', { exact: true })).toHaveCount(0);
  await expect(properties.getByLabel('Body', { exact: true })).toHaveCount(0);
  await expect(properties.getByLabel('Body length (mm)', { exact: true })).toHaveValue('10');
  await expect(properties.getByLabel('Grip / clamped thickness (mm)', { exact: true })).toHaveValue('5');
  await expect(properties.getByLabel('Bulb height (mm)', { exact: true })).toHaveValue('3.12');
  await expect(properties.getByLabel('Hardware material', { exact: true })).toHaveValue('Aluminum');
  await properties.getByRole('button', { name: 'Add hardware', exact: true }).click();
  await expect(hint).toContainText('Hardware: click the holes it goes in');
  await expect(properties.getByRole('heading', { name: 'Place hardware' })).toBeVisible();
  const before = await savedWhen(() => true, 'the model before Apply');
  checks.push(
    `library: nine groups (${groups.join(' / ')}), ${typeCount} types; pop rivet 4.8: Head style dome, State set, no Drive / Point / Body, Body length 10, grip 5, bulb height 3.12, Aluminum`,
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
  await expect(hud).toContainText('hole centre · Blind rivet, open end (pop rivet) 4.8 · Board / plate top');
  for (const k of [0, 2]) await clickHole(k);
  await expect.poll(async () => (await placement()).chosen).toBe(2);
  await expect(hint).toContainText('Hardware: 2 holes chosen');
  checks.push(
    'place: readout "hole centre · Blind rivet, open end (pop rivet) 4.8 · Board / plate top"; holes 1 and 3 chosen',
  );

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
  const seated = await savedWhen((m) => m.instances.length === before.instances.length + 2, 'two rivets');
  await page.waitForTimeout(500);
  await settled('Apply blind rivets');
  const cameraAfter = await project(probe);
  const cameraDelta = Math.hypot(cameraAfter[0] - cameraBefore[0], cameraAfter[1] - cameraBefore[1]);
  assert(cameraDelta <= 0.5, `Apply hardware moved the camera: ${cameraDelta} px.`);
  assert.equal(seated.parts.length, before.parts.length + 1, 'One new part.');
  const pop = seated.parts.at(-1);
  assert.equal(pop.name, 'Blind rivet, open end (pop rivet) 4.8');
  assert.equal(pop.material, 'Aluminum');
  assert.equal(pop.features.length, 1);
  const popFeature = pop.features[0];
  assert.equal(popFeature.kind, 'blind-open');
  assert.equal(popFeature.head, 'dome');
  assert.equal(popFeature.state, 'set');
  assert.equal(popFeature.grip, 5);
  assert.equal('pitch' in popFeature, false, 'No pitch on a blind rivet.');
  assert.deepEqual([popFeature.headDiameter, popFeature.headHeight, popFeature.bulbDiameter], [9.5, 1.5, 7.2]);
  const rivets = seated.instances.slice(before.instances.length);
  assert(
    rivets.every((s) => s.partId === pop.id),
    'The two instances share one part.',
  );
  const connections = seated.connections.slice(before.connections.length);
  assert.deepEqual(
    connections.map((c) => [c.type, c.from, c.toFeatureId, c.holeIndex]),
    [
      ['concentric', rivets[0].id, row.id, undefined],
      ['concentric', rivets[1].id, row.id, 2],
    ],
  );
  assert.equal('holeIndex' in connections[0], false, 'No holeIndex on the first hole.');
  [0, 2].forEach((k, i) =>
    assert(near(rivets[i].position, centre(k), 1e-3), `Rivet ${i + 1} sits on hole ${k + 1}: ${rivets[i].position}`),
  );
  await zoomedShot('01-blind-open-4.8-iso', centre(0), 'isometric', 14);
  // From the front in X-ray: the board is glass, the rivets solid, so the head
  // on the top face and the bulb at −(grip + bulb height) inside the board show.
  await setMode('X-ray', 'xray');
  await zoomedShot('02-blind-open-4.8-front-xray', add(centre(0), [0, 0, -4]), 'front', 18);
  await setMode('Solid', 'solid');
  checks.push(
    `apply: +1 part "${pop.name}" (${pop.material}, head ${popFeature.head}, state ${popFeature.state}, grip ${popFeature.grip}, dk ${popFeature.headDiameter}, bulb Ø${popFeature.bulbDiameter}), 2 instances at (${rivets.map((s) => s.position.join(', ')).join(') (')}), holeIndex ${connections.map((c) => c.holeIndex ?? '—')}; camera delta ${cameraDelta.toFixed(3)} px`,
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

  // 4. A solid rivet 4, countersunk head, as supplied.
  await openLibrary('solid');
  await expect(properties.getByLabel('Metric size')).toHaveValue('4');
  await expect(properties.getByLabel('Head style')).toHaveValue('round');
  await expect(properties.getByLabel('Head height (mm)', { exact: true })).toHaveValue('2.4');
  await expect(properties.getByLabel('Hardware material', { exact: true })).toHaveValue('Steel');
  await properties.getByLabel('Head style').selectOption('countersunk');
  await expect(properties.getByLabel('Head height (mm)', { exact: true })).toHaveValue('1.5');
  await expect(properties.getByLabel('Overall length (mm)', { exact: true })).toHaveValue('12');
  await expect(properties.getByLabel('Shop head height (mm)', { exact: true })).toHaveValue('2');
  await properties.getByLabel('State', { exact: true }).selectOption('unset');
  await expect(properties.getByLabel('Shop head height (mm)', { exact: true })).toHaveCount(0);
  await properties.getByRole('button', { name: 'Add hardware', exact: true }).click();
  await expect(properties.getByRole('heading', { name: 'Place hardware' })).toBeVisible();
  const solid = await seatOnBoard([320, 260, top], 'Solid rivet 4');
  const solidFeature = solid.part.features[0];
  assert.equal(solidFeature.kind, 'solid');
  assert.equal(solidFeature.head, 'countersunk');
  assert.equal(solidFeature.state, 'unset');
  assert.equal(solidFeature.headHeight, 1.5);
  assert.equal(solid.part.material, 'Steel');
  await zoomedShot('03-solid-4-countersunk-unset-iso', solid.instance.position);
  // The flush head is coplanar with the board top: X-ray shows the cone and
  // the as-supplied shank inside the board.
  await setMode('X-ray', 'xray');
  await zoomedShot('03b-solid-4-countersunk-unset-iso-xray', add(solid.instance.position, [0, 0, -5]), 'isometric', 14);
  await setMode('Solid', 'solid');
  checks.push(
    `solid: size 4, Head style round → countersunk (head height 2.4 → 1.5), State unset (shop head height hidden) → "${solid.part.name}" at (${solid.instance.position.join(', ')})`,
  );

  // 5. A blind rivet nut M6, hexagon body.
  await openLibrary('blind-rivet-nut', 'M6');
  await expect(properties.getByLabel('Head style')).toHaveValue('flat');
  await expect(properties.getByLabel('Body', { exact: true })).toHaveValue('round');
  await expect(properties.getByLabel('Thread pitch (mm)', { exact: true })).toHaveValue('1');
  await properties.getByLabel('Body', { exact: true }).selectOption('hex');
  await expect(properties.getByLabel('Body across flats (mm)', { exact: true })).toHaveValue('9');
  await properties.getByRole('button', { name: 'Add hardware', exact: true }).click();
  await expect(properties.getByRole('heading', { name: 'Place hardware' })).toBeVisible();
  const nut = await seatOnBoard([460, 260, top], 'Blind rivet nut (rivnut) M6');
  const nutFeature = nut.part.features[0];
  assert.equal(nutFeature.kind, 'blind-rivet-nut');
  assert.equal(nutFeature.body, 'hex');
  assert.equal(nutFeature.state, 'set');
  assert.equal(nutFeature.pitch, 1);
  await zoomedShot('04-blind-rivet-nut-M6-hex-iso', nut.instance.position);
  await setMode('X-ray', 'xray');
  await zoomedShot('05-blind-rivet-nut-M6-hex-front-xray', add(nut.instance.position, [0, 0, -6]), 'front', 18);
  await setMode('Solid', 'solid');
  checks.push(
    `rivet nut: M6, Body round → hex (across flats 9), pitch 1 → "${nut.part.name}" at (${nut.instance.position.join(', ')})`,
  );

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
  await shot('06-undone');
  checks.push(
    `undo × 3: parts ${undone.parts.length}, instances ${undone.instances.length}, connections ${undone.connections.length} (as before the rivets)`,
  );

  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(`${directory}/verification.json`, JSON.stringify({ status: 'passed', errors, checks }, null, 2));
  console.log('Rivet library verification passed:\n- ' + checks.join('\n- '));
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
