/* global localStorage, process, console, document, requestAnimationFrame */
// Round bends RB-1 (docs/sketch-studio-round-bend.md §8): a fresh model →
// Shop → Draw → Cut a 600 × 400 blank of 1.5 SPCC → Bend: the right edge on
// the backgauge, L 300, 90°, Bend shape Round, R40 (hits automatic: 13) → the
// results read the §8 numbers → Bend: the ram cycles 13 times (the curve
// grows hit by hit, the fingers step nearer) and ONE bend record is
// committed → the sequence row, the folded size, the job sheet's hit count →
// leave, reload: the round bend is in the saved part, the kernel solid the
// same size. Frame times of the bump measured by the shop layer. No page errors.
//   CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-round-bend-rb1.mjs
// Screenshots: artifacts/sketch-cad/round-bend-rb1 (or RB1_SHOTS).
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { cadSteps } from './sketch-cad-steps.mjs';

const directory = process.env.RB1_SHOTS || 'artifacts/sketch-cad/round-bend-rb1';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [],
  checks = [],
  measured = {};
page.on('pageerror', (e) => errors.push(e.message));
const { properties, current, savedWhen, saved, shopStation, shopMore, showTree } = cadSteps(page);
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
// §8: R40 on 1.5 SPCC, K 0.5: the outside legs 300 − BA/2 + R + t.
const BA = (Math.PI / 2) * (40 + 0.75);
const leg = 300 - BA / 2 + 41.5;
const expected = [leg, 400, leg];

try {
  await page.goto(process.env.CAD_VERIFY_URL || 'http://localhost:5180/sketch');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '3D Model & workshop', exact: true }).click();
  await current();

  // 1. Draw → Cut a 600 × 400 blank of 1.5 SPCC.
  await page.getByRole('button', { name: 'Shop', exact: true }).click();
  const draw = properties.getByRole('region', { name: 'Draw' });
  await draw.getByRole('button', { name: /^Rectangle/ }).click();
  await fill(draw, 'Width W (mm)', 600);
  await fill(draw, 'Height H (mm)', 400);
  await draw.getByRole('button', { name: 'Cut this rectangle', exact: true }).click();
  const cut = properties.getByRole('region', { name: 'Cut from sheet' });
  await cut.getByLabel('Sheet stock', { exact: true }).selectOption('spcc');
  await fill(cut, 'Custom thickness (mm)', 1.5);
  await cut.getByRole('button', { name: 'Cut on the laser', exact: true }).click();
  await expect(page.getByRole('figure', { name: 'Laser bed' })).toHaveAttribute('data-state', 'cut', { timeout: 20000 });
  await expect(footer).toContainText('Model current', { timeout: 60000 });
  await savedWhen((m) => m.parts.some((p) => p.features[0]?.type === 'sheetmetal'), 'the blank');
  checks.push('Draw → Cut on the laser → 600 × 400 × 1.5 SPCC blank');

  // 2. Bend: the right edge (edge 2) on the backgauge, L 300, 90°, Round, R40.
  await shopStation('Bend');
  const panel = properties.getByRole('region', { name: 'Press brake' });
  const map = page.getByRole('figure', { name: 'Flat blank' });
  await expect(map).toBeVisible();
  await map.getByRole('button', { name: 'Gauge edge 2', exact: true }).click();
  await fill(panel, 'Backgauge L (mm)', 300);
  await fill(panel, 'Bend angle (°)', 90);
  await panel.getByRole('group', { name: 'Bend shape' }).getByRole('button', { name: 'Round', exact: true }).click();
  await fill(panel, 'Inside radius (mm)', 40);
  const hitsField = panel.getByRole('spinbutton', { name: 'Hits', exact: true });
  await expect(hitsField).toHaveAttribute('placeholder', '13');
  const results = panel.getByLabel('Hit results', { exact: true });
  await expect(results.getByLabel('Hits', { exact: true })).toHaveText('13 hits · 6.92° each · every 4.92 mm');
  await expect(results.getByLabel('Flats', { exact: true })).toHaveText('0.08 mm high');
  await expect(results.getByLabel('Flange', { exact: true })).toHaveText('309.5 mm');
  const numbers = panel.locator('details.cad-shop-numbers');
  if (!(await numbers.evaluate((d) => d.open))) await numbers.locator('summary').click();
  await expect(panel.getByLabel('Backgauge per hit', { exact: true })).toHaveText('329.54 → 270.46 mm');
  await expect(panel.getByLabel('Ram depth per hit', { exact: true })).toHaveText('0.26 mm');
  await expect(panel.getByRole('status', { name: 'Collision check' })).toContainText('Clear through the stroke');
  measured.results = (await results.innerText()).replace(/\s+/g, ' ').trim();
  measured.readouts = (await panel.getByLabel('Hit readouts', { exact: true }).innerText()).replace(/\s+/g, ' ').trim();
  let state = await shop();
  assert.equal(state.station.hit, 1, 'the pending pose sits hit 1 in the die');
  assert(Math.abs(state.station.gaugeDistance - 300) < 1e-9, 'the station keeps L of the centre line');
  await map.screenshot({ path: `${directory}/02-flat-blank-card.png` });
  await page.waitForTimeout(300);
  await shot('01-round-setup');
  checks.push(`gauge edge 2, L 300, 90°, Round R40 → ${measured.results} · ${measured.readouts}`);

  // 3. Bend: the ram cycles 13 times; mid-bump the curve is part-made.
  const startedAt = Date.now();
  await panel.getByRole('button', { name: 'Bend', exact: true }).click();
  // Watch the hits go by, frame by frame (the hit in the die, the side view's phase).
  const watch = page.evaluate(
    () =>
      new Promise((resolve) => {
        const seen = new Set();
        const phases = new Set();
        const read = () => {
          const s = document.querySelector('.cad-viewport').cadShop().station;
          if (s?.hit) seen.add(s.hit);
          const phase = document.querySelector('[aria-label="Ram"]')?.textContent;
          if (phase) phases.add(phase);
          if (s && !s.stroking && seen.size > 1) resolve({ hits: [...seen].sort((a, b) => a - b), phases: [...phases] });
          else requestAnimationFrame(read);
        };
        read();
      }),
  );
  await page.waitForFunction(
    () => {
      const s = document.querySelector('.cad-viewport').cadShop().station;
      return s?.stroking && s.hit >= 6 && s.phase === 'bend';
    },
    null,
    { timeout: 15000, polling: 'raf' },
  );
  const mid = (await shop()).station;
  // The fingers stand at hit j's reading, L + BA/2 − (j − ½)·p, the station's L staying 300.
  const fingerAt = 300 + BA / 2 - (mid.hit - 0.5) * (BA / 13);
  assert(Math.abs(mid.fingerDistance - fingerAt) < 1e-6, `fingers at ${mid.fingerDistance}, want ${fingerAt}`);
  assert(Math.abs(mid.gaugeDistance - 300) < 1e-9);
  await shot('03-mid-bump');
  await sideView.screenshot({ path: `${directory}/04-side-view-mid-bump.png` });
  await page.locator('.cad-viewport').screenshot({ path: `${directory}/05-mid-bump-3d.png` });
  const seen = await watch;
  measured.strokeMs = Date.now() - startedAt;
  assert.deepEqual(
    seen.hits,
    Array.from({ length: 13 }, (_, i) => i + 1),
    `every hit in the die in turn: ${seen.hits}`,
  );
  assert(
    seen.phases.some((p) => /hit \d+ of 13$/.test(p)),
    `the side view names the hit: ${seen.phases.join(' | ')}`,
  );
  checks.push(
    `Bend → hits ${seen.hits[0]} … ${seen.hits.at(-1)} seen in the die; mid-bump hit ${mid.hit} at ${mid.angle.toFixed(1)}° (fingers at ${mid.fingerDistance.toFixed(2)} mm, L ${mid.gaugeDistance}); stroke ≈ ${(measured.strokeMs / 1000).toFixed(1)} s; side view "${seen.phases.find((p) => /hit/.test(p))}"`,
  );

  // 4. One bend record, one sequence row, the §8 folded size.
  const model = await savedWhen((m) => m.parts[0].features[0].bends.length === 1, 'the round bend');
  const bend = model.parts[0].features[0].bends[0];
  assert.deepEqual(
    [bend.angle, bend.direction, bend.radius, bend.steps, bend.die],
    [90, 'up', 40, 13, 'v10-88'],
    JSON.stringify(bend),
  );
  state = await shop();
  assert.equal(state.station.stroking, false);
  assert.equal(state.station.angle, 90);
  measured.frames = state.station.lastStroke;
  assert(measured.frames && measured.frames.frames > 100, `frames counted: ${JSON.stringify(measured.frames)}`);
  const rows = panel.getByRole('list', { name: 'Sequence' }).getByRole('listitem');
  await expect(rows).toHaveCount(1);
  await expect(rows.first().locator('strong')).toHaveText('1 · UP 90° R40 · 13 hits');
  const folded = await size(panel, 'Folded size');
  near(folded, expected, 'Folded size');
  await page.waitForTimeout(300);
  await shot('06-finished-part');
  checks.push(
    `committed ${JSON.stringify({ radius: bend.radius, steps: bend.steps, die: bend.die })}; sequence "1 · UP 90° R40 · 13 hits"; folded ${folded.join(' × ')} mm (expected ${expected.map((v) => v.toFixed(3)).join(' × ')})`,
  );
  checks.push(
    `bump frame work (pose + side view + render, per frame): ${measured.frames.frames} frames, mean ${measured.frames.meanMs} ms, worst ${measured.frames.worstMs} ms`,
  );

  // 5. The job sheet counts the hits.
  await panel.getByRole('button', { name: 'Leave press brake', exact: true }).click();
  await current();
  await shopMore('Job sheet');
  const job = properties.getByRole('region', { name: 'Job sheet' });
  await expect(job).toContainText('13 hits on the press brake');
  await expect(job).toContainText('UP 90° R40 · 13 hits');
  measured.jobBend = await job.getByLabel('Bend time', { exact: true }).first().innerText();
  await page.waitForTimeout(200);
  await shot('07-job-sheet');
  checks.push(`job sheet: "13 hits on the press brake", Bend ${measured.jobBend}`);

  // 6. Reload: the round bend is in the saved part; the kernel solid has the same size.
  await page.waitForTimeout(1500);
  const before = await saved();
  await page.reload();
  const workshop = page.getByRole('button', { name: '3D Model & workshop', exact: true });
  if (await workshop.isVisible().catch(() => false)) await workshop.click();
  await current();
  const after = await saved();
  assert.deepEqual(after.parts, before.parts, 'The part survives the reload.');
  assert.equal(after.parts[0].features[0].bends[0].steps, 13);
  await showTree();
  await page.locator('.cad-tree-item', { hasText: 'Sheet-metal part' }).first().click();
  const solid = await size(properties, 'Part size');
  near(solid, folded, 'The reloaded kernel solid against the station readout');
  checks.push(`reload → the bend keeps steps 13; kernel part size ${solid.join(' × ')} mm`);

  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ status: 'passed', errors, checks, measured }, null, 2),
  );
  console.log('Round bend RB-1 verification passed:\n- ' + checks.join('\n- '));
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` });
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}
