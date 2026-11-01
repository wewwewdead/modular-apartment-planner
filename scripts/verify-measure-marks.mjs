/* global localStorage, process, console, document */
// Phase G: Measure + dimension marks. Measure a board's width from the top,
// check the label and the saved mark, save it as a parameter, box-snap a tube
// onto the mark, use the parameter in a Position field and a box width, and
// snap a sketch point to a mark point.
//   CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-measure-marks.mjs
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { cadSteps } from './sketch-cad-steps.mjs';

const directory = 'artifacts/sketch-cad/measure-marks';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [],
  checks = [];
page.on('pageerror', (e) => errors.push(e.message));
const { properties, current, savedWhen, project, view, sketchOnPlane, toolbar: sketchBar, status } = cadSteps(page);
const toolbar = page.locator('.cad-view-toolbar');
const measureHud = page.locator('.cad-measure-hud');
const gizmoHud = page.locator('.cad-gizmo-hud');
const label = page.locator('.cad-mark-label');
const marks = () => page.evaluate(() => document.querySelector('.cad-viewport').cadMarks());
const gizmo = () => page.evaluate(() => document.querySelector('.cad-viewport').cadGizmo());
const add = (a, b) => a.map((v, i) => v + b[i]);

try {
  await page.goto(process.env.CAD_VERIFY_URL || 'http://localhost:5180/sketch');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '3D Model & workshop', exact: true }).click();
  await current();
  // The default board: 600 × 400 × 18, centred under the view centre. Read
  // where it landed: world points below are part points plus its position.
  await page.locator('.cad-ribbon').getByRole('button', { name: 'Board / plate', exact: true }).click();
  await current();
  const boardAt = (await savedWhen((m) => m.instances.length === 1, 'the new board')).instances[0].position;
  assert.equal(boardAt[2], 0, 'The new board sits on the ground.');
  const onBoard = (p) => add(boardAt, p);
  await view('top');
  await page.waitForTimeout(300);

  // 1. Measure the front edge, corner to corner.
  await toolbar.getByRole('button', { name: 'Measure', exact: true }).click();
  await expect(toolbar.getByRole('button', { name: 'Measure', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(properties.getByRole('heading', { name: 'Measure' })).toBeVisible();
  const a = await project(onBoard([0, 0, 18]));
  const b = await project(onBoard([600, 0, 18]));
  await page.mouse.move(a[0] + 2, a[1] - 2, { steps: 4 });
  await expect(measureHud).toHaveText('vertex');
  await page.mouse.click(a[0] + 2, a[1] - 2);
  assert.deepEqual((await marks()).first, onBoard([0, 0, 18]), 'First point snaps to the board corner.');
  await page.mouse.move(b[0] - 2, b[1] + 1, { steps: 6 });
  await expect(measureHud).toContainText('600 mm · ΔX 600 · ΔY 0 · ΔZ 0 · vertex');
  const hudText = await measureHud.innerText();
  await page.screenshot({ path: `${directory}/01-second-point.png` });
  await page.mouse.click(b[0] - 2, b[1] + 1);
  await expect(label).toHaveText('600');
  const saved = await savedWhen(
    (m) => m.marks?.length === 1 && m.marks[0].from.instanceId,
    'one mark anchored to the board',
  );
  const [mark] = saved.marks;
  assert.equal(mark.from.instanceId, saved.instances[0].id);
  assert.equal(mark.to.instanceId, saved.instances[0].id);
  assert.equal(mark.along, 'aligned');
  await current();
  const shown = await marks();
  assert.equal(shown.labels.length, 1);
  assert.equal(shown.labels[0].text, '600');
  assert.equal(shown.first, null);
  await page.screenshot({ path: `${directory}/02-mark-label.png` });
  checks.push(`measure corner to corner: HUD "${hudText}"; label "600"; mark anchored to ${mark.from.instanceId}`);

  // 2. Save it as a parameter.
  await properties.getByRole('button', { name: 'Save as parameter', exact: true }).click();
  const name = properties.getByLabel('Parameter name', { exact: true });
  await expect(name).toHaveValue('mark1');
  await name.fill('boardWidth');
  await name.press('Enter');
  const withParameter = await savedWhen(
    (m) => m.parameters.some((p) => p.name === 'boardWidth' && p.value === 600),
    'boardWidth = 600',
  );
  await current();
  await page.screenshot({ path: `${directory}/03-parameter.png` });
  checks.push(
    `save as parameter: ${JSON.stringify(withParameter.parameters.map(({ name, value }) => ({ name, value })))}`,
  );

  // 3. A tube dragged toward the board's right end (part x = 600) snaps its box
  // onto the mark (clear of the board in Y, so the board's own face cannot be
  // what it snaps to).
  await page.keyboard.press('Escape');
  await expect(toolbar.getByRole('button', { name: 'Measure', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await page.locator('.cad-ribbon').getByRole('button', { name: 'Tube / member', exact: true }).click();
  await current();
  // A new tube lands on the ground under the centre of the view (the board's
  // centre in this top view), so the drag starts from where it actually is.
  const tubeAt = (await savedWhen((m) => m.instances.length === 2, 'the tube added')).instances[1].position;
  assert.equal(tubeAt[2], 0, 'The new tube stands on the ground.');
  await toolbar.getByRole('button', { name: 'Move part', exact: true }).click();
  await expect(toolbar.getByRole('button', { name: 'Move part', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(200);
  const start = await project(add(tubeAt, [0, 0, 350]));
  const target = await project(onBoard([575, -100, 350]));
  await page.mouse.move(...start);
  await page.waitForTimeout(150);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(start[0] + ((target[0] - start[0]) * i) / 10, start[1] + ((target[1] - start[1]) * i) / 10);
    await page.waitForTimeout(80);
  }
  await expect(gizmoHud).toContainText('mark');
  const dragText = await gizmoHud.innerText();
  await page.screenshot({ path: `${directory}/04-tube-mark-snap.png` });
  await page.mouse.up();
  await current();
  const pivot = (await gizmo()).pivot;
  // The 40 mm tube's right face on the mark's end (part x = 600): its centre at part x = 580.
  const snappedX = boardAt[0] + 580;
  assert(
    Math.abs(pivot[0] - snappedX) < 1e-6,
    `Tube centre x ${pivot[0]} should be ${snappedX} (right face on the mark).`,
  );
  checks.push(
    `tube added at (${tubeAt}) under the view centre; drag snaps to the mark: HUD "${dragText}"; tube centre x = ${pivot[0]}`,
  );

  // 4. =boardWidth in a Position field and in the board's box width.
  const positionX = properties
    .getByRole('group', { name: 'Position (mm)', exact: true })
    .getByLabel('X', { exact: true });
  await positionX.fill('=boardW');
  await expect(properties.getByRole('option', { name: /boardWidth/ })).toBeVisible();
  await positionX.fill('=boardWidth');
  await positionX.press('Escape');
  await positionX.press('Enter');
  await savedWhen((m) => m.instances[1]?.position[0] === '=boardWidth', 'tube X = =boardWidth');
  await current();
  const tubeCentre = (await gizmo()).pivot;
  assert(Math.abs(tubeCentre[0] - 600) < 1e-6, `Tube centre x ${tubeCentre[0]} should follow =boardWidth.`);
  await page
    .locator('.cad-tree')
    .getByRole('button', { name: /Board \/ plate/ })
    .click();
  const width = properties.getByLabel('width', { exact: true });
  await width.fill('=boardW');
  await expect(properties.getByRole('option', { name: /boardWidth/ })).toBeVisible();
  await width.fill('=boardWidth+100');
  await width.press('Enter');
  const resized = await savedWhen(
    (m) => m.parts[0].features[0].width === '=boardWidth+100',
    'board width = =boardWidth+100',
  );
  await current();
  assert.equal(resized.marks.length, 1);
  // The mark stays on the part's own points: still 600 after the board grew.
  await expect(label).toHaveText('600');
  await page.screenshot({ path: `${directory}/05-parameter-expressions.png` });
  checks.push('=boardWidth listed by autocomplete; tube Position X = 600; board width =boardWidth+100 rebuilt');

  // 5. A sketch on the board's top plane snaps to the mark's midpoint (part 300, 0).
  await sketchOnPlane('XY', 18);
  await sketchBar.getByRole('button', { name: 'Line', exact: true }).click();
  await page.waitForTimeout(300);
  const midpoint = onBoard([300, 0, 18]);
  const mid = await project(midpoint);
  await page.mouse.move(mid[0] + 3, mid[1] - 2, { steps: 4 });
  await expect(status).toContainText(`X ${midpoint[0]} · Y ${midpoint[1]} mm · mark`);
  await page.screenshot({ path: `${directory}/06-sketch-mark-snap.png` });
  await page.keyboard.press('Escape');
  await sketchBar.getByRole('button', { name: 'Cancel sketch', exact: true }).click();
  checks.push(
    `sketch on XY at Z 18: the cursor snaps to the mark midpoint (X ${midpoint[0]} · Y ${midpoint[1]} · mark), board at (${boardAt})`,
  );

  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(`${directory}/verification.json`, JSON.stringify({ status: 'passed', errors, checks }, null, 2));
  console.log('Measure marks verification passed:\n- ' + checks.join('\n- '));
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` });
  console.error(await page.locator('body').innerText());
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}
