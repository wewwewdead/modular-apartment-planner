/* global localStorage, process, console, document */
// Dial-style part rotation. Drag the rotate rings of a tube member the way a
// user turns a dial and check the readout, the committed rotation, the swept
// sector + start-pose ghost, Alt for free turning, Local space, the edge-on
// fallback and turning about a picked corner.
//   CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-rotate-dial.mjs
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { instanceAxis } from '../src/features/sketchstudio/cad/movement.js';
import { cadSteps } from './sketch-cad-steps.mjs';

const directory = 'artifacts/sketch-cad/rotate-dial';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [],
  checks = [];
page.on('pageerror', (e) => errors.push(e.message));
const { properties, current, project, view } = cadSteps(page);
const hud = page.locator('.cad-gizmo-hud');
const gizmo = () => page.evaluate(() => document.querySelector('.cad-viewport').cadGizmo());
const vectorField = (group) => async () => {
  const fields = properties.getByRole('group', { name: group, exact: true });
  const values = [];
  for (const axis of ['X', 'Y', 'Z']) values.push(Number(await fields.getByLabel(axis, { exact: true }).inputValue()));
  return values;
};
const rotation = vectorField('Rotation (degrees)');
const position = vectorField('Position (mm)');
const undo = async () => {
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await current();
};
const shownAngle = (text) => {
  const match = text.match(/([+-]?\d+\.\d)° about (local )?([XYZ])/);
  assert(match, `No angle in "${text}"`);
  return { degrees: Number(match[1]), local: Boolean(match[2]), axis: match[3] };
};
const near = (a, b, tolerance, message) =>
  assert(Math.abs(a - b) <= tolerance, `${message}: ${a} is not within ${tolerance} of ${b}`);

// Walk out from the pivot along a screen direction until the gizmo hovers
// the wanted ring.
async function ringPoint(pivot, axis, direction = [Math.SQRT1_2, -Math.SQRT1_2]) {
  for (let r = 16; r < 420; r += 2) {
    const point = [pivot[0] + r * direction[0], pivot[1] + r * direction[1]];
    await page.mouse.move(...point);
    if ((await gizmo()).axis === axis) return { point, r, angle: Math.atan2(-direction[1], direction[0]) };
  }
  throw new Error(`Could not find the ${axis} rotation ring.`);
}
// Turn like a dial: paced moves along a circular arc about the projected
// pivot, `sweep` degrees counter-clockwise on screen (negative: clockwise).
async function dialArc(pivot, { r, angle }, sweep, { steps = Math.ceil(Math.abs(sweep) / 6), release = true } = {}) {
  await page.mouse.move(pivot[0] + r * Math.cos(angle), pivot[1] - r * Math.sin(angle));
  await page.waitForTimeout(100);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    const a = angle + (((sweep * i) / steps) * Math.PI) / 180;
    await page.mouse.move(pivot[0] + r * Math.cos(a), pivot[1] - r * Math.sin(a));
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(100);
  if (release) await page.mouse.up();
}

try {
  await page.goto(process.env.CAD_VERIFY_URL || 'http://localhost:5180/sketch');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '3D Model & workshop', exact: true }).click();
  await current();
  await page.locator('.cad-start').getByRole('button', { name: 'Tube / member', exact: true }).click();
  await current();
  await page.getByRole('button', { name: 'Rotate part', exact: true }).click();
  await view('top');
  await page.waitForTimeout(200);
  // The tube runs 0 → 700 on Z; the gizmo sits at its centre.
  const centre = [0, 0, 350];
  let pivot = await project(centre);
  const handles = new Set();
  for (const direction of [
    [1, 0],
    [0, -1],
    [Math.SQRT1_2, -Math.SQRT1_2],
  ])
    for (let r = 8; r < 420; r += 4) {
      await page.mouse.move(pivot[0] + r * direction[0], pivot[1] + r * direction[1]);
      const { axis } = await gizmo();
      if (axis) handles.add(axis);
    }
  assert(!handles.has('E') && !handles.has('XYZE'), `Screen ring/trackball still pickable: ${[...handles]}`);
  checks.push(`only axis rings hover in rotate mode (seen: ${[...handles].sort().join(', ')})`);

  // 1. A 90° counter-clockwise arc on the Z ring seen from the top: +90 about Z.
  let ring = await ringPoint(pivot, 'Z');
  await dialArc(pivot, ring, 60, { release: false });
  await expect(hud).toBeVisible();
  const midText = await hud.innerText();
  assert.equal(shownAngle(midText).degrees, 60, `Mid-drag HUD: ${midText}`);
  const feedback = (await gizmo()).feedback;
  for (const name of ['rotate-ghost', 'rotate-sector', 'rotate-arc', 'rotate-radials'])
    assert(feedback.includes(name), `Missing ${name} in ${feedback}`);
  await page.screenshot({ path: `${directory}/01-top-mid-drag.png` });
  for (let i = 1; i <= 5; i++) {
    const a = ring.angle + ((60 + 6 * i) * Math.PI) / 180;
    await page.mouse.move(pivot[0] + ring.r * Math.cos(a), pivot[1] - ring.r * Math.sin(a));
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(100);
  const text = await hud.innerText();
  const shown = shownAngle(text);
  assert.deepEqual([shown.degrees, shown.axis], [90, 'Z'], `HUD after a 90° arc: ${text}`);
  assert.match(text, /snap 15°/);
  await page.mouse.up();
  await expect(hud).toBeHidden();
  assert.deepEqual((await gizmo()).feedback, [], 'Sector and ghost cleared on release');
  await current();
  assert.equal((await rotation())[2], 90, 'Rotation Z equals the dial angle.');
  checks.push(
    `90° counter-clockwise arc on the Z ring (top view): mid-drag "${midText.split('\n')[0]}" with ${feedback.join(', ')}; release "${text.split('\n')[0]}"; rotation Z field = 90`,
  );

  // 2. Undo, then a full circle back to the start: 360° shown, nothing changes.
  await undo();
  assert.equal((await rotation())[2], 0);
  pivot = await project(centre);
  ring = await ringPoint(pivot, 'Z');
  await dialArc(pivot, ring, 360, { release: false, steps: 60 });
  const fullText = await hud.innerText();
  assert.equal(shownAngle(fullText).degrees, 360, `Full circle HUD: ${fullText}`);
  await page.mouse.up();
  await page.waitForTimeout(300);
  assert.deepEqual(await rotation(), [0, 0, 0], 'A full turn back to the start leaves rotation 0.');
  checks.push(`full circle: HUD "${fullText.split('\n')[0]}" (unwrapped past ±180°); rotation fields stay 0, 0, 0`);

  // 3. Alt held: free rotation, a non-multiple of 15.
  ring = await ringPoint(pivot, 'Z');
  await page.keyboard.down('Alt');
  await dialArc(pivot, ring, 37, { release: false, steps: 8 });
  const altText = await hud.innerText();
  const free = shownAngle(altText).degrees;
  assert.match(altText, /free · Alt/);
  assert(Math.abs(free % 15) > 0.5 && Math.abs(free % 15) < 14.5, `Alt angle ${free} should not be a 15° step.`);
  near(free, 37, 1.5, 'Alt angle follows the cursor');
  await page.screenshot({ path: `${directory}/02-alt-free.png` });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  await current();
  near((await rotation())[2], free, 0.05, 'Rotation Z equals the free angle shown');
  checks.push(`Alt held: HUD "${altText.split('\n')[0]}"; rotation Z field = ${(await rotation())[2]}`);
  await undo();

  // 4. Edge-on fallback: the X ring seen from the top is a vertical line;
  //    pointer travel along it turns the part (down = positive, the front of
  //    the ring follows the cursor).
  pivot = await project(centre);
  ring = await ringPoint(pivot, 'X', [0, -1]);
  await page.mouse.move(...ring.point);
  await page.waitForTimeout(100);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(ring.point[0], ring.point[1] + 8 * i);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(100);
  const edge = await gizmo();
  const edgeText = await hud.innerText();
  assert.equal(edge.dial, 'edge', 'X ring from the top uses the edge-on fallback');
  assert(shownAngle(edgeText).degrees > 0, `Edge-on drag down should be positive: ${edgeText}`);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(hud).toBeHidden();
  assert.deepEqual(await rotation(), [0, 0, 0], 'Escape cancelled the edge-on drag');
  checks.push(
    `edge-on X ring (top view, dial mode "${edge.dial}"): 48 px down reads "${edgeText.split('\n')[0]}"; Esc cancels`,
  );

  // 5. Local: Z 90° first (rotation [0, 0, 90], local X = world +Y), then a
  //    local X ring drag from the front view. The local X axis then points
  //    away from the viewer, so a clockwise arc on screen is a positive turn.
  await page
    .getByRole('group', { name: 'Rotation space', exact: true })
    .getByRole('button', { name: 'Local', exact: true })
    .click();
  await page.getByRole('button', { name: 'Z 90°', exact: true }).click();
  await current();
  assert.deepEqual(await rotation(), [0, 0, 90]);
  await view('front');
  await page.waitForTimeout(300);
  const local = await gizmo();
  assert.equal(local.space, 'local');
  // The rings follow the part: the pivot is turned 90° about Z.
  const [qx, qy, qz, qw] = local.orientation;
  near(Math.abs(qz), Math.SQRT1_2, 1e-6, 'local gizmo z');
  near(Math.abs(qw), Math.SQRT1_2, 1e-6, 'local gizmo w');
  near(Math.hypot(qx, qy), 0, 1e-6, 'local gizmo xy');
  pivot = await project(centre);
  ring = await ringPoint(pivot, 'X', [Math.SQRT1_2, Math.SQRT1_2]);
  await dialArc(pivot, ring, -90, { release: false, steps: 15 });
  const localText = await hud.innerText();
  const localShown = shownAngle(localText);
  assert.deepEqual([localShown.degrees, localShown.local, localShown.axis], [90, true, 'X'], localText);
  await page.screenshot({ path: `${directory}/03-local-x.png` });
  await page.mouse.up();
  await current();
  const turned = await rotation();
  const instance = { rotation: turned, position: [0, 0, 0] };
  // As in rotateDial.test.js: +90° about local X of rotation [0, 0, 90] is
  // +90° about world +Y, so local X stays world +Y and local Y becomes +Z.
  instanceAxis(instance, 'X').forEach((v, i) => near(v, [0, 1, 0][i], 1e-6, `local X[${i}]`));
  instanceAxis(instance, 'Y').forEach((v, i) => near(v, [0, 0, 1][i], 1e-6, `local Y[${i}]`));
  checks.push(
    `Local: Z 90° then a clockwise local X arc (front view) reads "${localText.split('\n')[0]}"; rotation fields ${turned.join(', ')} keep local X on world +Y and turn local Y to +Z`,
  );

  // 6. Rotate about a picked corner: back to World, top view, pick the
  //    tube's (+X, +Y) top corner, then Z 90° turns about it.
  await undo();
  await undo();
  assert.deepEqual(await rotation(), [0, 0, 0]);
  await page
    .getByRole('group', { name: 'Rotation space', exact: true })
    .getByRole('button', { name: 'World', exact: true })
    .click();
  await view('top');
  await page.waitForTimeout(300);
  await page
    .getByRole('group', { name: 'Rotate about', exact: true })
    .getByRole('button', { name: 'Picked point', exact: true })
    .click();
  const corner = await project([20, 20, 700]);
  await page.mouse.click(corner[0] - 3, corner[1] + 3);
  await page.waitForTimeout(200);
  const picked = await gizmo();
  assert.equal(picked.picked?.corner, true, 'Picked near a corner snaps to it');
  picked.pivot.forEach((v, i) => near(v, [20, 20, 700][i], 1e-6, `picked pivot[${i}]`));
  await page.getByRole('button', { name: 'Z 90°', exact: true }).click();
  await current();
  assert.deepEqual(await rotation(), [0, 0, 90]);
  const moved = await position();
  [40, 0, 0].forEach((v, i) => near(moved[i], v, 1e-6, `position[${i}] after turning about the corner`));
  await page.screenshot({ path: `${directory}/04-picked-corner.png` });
  checks.push(
    `Rotate about: Picked point snapped to corner ${picked.pivot.join(', ')}; Z 90° about it moves the origin to ${moved.join(', ')}`,
  );

  // 7. A picture of the feedback in the default isometric view.
  await undo();
  await page
    .getByRole('group', { name: 'Rotate about', exact: true })
    .getByRole('button', { name: 'Centre', exact: true })
    .click();
  await view('isometric');
  await page.waitForTimeout(300);
  // Walk out along a world-horizontal direction until the Z ring hovers,
  // then follow the ring itself (an ellipse on screen) through 75°.
  let worldRadius = null;
  for (let rho = 10; rho < 600; rho += 3) {
    await page.mouse.move(...(await project([rho * Math.cos(-0.9), rho * Math.sin(-0.9), 350])));
    if ((await gizmo()).axis === 'Z') {
      worldRadius = rho;
      break;
    }
  }
  assert(worldRadius, 'Z ring found in the isometric view');
  await page.mouse.down();
  for (let i = 1; i <= 15; i++) {
    const t = -0.9 + (i * 5 * Math.PI) / 180;
    await page.mouse.move(...(await project([worldRadius * Math.cos(t), worldRadius * Math.sin(t), 350])));
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(150);
  const isoText = await hud.innerText();
  assert.equal(shownAngle(isoText).degrees, 75, `Isometric ellipse drag tracks the ring: ${isoText}`);
  await page.screenshot({ path: `${directory}/05-isometric-mid-drag.png` });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  checks.push(
    `isometric: following the Z ring's on-screen ellipse through 75° reads "${isoText.split('\n')[0]}" (screenshot 05)`,
  );

  // 8. Tip the tube over on the Y ring (the X-Z plane) so the start-pose ghost
  //    stands clear of the turned part. Following the ring from +X toward +Z
  //    is a negative turn about +Y (Z × X = Y).
  const yRing = (rho, t) => [rho * Math.cos(t), 0, 350 + rho * Math.sin(t)];
  let yRadius = null;
  const t0 = -0.5;
  for (let rho = 10; rho < 600; rho += 3) {
    await page.mouse.move(...(await project(yRing(rho, t0))));
    if ((await gizmo()).axis === 'Y') {
      yRadius = rho;
      break;
    }
  }
  assert(yRadius, 'Y ring found in the isometric view');
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(...(await project(yRing(yRadius, t0 + (i * 5 * Math.PI) / 180))));
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(150);
  const tipText = await hud.innerText();
  const tip = shownAngle(tipText);
  assert.deepEqual([tip.degrees, tip.axis], [-60, 'Y'], `Y ring drag: ${tipText}`);
  const tipFeedback = (await gizmo()).feedback;
  assert(tipFeedback.includes('rotate-ghost') && tipFeedback.includes('rotate-sector'), tipFeedback.join(', '));
  await page.screenshot({ path: `${directory}/06-isometric-tip-mid-drag.png` });
  await page.mouse.up();
  await current();
  const tipped = await rotation();
  near(tipped[1], -60, 1e-6, 'Rotation Y after tipping');
  checks.push(
    `isometric: Y ring followed from +X toward +Z reads "${tipText.split('\n')[0]}" with ${tipFeedback.join(', ')}; rotation fields ${tipped.join(', ')} (screenshot 06)`,
  );

  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(`${directory}/verification.json`, JSON.stringify({ status: 'passed', errors, checks }, null, 2));
  console.log('Rotate dial verification passed:\n- ' + checks.join('\n- '));
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` });
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}
