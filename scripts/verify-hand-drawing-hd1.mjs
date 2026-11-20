/* global localStorage, process, console, document */
// Hand drawing HD-1 (docs/sketch-studio-hand-drawing.md §5.5), driven the way
// a user would from an empty workspace: Shop → Draw → Draw the outline; a
// 200 × 120 rectangle and five Ø10 holes typed; a box dragged to the right
// takes three holes (solid), one to the left over their middle line takes all
// five (dashed); Delete; Ctrl+Z brings the five back, Ctrl+Y takes them, Ctrl+Z;
// one hole selected, Diameter 12 and X 50 typed in the selection row; a
// construction centre line with X armed ("… · 1 construction · closed
// profile"); Finish → an outline ready to cut with five cut-outs; Edit → the
// construction line is still there, dashed. The bar and its row measured at
// 1600 × 1000 and 1366 × 768. No page error, no .cad-error.
//   CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-hand-drawing-hd1.mjs
// Screenshots: artifacts/sketch-cad/hand-drawing-hd1 (or HD1_SHOTS), each state
// at 1600 × 1000 and 1366 × 768.
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { cadSteps } from './sketch-cad-steps.mjs';

const directory = process.env.HD1_SHOTS || 'artifacts/sketch-cad/hand-drawing-hd1';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [],
  checks = [],
  measured = {};
page.on('pageerror', (e) => errors.push(e.message));
const { properties, savedWhen, typeHud, toolbar, status, shopStation, project } = cadSteps(page);
const footer = page.locator('.cad-status');
const draw = properties.getByRole('region', { name: 'Draw' });
const readyList = draw.getByRole('list', { name: 'Outlines ready to cut' });
const row = page.getByRole('group', { name: 'Selection', exact: true });
const note = row.getByRole('note');
const modelCurrent = () => expect(footer).toContainText('Model current', { timeout: 60000 });
const noErrorLine = async (where) =>
  assert.equal(await page.locator('.cad-error').count(), 0, `no error line ${where}`);
const tool = (name) => toolbar.getByRole('button', { name, exact: true }).click();
const button = (name) => toolbar.getByRole('button', { name, exact: true });
const typeAt = async (field, ...values) => {
  await expect(page.getByLabel(`Sketch ${field}`, { exact: true })).toBeFocused();
  await typeHud(...values);
};
const overlay = () => page.evaluate(() => document.querySelector('.cad-viewport').cadSketchOverlay());
// Screen position of a sketch-plane point: Draw the outline sketches on XY at the origin.
const at = async ([u, v]) => project([u, v, 0]);
const clickAt = async (point) => {
  const [x, y] = await at(point);
  await page.mouse.click(x, y);
};
const HOLES = [30, 65, 100, 135, 170];
// A left drag in paced steps from one plane point towards another; the button is left held.
const pressAndDrag = async (from, to, steps = 10) => {
  const [x0, y0] = await at(from),
    [x1, y1] = await at(to);
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps);
    await page.waitForTimeout(16);
  }
  return [x1, y1];
};
// How much of the view the bar and its row cover (the spec's limit: a fifth).
const coverage = () =>
  page.evaluate(() => {
    const view = document.querySelector('.cad-viewport').getBoundingClientRect();
    const top = document.querySelector('.cad-sketch-top').getBoundingClientRect();
    const bar = document.querySelector('.cad-sketch-toolbar').getBoundingClientRect();
    const rowBox = document.querySelector('.cad-sketch-options')?.getBoundingClientRect();
    return {
      view: Math.round(view.height),
      bar: Math.round(bar.height),
      row: rowBox ? Math.round(rowBox.height) : 0,
      covered: Math.round(top.bottom - view.top),
      share: Number(((top.bottom - view.top) / view.height).toFixed(3)),
      rowInside: !rowBox || (rowBox.right <= view.right + 0.5 && rowBox.left >= view.left - 0.5),
    };
  });
const shot = async (name) => {
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${directory}/${name}.png` });
};
// The state at 1600 × 1000, then at 1366 × 768 (the pointer parked off the canvas).
const shots = async (name, measure = null) => {
  await page.mouse.move(5, 600);
  await shot(`${name}-1600`);
  if (measure) measured[`${measure}-1600`] = await coverage();
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.waitForTimeout(350);
  await shot(`${name}-1366`);
  if (measure) measured[`${measure}-1366`] = await coverage();
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.waitForTimeout(350);
};

try {
  await page.goto(process.env.CAD_VERIFY_URL || 'http://localhost:5180/sketch');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '3D Model & workshop', exact: true }).click();
  await modelCurrent();

  // 1. Shop → Draw → Draw the outline: the bar's groups, Redo, Construction.
  await shopStation('Draw');
  await draw.getByRole('button', { name: /^Draw the outline/ }).click();
  await toolbar.waitFor();
  for (const group of ['Draw', 'Mark', 'History'])
    await expect(toolbar.getByRole('group', { name: group, exact: true })).toBeVisible();
  await expect(button('Undo last')).toBeDisabled();
  await expect(button('Redo')).toBeDisabled();
  await expect(button('Redo')).toHaveAttribute('title', 'Redo (Ctrl+Y or Ctrl+Shift+Z)');
  await expect(button('Construction')).toHaveAttribute('aria-pressed', 'false');
  checks.push(
    'Draw the outline → the bar in groups Draw · Mark · History; Undo last and Redo disabled on a new sketch',
  );

  // 2. A 200 × 120 rectangle and five Ø10 holes on its middle line.
  await tool('Rectangle');
  await typeAt('x', 0, 0);
  await typeAt('width', 200, 120);
  await page.keyboard.press('Escape');
  await tool('Circle');
  for (const x of HOLES) {
    await typeAt('x', x, 60);
    await typeAt('radius', 5);
  }
  await page.keyboard.press('Escape');
  await expect(status).toContainText('6 items · closed profile');
  await tool('Look at');
  await page.waitForTimeout(400);
  await expect(button('Undo last')).toBeEnabled();
  checks.push('a 200 × 120 rectangle and five Ø10 holes at y 60 typed: 6 items · closed profile');

  // 3. A box to the right takes the three left holes (wholly inside), drawn solid.
  let end = await pressAndDrag([12, 40], [110, 80]);
  await expect(status).toContainText('3 wholly inside · release to select');
  let drawn = await overlay();
  assert.equal(drawn.box?.mode, 'inside', 'a box dragged to the right is an inside box');
  assert.equal(drawn.box.dashed, false, 'drawn solid');
  measured.insideBox = drawn.box;
  await shot('01-box-inside-1600');
  await page.mouse.move(...end);
  await page.mouse.up();
  await expect(note).toHaveText('3 selected: 3 circles · Delete removes them');
  drawn = await overlay();
  assert.equal(drawn.box, null);
  assert.deepEqual(drawn.selectedIds, ['e2', 'e3', 'e4']);
  await shots('02-three-selected', 'three-selected');
  checks.push('a box dragged to the right (solid) → 3 selected: 3 circles, drawn in the selected colour');

  // 4. A box to the left over their middle line: every hole it touches, drawn dashed.
  end = await pressAndDrag([192, 63], [20, 57]);
  await expect(status).toContainText('5 touched · release to select');
  drawn = await overlay();
  assert.equal(drawn.box?.mode, 'touching', 'a box dragged to the left is a touching box');
  assert.equal(drawn.box.dashed, true, 'drawn dashed');
  measured.touchingBox = drawn.box;
  await shot('03-box-touching-1600');
  await page.mouse.move(...end);
  await page.mouse.up();
  await expect(note).toHaveText('5 selected: 5 circles · Delete removes them');
  checks.push(
    'a box dragged to the left over the holes’ middle line (dashed) → 5 selected: 5 circles (none lies inside it)',
  );

  // The same two boxes at 1366 × 768, each dropped with Esc before the release.
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.waitForTimeout(350);
  await tool('Look at');
  await page.waitForTimeout(400);
  for (const [from, to, name, mode] of [
    [[12, 40], [110, 80], '01-box-inside-1366', 'inside'],
    [[192, 63], [20, 57], '03-box-touching-1366', 'touching'],
  ]) {
    end = await pressAndDrag(from, to);
    assert.equal((await overlay()).box?.mode, mode);
    await shot(name);
    await page.keyboard.press('Escape');
    assert.equal((await overlay()).box, null, 'Esc drops the box');
    await page.mouse.up();
  }
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.waitForTimeout(350);
  await tool('Look at');
  await page.waitForTimeout(400);
  await expect(note).toHaveText('5 selected: 5 circles · Delete removes them');
  checks.push(
    'at 1366 × 768 the same two boxes; Esc before each release drops the box and leaves the selection as it was',
  );

  // 5. Delete the five (one step); Ctrl+Z brings them back, Ctrl+Y takes them, Ctrl+Z.
  await page.keyboard.press('Delete');
  await expect(status).toContainText('1 item · closed profile');
  await page.keyboard.press('Control+z');
  await expect(status).toContainText('6 items · closed profile');
  await page.keyboard.press('Control+y');
  await expect(status).toContainText('1 item · closed profile');
  await expect(button('Redo')).toBeDisabled();
  await page.keyboard.press('Control+z');
  await expect(status).toContainText('6 items · closed profile');
  await expect(button('Redo')).toBeEnabled();
  checks.push('Delete → 1 item; Ctrl+Z → 6 items; Ctrl+Y → 1 item (Redo then disabled); Ctrl+Z → 6 items');

  // 6. One hole selected (the undo brought nothing back selected): its numbers in the row; Diameter 12 and X 50 typed.
  await expect(row).toHaveCount(0);
  await clickAt([35, 60]);
  await expect(note).toHaveText('Circle Ø10 at (30, 60) · Delete removes it');
  const box = (label) => row.getByLabel(`Selected ${label}`, { exact: true });
  await expect(box('X (mm)')).toHaveValue('30');
  await expect(box('Y (mm)')).toHaveValue('60');
  await expect(box('Diameter (mm)')).toHaveValue('10');
  await box('Diameter (mm)').fill('12');
  await box('Diameter (mm)').press('Enter');
  await expect(note).toHaveText('Circle Ø12 at (30, 60) · Delete removes it');
  await box('X (mm)').fill('50');
  await box('X (mm)').press('Enter');
  await expect(note).toHaveText('Circle Ø12 at (50, 60) · Delete removes it');
  await expect(box('Diameter (mm)')).toHaveValue('12');
  await expect(box('X (mm)')).toHaveValue('50');
  drawn = await overlay();
  assert.deepEqual(
    drawn.selected.map((s) => s.ids),
    [['e2']],
  );
  await shots('04-circle-row', 'circle-row');
  checks.push(
    'a click on the first hole → its row: X 30, Y 60, Diameter 10; Diameter 12 ↵, X 50 ↵ → "Circle Ø12 at (50, 60)"',
  );

  // 7. A construction centre line with X armed. Esc in the row's box leaves the box, the next one clears the selection.
  await page.mouse.move(5, 600);
  await page.keyboard.press('Escape');
  await expect(box('X (mm)')).not.toBeFocused();
  await expect(row).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(row).toHaveCount(0);
  await expect(toolbar).toBeVisible();
  await page.keyboard.press('x');
  await expect(button('Construction')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('l');
  await expect(button('Line')).toHaveAttribute('aria-pressed', 'true');
  await expect(status).toContainText('Construction · Click the start point');
  await typeAt('x', 0, 60);
  await typeAt('length', 200, 0);
  await page.keyboard.press('Escape');
  await expect(status).toContainText('7 items · 1 construction · closed profile');
  drawn = await overlay();
  assert.deepEqual(drawn.construction, [{ ids: ['e7'], dashed: true, color: '#e0861a' }]);
  await page.keyboard.press('x');
  await expect(button('Construction')).toHaveAttribute('aria-pressed', 'false');
  await shots('05-construction-line', 'construction');
  checks.push(
    'X armed, L, a line from (0, 60) 200 long → "7 items · 1 construction · closed profile", drawn dashed in #e0861a',
  );

  // 8. Finish → Draw: an outline ready to cut with five cut-outs.
  await tool('Finish sketch');
  await expect(toolbar).toHaveCount(0);
  await expect(readyList.getByRole('listitem')).toHaveCount(1);
  await expect(readyList.getByRole('listitem')).toHaveClass('is-chosen');
  await expect(readyList.getByRole('listitem')).toContainText('200 × 120 mm');
  const model = await savedWhen((m) => m.sketches.length === 1, 'the finished outline');
  const [sketch] = model.sketches;
  assert.equal(sketch.profile.holes?.length, 5, 'five cut-outs');
  assert.deepEqual(
    sketch.profile.holes.map((h) => [h.center, h.radius]),
    [
      [[50, 60], 6],
      [[65, 60], 5],
      [[100, 60], 5],
      [[135, 60], 5],
      [[170, 60], 5],
    ],
  );
  assert.deepEqual(sketch.entities.at(-1), { id: 'e7', type: 'line', a: [0, 60], b: [200, 60], construction: true });
  measured.finished = {
    profile: sketch.profile.type,
    holes: sketch.profile.holes.length,
    entities: sketch.entities.length,
  };
  await noErrorLine('after Finish');
  await shots('06-ready-to-cut');
  checks.push(
    'Finish → Draw: Sketch 1 ready to cut, 200 × 120 mm, five cut-outs (Ø12 at (50, 60) and four Ø10); the construction line kept in its entities',
  );

  // 9. Edit: the construction line is still there, dashed; the widest row (a line) measured.
  await readyList.getByRole('button', { name: 'Edit Sketch 1', exact: true }).click();
  await toolbar.waitFor();
  await expect(status).toContainText('7 items · 1 construction · closed profile');
  await expect(button('Undo last')).toBeDisabled();
  drawn = await overlay();
  assert.deepEqual(drawn.construction, [{ ids: ['e7'], dashed: true, color: '#e0861a' }]);
  await tool('Look at');
  await page.waitForTimeout(400);
  await clickAt([182, 60]);
  await expect(note).toHaveText('Line 200 mm · Delete removes it');
  // It is construction: the bar's Construction shows pressed for it.
  await expect(button('Construction')).toHaveAttribute('aria-pressed', 'true');
  for (const [label, value] of [
    ['X1 (mm)', '0'],
    ['Y1 (mm)', '60'],
    ['X2 (mm)', '200'],
    ['Y2 (mm)', '60'],
    ['Length (mm)', '200'],
    ['Angle (°)', '0'],
  ])
    await expect(box(label)).toHaveValue(value);
  drawn = await overlay();
  assert.deepEqual(drawn.construction, [{ ids: ['e7'], dashed: true, color: '#e2541c' }]);
  await shots('07-edit-construction-selected', 'line-row');
  await tool('Cancel sketch');
  await expect(toolbar).toHaveCount(0);
  checks.push(
    'Edit Sketch 1 → 7 items · 1 construction · closed profile, the line dashed; selected: "Line 200 mm", Construction pressed, six boxes; Cancel',
  );

  // 10. The bar and its row cover no more than a sixth of the view at 1600 × 1000 and a quarter at
  // 1366 × 768 (HD-3 §7.5 restates HD-1's fifth: the selection row carries the actions on a
  // selection since), the row inside it.
  for (const [key, value] of Object.entries(measured).filter(([k]) => /-(1600|1366)$/.test(k))) {
    const limit = key.endsWith('1600') ? 1 / 6 : 1 / 4;
    assert.ok(value.share <= limit, `${key}: the bar and its row cover ${value.share} of the view`);
    assert.ok(value.rowInside, `${key}: the row stands inside the view`);
  }
  checks.push(
    'the bar and its row cover at most a sixth of the view at 1600 × 1000 and a quarter at 1366 × 768 (§7.5)',
  );

  await noErrorLine('at the end');
  if (errors.length) throw new Error(errors.join('\n'));
  checks.push('no page error; no .cad-error');
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ status: 'passed', errors, checks, measured }, null, 2),
  );
  console.log('Hand drawing HD-1 verification passed:\n- ' + checks.join('\n- '));
  console.log(JSON.stringify(measured, null, 2));
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` });
  console.error(errors, JSON.stringify(measured));
  throw error;
} finally {
  await browser.close();
}
