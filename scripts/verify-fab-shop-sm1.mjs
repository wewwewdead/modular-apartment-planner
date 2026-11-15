/* global localStorage, process, console, document */
// Fabrication shop SM-1 (docs/sketch-studio-fab-shop.md §9 SM-1 item 9): a
// fresh model → Shop (its route since docs/sketch-studio-shop-floor.md SF-1)
// → Draw → Rectangle → Cut, 100 × 60 of 1.5 SPCC → Add bend 20 mm
// in from the left edge, Up 90° → Add bend with a 25 mm outside flange on the
// right → the folded size in Properties matches the bend deduction → Unfold:
// the stand-in lies flat with "UP 90° R1.6" labels and the kernel body hidden
// → Fold → reload: the part is intact → no page errors.
//   CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-fab-shop-sm1.mjs
// Screenshots: artifacts/sketch-cad/fab-shop-sm1 (or SM1_SHOTS).
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { cadSteps } from './sketch-cad-steps.mjs';

const directory = process.env.SM1_SHOTS || 'artifacts/sketch-cad/fab-shop-sm1';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [],
  checks = [];
page.on('pageerror', (e) => errors.push(e.message));
const { properties, current, savedWhen, saved, view, route } = cadSteps(page);
const toolbar = page.locator('.cad-view-toolbar');
const footer = page.locator('.cad-status');
const shot = (name) => page.screenshot({ path: `${directory}/${name}.png` });
const shop = () => page.evaluate(() => document.querySelector('.cad-viewport').cadShop());
const bodies = () => page.evaluate(() => document.querySelector('.cad-viewport').cadViewMode().bodies);
const rebuilt = async () => {
  await page.waitForTimeout(300);
  await current();
  await expect(footer).not.toContainText('Rebuild failed');
};
const fill = async (scope, label, value) => {
  const field = scope.getByLabel(label, { exact: true });
  await field.fill(String(value));
  await field.press('Enter');
};
// "Size 59.01 × 60 × 25 mm (X × Y × Z, part coordinates)" → [59.01, 60, 25].
const partSize = async () => {
  const text = await properties.getByLabel('Part size', { exact: true }).innerText();
  const match = text.match(/Size ([\d.]+) × ([\d.]+) × ([\d.]+) mm/);
  assert(match, `Part size readout: "${text}"`);
  return match.slice(1).map(Number);
};

// The numbers the shop uses (shopCatalog.js §8): SPCC t 1.5 on the default V10
// die, 88° punch R0.8 → r = max(0.8, 0.16 × 10) = 1.6; r/t 1.07 → K 0.43.
const t = 1.5,
  r = 1.6,
  K = 0.43;
const BA = (Math.PI / 2) * (r + K * t),
  OSSB = r + t;
const left = 20; // bend 1: 20 mm in from the left edge
const rightFlange = 25; // bend 2: a 25 mm outside flange on the right
const rightD = rightFlange - OSSB + BA / 2;
const expected = [
  100 - rightD + OSSB - BA / 2 - (left + BA / 2 - OSSB), // between the two flange outer faces
  60,
  Math.max(left - BA / 2 + OSSB, rightFlange), // the taller flange
];

try {
  await page.goto(process.env.CAD_VERIFY_URL || 'http://localhost:5180/sketch');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '3D Model & workshop', exact: true }).click();
  await current();

  // 1. Shop: the route (five stations since the shop trim, then More); an empty model opens Draw.
  // Rectangle 100 × 60 → Cut: 1.5 mm SPCC → Cut on the laser.
  await page.getByRole('button', { name: 'Shop', exact: true }).click();
  await expect(route.getByRole('button')).toHaveText([
    /^1.*Draw/,
    /^2.*Cut/,
    /^3.*Bend/,
    /^4.*Paint/,
    /^5.*Print/,
    // SF-5: Replay, at the end of the route.
    /^Replay$/,
    /More/,
  ]);
  const draw = properties.getByRole('region', { name: 'Draw' });
  await draw.getByRole('button', { name: /^Rectangle/ }).click();
  await fill(draw, 'Width W (mm)', 100);
  await fill(draw, 'Height H (mm)', 60);
  await draw.getByRole('button', { name: 'Cut this rectangle', exact: true }).click();
  const panel = properties.getByRole('region', { name: 'Cut from sheet' });
  await panel.getByLabel('Sheet stock', { exact: true }).selectOption('spcc');
  await expect(panel.getByLabel('Thickness', { exact: true })).toHaveValue('custom');
  await fill(panel, 'Custom thickness (mm)', 1.5);
  await expect(panel.getByLabel('Blank size', { exact: true })).toHaveText(
    'Blank 100 × 60 mm · cut length 320 mm · 1 pierce',
  );
  await panel.getByRole('button', { name: 'Cut on the laser', exact: true }).click();
  // The laser opens on the new blank, already cutting; when it is done, leave it for the part form.
  const bed = page.getByRole('figure', { name: 'Laser bed' });
  await expect(bed).toHaveAttribute('data-state', 'cutting');
  await expect(bed).toHaveAttribute('data-state', 'cut', { timeout: 20000 });
  await properties
    .getByRole('region', { name: 'Laser station' })
    .getByRole('button', { name: 'Leave laser', exact: true })
    .click();
  await rebuilt();
  let model = await savedWhen((m) => m.parts.some((p) => p.features[0]?.type === 'sheetmetal'), 'the blank');
  const part = model.parts.find((p) => p.features[0].type === 'sheetmetal');
  assert.equal(part.material, 'SPCC cold-rolled steel');
  assert.deepEqual(
    { ...part.features[0], id: undefined },
    {
      id: undefined,
      type: 'sheetmetal',
      sketchId: part.features[0].sketchId,
      thickness: 1.5,
      stock: 'spcc',
      kFactor: null,
      base: null,
      marks: [],
      bends: [],
    },
  );
  const form = properties.getByLabel('Sheet metal', { exact: true });
  await expect(form.getByLabel('Flat blank', { exact: true })).toHaveText(
    'Blank 100 × 60 mm · cut length 320 mm · 1 pierce · 0 bends',
  );
  assert.deepEqual(await partSize(), [100, 60, 1.5]);
  await view('isometric');
  await toolbar.getByRole('button', { name: 'Fit', exact: true }).click();
  await page.waitForTimeout(400);
  await shot('01-flat-blank');
  checks.push(
    `Draw → Cut on the laser → "${part.name}", ${part.material}, t ${part.features[0].thickness}, size 100 × 60 × 1.5`,
  );

  // 2. Add bend: 20 mm in from the left edge, Up 90°.
  await form.getByLabel('Blank edge', { exact: true }).selectOption('left');
  await fill(form, 'Distance D (mm)', left);
  await expect(form.getByLabel('New bend numbers', { exact: true })).toContainText('UP 90° R1.6');
  await form.getByRole('button', { name: 'Add bend', exact: true }).click();
  await rebuilt();
  // 3. Add bend: the right edge, by the wanted outside flange (D follows).
  await form.getByLabel('Blank edge', { exact: true }).selectOption('right');
  await fill(form, 'Flange, outside (mm)', rightFlange);
  const typedD = Number(await form.getByLabel('Distance D (mm)', { exact: true }).inputValue());
  assert(Math.abs(typedD - rightD) < 1e-3, `D ${typedD} for a ${rightFlange} mm flange (expected ${rightD})`);
  await form.getByRole('button', { name: 'Add bend', exact: true }).click();
  await rebuilt();
  model = await savedWhen((m) => m.parts[0].features[0].bends?.length === 2, 'two bends');
  const bends = model.parts[0].features[0].bends;
  assert.deepEqual(
    bends.map((b) => [b.direction, b.angle, b.radius]),
    [
      ['up', 90, null],
      ['up', 90, null],
    ],
  );
  await expect(form.getByLabel('Bend 1 numbers', { exact: true })).toContainText('Deduction 2.67');
  const size = await partSize();
  size.forEach((v, i) =>
    assert(Math.abs(v - expected[i]) < 0.01, `Folded size ${size} against the deduction arithmetic ${expected}`),
  );
  await view('isometric');
  await toolbar.getByRole('button', { name: 'Fit', exact: true }).click();
  await page.waitForTimeout(400);
  await shot('02-folded');
  checks.push(
    `two bends (D ${left}, flange ${rightFlange} → D ${typedD.toFixed(3)}) → Properties size ${size.join(' × ')} mm; expected ${expected.map((v) => v.toFixed(3)).join(' × ')}`,
  );

  // 4. Unfold: the stand-in animates flat, the kernel body hides, labels show.
  const unfold = toolbar.getByRole('button', { name: 'Unfold', exact: true });
  await unfold.click();
  await page.waitForFunction(() => document.querySelector('.cad-viewport').cadShop().flat, null, { timeout: 5000 });
  let state = await shop();
  assert.equal(state.station, null);
  assert.equal(state.pieces, 3);
  assert.deepEqual(
    state.bends.map((b) => b.label),
    ['UP 90° R1.6', 'UP 90° R1.6'],
  );
  assert.equal((await bodies())[0].visible, false, 'The kernel body hides while the stand-in shows.');
  const labels = page.locator('.cad-shop-label');
  await expect(labels).toHaveCount(2);
  await expect(labels.first()).toBeVisible();
  await expect(labels).toHaveText(['UP 90° R1.6', 'UP 90° R1.6']);
  await expect(toolbar.getByRole('button', { name: 'Fold', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await view('top');
  await page.waitForTimeout(400);
  await shot('03-unfolded-bend-labels');
  checks.push(
    `Unfold → flat in ${state.pieces} pieces, labels ${state.bends.map((b) => b.label).join(', ')}, kernel body hidden`,
  );

  // 5. Fold: back to the kernel's solid, nothing animating, no labels.
  await toolbar.getByRole('button', { name: 'Fold', exact: true }).click();
  await page.waitForFunction(
    () => {
      const s = document.querySelector('.cad-viewport').cadShop();
      return !s.animating && !s.instanceId;
    },
    null,
    { timeout: 5000 },
  );
  state = await shop();
  assert.equal((await bodies())[0].visible, true, 'The kernel body is back after folding.');
  await expect(labels).toHaveCount(0);
  assert.deepEqual(await partSize(), size, 'Folding back changes nothing.');
  checks.push('Fold → the kernel body shows again, labels gone, size unchanged');

  // 6. Reload: the part comes back with its blank and both bends.
  await page.waitForTimeout(1500);
  const before = await saved();
  await page.reload();
  const workshop = page.getByRole('button', { name: '3D Model & workshop', exact: true });
  if (await workshop.isVisible().catch(() => false)) await workshop.click();
  await current();
  const after = await saved();
  assert.deepEqual(after.parts, before.parts, 'The part definition survives the reload.');
  assert.deepEqual(after.sketches, before.sketches, 'The blank sketch survives the reload.');
  await page.locator('.cad-tree-item', { hasText: 'Sheet-metal part' }).first().click();
  assert.deepEqual(await partSize(), size, 'The rebuilt part has the same folded size.');
  await expect(
    properties.getByLabel('Sheet metal', { exact: true }).getByLabel('Flat blank', { exact: true }),
  ).toHaveText('Blank 100 × 60 mm · cut length 320 mm · 1 pierce · 2 bends');
  checks.push(`reload → ${after.parts[0].features[0].bends.length} bends, size ${(await partSize()).join(' × ')} mm`);

  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ status: 'passed', errors, checks, model: after }, null, 2),
  );
  console.log('Fab shop SM-1 verification passed:\n- ' + checks.join('\n- '));
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` });
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}
