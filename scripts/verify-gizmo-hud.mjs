/* global localStorage, process, console, document */
// Phase E: the gizmo HUD. Rotate a tube member by dragging the blue (Z) ring
// and check the readout; then type 45 + Enter mid-drag for an exact turn.
//   CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-gizmo-hud.mjs
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { cadSteps } from './sketch-cad-steps.mjs';

const directory = 'artifacts/sketch-cad/gizmo-hud';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [],
  checks = [];
page.on('pageerror', (e) => errors.push(e.message));
const { properties, current, project, view } = cadSteps(page);
const hud = page.locator('.cad-gizmo-hud');
const gizmo = () => page.evaluate(() => document.querySelector('.cad-viewport').cadGizmo());
const rotationZ = () =>
  properties
    .getByRole('group', { name: 'Rotation (degrees)', exact: true })
    .getByLabel('Z', { exact: true })
    .inputValue()
    .then(Number);

// Find a point on the Z ring: walk out from the pivot along a diagonal (clear
// of the X and Y rings, seen edge-on from the top) until the gizmo hovers Z.
async function zRingPoint(pivot) {
  for (let r = 20; r < 400; r += 2) {
    const point = [pivot[0] + r * Math.SQRT1_2, pivot[1] - r * Math.SQRT1_2];
    await page.mouse.move(...point);
    if ((await gizmo()).axis === 'Z') return { point, r };
  }
  throw new Error('Could not find the Z rotation ring.');
}
// Drag along the ring's tangent with paced moves (the rotate dial turns the
// part by the angle swept about the pivot; a short tangent drag is a small arc).
async function dragAlongRing({ point }, pixels, { release = true, steps = 8 } = {}) {
  await page.mouse.move(...point);
  await page.waitForTimeout(100);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    const t = (pixels * i) / steps;
    // The tangent at the up-right diagonal point: up-left.
    await page.mouse.move(point[0] - t * Math.SQRT1_2, point[1] - t * Math.SQRT1_2);
    await page.waitForTimeout(100);
  }
  if (release) await page.mouse.up();
}

try {
  await page.goto(process.env.CAD_VERIFY_URL || 'http://localhost:5180/sketch');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '3D Model & workshop', exact: true }).click();
  await current();
  await page.getByRole('button', { name: 'Create tube member', exact: true }).click();
  await current();
  await page.getByRole('button', { name: 'Rotate part', exact: true }).click();
  await view('top');
  await page.waitForTimeout(200);
  // The tube runs 0 → 700 on Z; the gizmo sits at its centre.
  const pivot = await project([0, 0, 350]);
  const ring = await zRingPoint(pivot);

  // 1. Mouse drag on the Z ring: the HUD shows the snapped angle about Z.
  await dragAlongRing(ring, 120, { release: false });
  await expect(hud).toBeVisible();
  const text = await hud.innerText();
  assert.match(text, /about Z/);
  const shown = Number(text.match(/([+-]?\d+\.\d)°/)[1]);
  assert(Math.abs(shown) >= 15 && Math.abs(shown % 15) < 1e-9, `Angle ${shown} should be a 15° step.`);
  await expect(hud.locator('.cad-axis-z')).toHaveText('Z');
  await page.screenshot({ path: `${directory}/01-rotate-drag.png` });
  await page.mouse.up();
  await expect(hud).toBeHidden();
  await current();
  assert.equal(await rotationZ(), shown, 'Rotation Z equals the angle the HUD showed.');
  checks.push(`Z ring drag: HUD "${text.split('\n')[0]}"; rotation Z field = ${shown}`);

  // 2. Undo, then type an exact angle during a drag.
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await current();
  assert.equal(await rotationZ(), 0);
  await page.mouse.move(...(await project([0, 0, 350])));
  const again = await zRingPoint(await project([0, 0, 350]));
  await dragAlongRing(again, 40, { release: false, steps: 4 });
  await page.keyboard.type('45');
  await expect(hud).toContainText('45 ° · Enter applies');
  await page.screenshot({ path: `${directory}/02-typed-angle.png` });
  await page.keyboard.press('Enter');
  await expect(hud).toBeHidden();
  await page.mouse.up();
  await current();
  assert.equal(await rotationZ(), 45);
  checks.push('typed 45 + Enter during a Z ring drag: rotation Z = 45');

  // 3. Move readout with the arrow handle shows the delta.
  await page.getByRole('button', { name: 'Move part', exact: true }).click();
  const centre = await project([0, 0, 350]);
  await page.mouse.move(...centre);
  await page.waitForTimeout(100);
  await page.mouse.down();
  for (let i = 1; i <= 5; i++) {
    await page.mouse.move(centre[0] + i * 12, centre[1]);
    await page.waitForTimeout(100);
  }
  await expect(hud).toContainText(/ΔX [+-]?\d+ · ΔY [+-]?\d+ · ΔZ 0 mm/);
  await page.screenshot({ path: `${directory}/03-move-drag.png` });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(hud).toBeHidden();
  checks.push('move drag shows ΔX/ΔY/ΔZ; Esc cancels and hides the readout');

  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(`${directory}/verification.json`, JSON.stringify({ status: 'passed', errors, checks }, null, 2));
  console.log('Gizmo HUD verification passed:\n- ' + checks.join('\n- '));
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` });
  console.error(await page.locator('body').innerText());
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}
