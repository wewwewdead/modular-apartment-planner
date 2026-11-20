/* global localStorage, process, console, document */
// Hand drawing HD-4 (docs/sketch-studio-hand-drawing.md §8.9), driven the way
// a user would from an empty workspace: Shop → Draw → Draw the outline; a
// 200 × 120 rectangle from (0, 0); Fillet R10 on two corners, Chamfer 8 on
// the other two ("closed profile"); a keyhole (a Ø12 circle at (50, 70), a 6
// wide slot down from its centre, four trims) → Check clean with one
// cut-out; the keyhole box-selected and copied by typed ΔX 100; a notch in
// the top edge made with three lines, one Extend and two Trims (one of them
// on the outline's own edge); a 60 × 30 rectangle offset outward by 5 and the
// original made construction; a slot turned 90° by Rotate with a typed angle;
// Check "nothing to fix"; the Sketching panel's Now block read for a tool, an
// action and a selection; Finish → ready to cut with four cut-outs; cut from
// 1.2 mm SPCC and bent once. The bar's rows counted (two at both sizes) and
// the bar with each options row measured (a sixth of the view at 1600 × 1000,
// a quarter at 1366 × 768). No page error, no .cad-error.
//   CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-hand-drawing-hd4.mjs
// Screenshots: artifacts/sketch-cad/hand-drawing-hd4 (or HD4_SHOTS), each state
// at 1600 × 1000 and 1366 × 768.
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { cadSteps } from './sketch-cad-steps.mjs';

const directory = process.env.HD4_SHOTS || 'artifacts/sketch-cad/hand-drawing-hd4';
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
const now = properties.getByRole('region', { name: 'Now', exact: true });
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
const hover = async (point) => {
  const [x, y] = await at(point);
  await onCanvas([x, y], `the point ${point}`);
  await page.mouse.move(x, y);
};
const clickAt = async (point) => {
  await hover(point);
  const [x, y] = await at(point);
  await page.mouse.click(x, y);
};
// A left drag the way a hand makes it: down, paced moves, up.
const dragBetween = async (from, to) => {
  const [[x0, y0], [x1, y1]] = await Promise.all([at(from), at(to)]);
  await onCanvas([x0, y0], `the drag's start ${from}`);
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(x0 + ((x1 - x0) * i) / 8, y0 + ((y1 - y0) * i) / 8);
    await page.waitForTimeout(30);
  }
  await page.mouse.up();
};
const setBox = async (label, value) => {
  const box = page.getByLabel(label, { exact: true });
  await box.fill(String(value));
  await box.press('Enter');
};
const readout = (name) => page.getByLabel(`${name} readout`, { exact: true });
// How much of the view the bar and its row cover, and the bar's rows (§8.6: two at both sizes).
const coverage = () =>
  page.evaluate(() => {
    const view = document.querySelector('.cad-viewport').getBoundingClientRect();
    const top = document.querySelector('.cad-sketch-top').getBoundingClientRect();
    const bar = document.querySelector('.cad-sketch-toolbar');
    const rows = [...document.querySelectorAll('.cad-sketch-options')].map((r) => r.getBoundingClientRect());
    // A bar row is a run of its pieces whose middles lie within 8 px of each other.
    const middles = [...bar.querySelectorAll(':scope > *')]
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.height > 0)
      .map((r) => r.top + r.height / 2)
      .sort((a, b) => a - b);
    const barRows = middles.reduce((n, m, i) => (i && m - middles[i - 1] > 8 ? n + 1 : n), middles.length ? 1 : 0);
    const panel = document.querySelector('.cad-properties');
    return {
      view: Math.round(view.height),
      bar: Math.round(bar.getBoundingClientRect().height),
      barRows,
      row: rows.length ? Math.round(rows.at(-1).height) : 0,
      covered: Math.round(top.bottom - view.top),
      share: Number(((top.bottom - view.top) / view.height).toFixed(3)),
      rowInside: rows.every((r) => r.right <= view.right + 0.5 && r.left >= view.left - 0.5),
      panelScrolls: panel ? panel.scrollHeight > panel.clientHeight + 1 : null,
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
const measureOnly = async (measure) => {
  measured[`${measure}-1600`] = await coverage();
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.waitForTimeout(300);
  measured[`${measure}-1366`] = await coverage();
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.waitForTimeout(300);
};
const lookAt = async () => {
  await tool('Look at');
  await page.waitForTimeout(500);
};
// The point brought to the view's middle (a right drag pans), then the wheel a few clicks in:
// the small previews read in the pictures.
const zoomAt = async (point, clicks = 5) => {
  const [x, y] = await at(point);
  const box = await page.locator('.cad-viewport canvas').boundingBox();
  const [cx, cy] = [box.x + box.width / 2, box.y + box.height / 2];
  await page.mouse.move(x, y);
  await page.mouse.down({ button: 'right' });
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(x + ((cx - x) * i) / 8, y + ((cy - y) * i) / 8);
    await page.waitForTimeout(30);
  }
  await page.mouse.up({ button: 'right' });
  await page.mouse.move(cx, cy);
  for (let i = 0; i < clicks; i++) {
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(300);
};
const items = async () => Number((await status.innerText()).match(/(\d+) items?/)[1]);

try {
  await page.goto(process.env.CAD_VERIFY_URL || 'http://localhost:5180/sketch');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '3D Model & workshop', exact: true }).click();
  await modelCurrent();

  // 1. Shop → Draw → Draw the outline: the Edit group between Draw and Mark; the bar two rows.
  await shopStation('Draw');
  await draw.getByRole('button', { name: /^Draw the outline/ }).click();
  await toolbar.waitFor();
  const groups = await toolbar.getByRole('group').evaluateAll((list) => list.map((g) => g.getAttribute('aria-label')));
  assert.deepEqual(groups, ['Draw', 'Edit', 'Mark', 'History']);
  const edit = toolbar.getByRole('group', { name: 'Edit', exact: true });
  assert.deepEqual(await edit.getByRole('button').allTextContents(), ['Trim', 'Extend', 'Fillet', 'Chamfer', 'Offset']);
  // Shorter words on screen, the names whole (§8.6).
  await expect(button('Undo last')).toHaveText('Undo');
  await expect(button('Finish sketch')).toHaveText('Finish');
  await expect(button('Cancel sketch')).toHaveText('Cancel');
  await expect(now).toContainText('Now · Nothing in hand');
  await shots('01-bar-edit-group', 'bar');
  checks.push(
    'the bar: groups Draw, Edit, Mark, History; Edit is Trim, Extend, Fillet, Chamfer, Offset; Undo, Finish, Cancel shown short and found by their names',
  );

  // The other tools' rows, measured with the bar.
  for (const [key, name] of [
    ['b', 'relief-row'],
    ['z', 'zero-row'],
    ['p', 'polygon-row'],
  ]) {
    await page.keyboard.press(key);
    await measureOnly(name);
    await page.keyboard.press('Escape');
  }

  // 2. A 200 × 120 rectangle from (0, 0).
  await tool('Rectangle');
  await measureOnly('rectangle-row');
  await typeIn({ x: 0, y: 0 });
  await typeIn({ width: 200, height: 120 });
  await page.keyboard.press('Escape');
  await expect(status).toContainText('1 item · closed profile');
  await lookAt();

  // 3. Fillet R10 on the lower corners, Chamfer 8 on the upper ones: still a closed profile.
  await page.keyboard.press('f');
  await expect(page.getByRole('group', { name: 'Fillet options', exact: true })).toBeVisible();
  await setBox('Fillet radius (mm)', 10);
  // The lower right corner for the picture (the lower left one lies on the sketch's axes).
  await zoomAt([200, 0]);
  await hover([199.6, 0.3]);
  await expect(readout('Fillet')).toHaveText('Fillet R10click to round · Esc ends the tool');
  await expect(page.getByRole('group', { name: 'Fillet options', exact: true })).toContainText(
    'A rectangle’s own Corner radius rounds all four corners at once.',
  );
  let drawn = await overlay();
  assert.equal(drawn.cut, 2, 'the two cut-back runs red');
  assert.equal(drawn.cutColor, '#d22f27');
  assert.equal(drawn.preview, 1, 'the arc previewed');
  await expect(now).toContainText('Now · Fillet (F)');
  await shots('02-fillet-preview', 'fillet-row', true);
  await lookAt();
  await clickAt([0.4, 0.3]);
  await clickAt([200, 0]);
  await page.keyboard.press('h');
  await setBox('Chamfer distance (mm)', 8);
  await measureOnly('chamfer-row');
  await clickAt([200, 120]);
  await clickAt([0, 120]);
  await page.keyboard.press('Escape');
  await expect(status).toContainText('8 items · closed profile');
  checks.push(
    'a 200 × 120 rectangle; F, Radius 10, two lower corners; H, Distance 8, two upper → "8 items · closed profile"',
  );

  // 4. A keyhole: a Ø12 circle at (50, 70), a 6 wide slot from its centre down, four trims.
  await tool('Circle');
  await typeIn({ x: 50, y: 70 });
  await typeIn({ diameter: 12 });
  await page.keyboard.press('Escape');
  await page.keyboard.press('s');
  await setBox('Slot width (mm)', 6);
  await page.getByLabel('Slot first click', { exact: true }).selectOption('end');
  await typeIn({ x: 50, y: 70 });
  await typeIn({ length: 30, angle: -90 });
  await page.keyboard.press('Escape');
  await expect(status).toContainText('10 items');
  await page.keyboard.press('t');
  await expect(now).toContainText('Now · Trim (T)');
  measured.nowTool = await now.innerText();
  await zoomAt([50, 64], 8);
  await hover([50, 64]);
  await expect(readout('Trim')).toContainText('click to trim · Esc ends the tool');
  drawn = await overlay();
  assert.equal(drawn.cut, 1, 'the circle’s span between the slot’s sides red');
  await shots('03-trim-preview', 'trim', true);
  for (const point of [
    [50, 64],
    [50, 73],
    [53, 67],
    [47, 67],
  ])
    await clickAt(point);
  await page.keyboard.press('Escape');
  await lookAt();
  await tool('Check');
  await expect(checkPanel).toContainText('Nothing to fix: a closed outline with 1 cut-out.');
  await shots('04-keyhole-check');
  await tool('Check');
  checks.push(
    'a keyhole: a Ø12 circle at (50, 70), a 6 wide slot down from its centre (one end first), T and four trims → Check "a closed outline with 1 cut-out"',
  );

  // 5. The keyhole box-selected and copied by a typed ΔX 100.
  await dragBetween([40, 38], [62, 80]);
  await expect(row.getByRole('note')).toHaveText('4 selected: 2 arcs, 2 lines · Delete removes them');
  await expect(now).toContainText('Now · 4 selected');
  measured.nowSelection = await now.innerText();
  await page.keyboard.press('k');
  await expect(now).toContainText('Now · Copy (K)');
  measured.nowAction = await now.innerText();
  await shots('05-copy-now', 'copy-row', true);
  await typeIn({ ΔX: 100, ΔY: 0 });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await tool('Check');
  await expect(checkPanel).toContainText('Nothing to fix: a closed outline with 2 cut-outs.');
  await tool('Check');
  checks.push(
    'the keyhole box-selected (4 pieces: Now "4 selected"), K (Now "Copy (K)"), ΔX 100 → two keyholes, Check clean',
  );

  // 6. A notch in the top edge: three lines, one Extend, two Trims (one on the outline's own edge).
  await tool('Line');
  await typeIn({ x: 90, y: 125 });
  await typeIn({ x: 90, y: 105 });
  await typeIn({ x: 110, y: 105 });
  await typeIn({ x: 110, y: 112 });
  await page.keyboard.press('Escape');
  await page.keyboard.press('e');
  await hover([110, 111.5]);
  await expect(readout('Extend')).toHaveText('click to extend 8 mmEsc ends the tool');
  await clickAt([110, 111.5]);
  await page.keyboard.press('t');
  await clickAt([90, 123]);
  await hover([100, 120]);
  await expect(readout('Trim')).toHaveText('Trim 20 mmclick to trim · Esc ends the tool');
  await shots('06-notch-trim', null, true);
  await clickAt([100, 120]);
  await page.keyboard.press('Escape');
  await expect(status).toContainText('closed profile');
  await tool('Check');
  await expect(checkPanel).toContainText('Nothing to fix: a closed outline with 2 cut-outs.');
  await tool('Check');
  checks.push(
    'a notch: lines (90, 125) → (90, 105) → (110, 105) → (110, 112); E extends the last 8 mm to the top edge; T trims the stub and the edge between them → closed',
  );

  // 7. A 60 × 30 rectangle offset outward by 5; the original made construction.
  await tool('Rectangle');
  await typeIn({ x: 65, y: 60 });
  await typeIn({ width: 60, height: 30 });
  await page.keyboard.press('Escape');
  await page.keyboard.press('o');
  await expect(page.getByLabel('Offset distance (mm)', { exact: true })).toHaveValue('5');
  await clickAt([95, 90]);
  await expect(page.getByRole('group', { name: 'Offset options', exact: true })).toContainText(
    'Rectangle 60 × 30 at (65, 60) chosen',
  );
  await hover([95, 93]);
  await expect(readout('Offset')).toHaveText('Offset 5 mm outwardclick to place the copy · Esc lets go of it');
  await shots('07-offset-preview', 'offset-row', true);
  await clickAt([95, 93]);
  await page.keyboard.press('Escape');
  await clickAt([95, 90]);
  await expect(row.getByRole('note')).toHaveText('Rectangle 60 × 30 at (65, 60) · Delete removes it');
  await measureOnly('selection-row');
  await page.keyboard.press('x');
  await page.keyboard.press('Escape');
  await expect(status).toContainText('1 construction');
  checks.push(
    'a 60 × 30 rectangle at (65, 60); O, Distance 5, the rectangle, then outside → the copy; the original made construction (X)',
  );

  // 8. A slot turned 90° by Rotate with a typed angle.
  await page.keyboard.press('s');
  await setBox('Slot width (mm)', 5);
  await page.getByLabel('Slot first click', { exact: true }).selectOption('center');
  await measureOnly('slot-row');
  await typeIn({ x: 170, y: 25 });
  await typeIn({ length: 22, angle: 0 });
  await page.keyboard.press('Escape');
  await clickAt([170, 27.5]);
  await expect(row.getByRole('note')).toHaveText('Slot 22 × 5 at (170, 25) · Delete removes it');
  await page.keyboard.press('q');
  await expect(now).toContainText('Now · Rotate (Q)');
  await typeIn({ x: 170, y: 25 });
  await typeIn({ angle: 90 });
  await expect(row.getByLabel('Selected Angle (°)', { exact: true })).toHaveValue('90');
  await page.keyboard.press('g');
  await row.getByLabel('Pattern kind', { exact: true }).selectOption('grid');
  await measureOnly('pattern-row');
  await page.keyboard.press('Escape');
  await page.keyboard.press('i');
  await measureOnly('mirror-row');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  checks.push('a 22 × 5 slot at (170, 25); Q, centre (170, 25) typed, Angle 90 typed → the slot’s Angle reads 90');

  // 9. Check: nothing to fix, four cut-outs (two keyholes, the offset rectangle, the slot).
  await lookAt();
  await tool('Check');
  await expect(checkPanel).toContainText('Check · nothing to fix');
  await expect(checkPanel).toContainText('Nothing to fix: a closed outline with 4 cut-outs.');
  await shots('08-check', 'check');
  await tool('Check');
  measured.items = await items();
  // The panel's three sections closed, then Keys opened for its picture.
  await properties.locator('summary', { hasText: 'Keys' }).click();
  await expect(properties.getByText('Ctrl+Y · Ctrl+Shift+Z', { exact: true })).toBeVisible();
  await shots('09-panel-keys');
  await properties.locator('summary', { hasText: 'Keys' }).click();
  checks.push(
    'Check → "Nothing to fix: a closed outline with 4 cut-outs."; the Keys section lists the sketcher’s keys',
  );

  // 10. Finish → ready to cut with four cut-outs.
  await tool('Finish sketch');
  await expect(toolbar).toHaveCount(0);
  await expect(readyList.getByRole('listitem')).toHaveCount(1);
  await expect(readyList.getByRole('listitem')).toContainText('200 × 120 mm');
  let model = await savedWhen((m) => m.sketches.length === 1, 'the finished outline');
  const [sketch] = model.sketches;
  assert.equal(sketch.profile.type, 'path', 'a filleted, chamfered, notched outline is a path');
  assert.equal(sketch.profile.holes.length, 4, 'four cut-outs');
  const kinds = sketch.profile.holes.reduce((c, h) => ({ ...c, [h.type]: (c[h.type] || 0) + 1 }), {});
  assert.deepEqual(kinds, { path: 3, rectangle: 1 });
  measured.finished = {
    holes: sketch.profile.holes.length,
    kinds,
    entities: sketch.entities.length,
    segments: sketch.profile.segments.length,
  };
  await noErrorLine('after Finish');
  await shots('10-ready-to-cut');
  checks.push('Finish → Draw: one outline ready to cut, 200 × 120 mm, 4 cut-outs (3 paths, 1 rectangle)');

  // 11. Cut from 1.2 mm SPCC and bend once along x = 25 (the shop's own steps): the kernel takes it.
  await readyList.getByRole('button', { name: `Cut ${sketch.name}`, exact: true }).click();
  const cut = properties.getByRole('region', { name: 'Cut from sheet' });
  await cut.getByLabel('Sheet stock', { exact: true }).selectOption('spcc');
  const custom = cut.getByLabel('Custom thickness (mm)', { exact: true });
  await custom.fill('1.2');
  await custom.press('Enter');
  await expect(cut.getByLabel('Blank size', { exact: true })).toContainText('Blank 200 × 120 mm');
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
    ['A X (mm)', 25],
    ['A Y (mm)', 0],
    ['B X (mm)', 25],
    ['B Y (mm)', 120],
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
  await shots('11-bent');
  checks.push(`cut from 1.2 mm SPCC, one bend along x = 25 → "${measured.flatBlank}", no .cad-error`);

  // 12. The bar two rows at both sizes; with each row at most a sixth (1600 × 1000) and a quarter (1366 × 768).
  for (const [key, value] of Object.entries(measured).filter(([k, v]) => v && /-(1600|1366)$/.test(k))) {
    const limit = key.endsWith('1600') ? 1 / 6 : 1 / 4;
    assert.equal(value.barRows, 2, `${key}: the bar is two rows (${value.barRows})`);
    assert.ok(
      value.share <= limit,
      `${key}: the bar and its row cover ${value.share} of the view (limit ${limit.toFixed(3)})`,
    );
    assert.ok(value.rowInside, `${key}: the row stands inside the view`);
  }
  assert.equal(measured['bar-1366'].panelScrolls, false, 'the Sketching panel does not scroll at 1366 × 768');
  checks.push(
    'the bar two rows at both sizes; with each row (Relief, Zero, Polygon, Rectangle, Fillet, Chamfer, Trim, Copy, Offset, a selection, Slot, Pattern, Mirror, Check) at most a sixth / a quarter; the panel does not scroll at 1366 × 768',
  );

  await noErrorLine('at the end');
  if (errors.length) throw new Error(errors.join('\n'));
  checks.push('no page error; no .cad-error');
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ status: 'passed', errors, checks, measured }, null, 2),
  );
  console.log('Hand drawing HD-4 verification passed:\n- ' + checks.join('\n- '));
  console.log(JSON.stringify(measured, null, 2));
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` });
  console.error(errors, JSON.stringify(measured));
  throw error;
} finally {
  await browser.close();
}
