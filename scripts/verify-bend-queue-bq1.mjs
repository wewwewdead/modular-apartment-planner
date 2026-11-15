/* global localStorage, process, console, document */
// Bend queue BQ-1 (docs/sketch-studio-outline-edit-sheet-nest.md §7.6),
// driven the way a user would on the Shop tab.
//
// The batch of SN-1's §4.7 step 9 (Sketch 1, Sketch 1 · 2 × 2 and a 150 × 150
// with a Ø20, cut in one go) → a job board row of the batch while the laser
// is on it moves the lead and keeps the job (§7.7) → Next: Bend → the press
// brake on the first part with "Parts to bend" under its head (three rows, the
// second "× 2", "0 of 3 bent", Previous part off) → another punch, one hit →
// "1 bend", "1 of 3 bent", Next part the accent → Next part: part 2 with the
// punch still in, bent → both copies folded in the view → row 3, bent →
// "Every part is bent." → part 1 painted: its Finished card with the strip
// above it, Next part from there → Leave press brake, Bend again: the default
// punch → the job sheet's Sheets to buy against the laser's Sheet use → the
// replay's cut scenes read as sentences (§7.7) → a fresh workspace: one part,
// no strip; a second single cut with the camera not moved lands clear of the
// first (§7.7). No page error, no .cad-error.
//   CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-bend-queue-bq1.mjs
// Screenshots: artifacts/sketch-cad/bend-queue-bq1 (or BQ1_SHOTS), each state
// at 1600 × 1000 and at 1366 × 768 (the strip, the Bend button and the hit
// list all reachable at the smaller size, nothing clipped sideways).
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { cadSteps } from './sketch-cad-steps.mjs';

const directory = process.env.BQ1_SHOTS || 'artifacts/sketch-cad/bend-queue-bq1';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [],
  checks = [],
  measured = {};
page.on('pageerror', (e) => errors.push(e.message));
const { properties, savedWhen, typeHud, toolbar, status, route, shopStation, shopMore } = cadSteps(page);
const footer = page.locator('.cad-status');
const bed = page.getByRole('figure', { name: 'Laser bed' });
const draw = properties.getByRole('region', { name: 'Draw' });
const cutPanel = properties.getByRole('region', { name: 'Cut from sheet' });
const laser = properties.getByRole('region', { name: 'Laser station' });
const brake = properties.getByRole('region', { name: 'Press brake' });
const strip = brake.getByRole('region', { name: 'Bend queue' });
const queueRows = strip.getByRole('list', { name: 'Parts to bend' }).getByRole('button');
const progress = strip.getByRole('status', { name: 'Bend progress' });
const previousPart = strip.getByRole('button', { name: 'Previous part', exact: true });
const nextPart = strip.getByRole('button', { name: 'Next part', exact: true });
const bendButton = brake.getByRole('button', { name: 'Bend', exact: true });
// The hit list: its heading (the list itself is empty before the first hit).
const hitList = brake.getByRole('heading', { name: 'Sequence, in the order made' });
const punch = brake.getByLabel('Punch', { exact: true });
const jobBoard = page.getByRole('region', { name: 'Job board' });
const readyList = draw.getByRole('list', { name: 'Outlines ready to cut' });
const modelCurrent = () => expect(footer).toContainText('Model current', { timeout: 60000 });
const bodies = () => page.evaluate(() => document.querySelector('.cad-viewport').cadViewMode().bodies);
const film = () => page.evaluate(() => document.querySelector('.cad-workspace').cadFilm());
const fill = async (scope, label, value) => {
  const field = scope.getByLabel(label, { exact: true });
  await field.fill(String(value));
  await field.press('Enter');
};
const noErrorLine = async (where) =>
  assert.equal(await page.locator('.cad-error').count(), 0, `no error line ${where}`);
// Nothing in the Properties pane sticks out sideways (as in verify-sheet-nest-sn1.mjs).
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
// `visible` brought to the middle of its pane must then be in the window, and
// `pinned` (the station's footer buttons) in the window as the pane stands.
const shots = async (name, { visible = [], pinned = [] } = {}) => {
  await page.mouse.move(5, 600);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${directory}/${name}-1600.png` });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.waitForTimeout(350);
  for (const locator of pinned) await expect(locator).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: `${directory}/${name}-1366.png` });
  for (const locator of visible) {
    await locator.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await expect(locator).toBeInViewport({ ratio: 1 });
  }
  for (const locator of pinned) await expect(locator).toBeInViewport({ ratio: 1 });
  assert.deepEqual(await clippedInPane(), [], `nothing clipped sideways at 1366 × 768 (${name})`);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.waitForTimeout(350);
};
// The pane scrolled back to its top (the strip under the head), as the station opens.
const paneTop = () => page.evaluate(() => document.querySelector('.cad-properties')?.scrollTo?.(0, 0));
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
const circle = async (x, y, radius) => {
  await tool('Circle');
  await typeAt('x', x, y);
  await typeAt('radius', radius);
  await page.keyboard.press('Escape');
};
const apart = (list) => {
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++) {
      const [a, b] = [list[i].bounds, list[j].bounds];
      const overlaps =
        a[0][0] < b[1][0] - 1e-3 && b[0][0] < a[1][0] - 1e-3 && a[0][1] < b[1][1] - 1e-3 && b[0][1] < a[1][1] - 1e-3;
      if (overlaps) return `${list[i].id} and ${list[j].id}`;
    }
  return '';
};
const bodiesOf = async (ids) => {
  await expect.poll(async () => (await bodies()).filter((b) => ids.includes(b.id) && b.bounds).length).toBe(ids.length);
  return (await bodies()).filter((b) => ids.includes(b.id));
};
const cutDone = () => expect(bed).toHaveAttribute('data-state', 'cut', { timeout: 30000 });
const fresh = async () => {
  await page.goto(process.env.CAD_VERIFY_URL || 'http://localhost:5180/sketch');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '3D Model & workshop', exact: true }).click();
  await modelCurrent();
};
// One hit on the part on the brake: the first gauge edge `length` mm long, L 20, 90°.
const map = page.getByRole('figure', { name: 'Flat blank' });
const edges = map.getByRole('button', { name: /^Gauge edge \d+$/ });
const hit = async (length) => {
  await expect(edges.first()).toBeVisible();
  let found = false;
  for (let i = 0; i < (await edges.count()) && !found; i++) {
    await edges.nth(i).click();
    found = (await brake.getByLabel('Gauge edge', { exact: true }).innerText()).endsWith(`· ${length} mm`);
  }
  assert(found, `a ${length} mm gauge edge`);
  await fill(brake, 'Backgauge L (mm)', 20);
  await fill(brake, 'Bend angle (°)', 90);
  await expect(brake.getByRole('status', { name: 'Collision check' })).toContainText('Clear through the stroke');
  await bendButton.click();
  await page.waitForFunction(
    () => document.querySelector('.cad-viewport').cadShop().station?.stroking === false,
    null,
    {
      timeout: 10000,
    },
  );
};
// The Punch select lives in Machine and tooling (a disclosure): opened first.
const choosePunch = async (key) => {
  const tooling = brake.locator('details.cad-shop-tooling');
  if (!(await tooling.evaluate((el) => el.open))) await tooling.locator('summary').click();
  await punch.selectOption(key);
  await expect(punch).toHaveValue(key);
};
const onBrake = (name) => expect(brake.locator('.cad-shell-subject')).toHaveText(name);
const rowTexts = () => queueRows.evaluateAll((nodes) => nodes.map((n) => n.textContent));

try {
  // ------------------------------------------------------------ the batch (SN-1 §4.7 step 9)
  await fresh();
  await shopStation('Draw');
  await draw.getByRole('button', { name: /^Draw the outline/ }).click();
  await toolbar.waitFor();
  await rectangle(0, 0, 300, 200);
  await rectangle(360, 0, 200, 100);
  await expect(status).toContainText('2 items · closed profile');
  await tool('Finish sketch');
  await expect(readyList.getByRole('listitem').locator('strong')).toHaveText(['Sketch 1', 'Sketch 1 · 2']);
  await draw.getByRole('button', { name: /^Draw the outline/ }).click();
  await toolbar.waitFor();
  await rectangle(0, 0, 150, 150);
  await circle(75, 75, 10);
  await tool('Finish sketch');
  await expect(readyList.getByRole('listitem')).toHaveCount(3);
  const third = await readyList.getByRole('listitem').nth(2).locator('strong').innerText();
  await draw.getByRole('button', { name: 'Cut all outlines', exact: true }).click();
  await fill(cutPanel, 'Quantity of Sketch 1 · 2', 2);
  await expect(cutPanel.getByLabel('Batch', { exact: true })).toHaveText('4 blanks from 3 outlines');
  await cutPanel.getByRole('button', { name: 'Cut on the laser', exact: true }).click();
  await cutDone();
  let model = await savedWhen((m) => m.instances.length === 4, 'the batch');
  assert.deepEqual(
    model.parts.map((p) => p.name),
    ['Sketch 1', 'Sketch 1 · 2', third],
  );
  await modelCurrent();
  const sheetUse = await laser.getByLabel('Sheet use', { exact: true }).innerText();
  checks.push(`the batch: 3 parts (Sketch 1, Sketch 1 · 2 × 2, ${third}), 4 instances, cut on one sheet (${sheetUse})`);

  // 10b. A job board row of the batch while the laser is on it: its part leads, the job stays.
  const thisCut = laser.getByRole('list', { name: 'This cut' });
  await expect(thisCut.getByRole('button').first()).toHaveAttribute('aria-current', 'true');
  await jobBoard.locator('.cad-job-row').filter({ hasText: 'Sketch 1 · 2' }).nth(1).click();
  await expect(thisCut.getByRole('button')).toHaveCount(3);
  await expect(thisCut.getByRole('button').nth(1)).toHaveAttribute('aria-current', 'true');
  await expect(laser.locator('.cad-shell-subject')).toHaveText('Sketch 1 · 2 + 2 more');
  await expect(laser.getByLabel('On this sheet', { exact: true })).toHaveText('4 blanks');
  await expect(bed).toHaveAttribute('data-state', 'cut');
  await shots('01-job-board-lead', { visible: [thisCut] });
  checks.push(
    'laser open on the batch: a job board row of Sketch 1 · 2 (its second copy) makes it the lead — This cut keeps its 3 rows, "Sketch 1 · 2 + 2 more", 4 blanks on the sheet, the cut stays done',
  );
  await thisCut.getByRole('button').first().click();
  await expect(laser.locator('.cad-shell-subject')).toHaveText('Sketch 1 + 2 more');

  // 1. Next: Bend → the brake on the first part, the queue under the head.
  await laser.getByRole('button', { name: 'Next: Bend', exact: true }).click();
  await onBrake('Sketch 1');
  await expect(strip.getByRole('heading', { name: 'Parts to bend' })).toBeVisible();
  assert.deepEqual(await rowTexts(), [
    'Sketch 1flat · no bends yet',
    'Sketch 1 · 2 × 2flat · no bends yet',
    `${third}flat · no bends yet`,
  ]);
  await expect(queueRows.first()).toHaveAttribute('aria-current', 'true');
  await expect(progress).toHaveText('0 of 3 bent');
  await expect(previousPart).toBeDisabled();
  await expect(nextPart).toBeEnabled();
  await expect(nextPart).not.toHaveClass(/is-ready/);
  // The strip sits under the head, before the station's own steps.
  assert(
    await brake.evaluate((el) => {
      const s = el.querySelector('.cad-bend-queue');
      return s && s.previousElementSibling?.classList.contains('cad-shell-head');
    }),
    'the strip sits right under the shell head',
  );
  await paneTop();
  await shots('02-queue-first-part', { visible: [strip, hitList], pinned: [bendButton] });
  checks.push(
    'Next: Bend → the press brake on Sketch 1; "Parts to bend" right under the head: 3 rows (the second "Sketch 1 · 2 × 2"), "0 of 3 bent", Previous part off',
  );

  // 2. Another punch; the 200 mm edge, L 20, the pedal → "1 bend", "1 of 3 bent", Next is the accent.
  const defaultPunch = await punch.inputValue();
  await choosePunch('gooseneck-88');
  await expect(punch).toHaveValue('gooseneck-88');
  await hit(200);
  model = await savedWhen((m) => m.parts[0].features[0].bends.length === 1, 'the first part bent');
  assert.equal(model.parts[0].features[0].bends[0].punch, 'gooseneck-88', 'made with the chosen punch');
  await expect(queueRows.first()).toHaveText('Sketch 1' + '1 bend');
  await expect(progress).toHaveText('1 of 3 bent');
  await expect(nextPart).toHaveClass(/is-ready/);
  await paneTop();
  await shots('03-first-bent', { visible: [strip, hitList], pinned: [bendButton] });
  checks.push(
    `punch ${defaultPunch} → gooseneck-88, one hit on the 200 mm edge → row 1 "1 bend", "1 of 3 bent", Next part the accent`,
  );

  // 3. Next part → part 2 with the punch still in; bent → both copies folded.
  await nextPart.click();
  await onBrake('Sketch 1 · 2');
  await expect(punch).toHaveValue('gooseneck-88');
  await expect(brake.getByLabel('Gauge edge', { exact: true })).toHaveText(
    'Click a straight outline edge on the flat blank',
  );
  await expect(queueRows.nth(1)).toHaveAttribute('aria-current', 'true');
  await expect(previousPart).toBeEnabled();
  await hit(100);
  model = await savedWhen((m) => m.parts[1].features[0].bends.length === 1, 'the second part bent');
  await expect(queueRows.nth(1)).toHaveText('Sketch 1 · 2 × 2' + '1 bend');
  checks.push(
    'Next part → Sketch 1 · 2 on the brake, the gooseneck punch still in, the gauge edge to pick again; bent on its 100 mm edge',
  );

  // 4. Row 3 → part 3; bent → "Every part is bent."
  await queueRows.nth(2).click();
  await onBrake(third);
  await expect(punch).toHaveValue('gooseneck-88');
  await expect(nextPart).toBeDisabled();
  await hit(150);
  await savedWhen((m) => m.parts[2].features[0].bends.length === 1, 'the third part bent');
  await expect(progress).toHaveText('Every part is bent.');
  await paneTop();
  await shots('04-every-part-bent', { visible: [strip, hitList], pinned: [bendButton] });
  checks.push(`a click on row 3 → ${third} on the brake (punch still in); bent → "Every part is bent."`);

  // 3b. Both copies of part 2 are folded in the view: their boxes stand the flange's height.
  await brake.getByRole('button', { name: 'Leave press brake', exact: true }).click();
  await modelCurrent();
  model = await savedWhen((m) => m.parts.every((p) => p.features[0].bends.length === 1), 'every part bent');
  const copies = model.instances.filter((i) => i.partId === model.parts[1].id).map((i) => i.id);
  assert.equal(copies.length, 2, 'two copies of Sketch 1 · 2');
  const heights = (await bodiesOf(copies)).map((b) => b.bounds[1][2] - b.bounds[0][2]);
  measured.copyHeights = heights.map((h) => Number(h.toFixed(2)));
  for (const h of heights) assert(h > 15 && h < 25, `a copy stands the 20 mm flange's height (${h})`);
  checks.push(
    `both copies of Sketch 1 · 2 folded in the view: their boxes stand ${measured.copyHeights.join(' and ')} mm`,
  );

  // 5. Part 1 painted; Bend → row 1 → its Finished card with the strip above it; Next part from there.
  await jobBoard.locator('.cad-job-row').filter({ hasText: 'Sketch 1' }).first().click();
  await shopStation('Paint');
  const paint = properties.getByRole('region', { name: 'Paint booth' });
  await paint.getByRole('button', { name: 'RAL 5010 Gentian blue', exact: true }).click();
  await paint.getByRole('button', { name: 'Paint', exact: true }).click();
  model = await savedWhen((m) => m.finishes?.length === 1, 'part 1 painted');
  await paint.getByRole('button', { name: 'Leave paint booth', exact: true }).click();
  await shopStation('Bend');
  await queueRows.first().click();
  await onBrake('Sketch 1');
  await expect(brake.getByRole('status', { name: 'Finished here' })).toBeVisible();
  await expect(queueRows.first()).toHaveText('Sketch 1' + '1 bend · painted');
  await expect(queueRows.first()).toHaveAttribute('aria-current', 'true');
  await paneTop();
  await shots('05-finished-card', {
    visible: [strip, brake.getByRole('status', { name: 'Finished here' })],
    pinned: [brake.getByRole('button', { name: 'Watch the bends', exact: true })],
  });
  await nextPart.click();
  await onBrake('Sketch 1 · 2');
  await expect(bendButton).toBeVisible();
  checks.push(
    'Sketch 1 painted → Bend → row 1: its Finished card ("Bending is done…") with the strip above it, the row "1 bend · painted"; Next part → Sketch 1 · 2 on the brake',
  );

  // 6. The carry ends with the station: a punch chosen, Leave press brake, Bend again → the default punch.
  await choosePunch('gooseneck-88');
  await brake.getByRole('button', { name: 'Leave press brake', exact: true }).click();
  await shopStation('Bend');
  await onBrake('Sketch 1 · 2');
  await expect(punch).toHaveValue(defaultPunch);
  await brake.getByRole('button', { name: 'Leave press brake', exact: true }).click();
  checks.push(`gooseneck chosen, Leave press brake, Bend again → the default punch (${defaultPunch}): the carry ended`);

  // 8. Job sheet: Sheets to buy reads the laser station's Sheet use.
  await shopMore('Job sheet');
  const jobSheet = properties.getByRole('region', { name: 'Job sheet' });
  const toBuy = jobSheet.getByRole('region', { name: 'Sheets to buy' });
  await expect(toBuy.getByRole('listitem')).toHaveCount(1);
  await expect(toBuy.getByRole('listitem').first()).toContainText('t 1.5 SPCC · 1219 × 2438 mm · 4 blanks');
  await expect(toBuy.getByLabel('Sheet use', { exact: true })).toHaveText(sheetUse);
  await toBuy.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await shots('06-sheets-to-buy', { visible: [toBuy] });
  checks.push(
    `job sheet: Sheets to buy "t 1.5 SPCC · 1219 × 2438 mm · 4 blanks", "${sheetUse}" = the laser's Sheet use`,
  );

  // 10c. The replay's cut scenes read as sentences.
  await page.mouse.move(5, 500);
  await page.keyboard.press('Control+a');
  await shopMore('Group');
  await savedWhen((m) => m.groups?.length === 1 && m.instances.every((i) => i.groupId), 'the group');
  await route.getByRole('button', { name: 'Replay', exact: true }).click();
  const replayPanel = properties.getByRole('region', { name: 'Replay' });
  await expect(replayPanel).toBeVisible();
  await replayPanel.getByRole('button', { name: 'Pause', exact: true }).click();
  const titles = (await film()).scenes.filter((s) => s.station === 'cut').map((s) => s.title);
  assert.deepEqual(titles, ['Cut the Sketch 1 blank', 'Cut 2 blanks of Sketch 1 · 2', `Cut the ${third} blank`]);
  await route.getByRole('button', { name: 'End replay', exact: true }).click();
  await expect(replayPanel).toHaveCount(0);
  checks.push(`the replay's cut scenes: ${titles.map((t) => `"${t}"`).join(', ')}`);
  await noErrorLine('after the batch');

  // ------------------------------------------------------------ one part, then a second single cut
  await fresh();
  await shopStation('Draw');
  await draw.getByRole('button', { name: /^Rectangle/ }).click();
  await fill(draw, 'Width W (mm)', 300);
  await fill(draw, 'Height H (mm)', 200);
  await draw.getByRole('button', { name: 'Cut this rectangle', exact: true }).click();
  await cutPanel.getByRole('button', { name: 'Cut on the laser', exact: true }).click();
  await cutDone();
  // 7. One sheet-metal part: no strip.
  await laser.getByRole('button', { name: 'Next: Bend', exact: true }).click();
  await expect(bendButton).toBeVisible();
  await expect(strip).toHaveCount(0);
  await shots('07-one-part-no-strip', { pinned: [bendButton] });
  checks.push('one sheet-metal part in the model → the press brake shows no strip');
  await brake.getByRole('button', { name: 'Leave press brake', exact: true }).click();

  // 10a. A second single cut, the camera not moved: clear of the first in the view.
  await shopStation('Draw');
  await draw.getByRole('button', { name: /^Rectangle/ }).click();
  await fill(draw, 'Width W (mm)', 500);
  await fill(draw, 'Height H (mm)', 400);
  await draw.getByRole('button', { name: 'Cut this rectangle', exact: true }).click();
  await cutPanel.getByRole('button', { name: 'Cut on the laser', exact: true }).click();
  await cutDone();
  model = await savedWhen((m) => m.instances.length === 2, 'the second single cut');
  await modelCurrent();
  const two = await bodiesOf(model.instances.map((i) => i.id));
  const overlap = apart(two);
  assert.equal(overlap, '', `the second single cut lands clear of the first (${overlap})`);
  measured.singleCuts = two.map((b) => b.bounds.map((p) => p.slice(0, 2).map((v) => Number(v.toFixed(1)))));
  await laser.getByRole('button', { name: 'Leave laser', exact: true }).click();
  await shots('08-two-single-cuts');
  checks.push(
    `two single cuts in a row, the camera not moved → clear of each other in the view (${JSON.stringify(measured.singleCuts)})`,
  );

  // 9. No page error, no error line.
  await noErrorLine('at the end');
  if (errors.length) throw new Error(errors.join('\n'));
  checks.push('no page error; no .cad-error (checked along the way)');
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ status: 'passed', errors, checks, measured }, null, 2),
  );
  console.log('Bend queue BQ-1 verification passed:\n- ' + checks.join('\n- '));
  console.log(JSON.stringify(measured, null, 2));
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` });
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}
