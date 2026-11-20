/* global localStorage, process, console, document */
// Hand drawing HD-3 (docs/sketch-studio-hand-drawing.md §7.8), driven the way
// a user would from an empty workspace: Shop → Draw → Draw the outline; a
// 240 × 160 rectangle with R8 corners about the zero at its centre (Center
// rectangle, Corner radius 8 in its row); one Ø5 hole at (−100, −60) mirrored
// left ↔ right and top ↔ bottom about the zero (four holes); one 22 × 5 slot
// patterned in a 4 × 3 grid, then all twelve box-selected and moved by typed
// ΔX, ΔY; a hexagon patterned round a centre (six); one slot dragged with the
// pointer and put back with Esc; Check "nothing to fix"; Finish → ready to cut
// with 22 cut-outs; cut from 1.2 mm SPCC and bent once (the shop's own steps)
// to show the kernel takes it. The bar and its row measured at 1600 × 1000
// (at most a sixth of the view) and 1366 × 768 (a quarter). No page error, no
// .cad-error.
//   CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-hand-drawing-hd3.mjs
// Screenshots: artifacts/sketch-cad/hand-drawing-hd3 (or HD3_SHOTS), each state
// at 1600 × 1000 and 1366 × 768.
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { cadSteps } from './sketch-cad-steps.mjs';

const directory = process.env.HD3_SHOTS || 'artifacts/sketch-cad/hand-drawing-hd3';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [],
  checks = [],
  measured = {};
page.on('pageerror', (e) => errors.push(e.message));
const { properties, current, savedWhen, toolbar, status, shopStation, project } = cadSteps(page);
const footer = page.locator('.cad-status');
const draw = properties.getByRole('region', { name: 'Draw' });
const readyList = draw.getByRole('list', { name: 'Outlines ready to cut' });
const row = page.getByRole('group', { name: 'Selection', exact: true });
const checkPanel = page.getByRole('region', { name: 'Check', exact: true });
const modelCurrent = () => expect(footer).toContainText('Model current', { timeout: 60000 });
const noErrorLine = async (where) =>
  assert.equal(await page.locator('.cad-error').count(), 0, `no error line ${where}`);
const button = (name) => toolbar.getByRole('button', { name, exact: true });
const tool = (name) => button(name).click();
const hud = (field) => page.getByLabel(`Sketch ${field}`, { exact: true });
// The HUD's boxes typed, then Enter on the last.
const typeIn = async (values) => {
  const entries = Object.entries(values);
  for (const [field, value] of entries) await hud(field).fill(String(value));
  await hud(entries.at(-1)[0]).press('Enter');
};
const overlay = () => page.evaluate(() => document.querySelector('.cad-viewport').cadSketchOverlay());
const at = async ([u, v]) => project([u, v, 0]);
const onCanvas = async ([x, y], what) => {
  const hit = await page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.tagName, [x, y]);
  assert.equal(hit, 'CANVAS', `${what} is on the canvas (${x.toFixed(0)}, ${y.toFixed(0)})`);
};
const clickAt = async (point) => {
  const [x, y] = await at(point);
  await onCanvas([x, y], `the point ${point}`);
  await page.mouse.move(x, y);
  await page.mouse.click(x, y);
};
// A left drag the way a hand makes it: down, paced moves, (up unless `hold`).
const dragBetween = async (from, to, { hold = false } = {}) => {
  const [[x0, y0], [x1, y1]] = await Promise.all([at(from), at(to)]);
  await onCanvas([x0, y0], `the drag's start ${from}`);
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(x0 + ((x1 - x0) * i) / 8, y0 + ((y1 - y0) * i) / 8);
    await page.waitForTimeout(30);
  }
  if (!hold) await page.mouse.up();
};
const rowBox = (label) => row.getByLabel(label, { exact: true });
const setRow = async (label, value) => {
  const box = rowBox(label);
  await box.fill(String(value));
  await box.press('Enter');
};
// How much of the view the bar and its row cover (§7.5: a sixth at 1600 × 1000, a quarter at 1366 × 768).
const coverage = () =>
  page.evaluate(() => {
    const view = document.querySelector('.cad-viewport').getBoundingClientRect();
    const top = document.querySelector('.cad-sketch-top').getBoundingClientRect();
    const bar = document.querySelector('.cad-sketch-toolbar').getBoundingClientRect();
    const rows = [...document.querySelectorAll('.cad-sketch-options')].map((r) => r.getBoundingClientRect());
    return {
      view: Math.round(view.height),
      bar: Math.round(bar.height),
      row: rows.length ? Math.round(rows.at(-1).height) : 0,
      covered: Math.round(top.bottom - view.top),
      share: Number(((top.bottom - view.top) / view.height).toFixed(3)),
      rowInside: rows.every((r) => r.right <= view.right + 0.5 && r.left >= view.left - 0.5),
    };
  });
const shot = async (name) => {
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${directory}/${name}.png` });
};
// The state at 1600 × 1000, then at 1366 × 768 (the pointer parked off the canvas unless `keep`).
const shots = async (name, measure = null, keep = false) => {
  if (!keep) await page.mouse.move(5, 600);
  await shot(`${name}-1600`);
  if (measure) measured[`${measure}-1600`] = await coverage();
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.waitForTimeout(350);
  await shot(`${name}-1366`);
  if (measure) measured[`${measure}-1366`] = await coverage();
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.waitForTimeout(350);
};
const lookAt = async () => {
  await tool('Look at');
  await page.waitForTimeout(500);
};
const items = async () => Number((await status.innerText()).match(/(\d+) items?/)[1]);

try {
  await page.goto(process.env.CAD_VERIFY_URL || 'http://localhost:5180/sketch');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '3D Model & workshop', exact: true }).click();
  await modelCurrent();

  // 1. Shop → Draw → Draw the outline: Slot and Polygon in Draw; Center rect and Arc keep their names.
  await shopStation('Draw');
  await draw.getByRole('button', { name: /^Draw the outline/ }).click();
  await toolbar.waitFor();
  const drawGroup = toolbar.getByRole('group', { name: 'Draw', exact: true });
  assert.deepEqual(await drawGroup.getByRole('button').allTextContents(), [
    'Line',
    'Rectangle',
    'Center rect',
    'Circle',
    'Arc',
    'Slot',
    'Polygon',
  ]);
  await expect(button('Center rectangle')).toHaveText('Center rect');
  await expect(button('3-point arc')).toHaveText('Arc');
  measured['bar-1600'] = await coverage();
  checks.push(
    'the bar: Draw is Line, Rectangle, Center rect, Circle, Arc, Slot, Polygon; Center rectangle and 3-point arc found by their names',
  );

  // 2. A 240 × 160 rectangle with R8 corners about the zero (the sketch origin) at its centre.
  await tool('Center rectangle');
  const radius = page.getByLabel('Corner radius (mm)', { exact: true });
  await radius.fill('8');
  await radius.press('Enter');
  await typeIn({ x: 0, y: 0 });
  await shots('01-rectangle-row', 'rectangle-row', true);
  await typeIn({ width: 240, height: 160 });
  await page.keyboard.press('Escape');
  await expect(status).toContainText('1 item · closed profile');
  await lookAt();
  checks.push('Center rectangle with Corner radius 8 in its row: X 0, Y 0, 240 × 160 → "1 item · closed profile"');

  // 3. One Ø5 hole at (−100, −60), mirrored left ↔ right, then both top ↔ bottom about the zero: four.
  await tool('Circle');
  await typeIn({ x: -100, y: -60 });
  await typeIn({ diameter: 5 });
  await page.keyboard.press('Escape');
  await clickAt([-97.5, -60]);
  await expect(row.getByRole('note')).toHaveText('Circle Ø5 at (-100, -60) · Delete removes it');
  await page.keyboard.press('i');
  await expect(row.getByRole('button', { name: 'Mirror', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await shots('02-mirror-row', 'mirror-row', true);
  await row.getByRole('button', { name: 'Left ↔ right about the zero', exact: true }).click();
  await expect(row.getByRole('note')).toHaveText('Circle Ø5 at (100, -60) · Delete removes it');
  await page.keyboard.press('Escape');
  await dragBetween([-115, -70], [115, -50]);
  await expect(row.getByRole('note')).toHaveText('2 selected: 2 circles · Delete removes them');
  await page.keyboard.press('i');
  await row.getByRole('button', { name: 'Top ↔ bottom about the zero', exact: true }).click();
  await expect(status).toContainText('5 items · closed profile');
  await page.keyboard.press('Escape');
  let drawn = await overlay();
  assert.equal(drawn.selectedIds.length, 0);
  checks.push(
    'one Ø5 hole at (−100, −60); I → Left ↔ right about the zero → (100, −60); both box-selected, I → Top ↔ bottom → four holes, "5 items"',
  );

  // 4. One 22 × 5 slot at (−60, −40), patterned in a 4 × 3 grid (30, 15): twelve.
  await page.keyboard.press('s');
  await expect(page.getByRole('group', { name: 'Slot options', exact: true })).toBeVisible();
  await shots('03-slot-row', 'slot-row', true);
  await typeIn({ x: -60, y: -40 });
  await typeIn({ length: 22, angle: 0 });
  await page.keyboard.press('Escape');
  await expect(status).toContainText('6 items · closed profile');
  await clickAt([-60, -37.5]);
  await expect(row.getByRole('note')).toHaveText('Slot 22 × 5 at (-60, -40) · Delete removes it');
  await expect(row.getByLabel('Selected Length (mm)', { exact: true })).toHaveValue('22');
  await shots('04-slot-numbers', 'slot-numbers', true);
  await page.keyboard.press('g');
  await rowBox('Pattern kind').selectOption('grid');
  await setRow('Pattern columns', 4);
  await setRow('Pattern rows', 3);
  await setRow('Pattern column step (mm)', 30);
  await setRow('Pattern row step (mm)', 15);
  await expect(row.getByLabel('Pattern adds', { exact: true })).toHaveText('adds 11');
  drawn = await overlay();
  assert.equal(drawn.ghost, 11, 'a ghost of each of the 11 copies');
  await shots('05-pattern-grid', 'pattern-row', true);
  await row.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(status).toContainText('17 items · closed profile');
  await page.keyboard.press('Escape');
  checks.push(
    'a 22 × 5 slot at (−60, −40) by S and typed numbers; G → Grid 4 × 3, steps 30 and 15: "adds 11", a ghost of 11; Apply → 17 items',
  );

  // 5. All twelve box-selected (to the right: wholly inside) and moved by typed ΔX 10, ΔY −5.
  await dragBetween([-80, -48], [50, -2]);
  await expect(row.getByRole('note')).toHaveText('12 selected: 12 slots · Delete removes them');
  await page.keyboard.press('m');
  await expect(hud('ΔX')).toBeFocused();
  await typeIn({ ΔX: 10, ΔY: -5 });
  await expect(row.getByRole('note')).toHaveText('12 selected: 12 slots · Delete removes them');
  await page.keyboard.press('Escape');
  await clickAt([-50, -42.5]);
  await expect(row.getByRole('note')).toHaveText('Slot 22 × 5 at (-50, -45) · Delete removes it');
  await page.keyboard.press('Escape');
  checks.push('the twelve slots box-selected; M, ΔX 10, ΔY −5, Enter → the first slot at (−50, −45)');

  // 6. A hexagon 10 across flats at (60, 40), patterned round (60, 20): six.
  await page.keyboard.press('p');
  await expect(page.getByRole('group', { name: 'Polygon options', exact: true })).toBeVisible();
  await typeIn({ x: 60, y: 40 });
  await typeIn({ 'across flats': 10, angle: 0 });
  await page.keyboard.press('Escape');
  await clickAt([60, 35.2]);
  await expect(row.getByRole('note')).toHaveText('Hexagon 10 across flats at (60, 40) · Delete removes it');
  await page.keyboard.press('g');
  await rowBox('Pattern kind').selectOption('circle');
  await setRow('Pattern centre X (mm)', 60);
  await setRow('Pattern centre Y (mm)', 20);
  await setRow('Pattern count', 6);
  await expect(row.getByLabel('Pattern adds', { exact: true })).toHaveText('adds 5');
  drawn = await overlay();
  assert.equal(drawn.ghost, 5);
  await shots('06-pattern-circle', 'circle-row', true);
  // Esc leaves the row's box (its own rule, as in the Relief row); Enter then applies.
  await rowBox('Pattern count').press('Escape');
  await page.waitForTimeout(50);
  await page.keyboard.press('Enter');
  await expect(status).toContainText('23 items · closed profile');
  await page.keyboard.press('Escape');
  checks.push(
    'a hexagon 10 across flats at (60, 40) by P; G → Circle about (60, 20), Count 6, 360°: "adds 5"; Enter → 23 items',
  );

  // 7. One slot dragged with the pointer and put back with Esc: nothing moves, no Undo step.
  await clickAt([-50, -42.5]);
  const undo = button('Undo last');
  const undoTitle = await undo.getAttribute('title');
  await dragBetween([-50, -42.5], [-20, 40], { hold: true });
  drawn = await overlay();
  assert.ok(drawn.dragOffset && Math.hypot(...drawn.dragOffset) > 50, `the slot dragged: ${drawn.dragOffset}`);
  await expect(status).toContainText('Release to move it here');
  await shots('07-drag', null, true);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  drawn = await overlay();
  assert.equal(drawn.dragOffset, null);
  await expect(row.getByRole('note')).toHaveText('Slot 22 × 5 at (-50, -45) · Delete removes it');
  assert.equal(await undo.getAttribute('title'), undoTitle);
  assert.equal(await items(), 23);
  // A real move by dragging, then Undo last takes it back as one step.
  await dragBetween([-50, -42.5], [-50, -52.5]);
  // Released on the grid (1 mm snap) near 10 mm lower: X kept, Y about −55.
  await expect(row.getByRole('note')).toHaveText(/^Slot 22 × 5 at \(-50, -5[3-7](\.\d+)?\) · Delete removes it$/);
  measured.dragged = await row.getByRole('note').innerText();
  await undo.click();
  await expect(row.getByRole('note')).toHaveText('Slot 22 × 5 at (-50, -45) · Delete removes it');
  await page.keyboard.press('Escape');
  checks.push(
    'a slot dragged with the pointer (the selection drawn offset, "Release to move it here"), Esc → back where it was, no step; dragged 10 mm down and released → moved; Undo last → back',
  );

  // 8. Check: nothing to fix, a closed outline with 22 cut-outs.
  await lookAt();
  await tool('Check');
  await expect(checkPanel).toContainText('Check · nothing to fix');
  await expect(checkPanel).toContainText('Nothing to fix: a closed outline with 22 cut-outs.');
  await shots('08-check');
  await tool('Check');
  checks.push('Check → "Check · nothing to fix", "Nothing to fix: a closed outline with 22 cut-outs."');

  // 9. Finish → ready to cut with 22 cut-outs: 4 circles, 12 slot paths, 6 hexagon polygons.
  await tool('Finish sketch');
  await expect(toolbar).toHaveCount(0);
  await expect(readyList.getByRole('listitem')).toHaveCount(1);
  await expect(readyList.getByRole('listitem')).toContainText('240 × 160 mm');
  let model = await savedWhen((m) => m.sketches.length === 1, 'the finished outline');
  const [sketch] = model.sketches;
  assert.equal(sketch.profile.type, 'path', 'a rounded outline is a path');
  assert.equal(sketch.profile.holes.length, 22, 'twenty-two cut-outs');
  const kinds = sketch.profile.holes.reduce((c, h) => ({ ...c, [h.type]: (c[h.type] || 0) + 1 }), {});
  assert.deepEqual(kinds, { circle: 4, path: 12, polygon: 6 });
  assert.deepEqual(sketch.entities.filter((e) => e.type === 'slot').map((e) => e.c)[0], [-50, -45]);
  measured.finished = { holes: sketch.profile.holes.length, kinds, entities: sketch.entities.length };
  await noErrorLine('after Finish');
  await shots('09-ready-to-cut');
  checks.push(
    'Finish → Draw: one outline ready to cut, 240 × 160 mm, 22 cut-outs (4 circles, 12 slots as paths, 6 hexagons as polygons)',
  );

  // 10. Cut from 1.2 mm SPCC and bend once along x = 90 (the shop's own steps): the kernel takes it.
  await readyList.getByRole('button', { name: `Cut ${sketch.name}`, exact: true }).click();
  const cut = properties.getByRole('region', { name: 'Cut from sheet' });
  await cut.getByLabel('Sheet stock', { exact: true }).selectOption('spcc');
  const custom = cut.getByLabel('Custom thickness (mm)', { exact: true });
  await custom.fill('1.2');
  await custom.press('Enter');
  await expect(cut.getByLabel('Blank size', { exact: true })).toContainText('Blank 240 × 160 mm');
  await cut.getByRole('button', { name: 'Cut on the laser', exact: true }).click();
  await expect(page.getByRole('figure', { name: 'Laser bed' })).toHaveAttribute('data-state', 'cut', {
    timeout: 30000,
  });
  await properties
    .getByRole('region', { name: 'Laser station' })
    .getByRole('button', { name: 'Leave laser', exact: true })
    .click();
  await page.waitForTimeout(300);
  await current();
  const form = properties.getByLabel('Sheet metal', { exact: true });
  await form.getByRole('group', { name: 'Bend line' }).getByRole('button', { name: 'Two points', exact: true }).click();
  for (const [label, value] of [
    ['A X (mm)', 90],
    ['A Y (mm)', -80],
    ['B X (mm)', 90],
    ['B Y (mm)', 80],
  ]) {
    const field = form.getByLabel(label, { exact: true });
    await field.fill(String(value));
    await field.press('Enter');
  }
  const add = form.getByRole('button', { name: 'Add bend', exact: true });
  await expect(add).toBeEnabled();
  await add.click();
  await page.waitForTimeout(300);
  await current();
  await expect(footer).not.toContainText('Rebuild failed');
  model = await savedWhen((m) => m.parts[0]?.features[0]?.bends?.length === 1, 'one bend');
  assert.equal(model.parts[0].features[0].thickness, 1.2);
  await expect(form.getByLabel('Flat blank', { exact: true })).toContainText('1 bend');
  measured.flatBlank = await form.getByLabel('Flat blank', { exact: true }).innerText();
  await noErrorLine('with the bend');
  await shots('10-bent');
  checks.push(`cut from 1.2 mm SPCC, one bend along x = 90 → "${measured.flatBlank}", no .cad-error`);

  // 11. The bar and its row: at most a sixth of the view at 1600 × 1000, a quarter at 1366 × 768.
  for (const [key, value] of Object.entries(measured).filter(([k, v]) => v && /-(1600|1366)$/.test(k))) {
    const limit = key.endsWith('1600') ? 1 / 6 : 1 / 4;
    assert.ok(
      value.share <= limit,
      `${key}: the bar and its row cover ${value.share} of the view (limit ${limit.toFixed(3)})`,
    );
    assert.ok(value.rowInside, `${key}: the row stands inside the view`);
  }
  checks.push('the bar and its row cover at most a sixth of the view at 1600 × 1000 and a quarter at 1366 × 768');

  await noErrorLine('at the end');
  if (errors.length) throw new Error(errors.join('\n'));
  checks.push('no page error; no .cad-error');
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ status: 'passed', errors, checks, measured }, null, 2),
  );
  console.log('Hand drawing HD-3 verification passed:\n- ' + checks.join('\n- '));
  console.log(JSON.stringify(measured, null, 2));
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` });
  console.error(errors, JSON.stringify(measured));
  throw error;
} finally {
  await browser.close();
}
