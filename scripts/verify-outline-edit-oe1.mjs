/* global localStorage, process, console, document */
// Outline edit OE-1 (docs/sketch-studio-outline-edit-sheet-nest.md §3.8), driven
// the way a user would from an empty workspace on the Shop tab: an open outline
// comes back to Draw under "Not ready to cut" (drawn in the view, never "Make it
// solid") → Edit closes it → two rectangles in one sketch are two blanks → Edit
// makes one larger → Delete, Undo → Cut this → Cut from sheet → Edit outline
// adds a cut-out → Cut on the laser → the laser's Edit outline adds another →
// one bend on the press brake → a shrunk outline the bend falls off is refused
// (the sketcher stays open), Cancel leaves the part as it was. No page errors,
// no .cad-error but the refusal's.
//   CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-outline-edit-oe1.mjs
// Screenshots: artifacts/sketch-cad/outline-edit-oe1 (or OE1_SHOTS), each state
// at 1600 × 1000 and at 1366 × 768.
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { cadSteps } from './sketch-cad-steps.mjs';

const directory = process.env.OE1_SHOTS || 'artifacts/sketch-cad/outline-edit-oe1';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [],
  checks = [],
  measured = {};
page.on('pageerror', (e) => errors.push(e.message));
const { properties, savedWhen, saved, typeHud, toolbar, status, route, shopStation } = cadSteps(page);
const footer = page.locator('.cad-status');
const bed = page.getByRole('figure', { name: 'Laser bed' });
const draw = properties.getByRole('region', { name: 'Draw' });
const readyList = draw.getByRole('list', { name: 'Outlines ready to cut' });
const notReadyList = draw.getByRole('list', { name: 'Not ready to cut' });
const modelCurrent = () => expect(footer).toContainText('Model current', { timeout: 60000 });
const outlinesOnShow = () => page.evaluate(() => document.querySelector('.cad-viewport').cadViewMode().shopOutlines);
const fill = async (scope, label, value) => {
  const field = scope.getByLabel(label, { exact: true });
  await field.fill(String(value));
  await field.press('Enter');
};
const noErrorLine = async (where) =>
  assert.equal(await page.locator('.cad-error').count(), 0, `no error line ${where}`);
// The shot at 1600 × 1000, then the same state at 1366 × 768.
const shots = async (name) => {
  await page.mouse.move(5, 600);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${directory}/${name}-1600.png` });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.waitForTimeout(350);
  // At 1366 × 768 Draw's lists sit below its tiles: the pane brings the chosen
  // row into view on arriving (checked natively in step 4), not on a resize.
  const chosenRow = properties.locator('li.is-chosen');
  if (await chosenRow.count()) await chosenRow.first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${directory}/${name}-1366.png` });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.waitForTimeout(350);
};
// The sketcher's tools, typed through its HUD (the field under focus after each
// step). The pointer never crosses the canvas while sketching, so a typed
// rectangle opens toward +X, +Y (it opens toward the cursor's quadrant).
const tool = (name) => toolbar.getByRole('button', { name, exact: true }).click();
// Typed once the step's first field has the focus (the HUD moves it there after each step).
const typeAt = async (field, ...values) => {
  await expect(page.getByLabel(`Sketch ${field}`, { exact: true })).toBeFocused();
  await typeHud(...values);
};
const rectangle = async (x, y, width, height) => {
  await tool('Rectangle');
  await typeAt('x', x, y);
  await typeAt('width', width, height);
  await page.keyboard.press('Escape');
};
const circle = async (x, y, radius) => {
  await tool('Circle');
  await typeAt('x', x, y);
  await typeAt('radius', radius);
  await page.keyboard.press('Escape');
};
// A chain of lines from `start`, each step [length, angle], ended with Esc.
const lines = async (start, steps) => {
  await tool('Line');
  await typeAt('x', ...start);
  for (const [length, angle] of steps) await typeAt('length', length, angle);
  await page.keyboard.press('Escape');
};
// HD-1 (docs/sketch-studio-hand-drawing.md §5.2): Undo last has nothing to undo in a sketch just
// reopened, so the outline it opens with is cleared the way a user would: Ctrl+A, Delete selected.
const clearDrawing = async () => {
  await page.mouse.move(5, 600);
  await page.keyboard.press('Control+a');
  await page
    .getByRole('group', { name: 'Selection' })
    .getByRole('button', { name: 'Delete selected', exact: true })
    .click();
  await expect(status).toContainText('0 items · no profile yet');
};
const finish = () => tool('Finish sketch');
const sketchNamed = (model, name) => model.sketches.find((s) => s.name === name);

try {
  await page.goto(process.env.CAD_VERIFY_URL || 'http://localhost:5180/sketch');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '3D Model & workshop', exact: true }).click();
  await modelCurrent();
  await shopStation('Draw');
  await expect(draw).toBeVisible();

  // 1. Draw the outline: two lines that do not close → Finish → Draw, "Not ready to cut".
  await draw.getByRole('button', { name: /^Draw the outline/ }).click();
  await toolbar.waitFor();
  await lines(
    [0, 0],
    [
      [100, 0],
      [60, 90],
    ],
  );
  await expect(status).toContainText('2 items · open outline');
  await finish();
  await expect(draw).toBeVisible();
  await expect(properties.getByText('Make it solid', { exact: true })).toHaveCount(0);
  const open = notReadyList.getByRole('listitem');
  await expect(open).toHaveCount(1);
  await expect(open).toHaveClass('is-chosen');
  await expect(open).toContainText('Sketch 1');
  await expect(open.getByRole('note')).toHaveText('Not closed: connect the ends so the outline is one loop.');
  await expect(readyList).toHaveCount(0);
  await expect.poll(outlinesOnShow).toBe(1);
  await noErrorLine('after an open outline');
  await shots('01-draw-not-ready');
  checks.push(
    'open outline → Draw: "Not ready to cut" holds Sketch 1 ("Not closed…"), 1 outline on show, no Make it solid',
  );

  // 2. Edit Sketch 1: the two lines come back; a third closes it → ready, chosen.
  await open.getByRole('button', { name: 'Edit Sketch 1', exact: true }).click();
  await toolbar.waitFor();
  await expect(status).toContainText('2 items · open outline');
  await expect.poll(outlinesOnShow).toBe(0);
  await lines([100, 60], [[Math.hypot(100, 60), (Math.atan2(-60, -100) * 180) / Math.PI]]);
  await expect(status).toContainText('3 items · closed profile');
  await shots('02-edit-closing');
  await finish();
  await expect(readyList.getByRole('listitem')).toHaveCount(1);
  await expect(readyList.getByRole('listitem')).toHaveClass('is-chosen');
  await expect(readyList.getByRole('listitem')).toContainText('100 × 60 mm');
  await expect(notReadyList).toHaveCount(0);
  let model = await savedWhen((m) => m.sketches.length === 1 && m.sketches[0].profile.closed !== false, 'closed');
  const sketch1 = model.sketches[0].id;
  await noErrorLine('after closing the outline');
  await shots('03-draw-ready');
  checks.push(
    'Edit Sketch 1 → the two lines in the sketcher, a third closes it → "Outlines ready to cut", chosen, 100 × 60 mm',
  );

  // 3. Two rectangles in one sketch → two blanks and the status line.
  await draw.getByRole('button', { name: /^Draw the outline/ }).click();
  await toolbar.waitFor();
  await rectangle(0, 0, 200, 100);
  await rectangle(260, 0, 200, 100);
  await expect(status).toContainText('2 items · closed profile');
  await finish();
  await expect(readyList.getByRole('listitem').locator('strong')).toHaveText(['Sketch 1', 'Sketch 2', 'Sketch 2 · 2']);
  await expect(draw.getByRole('status')).toHaveText('Sketch 2 held 2 separate outlines: each is its own blank.');
  await expect(readyList.locator('li.is-chosen strong')).toHaveText('Sketch 2');
  model = await savedWhen((m) => m.sketches.length === 3, 'the split');
  assert.deepEqual(
    model.sketches.map((s) => [s.name, s.profile.origin, s.profile.width]),
    [
      ['Sketch 1', undefined, undefined],
      ['Sketch 2', [0, 0], 200],
      ['Sketch 2 · 2', [260, 0], 200],
    ],
  );
  await expect.poll(outlinesOnShow).toBe(3);
  await noErrorLine('after the split');
  await shots('04-two-blanks');
  checks.push(
    'two 200 × 100 rectangles in one sketch → "Sketch 2" and "Sketch 2 · 2" ready, the split status line, 3 outlines on show',
  );

  // 4. Edit "Sketch 2 · 2": larger → the row follows. Done at 1366 × 768,
  // where the lists are below Draw's tiles: the row comes back into view.
  await page.setViewportSize({ width: 1366, height: 768 });
  await readyList.getByRole('button', { name: 'Edit Sketch 2 · 2', exact: true }).click();
  await toolbar.waitFor();
  await clearDrawing();
  await rectangle(260, 0, 300, 150);
  await finish();
  const second = readyList.getByRole('listitem').filter({ hasText: 'Sketch 2 · 2' });
  await expect(second).toContainText('300 × 150 mm');
  await expect(second).toHaveClass('is-chosen');
  await expect(second).toBeInViewport();
  await page.setViewportSize({ width: 1600, height: 1000 });
  model = await savedWhen((m) => sketchNamed(m, 'Sketch 2 · 2')?.profile.width === 300, 'the larger outline');
  assert.equal(model.sketches.length, 3, 'edited in place');
  await shots('05-edited-larger');
  checks.push('Edit Sketch 2 · 2 → 300 × 150 → its row reads 300 × 150 mm (edited in place, 3 sketches)');

  // 5. Delete "Sketch 2 · 2" → gone; Undo → back.
  await second.getByRole('button', { name: 'Delete Sketch 2 · 2', exact: true }).click();
  await expect(readyList.getByRole('listitem').locator('strong')).toHaveText(['Sketch 1', 'Sketch 2']);
  await savedWhen((m) => m.sketches.length === 2, 'the delete');
  await expect.poll(outlinesOnShow).toBe(2);
  await page.locator('.cad-file-actions').getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(readyList.getByRole('listitem').locator('strong')).toHaveText(['Sketch 1', 'Sketch 2', 'Sketch 2 · 2']);
  await savedWhen((m) => m.sketches.length === 3, 'the undo');
  await noErrorLine('after Delete and Undo');
  checks.push('Delete Sketch 2 · 2 → gone (2 outlines on show); Undo → back');

  // 6. Cut this (Sketch 1) → Cut from sheet → Edit outline → a circle → 2 pierces → Cut on the laser.
  await readyList.getByRole('button', { name: 'Cut Sketch 1', exact: true }).click();
  const cut = properties.getByRole('region', { name: 'Cut from sheet' });
  await expect(cut.getByLabel('Blank size', { exact: true })).toHaveText(/· 1 pierce$/);
  await expect.poll(outlinesOnShow).toBe(0);
  await cut.getByRole('button', { name: 'Edit outline', exact: true }).click();
  await toolbar.waitFor();
  await circle(70, 7, 4);
  await expect(status).toContainText('4 items · closed profile');
  await finish();
  await expect(cut.getByLabel('Blank size', { exact: true })).toHaveText(/· 2 pierces$/);
  await shots('06-cut-from-sheet-edited');
  await cut.getByRole('button', { name: 'Cut on the laser', exact: true }).click();
  await expect(bed).toHaveAttribute('data-state', 'cutting', { timeout: 5000 });
  await expect(bed).toHaveAttribute('data-state', 'cut', { timeout: 20000 });
  model = await savedWhen((m) => m.parts.length === 1, 'the cut part');
  assert.equal(model.parts[0].features[0].sketchId, sketch1, 'Sketch 1 is the blank');
  await modelCurrent();
  await noErrorLine('after the cut');
  checks.push('Cut this → Cut from sheet → Edit outline + Ø8 circle → "2 pierces" → Cut on the laser → cut done');

  // 7. The laser's Edit outline: a second circle → back on the laser, 3 pierces, the notice.
  const laser = properties.getByRole('region', { name: 'Laser station' });
  await laser.getByRole('button', { name: 'Edit outline', exact: true }).click();
  await toolbar.waitFor();
  await expect(bed).toHaveCount(0);
  await circle(88, 7, 3);
  await expect(status).toContainText('5 items · closed profile');
  await finish();
  await expect(laser).toBeVisible();
  await expect(bed).toHaveAttribute('data-state', 'ready');
  await expect(laser.getByText('Outline updated: blank 100 × 60 mm.', { exact: true })).toBeVisible();
  await laser.locator('details.cad-shop-numbers > summary').click();
  await expect(laser.getByLabel('Pierces', { exact: true })).toHaveText(/^3 × /);
  await noErrorLine('back on the laser');
  await shots('07-laser-edited');
  checks.push(
    'laser → Edit outline + Ø6 circle → back on the laser (ready), "Outline updated: blank 100 × 60 mm.", 3 pierces',
  );

  // 8. One bend on the press brake, then a shrunk outline the bend falls off: refused; Cancel.
  await laser.getByRole('button', { name: 'Next: Bend', exact: true }).click();
  const brake = properties.getByRole('region', { name: 'Press brake' });
  const map = page.getByRole('figure', { name: 'Flat blank' });
  const edges = map.getByRole('button', { name: /^Gauge edge \d+$/ });
  await expect(edges.first()).toBeVisible();
  for (let i = 0; i < (await edges.count()); i++) {
    await edges.nth(i).click();
    if ((await brake.getByLabel('Gauge edge', { exact: true }).innerText()).endsWith('· 100 mm')) break;
  }
  await fill(brake, 'Backgauge L (mm)', 20);
  await expect(brake.getByRole('status', { name: 'Collision check' })).toContainText('Clear through the stroke');
  await brake.getByRole('button', { name: 'Bend', exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector('.cad-viewport').cadShop().station?.stroking === false,
    null,
    {
      timeout: 8000,
    },
  );
  model = await savedWhen((m) => m.parts[0].features[0].bends?.length === 1, 'the bend');
  const before = JSON.stringify({ sketch: model.sketches.find((s) => s.id === sketch1), part: model.parts[0] });
  measured.bendLine = model.parts[0].features[0].bends[0];
  await modelCurrent();
  await route.getByRole('button', { name: 'Cut', exact: true }).click();
  // Another outline waits, so the route's Cut opens the picker (docs/sketch-studio-cut-pick.md §4.1):
  // the bent part is under Already cut, one click from the laser.
  await properties
    .getByRole('list', { name: 'Already cut' })
    .getByRole('button', { name: /^Open .+ on the laser$/ })
    .click();
  await expect(laser).toBeVisible();
  await laser.getByRole('button', { name: 'Edit outline', exact: true }).click();
  await toolbar.waitFor();
  await clearDrawing();
  await rectangle(40, 0, 60, 14);
  await circle(70, 7, 4);
  await circle(88, 7, 3);
  await expect(status).toContainText('3 items · closed profile');
  await finish();
  const refusal = page.getByLabel('Sketch refused', { exact: true });
  await expect(refusal).toHaveText(
    /^This outline no longer takes the bends of .+: Bend 1: the punch line misses the blank\. Fix the outline, or remove that bend first\.$/,
  );
  await expect(toolbar).toBeVisible();
  await expect(status).toContainText('3 items · closed profile');
  await expect(page.locator('.cad-error')).toHaveText(await refusal.innerText());
  measured.refusal = await refusal.innerText();
  await shots('08-refused');
  await tool('Cancel sketch');
  await expect(toolbar).toHaveCount(0);
  await expect(laser).toBeVisible();
  await noErrorLine('after Cancel');
  const after = await saved();
  assert.equal(
    JSON.stringify({ sketch: after.sketches.find((s) => s.id === sketch1), part: after.parts[0] }),
    before,
    'Cancel leaves the part and its outline as they were',
  );
  await shots('09-cancelled');
  checks.push(
    `one bend, then a shrunk outline → refused ("${measured.refusal}"), the sketcher open; Cancel → the laser, the part as it was`,
  );

  // 9. No page error.
  if (errors.length) throw new Error(errors.join('\n'));
  checks.push('no page error; no .cad-error but the refusal of step 8 (checked along the way)');
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ status: 'passed', errors, checks, measured }, null, 2),
  );
  console.log('Outline edit OE-1 verification passed:\n- ' + checks.join('\n- '));
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` });
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}
