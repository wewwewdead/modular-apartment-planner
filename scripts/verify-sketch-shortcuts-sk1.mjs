/* global localStorage, process, console */
// Sketch keys SK-1 (docs/sketch-studio-sketch-shortcuts.md §4), driven from
// the keyboard the way a user would, from an empty workspace: a first sketch,
// a rectangle with R and typed sizes, finished (one model step) → a second
// sketch: R rectangle, C circle (from the empty HUD field), A arc, L line,
// "12" then C stays typed in the field, Ctrl+Z twice takes the line and the
// arc back and leaves the model, Shift+R toggles Center rectangle, D for a
// dimension, L for a cross, B for a relief on its corner, Esc, Finish → Ctrl+Z
// out of the sketch undoes the model as before. No page error, no .cad-error.
//   CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-sketch-shortcuts-sk1.mjs
// Screenshots: artifacts/sketch-cad/sketch-shortcuts-sk1 (or SK1_SHOTS).
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { cadSteps } from './sketch-cad-steps.mjs';

const directory = process.env.SK1_SHOTS || 'artifacts/sketch-cad/sketch-shortcuts-sk1';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [],
  checks = [];
page.on('pageerror', (e) => errors.push(e.message));
const { saved, savedWhen, typeHud, toolbar, status, sketchOnPlane, project } = cadSteps(page);
const footer = page.locator('.cad-status');
const modelCurrent = () => expect(footer).toContainText('Model current', { timeout: 60000 });
const noErrorLine = async (where) =>
  assert.equal(await page.locator('.cad-error').count(), 0, `no error line ${where}`);
const button = (name) => toolbar.getByRole('button', { name, exact: true });
const pressed = (name) => expect(button(name)).toHaveAttribute('aria-pressed', 'true');
const released = (name) => expect(button(name)).toHaveAttribute('aria-pressed', 'false');
const field = (name) => page.getByLabel(`Sketch ${name}`, { exact: true });
// Typed once the step's first field has the focus (the HUD moves it there after each step).
const typeAt = async (name, ...values) => {
  await expect(field(name)).toBeFocused();
  await typeHud(...values);
};
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
const shot = async (name) => {
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${directory}/${name}.png` });
};
// The cross blank of verify-bend-relief-br1 (base 200 × 100, flaps 20), as length and angle.
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
const CROSS_X = 500;
// The saved copy settles shortly after an edit: wait, then read it.
const settled = async () => {
  await page.waitForTimeout(800);
  return saved();
};

try {
  await page.goto(process.env.CAD_VERIFY_URL || 'http://localhost:5180/sketch');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '3D Model & workshop', exact: true }).click();
  await modelCurrent();

  // 1. The bar says each key.
  await page.mouse.move(5, 600);
  await sketchOnPlane('XY');
  for (const [name, key] of [
    ['Line', 'L'],
    ['Rectangle', 'R'],
    ['Center rectangle', 'Shift+R'],
    ['Circle', 'C'],
    ['3-point arc', 'A'],
    ['Dimension', 'D'],
    ['Relief', 'B'],
    ['Undo last', 'Ctrl+Z'],
  ])
    await expect(button(name)).toHaveAttribute('title', `${name} (${key})`);
  checks.push('the bar buttons say their keys: "Line (L)" … "Relief (B)", "Undo last (Ctrl+Z)"');

  // 2. A first sketch: R, a typed 100 × 60 rectangle, Finish → one model step.
  await page.keyboard.press('r');
  await pressed('Rectangle');
  await typeAt('x', 0, 0);
  await typeAt('width', 100, 60);
  await expect(status).toContainText('1 item · closed profile');
  await page.keyboard.press('Escape');
  await button('Finish sketch').click();
  await expect(toolbar).toHaveCount(0);
  await savedWhen((m) => m.sketches.length === 1, 'the first sketch');
  checks.push('R → Rectangle, typed 0, 0 then 100 × 60 → Finish: one sketch in the model');

  // 3. A second sketch: R rectangle, then C from its empty HUD field → circle.
  await sketchOnPlane('XY');
  await page.keyboard.press('r');
  await typeAt('x', 0, 0);
  await typeAt('width', 300, 200);
  await expect(field('x')).toBeFocused();
  await page.keyboard.press('c');
  await pressed('Circle');
  await released('Rectangle');
  await expect(field('x')).toHaveValue('');
  await typeAt('x', 150, 100);
  await typeAt('radius', 20);
  await expect(status).toContainText('2 items · closed profile');
  checks.push('R: 300 × 200 typed; C from the empty HUD field → Circle (nothing typed) → Ø40 at (150, 100): 2 items');

  // 4. A arc, L line; letters after typed digits stay in the field.
  await page.keyboard.press('a');
  await pressed('3-point arc');
  await typeAt('x', 320, 0);
  await typeAt('x', 420, 0);
  await typeAt('x', 370, 30);
  await expect(status).toContainText('3 items');
  await page.keyboard.press('l');
  await pressed('Line');
  await page.keyboard.type('12c');
  await expect(field('x')).toHaveValue('12c');
  await pressed('Line');
  for (let i = 0; i < 3; i++) await page.keyboard.press('Backspace');
  await expect(field('x')).toHaveValue('');
  await typeAt('x', 320, 100);
  await typeAt('length', 100, 0);
  await expect(status).toContainText('4 items');
  await shot('01-four-items');
  checks.push('A → arc (320, 0) → (420, 0) through (370, 30); L → "12c" typed stays in the field, the tool stays; one line: 4 items');

  // 5. Ctrl+Z twice: the line and the arc go, the model stays as it was.
  const before = await settled();
  await page.keyboard.press('Control+z');
  await expect(status).toContainText('3 items');
  await page.keyboard.press('Control+z');
  await expect(status).toContainText('2 items · closed profile');
  await pressed('Line');
  const after = await settled();
  assert.deepEqual(after, before, 'Ctrl+Z in the sketch leaves the model');
  assert.equal(after.sketches.length, 1);
  checks.push('Ctrl+Z twice (from the HUD field) → 2 items · closed profile; the saved model unchanged (1 sketch)');

  // 6. Shift+R toggles Center rectangle; Esc; D → a dimension on the top side.
  await page.keyboard.press('Shift+R');
  await pressed('Center rectangle');
  await released('Line');
  await page.keyboard.press('Shift+R');
  await released('Center rectangle');
  await page.keyboard.press('d');
  await pressed('Dimension');
  await hover([100, 200]);
  await click([100, 200]);
  await click([100, 230]);
  await expect(status).toContainText('2 items · closed profile · 1 dimension');
  await page.keyboard.press('d');
  await released('Dimension');
  checks.push('Shift+R on and off; D → the top side → 1 dimension; D off');

  // 7. L → the cross, B → Relief on its corner, Esc.
  await page.keyboard.press('l');
  await pressed('Line');
  await typeAt('x', CROSS_X, -20);
  for (const [length, angle] of CROSS_LEGS) await typeAt('length', length, angle);
  await page.keyboard.press('Escape');
  await released('Line');
  await expect(status).toContainText('14 items');
  await page.keyboard.press('b');
  await pressed('Relief');
  await hover([CROSS_X, 0]);
  await expect(page.getByLabel('Relief readout', { exact: true })).toContainText('Square 4.6 × 4.6');
  await click([CROSS_X, 0]);
  await expect(status).toContainText('18 items');
  await shot('02-relief-cut');
  await page.keyboard.press('Escape');
  await released('Relief');
  checks.push('L → the cross typed (14 items); B → Relief, Square 4.6 × 4.6 at its corner, cut (18 items); Esc ends it');

  // 8. Finish → two sketches; Ctrl+Z out of the sketch undoes the model.
  await button('Finish sketch').click();
  await expect(toolbar).toHaveCount(0);
  const finished = await savedWhen((m) => m.sketches.length === 2, 'the second sketch');
  assert.equal(finished.sketches[1].dimensions?.length, 1, 'the dimension kept');
  await modelCurrent();
  await page.mouse.move(5, 600);
  await page.keyboard.press('Control+z');
  await savedWhen((m) => m.sketches.length === 1, 'the model undone');
  await shot('03-model-undone');
  checks.push('Finish → 2 sketches (one dimension kept); Ctrl+Z out of the sketch → 1 sketch: the model undo as before');

  // 9. No page error, no .cad-error.
  await noErrorLine('at the end');
  if (errors.length) throw new Error(errors.join('\n'));
  checks.push('no page error; no .cad-error');
  await writeFile(`${directory}/verification.json`, JSON.stringify({ status: 'passed', errors, checks }, null, 2));
  console.log('Sketch keys SK-1 verification passed:\n- ' + checks.join('\n- '));
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` });
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}
