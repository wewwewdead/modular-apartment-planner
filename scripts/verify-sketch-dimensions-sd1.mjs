/* global localStorage, process, console, document */
// Sketch dimensions SD-1 (docs/sketch-studio-sketch-dimensions.md §5.2), driven
// the way a user would from an empty workspace: a 300 × 200 plate with a Ø20
// hole typed on the Top plane → Dimension the hole centre to the left side
// (read square to it: 50), the hole (Ø20), the top side (300) → two opposite
// corners only measured (360.56, Esc keeps nothing) → a fourth added, selected
// by its label, deleted → Finish lists "Dimensions · 3" → Edit brings them
// back → deleting the hole takes its two → extruded, the Tree's ↳ Edit sketch
// still shows the 300 → Draw's two outlines each keep their own dimension. No
// page error, no .cad-error.
//   CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-sketch-dimensions-sd1.mjs
// Screenshots: artifacts/sketch-cad/sketch-dimensions-sd1 (or SD1_SHOTS), each
// state at 1600 × 1000 and at 1366 × 768.
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { cadSteps } from './sketch-cad-steps.mjs';

const directory = process.env.SD1_SHOTS || 'artifacts/sketch-cad/sketch-dimensions-sd1';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [],
  checks = [],
  measured = {};
page.on('pageerror', (e) => errors.push(e.message));
const { properties, savedWhen, typeHud, toolbar, status, sketchOnPlane, applyOperation, shopStation, project } =
  cadSteps(page);
const footer = page.locator('.cad-status');
const readout = page.getByLabel('Dimension readout', { exact: true });
const selection = page.locator('.cad-sketch-selection');
const draw = properties.getByRole('region', { name: 'Draw' });
const readyList = draw.getByRole('list', { name: 'Outlines ready to cut' });
const modelCurrent = () => expect(footer).toContainText('Model current', { timeout: 60000 });
const noErrorLine = async (where) =>
  assert.equal(await page.locator('.cad-error').count(), 0, `no error line ${where}`);
// The labels the viewport shows (client px), and their texts.
const labels = () => page.evaluate(() => document.querySelector('.cad-viewport').cadSketchDimensions());
const texts = async () => (await labels()).map((l) => l.text);
// Screen position of a sketch-plane point on the Top plane (world XY, z 0).
const at = async ([u, v]) => project([u, v, 0]);
const click = async (point) => {
  const [x, y] = await at(point);
  await page.mouse.click(x, y);
};
const hover = async (point) => {
  const [x, y] = await at(point);
  await page.mouse.move(x, y);
};
// Every label sits on its dimension line's middle (`spots`: label text →
// plane point), is shown, and stays clear of the sketch toolbar and status line.
const labelsInPlace = async (spots, where) => {
  const shown = await labels();
  const boxes = await page.evaluate(() => ({
    chips: [...document.querySelectorAll('.cad-sketch-dim-label')].map((n) => n.getBoundingClientRect().toJSON()),
    chrome: [
      document.querySelector('.cad-sketch-toolbar'),
      ...document.querySelectorAll('.cad-sketch-status > span'),
    ]
      .filter(Boolean)
      .map((n) => n.getBoundingClientRect().toJSON()),
  }));
  for (const label of shown) {
    assert.equal(label.hidden, false, `label ${label.text} shown ${where}`);
    const expected = spots[label.text];
    if (!expected) continue;
    const [x, y] = await at(expected);
    assert(Math.hypot(label.x - x, label.y - y) < 1.5, `label ${label.text} on its line ${where}`);
  }
  const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  for (const chip of boxes.chips)
    for (const part of boxes.chrome) assert(!overlaps(chip, part), `a label clear of the sketch bar ${where}`);
  return shown.length;
};
// The shot at 1600 × 1000, then the same state at 1366 × 768 (labels checked at
// both). `pointer`: leave the pointer where it is (the readout stays shown).
const shots = async (name, spots = {}, { pointer = false } = {}) => {
  if (!pointer) await page.mouse.move(5, 600);
  await page.waitForTimeout(250);
  await labelsInPlace(spots, `${name} at 1600`);
  await page.screenshot({ path: `${directory}/${name}-1600.png` });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.waitForTimeout(350);
  await labelsInPlace(spots, `${name} at 1366`);
  await page.screenshot({ path: `${directory}/${name}-1366.png` });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.waitForTimeout(350);
};
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
const finish = () => tool('Finish sketch');
// Where each label sits: the middle of its dimension line (the radial one: its click).
const SPOTS = { 50: [25, 20], Ø20: [85, 85], 300: [150, 230], 200: [330, 100] };
// A point on the hole's body (Ø20 at (50, 50)) clear of its quadrants and of the dimensions.
const holeBody = (degrees) => [50 + 10 * Math.cos((degrees * Math.PI) / 180), 50 + 10 * Math.sin((degrees * Math.PI) / 180)];

try {
  await page.goto(process.env.CAD_VERIFY_URL || 'http://localhost:5180/sketch');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '3D Model & workshop', exact: true }).click();
  await modelCurrent();

  // 1. New sketch on the Top plane: a 300 × 200 rectangle at the origin and a Ø20 circle at (50, 50), typed.
  await page.mouse.move(5, 600);
  await sketchOnPlane('XY');
  await rectangle(0, 0, 300, 200);
  await circle(50, 50, 10);
  await expect(status).toContainText('2 items · closed profile');
  await expect(toolbar.getByRole('button', { name: 'Dimension', exact: true })).toBeVisible();
  checks.push('Top plane: 300 × 200 rectangle and Ø20 circle typed → "2 items · closed profile", a Dimension button');

  // 2. Dimension: the hole centre, then the body of the left side → 50 (square to it) → lower left → "50".
  await tool('Dimension');
  await expect(toolbar.getByRole('button', { name: 'Dimension', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(status).toContainText('Click a point, or a line, circle or arc to dimension it.');
  await click([50, 50]);
  await expect(status).toContainText('Click the second point · an edge reads square to it');
  await hover([0, 130]);
  await expect(readout).toHaveText('50 mm · ΔX -50 · ΔY 0');
  measured.holeToEdgeHover = await readout.innerText();
  await click([0, 130]);
  await expect(readout).toContainText('Horizontal 50 mm');
  await hover([25, 20]);
  await expect(readout).toContainText('Horizontal 50 mm');
  await expect(readout).toContainText('click to keep · Esc drops it');
  await click([25, 20]);
  await expect.poll(texts).toEqual(['50']);
  await expect(status).toContainText('2 items · closed profile · 1 dimension');
  await shots('01-hole-to-edge', SPOTS);
  checks.push(
    `hole centre → body of the left side: readout "${measured.holeToEdgeHover}" (square to the edge) → click lower left → label "50"`,
  );

  // 3. The hole's body → "Ø20" → click outside it → the label.
  await hover(holeBody(45));
  await expect(readout).toHaveText('Ø20');
  await click(holeBody(45));
  await expect(status).toContainText('Click where the label goes · Esc drops it.');
  await click([85, 85]);
  await expect.poll(texts).toEqual(['50', 'Ø20']);
  checks.push('the hole\'s body → readout "Ø20" → click outside → label "Ø20"');

  // 4. The body of the top side → 300 → click above → "300".
  await hover([200, 200]);
  await expect(readout).toHaveText('Side 300 mm');
  await click([200, 200]);
  await hover([200, 230]);
  await expect(readout).toContainText('Horizontal 300 mm');
  await click([200, 230]);
  await expect.poll(texts).toEqual(['50', 'Ø20', '300']);
  await shots('02-three-dimensions', SPOTS);
  checks.push('the body of the top side → "Side 300 mm" → click above → label "300"');

  // 5. Two opposite corners → 360.56 → Esc → still three.
  await click([0, 0]);
  await hover([300, 200]);
  await expect(readout).toHaveText('360.56 mm · ΔX 300 · ΔY 200');
  await click([300, 200]);
  await hover([380, 260]);
  await expect(readout).toContainText('Aligned 360.56 mm');
  measured.diagonal = await readout.innerText();
  await shots('03-measuring-diagonal', SPOTS, { pointer: true });
  await page.keyboard.press('Escape');
  await expect(readout).toHaveCount(0);
  await expect.poll(texts).toEqual(['50', 'Ø20', '300']);
  await expect(status).toContainText('3 dimensions');
  await expect(toolbar.getByRole('button', { name: 'Dimension', exact: true })).toHaveAttribute('aria-pressed', 'true');
  checks.push(`two opposite corners → "${measured.diagonal.replace(/\n/g, ' ')}" → Esc → still 3 dimensions, the tool on`);

  // 6. A fourth (the right side, "200"), selected by its label, Delete → three.
  await click([300, 60]);
  await click([330, 60]);
  await expect.poll(texts).toEqual(['50', 'Ø20', '300', '200']);
  await shots('04-four-dimensions', SPOTS);
  await page.keyboard.press('Escape');
  await expect(toolbar.getByRole('button', { name: 'Dimension', exact: true })).toHaveAttribute('aria-pressed', 'false');
  const fourth = (await labels()).find((l) => l.text === '200');
  await page.mouse.click(fourth.x + 4, fourth.y);
  await expect(selection).toHaveText('Vertical 200 mm · Delete removes it');
  assert.equal((await labels()).find((l) => l.text === '200').selected, true, 'the 200 is selected');
  // The note sits under the sketch bar, which wraps to two rows here.
  for (const size of [null, { width: 1366, height: 768 }]) {
    if (size) await page.setViewportSize(size);
    const [bar, note] = await Promise.all([toolbar.boundingBox(), selection.boundingBox()]);
    assert(note.y >= bar.y + bar.height, `the selection note clear of the sketch bar at ${size?.width || 1600}`);
  }
  await page.setViewportSize({ width: 1600, height: 1000 });
  await shots('05-selected-by-label', SPOTS);
  await page.keyboard.press('Delete');
  await expect.poll(texts).toEqual(['50', 'Ø20', '300']);
  await expect(selection).toHaveCount(0);
  // D brings the tool back, D again puts it away.
  await page.keyboard.press('d');
  await expect(toolbar.getByRole('button', { name: 'Dimension', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('d');
  await expect(toolbar.getByRole('button', { name: 'Dimension', exact: true })).toHaveAttribute('aria-pressed', 'false');
  checks.push('the right side → label "200"; Esc ends the tool; a click on its label selects it ("Vertical 200 mm · Delete removes it"); Delete → 3; D toggles the tool');

  // 7. Finish sketch → the panel lists "Dimensions · 3".
  await finish();
  await expect(properties.getByText('Dimensions · 3', { exact: true })).toBeVisible();
  let model = await savedWhen((m) => m.sketches[0]?.dimensions?.length === 3, 'three dimensions saved');
  assert.deepEqual(
    model.sketches[0].dimensions.map((d) => [d.id, d.type, d.orientation || d.mode]),
    [
      ['d1', 'linear', 'horizontal'],
      ['d2', 'radial', 'diameter'],
      ['d3', 'linear', 'horizontal'],
    ],
  );
  assert.deepEqual(model.sketches[0].dimensions[0], {
    id: 'd1',
    type: 'linear',
    from: [50, 50],
    to: [0, 50],
    orientation: 'horizontal',
    offset: -30,
  });
  assert.equal(model.sketches[0].entities.length, 2, 'dimensions never join the entities');
  await shots('06-finished-panel');
  checks.push('Finish → the panel lists "Dimensions · 3"; saved: d1 50 (50,50)→(0,50) horizontal, d2 Ø20, d3 300; 2 entities');

  // 8. Edit sketch → three labels, the same texts.
  await properties.getByRole('button', { name: 'Edit sketch', exact: true }).click();
  await toolbar.waitFor();
  await expect.poll(texts).toEqual(['50', 'Ø20', '300']);
  await expect(status).toContainText('2 items · closed profile · 3 dimensions');
  await shots('07-reopened', SPOTS);
  checks.push('Edit sketch → the three labels "50", "Ø20", "300" back');

  // 9. The circle selected, Delete → "50" and "Ø20" go, "300" stays → Finish → "Dimensions · 1".
  await page.mouse.move(5, 600);
  await click(holeBody(135));
  await expect(selection).toHaveText('Circle Ø20 at (50, 50) · Delete removes it');
  await page.keyboard.press('Delete');
  await expect.poll(texts).toEqual(['300']);
  await expect(status).toContainText('1 item · closed profile · 1 dimension');
  await shots('08-hole-deleted', SPOTS);
  await finish();
  await expect(properties.getByText('Dimensions · 1', { exact: true })).toBeVisible();
  model = await savedWhen((m) => m.sketches[0]?.dimensions?.length === 1, 'one dimension saved');
  assert.equal(model.sketches[0].dimensions[0].id, 'd3');
  checks.push('the circle selected, Delete → "50" and "Ø20" go with it, "300" stays → Finish → "Dimensions · 1"');

  // 10. Extrude to a new part, then the Tree's ↳ Edit sketch → the "300" is there.
  await properties.getByRole('button', { name: 'Extrude', exact: true }).click();
  await applyOperation('Apply extrude', { name: 'Plate', distance: 3 });
  model = await savedWhen((m) => m.parts.length === 1, 'the extruded part');
  assert.equal(model.sketches[0].dimensions.length, 1, 'the extruded sketch keeps its dimension');
  await page.locator('.cad-tree-item', { hasText: 'Plate' }).first().click();
  await page.getByRole('button', { name: 'Edit sketch of feature 1', exact: true }).click();
  await toolbar.waitFor();
  await expect.poll(texts).toEqual(['300']);
  await shots('09-tree-edit-sketch', SPOTS);
  await tool('Cancel sketch');
  await expect(toolbar).toHaveCount(0);
  await modelCurrent();
  checks.push('Extrude → Plate; the Tree\'s "↳ Edit sketch" → the "300" is there; Cancel');

  // 11. Shop → Draw the outline: two rectangles side by side, one dimension on each → two outlines, each its own.
  await shopStation('Draw');
  await page.mouse.move(5, 600);
  await draw.getByRole('button', { name: /^Draw the outline/ }).click();
  await toolbar.waitFor();
  await rectangle(400, 0, 200, 100);
  await rectangle(660, 0, 200, 100);
  await tool('Dimension');
  await click([450, 100]);
  await click([450, 130]);
  await click([860, 30]);
  await click([890, 30]);
  await expect.poll(texts).toEqual(['200', '100']);
  await expect(status).toContainText('2 items · closed profile · 2 dimensions');
  await shots('10-two-outlines', { 200: [500, 130], 100: [890, 50] });
  await page.keyboard.press('Escape');
  await finish();
  await expect(readyList.getByRole('listitem')).toHaveCount(2);
  model = await savedWhen((m) => m.sketches.length === 3, 'the split');
  const [, first, second] = model.sketches;
  assert.deepEqual(
    [first.dimensions, second.dimensions],
    [
      [{ id: 'd1', type: 'linear', from: [600, 100], to: [400, 100], orientation: 'horizontal', offset: 30 }],
      [{ id: 'd2', type: 'linear', from: [860, 0], to: [860, 100], orientation: 'vertical', offset: 30 }],
    ],
  );
  await readyList.getByRole('button', { name: `Edit ${second.name}`, exact: true }).click();
  await toolbar.waitFor();
  await expect.poll(texts).toEqual(['100']);
  await tool('Cancel sketch');
  await readyList.getByRole('button', { name: `Edit ${first.name}`, exact: true }).click();
  await toolbar.waitFor();
  await expect.poll(texts).toEqual(['200']);
  await shots('11-outline-reopened', { 200: [500, 130] });
  await tool('Cancel sketch');
  await expect(toolbar).toHaveCount(0);
  checks.push(
    `Draw: two rectangles, one dimension on each → "${first.name}" keeps the 200, "${second.name}" the 100; Edit each shows its own`,
  );

  // 12. No page error, no .cad-error.
  await noErrorLine('at the end');
  if (errors.length) throw new Error(errors.join('\n'));
  checks.push('no page error; no .cad-error');
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ status: 'passed', errors, checks, measured }, null, 2),
  );
  console.log('Sketch dimensions SD-1 verification passed:\n- ' + checks.join('\n- '));
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` });
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}
