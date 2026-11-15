/* global localStorage, process, console, document, requestAnimationFrame */
// Fabrication shop SM-2 (docs/sketch-studio-fab-shop.md §9 SM-2): a fresh
// model → Shop → Draw → Cut, 100 × 60 of 1.5 SPCC (the Shop tab's route since
// docs/sketch-studio-shop-floor.md SF-1) → Bend: the press brake → the
// left edge on the backgauge on the flat map, L 20, 90° → Bend: the stroke
// runs (mid-stroke the wings are up, the punch on the part) and commits →
// second hit off the right edge, L 25, by the pedal key → the folded size
// matches the bend deduction → a 5 mm flange is refused (the die minimum) →
// a bend in the web is refused by a collision drawn red → leave → the kernel
// solid has the same size → reload: both bends are there → no page errors.
// SM-2b: the side view card (the section of the hit) is on show with the
// station, its angle readout follows the stroke frame by frame and ends at the
// target, and it shows the tool a collision hits in red; the camera opens on
// the operator's view of the part in the machine.
//   CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-fab-shop-sm2.mjs
// Screenshots: artifacts/sketch-cad/fab-shop-sm2 (or SM2_SHOTS).
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { cadSteps } from './sketch-cad-steps.mjs';

const directory = process.env.SM2_SHOTS || 'artifacts/sketch-cad/fab-shop-sm2';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [],
  checks = [];
page.on('pageerror', (e) => errors.push(e.message));
const { properties, current, savedWhen, saved, route, shopStation, showTree } = cadSteps(page);
const footer = page.locator('.cad-status');
const shot = (name) => page.screenshot({ path: `${directory}/${name}.png` });
const shop = () => page.evaluate(() => document.querySelector('.cad-viewport').cadShop());
const bodies = () => page.evaluate(() => document.querySelector('.cad-viewport').cadViewMode().bodies);
// The side view's readouts, as drawn.
const sideView = page.getByRole('figure', { name: 'Side view' });
const sideAngle = async () => {
  const text = await sideView.getByLabel('Side view angle', { exact: true }).innerText();
  const match = text.match(/^(-?[\d.]+)°$/);
  assert(match, `side view angle readout: "${text}"`);
  return Number(match[1]);
};
const fill = async (scope, label, value) => {
  const field = scope.getByLabel(label, { exact: true });
  await field.fill(String(value));
  await field.press('Enter');
};
const size = async (scope, label) => {
  const text = await scope.getByLabel(label, { exact: true }).innerText();
  const match = text.match(/([\d.]+) × ([\d.]+) × ([\d.]+) mm/);
  assert(match, `${label} readout: "${text}"`);
  return match.slice(1).map(Number);
};
const near = (actual, expected, what, tolerance = 0.01) =>
  actual.forEach((v, i) =>
    assert(Math.abs(v - expected[i]) < tolerance, `${what}: ${actual.join(' × ')} against ${expected.join(' × ')}`),
  );

// The shop's numbers (shopCatalog.js §8): SPCC t 1.5 on the automatic V10
// die, straight 88° punch R0.8 → r = max(0.8, 0.16 × 10) = 1.6; K 0.43.
const t = 1.5,
  r = 1.6,
  K = 0.43;
const BA = (Math.PI / 2) * (r + K * t),
  OSSB = r + t;
const leftL = 20,
  rightL = 25;
const expected = [100 - leftL - rightL + 2 * OSSB - BA, 60, rightL - BA / 2 + OSSB];

try {
  await page.goto(process.env.CAD_VERIFY_URL || 'http://localhost:5180/sketch');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '3D Model & workshop', exact: true }).click();
  await current();

  // 1. Cut a 100 × 60 blank of 1.5 SPCC: the route's Draw (it opens itself on an empty model), then Cut.
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
  const cut = properties.getByRole('region', { name: 'Cut from sheet' });
  await cut.getByLabel('Sheet stock', { exact: true }).selectOption('spcc');
  await fill(cut, 'Custom thickness (mm)', 1.5);
  await cut.getByRole('button', { name: 'Cut on the laser', exact: true }).click();
  // The laser cuts it at once; the route waits for the cut to end.
  await expect(page.getByRole('figure', { name: 'Laser bed' })).toHaveAttribute('data-state', 'cut', {
    timeout: 20000,
  });
  // (The laser's own status line says when the model is current.)
  await expect(footer).toContainText('Model current', { timeout: 60000 });
  await savedWhen((m) => m.parts.some((p) => p.features[0]?.type === 'sheetmetal'), 'the blank');
  checks.push('Draw → Cut on the laser → 100 × 60 × 1.5 SPCC blank');

  // 2. Open the press brake (the route's Bend, on the part just cut): the machine, every part hidden, the flat map.
  await shopStation('Bend');
  const panel = properties.getByRole('region', { name: 'Press brake' });
  await expect(panel.getByLabel('Press brake machine', { exact: true })).toHaveValue('brake-50-2000');
  await expect(footer).toContainText('Press brake — 50 t × 2 m press brake');
  let state = await shop();
  assert(state.station, 'The station is open in the viewport.');
  assert.equal(state.station.machine, 'brake-50-2000');
  assert(
    (await bodies()).every((b) => !b.visible),
    'Every kernel body hides in the station.',
  );
  const map = page.getByRole('figure', { name: 'Flat blank' });
  await expect(map).toBeVisible();
  // The side view: the tooling, the sheet flat on the die, the ram parked.
  await expect(sideView).toBeVisible();
  await expect(sideView.locator('path.cad-side-punch')).toHaveAttribute('d', /^M /);
  await expect(sideView.locator('path.cad-side-die')).toHaveAttribute('d', /^M /);
  await expect(sideView.getByLabel('Sheet section', { exact: true })).toHaveAttribute('d', /^M /);
  assert.equal(await sideAngle(), 0, 'The side view opens on the flat sheet.');
  // The operator's view: in front of the machine (−Y), above the die, looking down.
  const eye = await page.evaluate(() => document.querySelector('.cad-viewport').cadCamera());
  assert(eye.position[1] < eye.target[1] - 50, `the camera stands in front: ${JSON.stringify(eye)}`);
  const down = Math.atan2(
    eye.position[2] - eye.target[2],
    Math.hypot(eye.position[0] - eye.target[0], eye.position[1] - eye.target[1]),
  );
  assert(
    down > (18 * Math.PI) / 180 && down < (32 * Math.PI) / 180,
    `looking down ${((down * 180) / Math.PI).toFixed(1)}°`,
  );
  checks.push(`station opens on the operator's view (down ${((down * 180) / Math.PI).toFixed(1)}°), side view at 0°`);

  // 3. Gauge edge 4 (the left edge) on the backgauge, L 20, 90°.
  await map.getByRole('button', { name: 'Gauge edge 4', exact: true }).click();
  await expect(panel.getByLabel('Gauge edge', { exact: true })).toHaveText('Edge 4 · 60 mm');
  await fill(panel, 'Backgauge L (mm)', leftL);
  await fill(panel, 'Bend angle (°)', 90);
  // The machine's numbers are one click away (shop floor §4.6).
  const numbers = panel.locator('details.cad-shop-numbers');
  if (!(await numbers.evaluate((d) => d.open))) await numbers.locator('summary').click();
  await expect(panel.getByLabel('Inside radius', { exact: true })).toHaveText('R1.6 mm');
  await expect(panel.getByLabel('Backgauge L', { exact: true })).toHaveText('20 mm');
  await expect(panel.getByRole('status', { name: 'Collision check' })).toContainText('Clear through the stroke');
  const readouts = `${await panel.getByLabel('Hit results', { exact: true }).innerText()} · ${await panel.getByLabel('Hit readouts', { exact: true }).innerText()}`;
  state = await shop();
  assert.equal(state.station.gaugeDistance, 20);
  assert.equal(state.station.angle, 0);
  await expect(sideView.getByLabel('Backgauge finger', { exact: true })).toHaveAttribute('d', /^M /);
  await page.waitForTimeout(300);
  await shot('01-station-setup');
  await page.locator('.cad-viewport').screenshot({ path: `${directory}/06-operator-view.png` });
  checks.push(`gauge edge 4, L 20, 90° → ${readouts.replace(/\s+/g, ' ').trim()}`);

  // 4. Bend: the stroke runs in the viewport; mid-stroke the wings are up.
  await panel.getByRole('button', { name: 'Bend', exact: true }).click();
  await page.waitForFunction(
    () => {
      const s = document.querySelector('.cad-viewport').cadShop().station;
      return s?.phase === 'bend' && s.angle > 30 && s.angle < 75;
    },
    null,
    { timeout: 5000, polling: 'raf' },
  );
  const midStroke = (await shop()).station;
  // The side view draws the same frame: its angle readout follows the 3D pose.
  const midSide = await sideAngle();
  assert(midSide > 0 && midSide < 90, `side view mid-stroke ${midSide}°`);
  await shot('02-mid-stroke');
  await page.waitForFunction(() => !document.querySelector('.cad-viewport').cadShop().station.stroking, null, {
    timeout: 5000,
  });
  let model = await savedWhen((m) => m.parts[0].features[0].bends.length === 1, 'the first hit');
  const first = model.parts[0].features[0].bends[0];
  assert.deepEqual(
    [first.angle, first.direction, first.radius, first.punch, first.die],
    [90, 'up', null, 'straight-88', 'v10-88'],
  );
  assert(Math.abs(first.a[0] - leftL) < 1e-9 && Math.abs(first.b[0] - leftL) < 1e-9, 'The punch line is L in.');
  state = await shop();
  assert.equal(state.station.angle, 90);
  assert.equal(state.station.stroking, false);
  assert.equal(await sideAngle(), 90, 'The side view ends at the target angle.');
  checks.push(`side view angle ${midSide}° mid-stroke → ${await sideAngle()}° at rest`);
  await expect(panel.getByRole('list', { name: 'Sequence' })).toContainText('1 · UP 90° R1.6');
  await page.waitForTimeout(200);
  await shot('03-after-stroke');
  checks.push(
    `Bend → mid-stroke ${midStroke.angle.toFixed(1)}°, punch tip at ${midStroke.tipZ.toFixed(2)} mm; committed ${JSON.stringify({ angle: first.angle, direction: first.direction, punch: first.punch, die: first.die })}`,
  );

  // 5. Second hit: the right edge, L 25, by the pedal key (Space).
  await map.getByRole('button', { name: 'Gauge edge 2', exact: true }).click();
  await fill(panel, 'Backgauge L (mm)', rightL);
  await expect(panel.getByLabel('Backgauge L', { exact: true })).toHaveText('25 mm');
  await panel.getByRole('heading', { name: '3 · Bend' }).click();
  await page.keyboard.press('Space');
  await page.waitForFunction(() => document.querySelector('.cad-viewport').cadShop().station.stroking, null, {
    timeout: 3000,
  });
  // Mid-stroke in the side view: the readout read frame by frame, then the card.
  const seen = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const values = [];
        const read = () => {
          const s = document.querySelector('.cad-viewport').cadShop().station;
          const text = document.querySelector('[aria-label="Side view angle"]').textContent;
          values.push(Number.parseFloat(text));
          if (s.phase === 'bend' && s.angle > 35 && s.angle < 65) resolve(values);
          else if (!s.stroking) resolve(values);
          else requestAnimationFrame(read);
        };
        read();
      }),
  );
  await sideView.screenshot({ path: `${directory}/07-side-view-mid-stroke.png` });
  const rising = seen.filter((v, i) => i && v > seen[i - 1]).length;
  assert(rising >= 2, `the side view angle rises during the stroke: ${seen.join(', ')}`);
  const moving = seen.filter((v) => v > 0);
  checks.push(
    `second stroke, side view read on ${seen.length} frames: 0° while the ram comes down, then ${moving.slice(0, 4).join('°, ')}° … ${seen.at(-1)}° mid-bend`,
  );
  await page.waitForFunction(() => !document.querySelector('.cad-viewport').cadShop().station.stroking, null, {
    timeout: 5000,
  });
  model = await savedWhen((m) => m.parts[0].features[0].bends.length === 2, 'the second hit');
  const folded = await size(panel, 'Folded size');
  near(folded, expected, 'Folded size after two hits');
  checks.push(
    `second hit (edge 2, L 25, Space) → folded ${folded.join(' × ')} mm; expected ${expected.map((v) => v.toFixed(3)).join(' × ')}`,
  );

  // 6. A refused hit: a 5 mm flange off the right edge is short for the V10 die.
  await map.getByRole('button', { name: 'Gauge edge 2', exact: true }).click();
  await fill(panel, 'Backgauge L (mm)', 5);
  const refusal = panel.getByRole('alert').first();
  await expect(refusal).toContainText('the V10 88° die needs 8.27 mm to carry it on both shoulders');
  await expect(panel.getByRole('button', { name: 'Bend', exact: true })).toBeDisabled();
  const refusalText = await refusal.innerText();
  await page.waitForTimeout(200);
  await shot('04-refusal');
  checks.push(`refused: ${refusalText}`);

  // 7. A collision: bending the web in the middle swings both flanges into the punch.
  await map.getByRole('button', { name: 'Gauge edge 4', exact: true }).click();
  await fill(panel, 'Backgauge L (mm)', 47.5);
  const collision = panel.getByRole('alert', { name: 'Collision' });
  await expect(collision).toContainText('the part hits the');
  state = await shop();
  assert(state.station.collision, 'The viewport shows the collision.');
  // The side view shows it: the tool hit in red, the pose at the hit.
  await expect(sideView.getByRole('status', { name: 'Side view collision' })).toContainText(
    `Hits the ${state.station.collision.tool === 'self' ? 'part itself' : state.station.collision.tool}`,
  );
  const hitTool =
    state.station.collision.tool === 'self' ? 'path.cad-side-sheet' : `path.cad-side-${state.station.collision.tool}`;
  await expect(sideView.locator(hitTool)).toHaveClass(/is-hit/);
  assert(
    Math.abs((await sideAngle()) - Number(state.station.collision.angle.toFixed(1))) < 0.06,
    'The side view is posed at the hit.',
  );
  await page.waitForTimeout(300);
  await shot('05-collision');
  await sideView.screenshot({ path: `${directory}/08-side-view-collision.png` });
  checks.push(
    `collision: ${await collision.innerText()} (drawn at ${state.station.collision.angle.toFixed(1)}° on the ${state.station.collision.tool})`,
  );
  // Esc clears the pick.
  await panel.getByRole('heading', { name: '3 · Bend' }).click();
  await page.keyboard.press('Escape');
  await expect(panel.getByLabel('Gauge edge', { exact: true })).toHaveText(
    'Click a straight outline edge on the flat blank',
  );

  // 8. Leave: the kernel solid again, the same size.
  await panel.getByRole('button', { name: 'Leave press brake', exact: true }).click();
  state = await shop();
  assert.equal(state.station, null);
  await current();
  assert(
    (await bodies()).some((b) => b.visible),
    'The kernel bodies are back after leaving.',
  );
  await showTree();
  await page.locator('.cad-tree-item', { hasText: 'Sheet-metal part' }).first().click();
  const solid = await size(properties, 'Part size');
  near(solid, folded, 'The kernel solid against the station readout');
  checks.push(`leave → kernel part size ${solid.join(' × ')} mm`);

  // 9. Reload: both bends are in the saved part.
  await page.waitForTimeout(1500);
  const before = await saved();
  await page.reload();
  const workshop = page.getByRole('button', { name: '3D Model & workshop', exact: true });
  if (await workshop.isVisible().catch(() => false)) await workshop.click();
  await current();
  const after = await saved();
  assert.deepEqual(after.parts, before.parts, 'The part survives the reload.');
  assert.equal(after.parts[0].features[0].bends.length, 2);
  await page.locator('.cad-tree-item', { hasText: 'Sheet-metal part' }).first().click();
  await expect(
    properties.getByLabel('Sheet metal', { exact: true }).getByLabel('Flat blank', { exact: true }),
  ).toHaveText('Blank 100 × 60 mm · cut length 320 mm · 1 pierce · 2 bends');
  near(await size(properties, 'Part size'), folded, 'The reloaded part');
  checks.push(
    `reload → ${after.parts[0].features[0].bends.map((b) => `${b.direction} ${b.angle}° ${b.punch}/${b.die}`).join(', ')}`,
  );

  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ status: 'passed', errors, checks, model: after }, null, 2),
  );
  console.log('Fab shop SM-2 verification passed:\n- ' + checks.join('\n- '));
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` });
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}
