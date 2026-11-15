/* global localStorage, process, console, document */
// Round bends RB-2 (docs/sketch-studio-round-bend.md §12.7): a fresh model →
// Shop → Draw → Cut a 1000 × 40 strip of 1.5 SPCC → Bend: the right edge on
// the backgauge, L 300, 90°, Round · Made by Radius punch · Radius R30 (the
// die automatic: V80 60°) → one hit, the side view with the round nose in the
// die → the left edge, L 300, the second hit → two sequence rows "UP 90° R30"
// naming the punch, the §12.7 folded size, the job sheet's 2 hits. Then a
// fresh 600 × 400 blank, the line 40 mm in with the R30 punch: refused for the
// short leg, the card offers bump hits; its fix → Bump hits, 10 hits, and the
// same bend is made. No page errors.
//   CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-round-bend-rb2.mjs
// Screenshots: artifacts/sketch-cad/round-bend-rb2 (or RB2_SHOTS).
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { cadSteps } from './sketch-cad-steps.mjs';

const directory = process.env.RB2_SHOTS || 'artifacts/sketch-cad/round-bend-rb2';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [],
  checks = [],
  measured = {};
page.on('pageerror', (e) => errors.push(e.message));
const { properties, current, savedWhen, shopStation, shopMore } = cadSteps(page);
const footer = page.locator('.cad-status');
const shot = (name) => page.screenshot({ path: `${directory}/${name}.png` });
const shop = () => page.evaluate(() => document.querySelector('.cad-viewport').cadShop());
const sideView = page.getByRole('figure', { name: 'Side view' });
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
// §12.7: R30 on 1.5 SPCC, K 0.5: BA = π/2 · 30.75, setback R + t = 31.5.
const BA = (Math.PI / 2) * 30.75;
const end = 300 - BA / 2 + 31.5,
  middle = 400 - BA + 63;
const expected = [middle, 40, end];

// A fresh model, then Draw → Cut a W × H blank of 1.5 SPCC.
const blank = async (width, height) => {
  await page.goto(process.env.CAD_VERIFY_URL || 'http://localhost:5180/sketch');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '3D Model & workshop', exact: true }).click();
  await current();
  await page.getByRole('button', { name: 'Shop', exact: true }).click();
  const draw = properties.getByRole('region', { name: 'Draw' });
  await draw.getByRole('button', { name: /^Rectangle/ }).click();
  await fill(draw, 'Width W (mm)', width);
  await fill(draw, 'Height H (mm)', height);
  await draw.getByRole('button', { name: 'Cut this rectangle', exact: true }).click();
  const cut = properties.getByRole('region', { name: 'Cut from sheet' });
  await cut.getByLabel('Sheet stock', { exact: true }).selectOption('spcc');
  await fill(cut, 'Custom thickness (mm)', 1.5);
  await cut.getByRole('button', { name: 'Cut on the laser', exact: true }).click();
  await expect(page.getByRole('figure', { name: 'Laser bed' })).toHaveAttribute('data-state', 'cut', {
    timeout: 20000,
  });
  await expect(footer).toContainText('Model current', { timeout: 60000 });
  await savedWhen((m) => m.parts.some((p) => p.features[0]?.type === 'sheetmetal'), 'the blank');
  await shopStation('Bend');
  const panel = properties.getByRole('region', { name: 'Press brake' });
  const map = page.getByRole('figure', { name: 'Flat blank' });
  await expect(map).toBeVisible();
  return { panel, map };
};
const roundPunch = async (panel, key) => {
  await panel.getByRole('group', { name: 'Bend shape' }).getByRole('button', { name: 'Round', exact: true }).click();
  await panel
    .getByRole('group', { name: 'Made by' })
    .getByRole('button', { name: 'Radius punch', exact: true })
    .click();
  await panel.getByRole('combobox', { name: 'Radius punch', exact: true }).selectOption(key);
};

try {
  // 1. The 1000 × 40 strip; the right edge (edge 2) on the backgauge, L 300, Round · Radius punch · R30.
  const { panel, map } = await blank(1000, 40);
  // On a strip only 40 mm tall the long edges' click strips cover the short
  // ends: a click on the right edge's centre must still pick it (§12.8).
  // `force`: the click lands on whatever is on top there (the top edge's
  // strip), as a real pointer's does; Playwright would otherwise wait for the
  // right edge's own element to be uncovered.
  const right = map.getByRole('button', { name: 'Gauge edge 2', exact: true });
  await right.click({ force: true });
  await expect(right).toHaveAttribute('aria-pressed', 'true');
  await fill(panel, 'Backgauge L (mm)', 300);
  await fill(panel, 'Bend angle (°)', 90);
  await roundPunch(panel, 'radius-30');
  await expect(panel.getByLabel('Inside radius (mm)', { exact: true })).toHaveCount(0);
  await expect(panel.getByRole('spinbutton', { name: 'Hits', exact: true })).toHaveCount(0);
  await expect(panel.locator('details.cad-shop-tooling summary small')).toHaveText(
    '50 t × 2 m press brake · Radius R30 punch · V80 60° (automatic) die',
  );
  const results = panel.getByLabel('Hit results', { exact: true });
  await expect(results.getByLabel('Hits', { exact: true })).toHaveCount(0);
  await expect(results.getByLabel('Flange', { exact: true })).toHaveText('307.35 mm');
  await expect(results.getByLabel('Other leg', { exact: true })).toHaveText('707.35 mm');
  const numbers = panel.locator('details.cad-shop-numbers');
  if (!(await numbers.evaluate((d) => d.open))) await numbers.locator('summary').click();
  await expect(panel.getByLabel('Inside radius', { exact: true })).toHaveText('R30 mm');
  await expect(panel.getByLabel('Bend allowance', { exact: true })).toHaveText('48.3 mm');
  await expect(panel.getByLabel('Ram depth', { exact: true })).toBeVisible();
  await expect(panel.getByRole('status', { name: 'Collision check' })).toContainText('Clear through the stroke');
  measured.results = (await results.innerText()).replace(/\s+/g, ' ').trim();
  measured.readouts = (await panel.getByLabel('Hit readouts', { exact: true }).innerText()).replace(/\s+/g, ' ').trim();
  let state = await shop();
  assert.equal(state.station.punch, 'radius-30', JSON.stringify(state.station.punch));
  await map.screenshot({ path: `${directory}/02-flat-blank-card.png` });
  await page.waitForTimeout(300);
  await shot('01-radius-punch-setup');
  checks.push(
    `strip 1000 × 40, gauge edge 2, L 300, Round · Radius punch · R30 → ${measured.results} · ${measured.readouts}`,
  );

  // 2. Bend: one hit; mid-stroke the side view shows the round nose in the V80 die.
  const startedAt = Date.now();
  await panel.getByRole('button', { name: 'Bend', exact: true }).click();
  await page.waitForFunction(
    () => {
      const s = document.querySelector('.cad-viewport').cadShop().station;
      return s?.stroking && s.phase === 'bend' && s.angle > 55;
    },
    null,
    { timeout: 15000, polling: 'raf' },
  );
  await sideView.screenshot({ path: `${directory}/03-side-view-radius-punch.png` });
  await page.locator('.cad-viewport').screenshot({ path: `${directory}/04-radius-punch-3d.png` });
  const ram = await page.locator('[aria-label="Ram"]').textContent();
  let model = await savedWhen((m) => m.parts[0].features[0].bends.length === 1, 'the first radius-punch bend');
  measured.strokeMs = Date.now() - startedAt;
  const first = model.parts[0].features[0].bends[0];
  assert.deepEqual(
    [first.angle, first.direction, first.radius, first.steps, first.punch, first.die],
    [90, 'up', null, undefined, 'radius-30', 'v80-60'],
    JSON.stringify(first),
  );
  state = await shop();
  assert.equal(state.station.stroking, false);
  assert.equal(state.station.hits ?? 1, 1, 'one hit');
  checks.push(
    `Bend → one hit (side view "${ram}"), committed ${JSON.stringify({ radius: first.radius, punch: first.punch, die: first.die })}, stroke ≈ ${(measured.strokeMs / 1000).toFixed(1)} s`,
  );

  // 3. The second hit: the left edge (edge 4) on the backgauge, L 300; the session keeps Round · R30.
  await map.getByRole('button', { name: 'Gauge edge 4', exact: true }).click();
  await fill(panel, 'Backgauge L (mm)', 300);
  await expect(
    panel.getByRole('group', { name: 'Made by' }).getByRole('button', { name: 'Radius punch', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(panel.getByRole('status', { name: 'Collision check' })).toContainText('Clear through the stroke');
  await panel.getByRole('button', { name: 'Bend', exact: true }).click();
  model = await savedWhen((m) => m.parts[0].features[0].bends.length === 2, 'the second radius-punch bend');
  await expect(panel.getByRole('button', { name: 'Bend', exact: true })).toHaveText('Bend', { timeout: 15000 });
  const rows = panel.getByRole('list', { name: 'Sequence' }).getByRole('listitem');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).locator('strong')).toHaveText('1 · UP 90° R30');
  await expect(rows.nth(1).locator('strong')).toHaveText('2 · UP 90° R30');
  await expect(rows.nth(0).locator('small')).toHaveText('Radius R30 punch · v80-60');
  await expect(rows.nth(0).locator('.cad-brake-check')).toHaveText('ok');
  await expect(rows.nth(1).locator('.cad-brake-check')).toHaveText('ok');
  const folded = await size(panel, 'Folded size');
  near(folded, expected, 'Folded size');
  await page.waitForTimeout(300);
  await shot('05-strip-folded');
  checks.push(
    `second hit off edge 4, L 300 → rows "1 · UP 90° R30", "2 · UP 90° R30" (Radius R30 punch · v80-60, both ok); folded ${folded.join(' × ')} mm (expected ${expected.map((v) => v.toFixed(3)).join(' × ')})`,
  );

  // 4. The job sheet counts two hits.
  await panel.getByRole('button', { name: 'Leave press brake', exact: true }).click();
  await current();
  await shopMore('Job sheet');
  const job = properties.getByRole('region', { name: 'Job sheet' });
  await expect(job).toContainText('2 hits on the press brake');
  await expect(job).toContainText('Radius R30 punch, V80 60° die');
  await page.waitForTimeout(200);
  await shot('06-job-sheet');
  checks.push('job sheet: "2 hits on the press brake", "Radius R30 punch, V80 60° die"');

  // 5. A fresh 600 × 400 blank, the line 40 mm in with the R30 punch: refused for the short leg, fixed by bump hits.
  const again = await blank(600, 400);
  await again.map.getByRole('button', { name: 'Gauge edge 2', exact: true }).click();
  await fill(again.panel, 'Backgauge L (mm)', 40);
  await fill(again.panel, 'Bend angle (°)', 90);
  await roundPunch(again.panel, 'radius-30');
  const alert = again.panel.getByRole('alert');
  await expect(alert).toHaveText(
    'The flange is 40 mm from the punch line in the flat; the V80 60° die needs 66.57 mm to carry it on both shoulders. Cut the blank larger, so the flange is at least 66.57 mm from the punch line, or make it with bump hits: they need only about 27.95 mm.',
  );
  measured.refusal = await alert.innerText();
  await expect(again.panel.getByRole('button', { name: 'Bend', exact: true })).toBeDisabled();
  await page.waitForTimeout(200);
  await shot('07-short-leg-refused');
  await again.panel.getByRole('button', { name: 'Make it with bump hits', exact: true }).click();
  await expect(
    again.panel.getByRole('group', { name: 'Made by' }).getByRole('button', { name: 'Bump hits', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(again.panel.getByLabel('Inside radius (mm)', { exact: true })).toHaveValue('30');
  await expect(again.panel.getByRole('spinbutton', { name: 'Hits', exact: true })).toHaveAttribute('placeholder', '10');
  await expect(again.panel.getByRole('alert')).toHaveCount(0);
  const bumpResults = again.panel.getByLabel('Hit results', { exact: true });
  await expect(bumpResults.getByLabel('Hits', { exact: true })).toHaveText('10 hits · 9° each · every 4.83 mm');
  await expect(again.panel.getByRole('status', { name: 'Collision check' })).toContainText('Clear through the stroke');
  await page.waitForTimeout(200);
  await shot('08-bump-fix');
  await again.panel.getByRole('button', { name: 'Bend', exact: true }).click();
  model = await savedWhen((m) => m.parts[0].features[0].bends.length === 1, 'the bump-hit bend');
  const bumped = model.parts[0].features[0].bends[0];
  assert.deepEqual(
    [bumped.radius, bumped.steps, bumped.punch, bumped.die],
    [30, 10, 'straight-88', 'v10-88'],
    JSON.stringify(bumped),
  );
  await expect(again.panel.getByRole('button', { name: 'Bend', exact: true })).toHaveText('Bend', { timeout: 20000 });
  await expect(
    again.panel.getByRole('list', { name: 'Sequence' }).getByRole('listitem').first().locator('strong'),
  ).toHaveText('1 · UP 90° R30 · 10 hits');
  await page.waitForTimeout(300);
  await shot('09-bump-fix-made');
  checks.push(
    `600 × 400, L 40, R30 punch → refused "${measured.refusal}"; Make it with bump hits → Bump hits, R30, 10 hits, clear; made: ${JSON.stringify({ radius: bumped.radius, steps: bumped.steps, punch: bumped.punch, die: bumped.die })}`,
  );

  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ status: 'passed', errors, checks, measured }, null, 2),
  );
  console.log('Round bend RB-2 verification passed:\n- ' + checks.join('\n- '));
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` });
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}
