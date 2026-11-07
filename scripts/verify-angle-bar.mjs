/* global localStorage, process, console, document */
// Phase P (docs/sketch-studio-angle-bar.md §5): the Angle bar. A fresh model
// → Start list Angle bar → the saved part is an L 50×50×5 r7 / r3.5 member,
// 700 long, standing on the ground under the view centre (read from the
// save) → Properties: Standard size L 100×100×10 → rebuild → Hole: the root
// fillet reads curved, a click on the outside face of leg A drills there →
// Apply → Cutting list row names L 100×100×10 → no page errors.
//   CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-angle-bar.mjs
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { cadSteps } from './sketch-cad-steps.mjs';

const directory = 'artifacts/sketch-cad/angle-bar';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [],
  checks = [];
page.on('pageerror', (e) => errors.push(e.message));
const { properties, current, savedWhen, project, view } = cadSteps(page);
const ribbon = page.locator('.cad-ribbon');
const hud = page.locator('.cad-placement-hud');
const hint = page.locator('.cad-viewport-hint');
const footer = page.locator('.cad-status');
const status = properties.getByRole('status');
const shot = (name) => page.screenshot({ path: `${directory}/${name}.png` });
const placement = () => page.evaluate(() => document.querySelector('.cad-viewport').cadPlacement());
const add = (a, b) => a.map((v, i) => v + b[i]);
const previewReady = () => expect(status).toHaveText('Preview ready', { timeout: 60000 });
// A rebuild after an edit: wait for it to start (or finish at once), then for Model current.
const rebuilt = async () => {
  await page.waitForTimeout(300);
  await current();
  await expect(footer).not.toContainText('Rebuild failed');
};

try {
  await page.goto(process.env.CAD_VERIFY_URL || 'http://localhost:5180/sketch');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '3D Model & workshop', exact: true }).click();
  await current();

  // 1. Start list → Angle bar: the default section, on the ground under the view centre.
  const start = page.locator('.cad-start');
  await expect(start.getByRole('button', { name: 'Angle bar', exact: true })).toBeVisible();
  await start.getByRole('button', { name: 'Angle bar', exact: true }).click();
  await rebuilt();
  let model = await savedWhen((m) => m.instances.length === 1, 'the new angle bar');
  const part = model.parts[0];
  const member = part.features[0];
  assert.equal(part.name, 'Angle bar');
  assert.equal(part.material, 'Steel');
  assert.equal(member.type, 'member');
  assert.deepEqual(member.section, { type: 'angle', width: 50, height: 50, wall: 5, rootRadius: 7, toeRadius: 3.5 });
  assert.deepEqual(
    [member.start, member.end],
    [
      [0, 0, 0],
      [0, 0, 700],
    ],
  );
  const at = model.instances[0].position;
  assert.equal(at[2], 0, 'The angle bar stands on the ground.');
  assert.deepEqual(model.instances[0].rotation, [0, 0, 0]);
  await expect(footer).toContainText('1 definitions · 1 instances');
  // The Standard view list reframes when asked (adding never does).
  await view('isometric');
  await page.waitForTimeout(500);
  await shot('01-angle-bar-iso');
  checks.push(
    `Start list Angle bar → "${part.name}", ${part.material}, section ${JSON.stringify(member.section)}, at (${at}), Model current`,
  );

  // 2. Properties: the member feature → Standard size L 100×100×10 (all five numbers, one rebuild).
  await page
    .locator('.cad-tree')
    .getByRole('button', { name: /^1\. member/ })
    .click();
  const size = properties.getByLabel('Standard size', { exact: true });
  await expect(size).toHaveValue('L 50×50×5');
  for (const [label, value] of [
    ['Leg A (width)', '50'],
    ['Leg B (height)', '50'],
    ['Thickness', '5'],
    ['Root radius', '7'],
    ['Toe radius', '3.5'],
  ])
    await expect(properties.getByLabel(label, { exact: true })).toHaveValue(value);
  await size.selectOption('L 100×100×10');
  await rebuilt();
  model = await savedWhen((m) => m.parts[0].features[0].section.width === 100, 'the L 100×100×10 section');
  assert.deepEqual(model.parts[0].features[0].section, {
    type: 'angle',
    width: 100,
    height: 100,
    wall: 10,
    rootRadius: 12,
    toeRadius: 6,
  });
  await expect(properties.getByLabel('Root radius', { exact: true })).toHaveValue('12');
  await view('isometric');
  await page.waitForTimeout(500);
  await shot('02-standard-size-100');
  checks.push(`Standard size L 100×100×10 → ${JSON.stringify(model.parts[0].features[0].section)}, Model current`);

  // 3. Hole: from the rear the root fillet (local (−36.5, −36.5) on L 100×100×10 r12) reads curved.
  await page.keyboard.press('Escape');
  await ribbon.getByRole('button', { name: 'Hole', exact: true }).click();
  await expect(hint).toContainText('Hole: click a flat face to drill there');
  await view('rear');
  await page.waitForTimeout(500);
  const k = Math.SQRT1_2;
  const fillet = await project(add(at, [-28 - 12 * k, -28 - 12 * k, 350]));
  await page.mouse.move(fillet[0] - 5, fillet[1]);
  await page.mouse.move(fillet[0], fillet[1], { steps: 3 });
  await expect(hud).toContainText('Curved face');
  await shot('03-hole-hover-root-fillet');
  checks.push(`Hole over the root fillet (rear view) → "${(await hud.innerText()).replace(/\s+/g, ' ')}"`);

  // 4. A click on the outside face of leg A (local y = −50) drills there, into +Y.
  await view('front');
  await page.waitForTimeout(500);
  const face = await project(add(at, [20, -50, 350]));
  await page.mouse.move(face[0] - 5, face[1]);
  await page.mouse.move(face[0], face[1], { steps: 3 });
  await expect(hud).toContainText('Angle bar front');
  const hoverText = (await hud.innerText()).replace(/\s+/g, ' ');
  await page.mouse.click(face[0], face[1]);
  await expect(hint).toContainText('Hole: drag the arrow for the depth');
  const placed = await placement();
  assert(
    placed.handles.some((h) => h.id === 'distance'),
    'The placed hole shows its depth arrow.',
  );
  assert.equal(placed.throughAll, true, 'A new hole starts through all.');
  await previewReady();
  await shot('04-hole-on-leg-a');
  await properties.getByRole('button', { name: 'Apply hole', exact: true }).click();
  await rebuilt();
  model = await savedWhen((m) => m.parts[0].features.some((f) => f.type === 'hole'), 'a hole on the angle');
  const hole = model.parts[0].features.find((f) => f.type === 'hole');
  assert(Math.abs(hole.position[1] + 50) < 1e-6, `The hole starts on leg A's outside face: ${hole.position}`);
  assert(hole.position[0] > -50 && hole.position[0] < 50, `On leg A across x: ${hole.position}`);
  assert(hole.position[2] > 0 && hole.position[2] < 700, `Along the bar: ${hole.position}`);
  assert.deepEqual(hole.direction, [0, 1, 0]);
  await view('isometric');
  await page.waitForTimeout(500);
  await shot('05-hole-applied');
  checks.push(
    `hover "${hoverText}"; click on leg A's outside face → hole at (${hole.position}), direction (${hole.direction}), throughAll ${hole.throughAll}; Model current`,
  );

  // 5. The cutting list names the section.
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Manufacture', exact: true }).click();
  await ribbon.getByRole('button', { name: 'Cutting list', exact: true }).click();
  const row = properties.locator('.cad-cut-row');
  await expect(row).toHaveCount(1);
  await expect(row.locator('span').first()).toHaveText('L 100×100×10');
  await expect(row).toContainText('CL 700.00 mm');
  await shot('06-cutting-list');
  checks.push(`Cutting list row: "${(await row.innerText()).replace(/\s+/g, ' ')}"`);

  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ status: 'passed', errors, checks, model }, null, 2),
  );
  console.log('Angle bar verification passed:\n- ' + checks.join('\n- '));
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` });
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}
