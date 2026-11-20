/* global localStorage, process, console, document, window, performance, MutationObserver, URL */
// Corner gaps CG-2 (docs/sketch-studio-corner-gaps.md §4.4): set a gap, on the
// user's own tray, driven the way the user would:
//  1. Open the user's file through the app's Open button (a copy of
//     sample_bending.json under scripts/fixtures; the original is never
//     touched); the part's Sheet metal panel reads "least 0.72 mm";
//  2. "Set all" at the Gap field's 0.2: the line reads "Flange gaps: least
//     0.20 mm · 12 within 3 mm", the status line "Set 12 gaps to 0.20 mm: 16
//     edges moved, the most 1.02 mm. Undo takes it back." and the note "Bends 3
//     and 4: …"; the saved model holds the moved outline (its top-right corner
//     as §1.4), the sketcher's entities in step with it (ids kept), the bends
//     as stored; the solids rebuild ("Model current" again, no error line);
//  3. one wall row (the rear wall's end against the right wall) set to "Runs
//     past (covers)": it reads "runs past its end: flush with its outside
//     face", bend 5's line clipped to its own tabs in the saved model; then
//     back to "Stops short": 0.20 mm again; two Undos back to step 2;
//  4. Shop → Bend: the press brake's card reads "least 0.20 mm", points to the
//     Sheet metal panel (no Set there), all eight steps made and "ok"; then
//     Set all at 0: the note says steps 7 and 8 no longer go at the brake (the
//     lips hit the punch), the brake refuses them; Undo back to 0.2, all ok;
//  5. Leave the brake, Undo: the outline the file had, byte for byte, "least
//     0.72 mm" again;
//  6. timing: setGaps on the user's part in node (the app's own module); in
//     the page, from the click on "Set all" to the status line and to the
//     solids rebuilt;
//  7. no page error.
// Screenshots at 1600 × 1000 and 1366 × 768.
//   CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-corner-gaps-cg2.mjs
// Screenshots: artifacts/sketch-cad/corner-gaps-cg2 (or CG2_SHOTS).
import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { cadSteps } from './sketch-cad-steps.mjs';
import { setGaps } from '../src/features/sketchstudio/cad/cornerGaps.js';
import { entitiesToProfile } from '../src/features/sketchstudio/cad/sketchProfile.js';

const SAMPLE = fileURLToPath(new URL('./fixtures/corner-gaps-sample-bending.json', import.meta.url));
const directory = process.env.CG2_SHOTS || 'artifacts/sketch-cad/corner-gaps-cg2';
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
const { properties, current, shopStation, saved, savedWhen, showTree } = cadSteps(page);
const summaryOf = (scope) => scope.getByLabel('Flange gaps summary', { exact: true });
const rowsOf = (scope) => scope.getByRole('list', { name: 'Flange gaps, nearest first' }).getByRole('listitem');
const BEFORE = 'Flange gaps: least 0.72 mm · 12 within 3 mm';
// Since CG-4 (§6) the line counts the rows that may touch on the bench with the shop's usual figures.
const AFTER = 'Flange gaps: least 0.20 mm · 12 within 3 mm · 12 may touch on the bench';
const SET_ALL = 'Set 12 gaps to 0.20 mm: 16 edges moved, the most 1.02 mm. Undo takes it back.';
const REAR = 'Bend 8 flange, end → bend 5 flange, inside face';
// Both sizes; `focus` scrolled into the panel's view at each.
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
const noErrorLine = async (where) =>
  assert.equal(await page.locator('.cad-error').count(), 0, `no error line ${where}`);
const undo = () => page.locator('.cad-file-actions').getByRole('button', { name: 'Undo', exact: true }).click();
const sketchOf = (model) => model.sketches[0];
const featureOf = (model) => model.parts[0].features[0];

try {
  // 6a. setGaps on the user's part, in node on the app's own module (warm, median of 25).
  const sample = JSON.parse(await readFile(SAMPLE, 'utf8')).document.model;
  const original = sketchOf(sample);
  const feature = featureOf(sample);
  for (let i = 0; i < 5; i++) setGaps({ feature, profile: original.profile, target: 0.2 });
  const times = [];
  for (let i = 0; i < 25; i++) {
    const start = performance.now();
    setGaps({ feature, profile: original.profile, target: 0.2 });
    times.push(performance.now() - start);
  }
  times.sort((p, q) => p - q);
  measured.setGapsMs = { median: Number(times[12].toFixed(2)), worst: Number(times.at(-1).toFixed(2)) };
  const result = setGaps({ feature, profile: original.profile, target: 0.2 });
  measured.passes = result.passes;
  measured.residual = Number(result.residual.toFixed(5));
  assert(measured.setGapsMs.median < 100, `setGaps under 100 ms: ${measured.setGapsMs.median}`);
  checks.push(
    `setGaps on the user's part: ${result.passes} pass, residual ${measured.residual} mm, median ${measured.setGapsMs.median} ms (worst ${measured.setGapsMs.worst})`,
  );

  // 1. The user's file through Open.
  await page.goto(process.env.CAD_VERIFY_URL || 'http://localhost:5180/sketch');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '3D Model & workshop', exact: true }).click();
  await current();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await (await chooser).setFiles(SAMPLE);
  await page.getByText('Unsaved sketch changes will be lost. Continue?').waitFor();
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await current();
  const openPart = async () => {
    await showTree();
    await page.locator('.cad-tree-item', { hasText: 'Sheet-metal part' }).first().click();
    return properties.getByLabel('Sheet metal', { exact: true });
  };
  let form = await openPart();
  await expect(summaryOf(form)).toHaveText(BEFORE);
  await expect(form.getByLabel('Gap (mm)', { exact: true })).toHaveValue('0.2');
  measured.sizeBefore = await properties.getByLabel('Part size', { exact: true }).textContent();
  await shot('01-sheet-metal-before', { focus: summaryOf(form) });
  checks.push(`Open → the user file: "${BEFORE}", Gap (mm) 0.2`);

  // 2. Set all at 0.2, timed in the page: the click, the status line, the solids current again.
  await page.evaluate(() => {
    const at = (window.__cg2 = { click: null, status: null, checked: null, rebuilding: null, current: null });
    const dot = document.querySelector('.cad-status-dot');
    document.addEventListener(
      'click',
      (e) => e.target.closest?.('button')?.textContent === 'Set all' && (at.click = performance.now()),
      true,
    );
    new MutationObserver(() => {
      if (at.click == null) return;
      if (
        at.status == null &&
        document.querySelector('.cad-sheet-metal [role="status"]')?.textContent.startsWith('Set 12 gaps')
      )
        at.status = performance.now();
      // The brake's steps checked off the click (§4.5, after the first audit).
      if (at.checked == null && document.querySelector('.cad-sheet-metal [role="status"][data-brake="checked"]'))
        at.checked = performance.now();
      const ready = dot.classList.contains('is-ready');
      if (!ready && at.rebuilding == null) at.rebuilding = performance.now();
      if (ready && at.rebuilding != null && at.current == null) at.current = performance.now();
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
  });
  await form.getByRole('button', { name: 'Set all', exact: true }).click();
  await expect(form.getByRole('status')).toHaveText(SET_ALL);
  await current();
  await expect.poll(() => page.evaluate(() => window.__cg2.current != null), { timeout: 60000 }).toBe(true);
  await expect(form.getByRole('status')).toHaveAttribute('data-brake', 'checked');
  const stamps = await page.evaluate(() => window.__cg2);
  measured.clickToStatusMs = Number((stamps.status - stamps.click).toFixed(1));
  measured.clickToBrakeCheckedMs = Number((stamps.checked - stamps.click).toFixed(1));
  // The controls stand above the rows.
  assert(
    await form
      .getByRole('button', { name: 'Set all', exact: true })
      .evaluate(
        (b, list) => Boolean(b.compareDocumentPosition(list) & 4),
        await form.getByRole('list', { name: 'Flange gaps, nearest first' }).elementHandle(),
      ),
    'Set all above the rows',
  );
  measured.clickToRebuiltMs = Number((stamps.current - stamps.click).toFixed(1));
  await expect(summaryOf(form)).toHaveText(AFTER);
  await expect(form.getByRole('note').filter({ hasText: 'Bends 3 and 4' })).toHaveText(
    'Bends 3 and 4: the outline now crosses the bend zone at an angle.',
  );
  for (const row of await rowsOf(form).all()) assert.match(await row.locator('strong').textContent(), /^0\.20 mm/);
  await noErrorLine('after Set all');
  measured.sizeAfter = await properties.getByLabel('Part size', { exact: true }).textContent();
  const afterSet = await savedWhen(
    (m) => JSON.stringify(sketchOf(m).profile) !== JSON.stringify(original.profile),
    'the moved outline',
  );
  const sketch = sketchOf(afterSet);
  assert.equal(
    JSON.stringify(entitiesToProfile(sketch.entities).profile),
    JSON.stringify(sketch.profile),
    'entities in step',
  );
  assert.deepEqual(
    sketch.entities.map((e) => e.id),
    original.entities.map((e) => e.id),
    'the same entity ids',
  );
  // Bends 1 – 6 as stored; 7 and 8 keep their punch's 367.70 mm (their trims moved).
  assert.deepEqual(featureOf(afterSet).bends.slice(0, 6), feature.bends.slice(0, 6), 'bends 1 – 6 as stored');
  measured.heldTrims = featureOf(afterSet)
    .bends.slice(6)
    .map((b) => b.punchTrim);
  for (const [i, b] of featureOf(afterSet).bends.slice(6).entries())
    assert.deepEqual(
      { ...b, punchTrim: null },
      { ...feature.bends[6 + i], punchTrim: null },
      `bend ${7 + i}: only its trim`,
    );
  const corner = [sketch.profile.start, ...sketch.profile.segments.map((s) => s.end)];
  for (const p of [
    [286.5042, 103.3104],
    [287.0007, 83.0481],
    [321.8347, 67.9947],
  ])
    assert(
      corner.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.001),
      `corner ${p} as §1.4`,
    );
  await shot('02-set-all', { focus: form.getByRole('status') });
  checks.push(
    `Set all → "${AFTER}", every row 0.20, "${SET_ALL}"; saved: entities in step (ids kept), bends 1 – 6 as stored and 7 – 8 their punch held (trims ${measured.heldTrims.join(' / ')}), §1.4 corner; status in ${measured.clickToStatusMs} ms, the brake's steps checked in ${measured.clickToBrakeCheckedMs} ms, solids current in ${measured.clickToRebuiltMs} ms (part size ${measured.sizeBefore} → ${measured.sizeAfter})`,
  );

  // 3. One wall row run past its neighbour, and back.
  const way = form.getByRole('combobox', { name: `Way for ${REAR}`, exact: true });
  await way.selectOption('cover');
  await form.getByRole('button', { name: `Set ${REAR}`, exact: true }).click();
  await expect(form.getByRole('status')).toHaveText(
    'Set 1 covering end flush: 1 edge moved 1.40 mm. Undo takes it back.',
  );
  const rear = rowsOf(form).filter({ hasText: REAR });
  await expect(rear.locator('strong')).toHaveText(/^runs past its end: flush with its outside face( · |$)/);
  await expect(way).toHaveValue('cover');
  const covering = await savedWhen((m) => featureOf(m).bends[4].b[1] < 100, 'bend 5 clipped');
  measured.clippedBend5 = { a: featureOf(covering).bends[4].a, b: featureOf(covering).bends[4].b };
  await noErrorLine('after covering');
  await shot('03-covering', { focus: rear });
  await way.selectOption('short');
  await form.getByRole('button', { name: `Set ${REAR}`, exact: true }).click();
  await expect(form.getByRole('status')).toHaveText('Set 1 gap to 0.20 mm: 1 edge moved 1.40 mm. Undo takes it back.');
  await expect(rear.locator('strong')).toHaveText(/^0\.20 mm/);
  await undo();
  await undo();
  await expect(summaryOf(form)).toHaveText(AFTER);
  await savedWhen((m) => JSON.stringify(sketchOf(m)) === JSON.stringify(sketch), 'back to Set all');
  checks.push(
    `rear wall row "Runs past (covers)" → flush, bend 5 clipped to ${JSON.stringify(measured.clippedBend5)}; "Stops short" → 0.20 again; two Undos → the Set all outline`,
  );

  // 4. The press brake.
  await shopStation('Bend');
  const brake = properties.getByRole('region', { name: 'Press brake' });
  await expect(brake).toBeVisible({ timeout: 20000 });
  await expect(summaryOf(brake)).toHaveText(AFTER);
  await expect(brake.getByText("To change a gap, set it in the part's Sheet metal panel.")).toBeVisible();
  assert.equal(await brake.getByRole('button', { name: 'Set all', exact: true }).count(), 0, 'no Set at the brake');
  const steps = brake.getByRole('list', { name: 'Sequence' }).getByRole('listitem');
  await expect(steps).toHaveCount(8);
  await expect(brake.locator('.cad-brake-sequence .cad-brake-check')).toHaveText(Array(8).fill('ok'));
  assert.equal(await brake.locator('.cad-brake-check.is-failing').count(), 0, 'no step refused');
  await shot('04-brake', { focus: summaryOf(brake) });
  checks.push(`brake: "${AFTER}", the pointer to the Sheet metal panel, 8 steps all ok`);

  // 4b. Set all at 0: the gaps close, the brake then refuses steps 7 and 8 (the front and rear lips
  // against the punch, §4.5 after the first audit), the note says so; Undo back to 0.2.
  await brake.getByRole('button', { name: 'Leave press brake', exact: true }).click();
  form = await openPart();
  const gapField = form.getByLabel('Gap (mm)', { exact: true });
  await gapField.fill('0');
  await gapField.press('Enter');
  await form.getByRole('button', { name: 'Set all', exact: true }).click();
  await expect(form.getByRole('status')).toHaveText(
    'Set 12 gaps to 0.00 mm: 16 edges moved, the most 0.20 mm. Undo takes it back.',
  );
  await expect(form.getByRole('status')).toHaveAttribute('data-brake', 'checked', { timeout: 10000 });
  const zeroNote = form.getByRole('region', { name: 'Flange gaps' }).getByRole('note');
  await expect(zeroNote).toContainText('Step 7 no longer goes at the brake: Bend 7: the part hits the punch at 32.5°.');
  await expect(zeroNote).toContainText('Step 8 no longer goes at the brake: Bend 8: the part hits the punch at 32.5°.');
  measured.zeroNote = await zeroNote.textContent();
  await expect(summaryOf(form)).toHaveText('Flange gaps: least 0.00 mm · 12 within 3 mm · 12 may touch on the bench');
  await shot('04b-set-all-zero', { focus: form.getByRole('status') });
  await shopStation('Bend');
  await expect(summaryOf(brake)).toHaveText('Flange gaps: least 0.00 mm · 12 within 3 mm · 12 may touch on the bench');
  await expect(brake.locator('.cad-brake-sequence .cad-brake-check')).toHaveText([
    ...Array(6).fill('ok'),
    'refused',
    'refused',
  ]);
  await shot('04c-brake-zero', { focus: brake.locator('.cad-brake-check.is-failing').first() });
  await brake.getByRole('button', { name: 'Leave press brake', exact: true }).click();
  form = await openPart();
  await undo();
  await expect(summaryOf(form)).toHaveText(AFTER);
  await savedWhen((m) => JSON.stringify(sketchOf(m)) === JSON.stringify(sketch), 'back to the 0.2 outline');
  await shopStation('Bend');
  await expect(brake.locator('.cad-brake-sequence .cad-brake-check')).toHaveText(Array(8).fill('ok'));
  checks.push(
    'Set all at 0 → "least 0.00 mm", the note: steps 7 and 8 no longer go at the brake (the lips hit the punch at 32.5°), the brake refuses them; Undo → 0.2, all eight ok again',
  );

  // 5. Undo from the part: the file's outline, byte for byte.
  await brake.getByRole('button', { name: 'Leave press brake', exact: true }).click();
  form = await openPart();
  await undo();
  await expect(summaryOf(form)).toHaveText(BEFORE);
  const undone = await savedWhen(
    (m) => JSON.stringify(sketchOf(m).profile) === JSON.stringify(original.profile),
    'the original outline',
  );
  assert.equal(
    JSON.stringify(sketchOf(undone).entities),
    JSON.stringify(original.entities),
    'entities as the file had them',
  );
  assert.equal(await form.getByRole('status').count(), 0, 'the status line goes with the Undo');
  await noErrorLine('after Undo');
  await shot('05-undone', { focus: summaryOf(form) });
  checks.push(`Undo → "${BEFORE}", the profile and entities byte for byte as the file had them`);

  assert((await saved()) != null, 'the recovery copy is written');
  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ status: 'passed', errors, checks, measured }, null, 2),
  );
  console.log('Corner gaps CG-2 verification passed:\n- ' + checks.join('\n- '));
  console.log(JSON.stringify(measured, null, 2));
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` });
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}
