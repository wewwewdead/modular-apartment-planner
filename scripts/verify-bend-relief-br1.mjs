/* global localStorage, process, console, document */
// Bend reliefs BR-1 (docs/sketch-studio-bend-relief.md §5.2), driven the way
// the user would from an empty workspace: Shop → Draw → a cross blank (base
// 200 × 100, flaps 20) typed with the Line tool → Relief: Square, its
// automatic size for the sheet (4.6 at 1.5 mm, 4 at 1.2) → the four inside
// corners cut, still a closed profile → Undo last, cut again → Round on a
// second cross → the tab blank: a Square larger than the tab's side refused
// in its words (nothing changed), Obround from the tab's side at both
// corners, Rectangular on a straight edge → Finish: three outlines ready to
// cut → the first cut from 1.2 mm SPCC, four bends through its corners → it
// folds, no .cad-error → Edit outline sizes for the part's own sheet ("1.2 mm
// SPCC (this part)") → Finish unchanged, it still folds. No page error.
//   CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-bend-relief-br1.mjs
// Screenshots: artifacts/sketch-cad/bend-relief-br1 (or BR1_SHOTS), each state
// at 1600 × 1000 and at 1366 × 768.
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { cadSteps } from './sketch-cad-steps.mjs';

const directory = process.env.BR1_SHOTS || 'artifacts/sketch-cad/bend-relief-br1';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [],
  checks = [],
  measured = {};
page.on('pageerror', (e) => errors.push(e.message));
const { properties, current, savedWhen, typeHud, toolbar, status, shopStation, project } = cadSteps(page);
const footer = page.locator('.cad-status');
const readout = page.getByLabel('Relief readout', { exact: true });
const options = page.getByRole('group', { name: 'Relief options', exact: true });
const draw = properties.getByRole('region', { name: 'Draw' });
const readyList = draw.getByRole('list', { name: 'Outlines ready to cut' });
const noErrorLine = async (where) =>
  assert.equal(await page.locator('.cad-error').count(), 0, `no error line ${where}`);
const rebuilt = async () => {
  await page.waitForTimeout(300);
  await current();
  await expect(footer).not.toContainText('Rebuild failed');
};
// Screen position of a sketch-plane point on the Draw plane (world XY, z 0).
const at = async ([u, v]) => project([u, v, 0]);
// A click on the canvas itself (never on the sketch bar or the status line over it).
const click = async (point) => {
  const [x, y] = await at(point);
  const hit = await page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.tagName, [x, y]);
  assert.equal(hit, 'CANVAS', `the point ${point} is on the canvas (${x.toFixed(0)}, ${y.toFixed(0)})`);
  await page.mouse.click(x, y);
};
// Look at: square to the plane, the whole sketch framed.
const lookAt = async () => {
  await tool('Look at');
  await page.waitForTimeout(600);
};
const hover = async (point) => {
  const [x, y] = await at(point);
  await page.mouse.move(x, y);
};
const items = async () => Number((await status.innerText()).match(/(\d+) items?/)[1]);
// The options row fits the view at this size: inside the canvas, one row, clear of the status line.
const rowFits = async (where) => {
  if (!(await options.count())) return null;
  const box = await page.evaluate(() => {
    const rect = (node) => node.getBoundingClientRect().toJSON();
    const row = document.querySelector('.cad-sketch-options');
    return {
      row: rect(row),
      overflow: row.scrollWidth - row.clientWidth,
      bar: rect(document.querySelector('.cad-sketch-toolbar')),
      view: rect(document.querySelector('.cad-viewport')),
      status: rect(document.querySelector('.cad-sketch-status')),
    };
  });
  assert(box.row.right <= box.view.right && box.row.left >= box.view.left, `the Relief row inside the view ${where}`);
  assert(box.overflow <= 0, `the Relief row does not overflow ${where}`);
  assert(box.row.height < 40, `the Relief row is one row ${where} (${box.row.height} px)`);
  assert(box.row.top >= box.bar.bottom, `the Relief row under the sketch bar ${where}`);
  assert(box.row.bottom < box.status.top, `the Relief row clear of the status line ${where}`);
  return { row: Math.round(box.row.width), height: Math.round(box.row.height), bar: Math.round(box.bar.height) };
};
// The shot at 1600 × 1000, then the same state at 1366 × 768 (the row measured at both).
const shots = async (name, { pointer = false } = {}) => {
  if (!pointer) await page.mouse.move(5, 600);
  await page.waitForTimeout(250);
  const wide = await rowFits(`${name} at 1600`);
  await page.screenshot({ path: `${directory}/${name}-1600.png` });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.waitForTimeout(350);
  const narrow = await rowFits(`${name} at 1366`);
  await page.screenshot({ path: `${directory}/${name}-1366.png` });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.waitForTimeout(350);
  if (wide) measured[`row ${name}`] = { 1600: wide, 1366: narrow };
};
const tool = (name) => toolbar.getByRole('button', { name, exact: true }).click();
// Typed once the step's first field has the focus (the HUD moves it there after each step).
const typeAt = async (field, ...values) => {
  await expect(page.getByLabel(`Sketch ${field}`, { exact: true })).toBeFocused();
  await typeHud(...values);
};
// A closed outline of lines from `start`, typed as length and angle; the last closes it.
const outline = async (start, legs) => {
  await tool('Line');
  await typeAt('x', ...start);
  for (const [length, angle] of legs) await typeAt('length', length, angle);
  await page.keyboard.press('Escape');
};
const CROSS_LEGS = [
  [200, 0],
  [20, 90],
  [20, 0],
  [100, 90],
  [20, 180],
  [20, 90],
  [200, 180],
  [20, -90],
  [20, 180],
  [100, -90],
  [20, 0],
  [20, -90],
];
const cross = (x) => outline([x, -20], CROSS_LEGS);
const cornersOf = (x) => [
  [x, 0],
  [x + 200, 0],
  [x + 200, 100],
  [x, 100],
];
const setBox = async (label, value) => {
  const box = options.getByLabel(label, { exact: true });
  await box.fill(String(value));
  await box.press('Enter');
  // Leave the box (Esc drops nothing now: the value is committed) so the sketcher has the keys.
  await box.press('Escape');
  await page.waitForTimeout(50);
};
const SECOND = 300; // the second cross's left edge
const TAB = 600; // the tab blank's left edge: base 100 × 100, a 20 mm tab from x + 40 to x + 60

try {
  await page.goto(process.env.CAD_VERIFY_URL || 'http://localhost:5180/sketch');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '3D Model & workshop', exact: true }).click();
  await current();

  // 1. Shop → Draw: the cross blank with the Line tool, typed.
  await shopStation('Draw');
  await page.mouse.move(5, 600);
  await draw.getByRole('button', { name: /^Draw the outline/ }).click();
  await toolbar.waitFor();
  await cross(0);
  await expect(status).toContainText('12 items · closed profile');
  await lookAt();
  checks.push(
    'Shop → Draw: the cross blank (base 200 × 100, flaps 20) typed with the Line tool → "12 items · closed profile"',
  );

  // 2. Relief: Square, "4.6" automatic for 1.5 mm → the sheet set to 1.2 → "4"; the readout at a corner.
  await tool('Relief');
  await expect(toolbar.getByRole('button', { name: 'Relief', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(options).toBeVisible();
  await expect(options.getByLabel('Relief shape', { exact: true })).toHaveValue('square');
  const size = options.getByLabel('Relief size (mm)', { exact: true });
  await expect(size).toHaveValue('');
  await expect(size).toHaveAttribute('placeholder', '4.6');
  await expect(options.getByLabel('Relief sheet thickness (mm)', { exact: true })).toHaveValue('1.5');
  await expect(status).toContainText('Move to an inside corner and click to cut the relief');
  await shots('01-relief-options');
  await setBox('Relief sheet thickness (mm)', 1.2);
  await expect(size).toHaveAttribute('placeholder', '4');
  await hover([0, 0]);
  await expect(readout).toHaveText('Square 4 × 4click to cut · Esc ends the tool');
  measured.readoutAtCorner = await readout.innerText();
  await shots('02-readout-at-corner', { pointer: true });
  checks.push(
    'Relief: Square, size empty with "4.6" automatic for 1.5 mm; sheet 1.2 → "4"; at a corner the readout reads "Square 4 × 4"',
  );

  // 3. The four inside corners → still "closed profile".
  for (const corner of cornersOf(0)) await click(corner);
  await expect(status).toContainText('28 items · closed profile');
  await shots('03-four-square-reliefs');
  checks.push('the four inside corners clicked → 28 items, still "closed profile"');

  // 4. Undo last once → three reliefs; the corner again → four.
  await tool('Undo last');
  await expect(status).toContainText('24 items · closed profile');
  await click(cornersOf(0)[3]);
  await expect(status).toContainText('28 items · closed profile');
  checks.push('Undo last → 24 items (three reliefs); the corner again → 28');

  // 5. Round on a second cross beside it: its four corners.
  await cross(SECOND);
  await expect(status).toContainText('40 items · closed profile');
  await lookAt();
  await tool('Relief');
  await options.getByLabel('Relief shape', { exact: true }).selectOption('round');
  await expect(options.getByLabel('Relief diameter (mm)', { exact: true })).toHaveAttribute('placeholder', '4');
  await hover(cornersOf(SECOND)[0]);
  await expect(readout).toHaveText('Round Ø4click to cut · Esc ends the tool');
  for (const corner of cornersOf(SECOND)) await click(corner);
  await expect(status).toContainText('44 items · closed profile');
  await shots('04-round-reliefs');
  checks.push('a second cross, Round: "Round Ø4" at its corner, its four corners cut → 44 items (one arc each)');

  // 6. The tab blank: a Square larger than the tab's side refused, nothing changed; Obround
  //    from the tab's side at both corners; Rectangular on a straight edge point.
  await outline(
    [TAB, 0],
    [
      [100, 0],
      [100, 90],
      [40, 180],
      [20, 90],
      [20, 180],
      [20, -90],
      [40, 180],
      [100, -90],
    ],
  );
  await expect(status).toContainText('52 items · closed profile');
  await lookAt();
  await tool('Relief');
  await options.getByLabel('Relief shape', { exact: true }).selectOption('square');
  await setBox('Relief size (mm)', 50);
  await click([TAB + 40, 100]);
  const refusal = 'The edge beside this corner is 20 mm long: the relief needs 25 mm of it.';
  await expect(status).toContainText(refusal);
  await expect(status).toContainText('52 items · closed profile');
  await shots('05-square-refused');
  await options.getByLabel('Relief size (mm)', { exact: true }).fill('');
  await options.getByLabel('Relief size (mm)', { exact: true }).press('Enter');
  await expect(size).toHaveValue('');
  await options.getByLabel('Relief shape', { exact: true }).selectOption('obround');
  await expect(options.getByLabel('Relief width (mm)', { exact: true })).toHaveAttribute('placeholder', '1.2');
  await expect(options.getByLabel('Relief depth (mm)', { exact: true })).toHaveAttribute('placeholder', '2.6');
  // From the tab's side: the cursor a little up it, so its side is the one pointed at.
  await hover([TAB + 40, 102]);
  await expect(readout).toHaveText('Obround 1.2 × 2.6click to cut · Esc ends the tool');
  await click([TAB + 40, 102]);
  await click([TAB + 60, 102]);
  await expect(status).toContainText('56 items · closed profile');
  await options.getByLabel('Relief shape', { exact: true }).selectOption('rect');
  // The bottom edge's midpoint.
  await hover([TAB + 50, 0]);
  await expect(readout).toHaveText('Rectangular 1.2 × 2click to cut · Esc ends the tool');
  await click([TAB + 50, 0]);
  await expect(status).toContainText('60 items · closed profile');
  await shots('06-tab-reliefs');
  checks.push(
    `the tab blank: Square 50 refused "${refusal}", 52 items kept; Obround 1.2 × 2.6 from the tab's side at both corners; Rectangular 1.2 × 2 on the bottom edge → 60 items`,
  );

  // 7. Finish → three outlines ready to cut; the first cut from 1.2 mm SPCC, four bends through its corners.
  await page.keyboard.press('Escape');
  await tool('Finish sketch');
  await expect(readyList.getByRole('listitem')).toHaveCount(3);
  let model = await savedWhen((m) => m.sketches.length === 3, 'three outlines');
  const first = model.sketches.find((s) => s.profile.start[0] < 250);
  assert(first, 'the first cross is an outline');
  assert.equal(first.profile.segments.length, 28, 'the first cross: 12 edges + 4 × 4 relief lines');
  const points = [first.profile.start, ...first.profile.segments.map((s) => s.end)];
  for (const p of [
    [-2, 0],
    [-2, 2],
    [2, 2],
    [2, -2],
    [0, -2],
  ])
    assert(
      points.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-6),
      `the corner (0, 0) relieved: ${p}`,
    );
  const second = model.sketches.find((s) => s.profile.start[0] >= 250 && s.profile.start[0] < 550);
  assert.equal(second.profile.segments.filter((s) => s.type === 'arc').length, 4, 'the second cross: four arcs');
  await shots('07-three-outlines');
  checks.push(
    `Finish → three outlines ready to cut; "${first.name}" a closed path of 28 edges holding the four squares, "${second.name}" four arcs`,
  );

  await readyList.getByRole('button', { name: `Cut ${first.name}`, exact: true }).click();
  const cut = properties.getByRole('region', { name: 'Cut from sheet' });
  await cut.getByLabel('Sheet stock', { exact: true }).selectOption('spcc');
  const custom = cut.getByLabel('Custom thickness (mm)', { exact: true });
  await custom.fill('1.2');
  await custom.press('Enter');
  await expect(cut.getByLabel('Blank size', { exact: true })).toContainText('Blank 240 × 140 mm');
  await cut.getByRole('button', { name: 'Cut on the laser', exact: true }).click();
  const bed = page.getByRole('figure', { name: 'Laser bed' });
  await expect(bed).toHaveAttribute('data-state', 'cut', { timeout: 30000 });
  await properties
    .getByRole('region', { name: 'Laser station' })
    .getByRole('button', { name: 'Leave laser', exact: true })
    .click();
  await rebuilt();
  const form = properties.getByLabel('Sheet metal', { exact: true });
  await form.getByRole('group', { name: 'Bend line' }).getByRole('button', { name: 'Two points', exact: true }).click();
  // Through the corners, the segments kept within the base (spec §5.1).
  const BENDS = [
    [
      [8, 0],
      [192, 0],
    ],
    [
      [192, 100],
      [8, 100],
    ],
    [
      [0, 92],
      [0, 8],
    ],
    [
      [200, 8],
      [200, 92],
    ],
  ];
  for (const [a, b] of BENDS) {
    for (const [label, value] of [
      ['A X (mm)', a[0]],
      ['A Y (mm)', a[1]],
      ['B X (mm)', b[0]],
      ['B Y (mm)', b[1]],
    ]) {
      const field = form.getByLabel(label, { exact: true });
      await field.fill(String(value));
      await field.press('Enter');
    }
    const add = form.getByRole('button', { name: 'Add bend', exact: true });
    await expect(add).toBeEnabled();
    await add.click();
    await rebuilt();
  }
  model = await savedWhen((m) => m.parts[0]?.features[0]?.bends?.length === 4, 'four bends');
  assert.equal(model.parts[0].features[0].thickness, 1.2);
  await expect(form.getByLabel('Flat blank', { exact: true })).toContainText('4 bends');
  await noErrorLine('with the four bends');
  measured.flatBlank = await form.getByLabel('Flat blank', { exact: true }).innerText();
  await shots('08-folded');
  checks.push(`cut from 1.2 mm SPCC, four bends through the corners → "${measured.flatBlank}", no .cad-error`);

  // 8. Edit outline: the row sizes for the part's own sheet → Finish unchanged → it still folds.
  await form.getByRole('button', { name: 'Edit outline', exact: true }).click();
  await toolbar.waitFor();
  await tool('Relief');
  await expect(options).toContainText('1.2 mm SPCC (this part)');
  assert.equal(await options.getByLabel('Relief sheet thickness (mm)', { exact: true }).count(), 0);
  // The shape left in the last sketch (Rectangular) comes back with it; Square sizes for the part's 1.2 mm.
  await expect(options.getByLabel('Relief shape', { exact: true })).toHaveValue('rect');
  await options.getByLabel('Relief shape', { exact: true }).selectOption('square');
  await expect(options.getByLabel('Relief size (mm)', { exact: true })).toHaveAttribute('placeholder', '4');
  await shots('09-edit-outline-this-part');
  await page.keyboard.press('Escape');
  await tool('Finish sketch');
  await expect(toolbar).toHaveCount(0);
  await rebuilt();
  await expect(form.getByLabel('Flat blank', { exact: true })).toContainText('4 bends');
  await noErrorLine('after the outline edit');
  checks.push(
    'Edit outline → "1.2 mm SPCC (this part)", the last shape (Rectangular) remembered, Square "4" → Finish unchanged → still four bends, no .cad-error',
  );

  // 9. No page error.
  if (errors.length) throw new Error(errors.join('\n'));
  checks.push('no page error');
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ status: 'passed', errors, checks, measured }, null, 2),
  );
  console.log('Bend reliefs BR-1 verification passed:\n- ' + checks.join('\n- '));
  console.log(JSON.stringify(measured, null, 2));
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` });
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}
