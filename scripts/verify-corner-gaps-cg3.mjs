/* global localStorage, process, console, document, window, performance, URL */
// Corner gaps CG-3 (docs/sketch-studio-corner-gaps.md §5.1): the brake checks
// the sheet's thickness, driven the way the user would:
//  1. Open the §3.4 L corner (scripts/fixtures/corner-gaps-l-overlap.json: the
//     rear wall's end drawn 0.3 mm past the right wall's inside face, both
//     bends stored) through the app's Open button; its Sheet metal panel shows
//     the overlap card;
//  2. Shop → Bend: step 2 is "refused" with the thickness words; Remove it and
//     pick its line again by two points: the Collision card says "Bend 2: bend
//     1's flange ends 0.30 mm inside bend 2's flange (the sheet is 1.2 mm
//     thick). …", no remedy button, Bend is greyed out, the 3D view marks the
//     two pieces red;
//  3. Leave, Undo (step 2 back), the overlap row's Set at the Gap field's 0.2
//     in the Sheet metal panel: the row reads 0.20 mm, no overlap card;
//  4. Shop → Bend: both steps ok; Remove step 2, the same two points: clear,
//     Bend goes, the stroke commits, both steps ok;
//  5. timing: thicknessHit on each of the user's tray's eight step ends, and
//     sequenceChecks with and without it, in node (the app's own modules);
//  6. no page error.
// Screenshots at 1600 × 1000 and 1366 × 768.
//   CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-corner-gaps-cg3.mjs
// Screenshots: artifacts/sketch-cad/corner-gaps-cg3 (or CG3_SHOTS).
import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { cadSteps } from './sketch-cad-steps.mjs';
import { foldSheet, hitSequence, stepPose } from '../src/features/sketchstudio/cad/sheetMetal.js';
import { sequenceChecks, thicknessHit } from '../src/features/sketchstudio/cad/brakeStation.js';
import { machineOf } from '../src/features/sketchstudio/cad/shopCatalog.js';

const L_FILE = fileURLToPath(new URL('./fixtures/corner-gaps-l-overlap.json', import.meta.url));
const SAMPLE = fileURLToPath(new URL('./fixtures/corner-gaps-sample-bending.json', import.meta.url));
const directory = process.env.CG3_SHOTS || 'artifacts/sketch-cad/corner-gaps-cg3';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
// The Open button falls back to the file input without the File System Access
// picker (headless Chrome's picker refuses a call that follows the confirm).
await page.addInitScript(() => {
  delete window.showOpenFilePicker;
});
const errors = [],
  checks = [],
  measured = {};
page.on('pageerror', (e) => errors.push(e.message));
const { properties, current, shopStation, savedWhen, showTree } = cadSteps(page);
const MESSAGE =
  "Bend 2: bend 1's flange ends 0.30 mm inside bend 2's flange (the sheet is 1.2 mm thick). Give that gap 0 mm or more in the part's Sheet metal panel.";
const REAR = 'Bend 1 flange, end → bend 2 flange, inside face';
// The right wall's punch line as stored (L corner: x = 100, from y = −1 to 76).
const RIGHT = { a: [100, -1], b: [100, 76] };
const shot = async (name, { focus = null } = {}) => {
  const ready = async () => {
    if (focus) await focus.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(300);
  };
  await ready();
  await page.screenshot({ path: `${directory}/${name}-1600.png` });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.waitForTimeout(400);
  await ready();
  await page.screenshot({ path: `${directory}/${name}-1366.png` });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.waitForTimeout(300);
};
const fill = async (scope, label, value) => {
  const field = scope.getByLabel(label, { exact: true });
  await field.fill(String(value));
  await field.press('Enter');
};
const undo = () => page.locator('.cad-file-actions').getByRole('button', { name: 'Undo', exact: true }).click();
const bendsOf = (model) => model.parts[0].features[0].bends;
const station = () => page.evaluate(() => document.querySelector('.cad-viewport')?.cadShop?.().station ?? null);
const median = (xs) => [...xs].sort((p, q) => p - q)[Math.floor(xs.length / 2)];

try {
  // 5. The cost, in node on the app's own modules: the user's tray, every step's end (warm, median of 25).
  const tray = JSON.parse(await readFile(SAMPLE, 'utf8')).document.model;
  const feature = tray.parts[0].features[0],
    profile = tray.sketches[0].profile;
  const machine = machineOf(tray.fabrication.shop.machine);
  const fold = foldSheet(feature, profile, {});
  const per = hitSequence(fold).map((stroke, index) => {
    const pose = stepPose(fold, index);
    const later = Object.fromEntries(Object.entries(pose.angles).filter(([id]) => !stroke.bendIds.includes(id)));
    const options = { fold: pose.fold, bendIds: stroke.bendIds, angles: later, machine, die: stroke.die, profile };
    assert.equal(thicknessHit(options), null, `the tray's step ${index + 1} is clear at thickness`);
    const times = [];
    for (let i = 0; i < 25; i++) {
      const start = performance.now();
      thicknessHit(options);
      times.push(performance.now() - start);
    }
    return median(times);
  });
  measured.thicknessPerStepMs = per.map((t) => Number(t.toFixed(3)));
  assert(Math.max(...per) < 3, `under 3 ms a stroke: ${Math.max(...per)}`);
  const timed = (run) => {
    run();
    const times = [];
    for (let i = 0; i < 9; i++) {
      const start = performance.now();
      run();
      times.push(performance.now() - start);
    }
    return Number(median(times).toFixed(1));
  };
  measured.sequenceChecksMs = {
    withThickness: timed(() => sequenceChecks({ fold, machine, profile })),
    without: timed(() => sequenceChecks({ fold, machine, thickness: false })),
  };
  checks.push(
    `the user's tray: all eight step ends clear at thickness, thicknessHit ${measured.thicknessPerStepMs.join(' / ')} ms; sequenceChecks ${measured.sequenceChecksMs.withThickness} ms with it, ${measured.sequenceChecksMs.without} without`,
  );

  // 1. The L corner through Open.
  await page.goto(process.env.CAD_VERIFY_URL || 'http://localhost:5180/sketch');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '3D Model & workshop', exact: true }).click();
  await current();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await (await chooser).setFiles(L_FILE);
  await page.getByText('Unsaved sketch changes will be lost. Continue?').waitFor();
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await current();
  const openPart = async () => {
    await showTree();
    await page.locator('.cad-tree-item', { hasText: 'L corner' }).first().click();
    return properties.getByLabel('Sheet metal', { exact: true });
  };
  let form = await openPart();
  const overlapCard = form.getByRole('note', { name: 'Overlap' });
  await expect(overlapCard).toContainText("Bend 1's flange runs 0.30 mm into bend 2's flange.");
  await shot('01-sheet-metal-overlap', { focus: overlapCard });
  checks.push(
    "Open → the L corner: the Sheet metal panel's overlap card \"Bend 1's flange runs 0.30 mm into bend 2's flange.\"",
  );

  // 2. The brake: the stored step refused; the same hit pending, refused with the card.
  await shopStation('Bend');
  const brake = properties.getByRole('region', { name: 'Press brake' });
  await expect(brake).toBeVisible({ timeout: 20000 });
  const steps = brake.getByRole('list', { name: 'Sequence' }).getByRole('listitem');
  await expect(steps).toHaveCount(2);
  await expect(brake.locator('.cad-brake-sequence .cad-brake-check')).toHaveText(['ok', 'refused']);
  const stepTwo = brake.getByRole('listitem', { name: 'Step 2' });
  await expect(stepTwo.locator('.cad-shop-error')).toHaveText(MESSAGE);
  // No reorder or punch button on the row (sequenceTries leave it out), even after the settle.
  await page.waitForTimeout(800);
  assert.equal(await stepTwo.locator('.cad-brake-row-fix').count(), 0, 'no row remedy');
  await shot('02-stored-step-refused', { focus: stepTwo });
  checks.push(`brake: step 2 "refused", its row "${MESSAGE}", no row remedy`);
  await stepTwo.getByRole('button', { name: 'Remove', exact: true }).click();
  await savedWhen((m) => bendsOf(m).length === 1, 'step 2 removed');
  await expect(steps).toHaveCount(1);
  await brake.getByRole('group', { name: 'Punch line' }).getByRole('button', { name: 'Two points' }).click();
  for (const [label, value] of [
    ['A X (mm)', RIGHT.a[0]],
    ['A Y (mm)', RIGHT.a[1]],
    ['B X (mm)', RIGHT.b[0]],
    ['B Y (mm)', RIGHT.b[1]],
  ])
    await fill(brake, label, value);
  const collision = brake.getByRole('alert', { name: 'Collision' });
  await expect(collision).toHaveText(MESSAGE, { timeout: 15000 });
  // The advice settles: the words stay, no button comes.
  await page.waitForTimeout(800);
  await expect(collision).toHaveText(MESSAGE);
  const card = brake.locator('.cad-problem').filter({ has: page.getByRole('alert', { name: 'Collision' }) });
  await expect(card).toHaveCount(1);
  assert.equal(await card.getByRole('button').count(), 0, 'no remedy button on the card');
  const pedal = brake.getByRole('button', { name: 'Bend', exact: true });
  await expect(pedal).toBeDisabled();
  await expect.poll(async () => (await station())?.collision?.tool ?? null, { timeout: 10000 }).toBe('part');
  measured.marked = (await station()).collision.marked;
  measured.collisionAngle = (await station()).collision.angle;
  assert(measured.marked >= 8, `the two pieces marked red: ${measured.marked} triangles`);
  await shot('03-pending-refused', { focus: card });
  checks.push(
    `step 2 removed and its line picked again (two points): the Collision card "${MESSAGE}", no button, Bend greyed out; the view at ${measured.collisionAngle}° with ${measured.marked} red triangles (the two pieces' sheet faces)`,
  );

  // 3. Undo the removal, then set the overlapping row to 0.2 in the Sheet metal panel.
  await brake.getByRole('button', { name: 'Leave press brake', exact: true }).click();
  form = await openPart();
  await undo();
  await savedWhen((m) => bendsOf(m).length === 2, 'step 2 back');
  await expect(form.getByLabel('Gap (mm)', { exact: true })).toHaveValue('0.2');
  const rows = form.getByRole('list', { name: 'Flange gaps, nearest first' }).getByRole('listitem');
  if (
    !(await rows
      .first()
      .isVisible()
      .catch(() => false))
  )
    await form.getByText('The gaps, nearest first', { exact: true }).click();
  await form
    .getByRole('button', { name: `Set ${REAR}`, exact: true })
    .first()
    .click();
  await expect(form.getByRole('status')).toHaveText('Set 1 gap to 0.20 mm: 1 edge moved 0.50 mm. Undo takes it back.');
  await expect(form.getByRole('note', { name: 'Overlap' })).toHaveCount(0);
  await expect(rows.filter({ hasText: REAR }).first().locator('strong')).toHaveText(/^0\.20 mm( · |$)/);
  await expect(form.getByRole('status')).toHaveAttribute('data-brake', 'checked', { timeout: 10000 });
  assert.equal(await form.getByRole('note').filter({ hasText: 'at the brake' }).count(), 0, 'no brake note');
  await current();
  await shot('04-set-0.2', { focus: form.getByRole('status') });
  checks.push(
    'Undo → step 2 back; the overlap row\'s Set at 0.2: "Set 1 gap to 0.20 mm: 1 edge moved 0.50 mm.", the row 0.20 mm, no overlap card, no brake note',
  );

  // 4. The brake again: both ok; the same hit pending now clears and Bend goes.
  await shopStation('Bend');
  await expect(brake).toBeVisible({ timeout: 20000 });
  await expect(brake.locator('.cad-brake-sequence .cad-brake-check')).toHaveText(['ok', 'ok']);
  await brake.getByRole('listitem', { name: 'Step 2' }).getByRole('button', { name: 'Remove', exact: true }).click();
  await savedWhen((m) => bendsOf(m).length === 1, 'step 2 removed again');
  await brake.getByRole('group', { name: 'Punch line' }).getByRole('button', { name: 'Two points' }).click();
  for (const [label, value] of [
    ['A X (mm)', RIGHT.a[0]],
    ['A Y (mm)', RIGHT.a[1]],
    ['B X (mm)', RIGHT.b[0]],
    ['B Y (mm)', RIGHT.b[1]],
  ])
    await fill(brake, label, value);
  await expect(brake.getByRole('status', { name: 'Collision check' })).toContainText('Clear through the stroke', {
    timeout: 15000,
  });
  await expect(pedal).toBeEnabled();
  await shot('05-pending-clear', { focus: pedal });
  await pedal.click();
  const made = await savedWhen((m) => bendsOf(m).length === 2, 'the hit committed');
  await expect(brake.locator('.cad-brake-sequence .cad-brake-check')).toHaveText(['ok', 'ok'], { timeout: 20000 });
  measured.madeLine = { a: bendsOf(made)[1].a, b: bendsOf(made)[1].b };
  await shot('06-bent', { focus: brake.getByRole('list', { name: 'Sequence' }) });
  checks.push(
    `at 0.2 the same line clears ("Clear through the stroke"), Bend goes, the stroke commits (${JSON.stringify(measured.madeLine)}), both steps ok`,
  );

  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ status: 'passed', errors, checks, measured }, null, 2),
  );
  console.log('Corner gaps CG-3 verification passed:\n- ' + checks.join('\n- '));
  console.log(JSON.stringify(measured, null, 2));
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` });
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}
