/* global localStorage, process, console, document, window, performance, URL */
// Corner gaps CG-1 (docs/sketch-studio-corner-gaps.md §3.4): see the gaps, on
// the user's own tray, driven the way the user would:
//  1. Open the user's file through the app's Open button (a copy of
//     sample_bending.json under scripts/fixtures; the original is never
//     touched);
//  2. the part's Sheet metal panel reads "Flange gaps: least 0.72 mm · 12
//     within 3 mm", the rows open (a gap under 1 mm), the first a wall row
//     "0.72 mm · passes 1.22 mm beside it"; hovering it marks its edge on the
//     panel's flat blank, in the accent;
//  3. Shop → Bend: the press brake's panel reads the same line under its
//     "Folded …" line (the part as made: eight hits); hovering a wall row puts
//     the marker on the part in the 3D view (cadShop().station.gap: its two
//     points, 0.72 mm along the wall's normal and 1.22 mm beside) and its edge
//     on the flat-blank map; a mitre row marks both its edges; the pointer
//     leaving clears both;
//  4. timing: flangeGaps on the user's part (the app's own module, in node);
//     from the pointer on a row to the marker reported;
//  5. no page error.
// Screenshots at 1600 × 1000 and 1366 × 768.
//   CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-corner-gaps-cg1.mjs
// Screenshots: artifacts/sketch-cad/corner-gaps-cg1 (or CG1_SHOTS).
import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { cadSteps } from './sketch-cad-steps.mjs';
import { foldSheet } from '../src/features/sketchstudio/cad/sheetMetal.js';
import { flangeGaps } from '../src/features/sketchstudio/cad/cornerGaps.js';

const SAMPLE = fileURLToPath(new URL('./fixtures/corner-gaps-sample-bending.json', import.meta.url));
const directory = process.env.CG1_SHOTS || 'artifacts/sketch-cad/corner-gaps-cg1';
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
const { properties, current, shopStation } = cadSteps(page);
const shop = () => page.evaluate(() => document.querySelector('.cad-viewport').cadShop());
const summaryOf = (scope) => scope.getByLabel('Flange gaps summary', { exact: true });
const rowsOf = (scope) => scope.getByRole('list', { name: 'Flange gaps, nearest first' }).getByRole('listitem');
const LINE = 'Flange gaps: least 0.72 mm · 12 within 3 mm';
// Both sizes; `focus` scrolled into the panel's view at each, `hover` hovered again after the resize.
const shot = async (name, { focus = null, hover = null } = {}) => {
  const ready = async () => {
    if (focus) await focus.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    if (hover) await hover.hover();
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
const away = async () => {
  await page.mouse.move(5, 990);
  await page.waitForTimeout(200);
};

try {
  // flangeGaps on the user's part, in node on the app's own modules (warm, median of 25).
  const workspace = JSON.parse(await readFile(SAMPLE, 'utf8'));
  const sample = workspace.document.model;
  const feature = sample.parts[0].features[0],
    profile = sample.sketches[0].profile;
  const fold = foldSheet(feature, profile, {});
  for (let i = 0; i < 5; i++) flangeGaps(fold, profile, {});
  const times = [];
  for (let i = 0; i < 25; i++) {
    const start = performance.now();
    flangeGaps(fold, profile, {});
    times.push(performance.now() - start);
  }
  times.sort((p, q) => p - q);
  measured.flangeGapsMs = { median: Number(times[12].toFixed(3)), worst: Number(times.at(-1).toFixed(3)) };
  const reading = flangeGaps(fold, profile, {});
  measured.rows = reading.rows.length;
  measured.least = Number(reading.least.toFixed(4));
  assert.equal(reading.rows.length, 12, 'the user part reads 12 rows');
  assert(measured.flangeGapsMs.median < 5, `flangeGaps under 5 ms: ${measured.flangeGapsMs.median}`);
  checks.push(
    `flangeGaps on the user's part: ${measured.rows} rows, least ${measured.least}, median ${measured.flangeGapsMs.median} ms`,
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
  await page.locator('.cad-tree-item', { hasText: 'Sheet-metal part' }).first().click();
  const form = properties.getByLabel('Sheet metal', { exact: true });
  await expect(form.getByLabel('Flat blank', { exact: true })).toHaveText(
    'Blank 451.4 × 601.4 mm · cut length 2051.99 mm · 1 pierce · 8 bends',
  );
  checks.push('Open → the user file: blank 451.4 × 601.4 mm, 8 bends');

  // 2. The Sheet metal panel.
  await expect(summaryOf(form)).toHaveText(LINE);
  const formRows = rowsOf(form);
  await expect(formRows).toHaveCount(12);
  assert.equal(
    await form.locator('details.cad-gaps-rows').evaluate((d) => d.open),
    true,
    'rows open (a gap under 1 mm)',
  );
  // Since CG-4 (§6) followed by its band on the bench (" · ± 0.37 on the bench").
  await expect(formRows.first().locator('strong')).toHaveText(/^0\.72 mm · passes 1\.22 mm beside it( · |$)/);
  measured.formFirstRow = await formRows.first().getAttribute('aria-label');
  await expect(form.locator('.cad-gaps-edge')).toHaveCount(12);
  await formRows.first().hover();
  await expect(form.locator('.cad-gaps-edge.is-hot')).toHaveCount(1);
  measured.hotStroke = await form
    .locator('.cad-gaps-edge.is-hot line')
    .first()
    .evaluate((l) => window.getComputedStyle(l).stroke);
  assert.equal(measured.hotStroke, 'rgb(40, 127, 179)', `hovered edge in --shop-accent: ${measured.hotStroke}`);
  await shot('01-sheet-metal-gaps', { focus: summaryOf(form), hover: formRows.first() });
  await away();
  await expect(form.locator('.cad-gaps-edge.is-hot')).toHaveCount(0);
  checks.push(
    `Sheet metal panel: "${LINE}", 12 rows open, first "${measured.formFirstRow}", hover marks its edge in the accent`,
  );

  // 3. The press brake.
  await shopStation('Bend');
  const brake = properties.getByRole('region', { name: 'Press brake' });
  await expect(brake).toBeVisible({ timeout: 20000 });
  await expect(summaryOf(brake)).toHaveText(LINE);
  const folded = brake.getByLabel('Folded size', { exact: true }).last();
  assert(
    await folded.evaluate(
      (f, line) => Boolean(f.compareDocumentPosition(line) & 4),
      await summaryOf(brake).elementHandle(),
    ),
    'the line sits after the "Folded …" line',
  );
  // At the brake the rows wait closed (the sequence follows the card): open them.
  const disclosure = brake.locator('details.cad-gaps-rows');
  assert.equal(await disclosure.evaluate((d) => d.open), false, 'the rows are closed at the brake until asked for');
  await disclosure.locator('summary').click();
  const brakeRows = rowsOf(brake);
  await expect(brakeRows).toHaveCount(12);
  assert.equal((await shop()).station.gap, null, 'no marker before a hover');
  const map = page.getByRole('figure', { name: 'Flat blank' });
  await expect(map.locator('.cad-map-gap')).toHaveCount(0);
  // A wall row.
  await brakeRows.first().scrollIntoViewIfNeeded();
  const hoverStart = Date.now();
  await brakeRows.first().hover();
  await expect.poll(async () => Boolean((await shop()).station.gap), { timeout: 5000 }).toBe(true);
  measured.hoverToMarkerMs = Date.now() - hoverStart;
  const gap = (await shop()).station.gap;
  measured.wallMarker = gap;
  assert.equal(gap.overlap, false);
  assert.equal(gap.inPartGroup, true, 'the marker lives in the part group');
  // P on the wall's end, Q on the next wall's inside face: 0.72 along the normal, 1.22 beside.
  assert(Math.abs(gap.length - Math.hypot(0.717, 1.2187)) < 0.01, `marker length ${gap.length}`);
  await expect(map.locator('.cad-map-gap')).toHaveCount(1);
  await shot('02-brake-wall-row', { focus: brakeRows.first(), hover: brakeRows.first() });
  checks.push(
    `brake: "${LINE}" after the Folded line; wall row hovered → marker ${gap.length} mm (P ${gap.points[0].join(', ')} → Q ${gap.points[1].join(', ')}), its edge on the map, in ${measured.hoverToMarkerMs} ms`,
  );
  // A mitre row: both edges on the map.
  const mitre = brakeRows.filter({ hasText: 'edge to edge' }).first();
  await mitre.scrollIntoViewIfNeeded();
  await mitre.hover();
  await expect.poll(async () => (await shop()).station.gap?.length ?? null, { timeout: 5000 }).not.toBe(gap.length);
  measured.mitreMarker = (await shop()).station.gap;
  assert(Math.abs(measured.mitreMarker.length - 1.329) < 0.01, `mitre marker ${measured.mitreMarker.length}`);
  await expect(map.locator('.cad-map-gap')).toHaveCount(2);
  await shot('03-brake-mitre-row', { focus: mitre, hover: mitre });
  checks.push(`mitre row hovered → marker ${measured.mitreMarker.length} mm, both its edges on the map`);
  // The pointer leaving clears both.
  await away();
  await expect.poll(async () => (await shop()).station.gap, { timeout: 5000 }).toBe(null);
  await expect(map.locator('.cad-map-gap')).toHaveCount(0);
  checks.push('pointer away → no marker, no map edge');

  assert.equal(await page.locator('.cad-error').count(), 0, 'no error line');
  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ status: 'passed', errors, checks, measured }, null, 2),
  );
  console.log('Corner gaps CG-1 verification passed:\n- ' + checks.join('\n- '));
  console.log(JSON.stringify(measured, null, 2));
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` });
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}
