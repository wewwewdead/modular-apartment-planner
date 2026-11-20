/* global localStorage, process, console, document */
// Cut picks the drawings RC-1 / RC-2 (docs/sketch-studio-cut-pick.md §5.2),
// driven the way a user would on the Shop tab: five rectangles in one sketch →
// the route's Cut opens the picker, nothing selected, five outlines in the
// view → two clicked in the view, one unticked in the list (the view follows)
// → Select all, a Quantity of 2, 1.2 mm SPCC → three unticked, Cut on the
// laser: two parts → the picker again: three outlines, two parts under
// Already cut → a cut part selected in the view and removed (Remove instance):
// four outlines, one part, Draw lists four; Undo → three and two → one part
// bent, removed: its outline is back, cut again: a flat blank → the laser's
// "… waiting to be cut" → Cut another outline → the picker.
//   CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-cut-pick-rc.mjs
// Screenshots: artifacts/sketch-cad/cut-pick-rc (or RC_SHOTS), each state at
// 1600 × 1000 and at 1366 × 768.
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { cadSteps } from './sketch-cad-steps.mjs';

const directory = process.env.RC_SHOTS || 'artifacts/sketch-cad/cut-pick-rc';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [],
  checks = [],
  measured = {};
page.on('pageerror', (e) => errors.push(e.message));
const { properties, savedWhen, typeHud, toolbar, status, route, shopStation, project } = cadSteps(page);
const footer = page.locator('.cad-status');
const bed = page.getByRole('figure', { name: 'Laser bed' });
const draw = properties.getByRole('region', { name: 'Draw' });
const picker = properties.getByRole('region', { name: 'Cut from sheet' });
const laser = properties.getByRole('region', { name: 'Laser station' });
const readyList = draw.getByRole('list', { name: 'Outlines ready to cut' });
const toCut = picker.getByRole('list', { name: 'Outlines to cut' });
const alreadyCut = picker.getByRole('list', { name: 'Already cut' });
const selected = picker.getByLabel('Selected outlines', { exact: true });
const modelCurrent = () => expect(footer).toContainText('Model current', { timeout: 60000 });
const viewMode = () => page.evaluate(() => document.querySelector('.cad-viewport').cadViewMode());
const outlineAt = ([x, y]) =>
  page.evaluate(([cx, cy]) => document.querySelector('.cad-viewport').cadOutlineAt(cx, cy), [x, y]);
const fill = async (scope, label, value) => {
  const field = scope.getByLabel(label, { exact: true });
  await field.fill(String(value));
  await field.press('Enter');
};
const noErrorLine = async (where) =>
  assert.equal(await page.locator('.cad-error').count(), 0, `no error line ${where}`);
const clippedInPane = () =>
  page.evaluate(() => {
    const pane = document.querySelector('.cad-properties');
    if (!pane) return [];
    const box = pane.getBoundingClientRect();
    return [...pane.querySelectorAll('button, input, select, li, dd, strong')]
      .filter((el) => el.getClientRects().length)
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.right > box.right + 1 || r.left < box.left - 1);
      })
      .map(
        (el) =>
          `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent).trim().slice(0, 40)}"`,
      );
  });
// The shot at 1600 × 1000, then at 1366 × 768: every control named in
// `visible` in view after scrolling to it, nothing in the pane sticking out.
const shots = async (name, visible = []) => {
  await page.mouse.move(5, 600);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${directory}/${name}-1600.png` });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.waitForTimeout(350);
  for (const locator of visible) {
    await locator.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await expect(locator).toBeInViewport({ ratio: 1 });
  }
  assert.deepEqual(await clippedInPane(), [], `nothing clipped sideways at 1366 × 768 (${name})`);
  await page.screenshot({ path: `${directory}/${name}-1366.png` });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.waitForTimeout(350);
};
const tool = (name) => toolbar.getByRole('button', { name, exact: true }).click();
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
const undo = () => page.locator('.cad-file-actions').getByRole('button', { name: 'Undo', exact: true }).click();
const cutDone = () => expect(bed).toHaveAttribute('data-state', 'cut', { timeout: 30000 });
const names = (list) => list.getByRole('listitem').locator('strong');
// The five plates: 80 × 50, 120 mm apart along X.
const PLATES = [0, 1, 2, 3, 4].map((k) => ({ x: k * 120, centre: [k * 120 + 40, 25, 0] }));
// Click the ground at a world point (the outline under it, unless a part stands in front).
const clickWorld = async (point) => {
  const [x, y] = await project(point);
  await page.mouse.click(x, y);
};
// A part's displayed body: the centre of its world box's floor (a flat blank's
// face, a bent one's base under its flange), for a click on it.
const clickBody = async (instanceId) => {
  const body = (await viewMode()).bodies.find((b) => b.id === instanceId);
  assert.ok(body?.bounds, `the body of ${instanceId} is drawn`);
  const [[x0, y0, z0], [x1, y1]] = body.bounds;
  await clickWorld([(x0 + x1) / 2, (y0 + y1) / 2, z0]);
};
const removeInstance = () => properties.getByRole('button', { name: 'Remove instance', exact: true }).click();

try {
  await page.goto(process.env.CAD_VERIFY_URL || 'http://localhost:5180/sketch');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '3D Model & workshop', exact: true }).click();
  await modelCurrent();

  // 1. Draw: five rectangles side by side in one sketch → Finish → five outlines.
  await shopStation('Draw');
  await draw.getByRole('button', { name: /^Draw the outline/ }).click();
  await toolbar.waitFor();
  for (const plate of PLATES) await rectangle(plate.x, 0, 80, 50);
  await expect(status).toContainText('5 items · closed profile');
  await tool('Finish sketch');
  await expect(readyList.getByRole('listitem')).toHaveCount(5);
  const outlineNames = await names(readyList).allInnerTexts();
  let model = await savedWhen((m) => m.sketches.length === 5, 'five outlines');
  const ids = model.sketches.map((s) => s.id);
  checks.push(`five rectangles in one sketch → five outlines (${outlineNames.join(', ')})`);

  // 2. The route's Cut → the picker, nothing selected, the view shows five outlines, clickable.
  await route.getByRole('button', { name: 'Cut', exact: true }).click();
  await expect(picker.getByText('Choose the outlines to cut, then the sheet stock.')).toBeVisible();
  await expect(names(toCut)).toHaveText(outlineNames);
  await expect(selected).toHaveText('0 of 5 selected');
  await expect(picker.getByRole('button', { name: 'Cut on the laser', exact: true })).toBeDisabled();
  let view = await viewMode();
  assert.equal(view.shopOutlines, 5, 'the view shows the five outlines');
  assert.equal(view.shopOutlinesPickable, true, 'a click in the view picks them');
  await shots('01-picker-none', [selected, toCut]);
  checks.push('route Cut → the picker: "0 of 5 selected", Cut on the laser off, five outlines in the view, clickable');

  // 3. Two outlines clicked in the view → their rows ticked; one unticked in the list → the view follows.
  for (const k of [0, 2]) assert.equal(await outlineAt(await project(PLATES[k].centre)), ids[k], `plate ${k + 1} is under its centre`);
  await clickWorld(PLATES[0].centre);
  await clickWorld(PLATES[2].centre);
  await expect(selected).toHaveText('2 of 5 selected');
  await expect(picker.getByRole('checkbox', { name: `Select ${outlineNames[0]}`, exact: true })).toBeChecked();
  await expect(picker.getByRole('checkbox', { name: `Select ${outlineNames[2]}`, exact: true })).toBeChecked();
  assert.deepEqual((await viewMode()).shopOutlinesChosen, [ids[0], ids[2]], 'the view draws the two chosen');
  // The cursor says it can be clicked.
  const [hx, hy] = await project(PLATES[1].centre);
  await page.mouse.move(hx, hy);
  await expect.poll(() => page.evaluate(() => document.querySelector('.cad-viewport canvas').style.cursor)).toBe('pointer');
  await shots('02-two-clicked', [selected]);
  await picker.getByRole('checkbox', { name: `Select ${outlineNames[0]}`, exact: true }).uncheck();
  await expect(selected).toHaveText('1 of 5 selected');
  await expect.poll(async () => (await viewMode()).shopOutlinesChosen).toEqual([ids[2]]);
  // A click again in the view leaves it out.
  await clickWorld(PLATES[2].centre);
  await expect(selected).toHaveText('0 of 5 selected');
  checks.push('two outlines clicked in the view → ticked, "2 of 5 selected", drawn chosen; the cursor a pointer; unticked in the list → the view follows; a second click leaves one out');

  // 4. Select all → 5; one Quantity 2; 1.2 mm SPCC → "6 blanks from 5 outlines".
  await picker.getByRole('button', { name: 'Select all', exact: true }).click();
  await expect(selected).toHaveText('5 of 5 selected');
  await fill(picker, `Quantity of ${outlineNames[1]}`, 2);
  await picker.getByLabel('Sheet stock', { exact: true }).selectOption('spcc');
  await picker.getByLabel('Thickness', { exact: true }).selectOption('1.2');
  await expect(picker.getByLabel('Batch', { exact: true })).toHaveText('6 blanks from 5 outlines');
  await shots('03-select-all', [picker.getByLabel('Batch', { exact: true }), picker.getByRole('button', { name: 'Cut on the laser', exact: true })]);
  checks.push('Select all → "5 of 5 selected"; a Quantity of 2 and 1.2 mm SPCC → "6 blanks from 5 outlines"');

  // 5. Untick three → Cut on the laser → the laser cuts; two parts.
  for (const k of [2, 3, 4])
    await picker.getByRole('checkbox', { name: `Select ${outlineNames[k]}`, exact: true }).uncheck();
  await expect(picker.getByLabel('Batch', { exact: true })).toHaveText('3 blanks from 2 outlines');
  await picker.getByRole('button', { name: 'Cut on the laser', exact: true }).click();
  await expect(bed).toHaveAttribute('data-state', 'cutting', { timeout: 10000 });
  await cutDone();
  model = await savedWhen((m) => m.parts.length === 2 && m.instances.length === 3, 'two parts, three blanks');
  assert.deepEqual(model.parts.map((p) => p.name), outlineNames.slice(0, 2), 'the parts named after their outlines');
  assert.ok(model.parts.every((p) => p.features[0].thickness === 1.2 && p.features[0].stock === 'spcc'), '1.2 mm SPCC');
  await modelCurrent();
  // 9 (here: the laser is open). "3 outlines waiting to be cut." with Cut another outline.
  const waiting = laser.locator('.cad-laser-waiting');
  await expect(waiting).toHaveText('3 outlines waiting to be cut. Cut another outline');
  await shots('04-laser-two-parts', [waiting]);
  checks.push('three unticked → Cut on the laser: the cut runs, 2 parts (1.2 mm SPCC, named after their outlines), 3 blanks; the laser says "3 outlines waiting to be cut."');

  // 6. Leave the laser, the route's Cut again (the new part still selected) → the picker: three, two parts.
  await laser.getByRole('button', { name: 'Leave laser', exact: true }).click();
  await route.getByRole('button', { name: 'Cut', exact: true }).click();
  await expect(names(toCut)).toHaveText(outlineNames.slice(2));
  await expect(selected).toHaveText('0 of 3 selected');
  await expect(names(alreadyCut)).toHaveText([outlineNames[0], `${outlineNames[1]} × 2`]);
  await expect(alreadyCut.getByRole('listitem').first().locator('small')).toHaveText('t 1.2 SPCC');
  assert.equal((await viewMode()).shopOutlines, 3, 'the view shows the three outlines left');
  await shots('05-picker-already-cut', [alreadyCut]);
  checks.push('the route’s Cut again (the part selected) → the picker: three outlines, Already cut: two parts (× 2, "t 1.2 SPCC")');

  // 7. A cut part selected in the view, removed (Remove instance: the app has no Delete key for parts)
  //    → the picker lists four, one part under Already cut; Draw lists four. Undo → three and two.
  const first = model.instances.find((i) => i.partId === model.parts[0].id).id;
  await clickBody(first);
  await expect(properties.getByRole('button', { name: 'Remove instance', exact: true })).toBeVisible();
  await removeInstance();
  model = await savedWhen((m) => m.parts.length === 1, 'the part goes with its one blank');
  assert.equal(model.sketches.length, 5, 'its outline stays');
  await route.getByRole('button', { name: 'Cut', exact: true }).click();
  await expect(names(toCut)).toHaveText([outlineNames[0], ...outlineNames.slice(2)]);
  await expect(names(alreadyCut)).toHaveText([`${outlineNames[1]} × 2`]);
  await shopStation('Draw');
  await expect(readyList.getByRole('listitem')).toHaveCount(4);
  await shots('06-removed-outline-back', [readyList]);
  await undo();
  model = await savedWhen((m) => m.parts.length === 2 && m.instances.length === 3, 'Undo: the part again');
  await route.getByRole('button', { name: 'Cut', exact: true }).click();
  await expect(names(toCut)).toHaveText(outlineNames.slice(2));
  await expect(alreadyCut.getByRole('listitem')).toHaveCount(2);
  checks.push('a cut part selected in the view → Remove instance: 1 part left, the picker lists 4 outlines and 1 part, Draw lists 4; one Undo → 3 outlines and 2 parts');

  // 8. Bend that part (one bend), remove it → its outline is back; cut again → a flat blank, no bends.
  await alreadyCut
    .getByRole('button', { name: `Open ${outlineNames[0]} on the laser`, exact: true })
    .click();
  await expect(laser).toBeVisible();
  await laser.getByRole('button', { name: 'Next: Bend', exact: true }).click();
  const brake = properties.getByRole('region', { name: 'Press brake' });
  await expect(brake.locator('.cad-shell-subject')).toHaveText(outlineNames[0]);
  const map = page.getByRole('figure', { name: 'Flat blank' });
  const edges = map.getByRole('button', { name: /^Gauge edge \d+$/ });
  await expect(edges.first()).toBeVisible();
  await edges.first().click();
  await fill(brake, 'Backgauge L (mm)', 15);
  await fill(brake, 'Bend angle (°)', 90);
  await expect(brake.getByRole('status', { name: 'Collision check' })).toContainText('Clear through the stroke');
  await brake.getByRole('button', { name: 'Bend', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.cad-viewport').cadShop().station?.stroking === false, null, {
    timeout: 8000,
  });
  model = await savedWhen((m) => m.parts[0].features[0].bends.length === 1, 'the bend');
  const bentId = model.instances.find((i) => i.partId === model.parts[0].id).id;
  await brake.getByRole('button', { name: 'Leave press brake', exact: true }).click();
  await modelCurrent();
  await clickBody(bentId);
  await removeInstance();
  model = await savedWhen((m) => m.parts.length === 1, 'the bent part goes with its blank');
  await route.getByRole('button', { name: 'Cut', exact: true }).click();
  await expect(names(toCut)).toHaveText([outlineNames[0], ...outlineNames.slice(2)]);
  await picker.getByRole('checkbox', { name: `Select ${outlineNames[0]}`, exact: true }).check();
  await picker.getByLabel('Thickness', { exact: true }).selectOption('1.2');
  await picker.getByRole('button', { name: 'Cut on the laser', exact: true }).click();
  await cutDone();
  model = await savedWhen((m) => m.parts.length === 2, 'cut again');
  const again = model.parts.find((p) => p.features[0].sketchId === ids[0]);
  assert.equal(again.features[0].bends.length, 0, 'cut again: a flat blank, no bends');
  await shots('07-cut-again-flat');
  checks.push('one part bent (1 bend) and removed → its outline back in the picker → cut again: a flat blank, no bends');

  // 9. On the laser: "… waiting to be cut" → Cut another outline → the picker.
  await expect(laser.locator('.cad-laser-waiting')).toHaveText('3 outlines waiting to be cut. Cut another outline');
  await laser.getByRole('button', { name: 'Cut another outline', exact: true }).click();
  await expect(picker).toBeVisible();
  await expect(names(toCut)).toHaveText(outlineNames.slice(2));
  await expect(selected).toHaveText('0 of 3 selected');
  await expect(picker.getByLabel('Thickness', { exact: true })).toHaveValue('1.2');
  await shots('08-cut-another-outline', [selected]);
  checks.push('the laser’s "3 outlines waiting to be cut." → Cut another outline → the picker, nothing selected, on the laser’s 1.2 mm');

  // 10. No page error, no error line.
  await noErrorLine('at the end');
  if (errors.length) throw new Error(errors.join('\n'));
  checks.push('no page error; no .cad-error');
  await writeFile(`${directory}/verification.json`, JSON.stringify({ status: 'passed', errors, checks, measured }, null, 2));
  console.log('Cut pick RC-1 / RC-2 verification passed:\n- ' + checks.join('\n- '));
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` });
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}
