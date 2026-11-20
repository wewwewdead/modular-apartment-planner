/* global localStorage, process, console, document */
// Gauging off a flange SG-1 (docs/sketch-studio-skin-gauge.md §4.8): L is what
// the backgauge reads. A 300 × 100 blank of 1.2 SPCC, straight punch, the left
// edge (edge 4) on the backgauge:
//  1. L 20, 90° → hit (the user's first);
//  2. edge 4 again, L 30 typed → "Backgauge L" reads "30 mm · off bend 1's
//     flange", "Line on the flat blank" "48.93 mm from edge 4"; the fingers in
//     the 3D view stand at 30, where the standing flange's skin is (the reading
//     worked out again here, in node, on the saved part); pedal → the second
//     bend at flat 48.9306 (the user's "20 then 30": the 50 typed before was
//     1.07 out);
//  3. Gauge off → Bend 1's flange, L 15 → flat 33.93; Automatic, L 15 → the
//     hint "L 15 is from the edge, inside bend 1's flange." and its button,
//     which gauges off bend 1's flange;
//  4. Automatic, L 60 → off bend 2's flange; the fingers dragged a millimetre
//     back and forth on that stop: the chip "L 61 mm · off bend 2 · …", the
//     fingers at 61, then 59; Esc → L 60 off bend 2's flange again;
//  5. no page error, no .cad-error.
// Screenshots at 1600 × 1000 and 1366 × 768.
//   CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-skin-gauge.mjs
// Screenshots: artifacts/sketch-cad/skin-gauge (or SG_SHOTS).
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { cadSteps } from './sketch-cad-steps.mjs';
import { foldSheet } from '../src/features/sketchstudio/cad/sheetMetal.js';
import { brakeReading, gaugeEdges } from '../src/features/sketchstudio/cad/pressBrake.js';

const directory = process.env.SG_SHOTS || 'artifacts/sketch-cad/skin-gauge';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [],
  checks = [],
  measured = {};
page.on('pageerror', (e) => errors.push(e.message));
const { properties, current, saved, savedWhen, shopStation } = cadSteps(page);
const footer = page.locator('.cad-status');
const chip = page.locator('.cad-grip-chip');
const station = () => page.evaluate(() => document.querySelector('.cad-viewport').cadShop().station);
const stationWhen = (test, timeout = 20000) =>
  page.waitForFunction(
    (body) => {
      const s = document.querySelector('.cad-viewport')?.cadShop?.().station;
      return Boolean(s) && new Function('s', `return ${body};`)(s);
    },
    test,
    { polling: 'raf', timeout },
  );
const shot = async (name, focus = null) => {
  await page.waitForTimeout(250);
  if (focus) await focus.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: `${directory}/${name}-1600.png` });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.waitForTimeout(400);
  if (focus) await focus.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: `${directory}/${name}-1366.png` });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.waitForTimeout(300);
};
const fill = async (scope, label, value) => {
  const field = scope.getByLabel(label, { exact: true });
  await field.fill(String(value));
  await field.press('Enter');
};
const bendsOf = (m) => m.parts[0].features[0].bends;
const text = async (locator) => (await locator.innerText()).replace(/\s+/g, ' ').trim();
const W = 300,
  H = 100;
const BLANK = { type: 'rectangle', width: W, height: H, origin: [0, 0] };

try {
  // A fresh model, then Draw → Cut the 300 × 100 blank of 1.2 SPCC → Bend.
  await page.goto(process.env.CAD_VERIFY_URL || 'http://localhost:5180/sketch');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '3D Model & workshop', exact: true }).click();
  await current();
  await page.getByRole('button', { name: 'Shop', exact: true }).click();
  const draw = properties.getByRole('region', { name: 'Draw' });
  await draw.getByRole('button', { name: /^Rectangle/ }).click();
  await fill(draw, 'Width W (mm)', W);
  await fill(draw, 'Height H (mm)', H);
  await draw.getByRole('button', { name: 'Cut this rectangle', exact: true }).click();
  const cut = properties.getByRole('region', { name: 'Cut from sheet' });
  await cut.getByLabel('Sheet stock', { exact: true }).selectOption('spcc');
  await fill(cut, 'Custom thickness (mm)', 1.2);
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
  const L = panel.getByLabel('Backgauge L (mm)', { exact: true });
  const reads = async () => (await panel.locator('dd[aria-label="Backgauge L"]').textContent()).trim();
  const flatLine = panel.locator('dd[aria-label="Line on the flat blank"]');
  const gaugeOff = panel.getByLabel('Gauge off', { exact: true });
  const edge4 = () => map.getByRole('button', { name: 'Gauge edge 4', exact: true }).click();
  const pedal = async (count, what) => {
    await expect(panel.getByRole('status', { name: 'Collision check' })).toContainText('Clear through the stroke');
    await panel.getByRole('button', { name: 'Bend', exact: true }).click();
    const model = await savedWhen((m) => bendsOf(m).length === count, what);
    await expect(panel.getByRole('button', { name: 'Bend', exact: true })).toHaveText('Bend', { timeout: 20000 });
    await stationWhen('!s.stroking && !s.turning', 20000);
    return model;
  };

  // 1. L 20, 90°: the first hit, gauged off the edge.
  await edge4();
  await fill(panel, 'Backgauge L (mm)', 20);
  assert.equal(await reads(), '20 mm');
  await expect(gaugeOff).toHaveCount(0);
  await pedal(1, 'bend 1 at L 20');
  checks.push('edge 4, L 20, 90° → hit; no Gauge off before a bend, Backgauge L "20 mm"');

  // 2. The same edge again, L 30: off the skin of bend 1's flange.
  await edge4();
  await expect(gaugeOff).toHaveValue('auto');
  await fill(panel, 'Backgauge L (mm)', 30);
  await expect(L).toHaveValue('30');
  await expect(panel.locator('dd[aria-label="Backgauge L"]')).toHaveText("30 mm · off bend 1's flange");
  await expect(flatLine).toHaveText('48.93 mm from edge 4');
  await page.evaluate(() => document.activeElement?.blur?.());
  await stationWhen('!s.turning && s.fingerDistance != null', 10000);
  const s2 = await station();
  // The reading again, in node, on the saved part: the skin of the formed flange.
  const madeOne = bendsOf(await saved());
  const edges = gaugeEdges([
    [0, 0],
    [W, 0],
    [W, H],
    [0, H],
  ]);
  const left = edges.find((e) => Math.abs(e.a[0]) < 1e-6 && Math.abs(e.b[0]) < 1e-6);
  const fold = foldSheet(
    {
      thickness: 1.2,
      stock: 'spcc',
      kFactor: null,
      bends: [
        ...madeOne,
        { id: 'probe', a: [48.9306, 0], b: [48.9306, H], angle: 90, direction: 'up', punch: 'straight-88' },
      ],
    },
    BLANK,
  );
  const skin = brakeReading(fold, 'probe', left).distance;
  measured.fingers = { drawnAt: s2.fingerDistance, gaugeDistance: s2.gaugeDistance, skinInNode: skin };
  assert(Math.abs(s2.fingerDistance - 30) < 1e-6, `the fingers at 30: ${JSON.stringify(measured.fingers)}`);
  assert(Math.abs(skin - 30) < 1e-3, `the flange's skin 30 from the line: ${JSON.stringify(measured.fingers)}`);
  await shot('01-l30-off-the-flange');
  await shot('02-l30-panel', panel.locator('dd[aria-label="Backgauge L"]'));
  measured.reads30 = await reads();
  measured.flat30 = (await flatLine.textContent()).trim();
  const two = await pedal(2, 'bend 2 off bend 1’s flange');
  const second = bendsOf(two)[1];
  measured.secondBend = { a: second.a, b: second.b };
  assert(Math.abs(second.a[0] - 48.9306) < 1e-3 && Math.abs(second.b[0] - 48.9306) < 1e-3, JSON.stringify(second));
  await shot('03-two-hits');
  checks.push(
    `edge 4 again, L 30 → Backgauge L "${measured.reads30}", Line on the flat blank "${measured.flat30}"; fingers drawn at ${s2.fingerDistance}, the skin read in node ${skin.toFixed(4)}; pedal → bend 2 at x ${second.a[0].toFixed(4)}`,
  );

  // 3. Gauge off → Bend 1's flange, L 15: flat 33.93. Then Automatic and the hint.
  await edge4();
  await expect(gaugeOff.locator('option')).toHaveText(['Automatic', 'The edge', "Bend 1's flange", "Bend 2's flange"]);
  await gaugeOff.selectOption({ label: "Bend 1's flange" });
  await fill(panel, 'Backgauge L (mm)', 15);
  await expect(panel.locator('dd[aria-label="Backgauge L"]')).toHaveText("15 mm · off bend 1's flange");
  await expect(flatLine).toHaveText('33.93 mm from edge 4');
  await shot('04-gauge-off-bend-1', gaugeOff);
  await gaugeOff.selectOption({ label: 'Automatic' });
  await expect(L).toHaveValue('15');
  const hint = panel.getByRole('note', { name: 'Gauge off a flange', exact: true });
  await expect(hint).toHaveText("L 15 is from the edge, inside bend 1's flange. Gauge off bend 1's flange");
  await expect(panel.locator('dd[aria-label="Backgauge L"]')).toHaveText('15 mm');
  await expect(flatLine).toHaveCount(0);
  await shot('05-hint', hint);
  measured.hint = await text(hint);
  await hint.getByRole('button', { name: "Gauge off bend 1's flange", exact: true }).click();
  await expect(gaugeOff).toHaveValue(bendsOf(two)[0].id);
  await expect(flatLine).toHaveText('33.93 mm from edge 4');
  await expect(hint).toHaveCount(0);
  checks.push(
    `Gauge off → Bend 1's flange, L 15 → flat 33.93; Automatic → "${measured.hint}"; its button → Gauge off bend 1's flange, flat 33.93`,
  );

  // 4. Automatic, L 60: off bend 2's flange. The fingers dragged on that stop, then Esc.
  await gaugeOff.selectOption({ label: 'Automatic' });
  await fill(panel, 'Backgauge L (mm)', 60);
  await expect(panel.locator('dd[aria-label="Backgauge L"]')).toHaveText("60 mm · off bend 2's flange");
  const flat60 = (await flatLine.textContent()).trim();
  measured.flat60 = flat60;
  await page.evaluate(() => document.activeElement?.blur?.());
  await stationWhen('!s.turning && s.reach.fingersOffered && s.reach.fingers.length === 2 && s.gaugeDistance === 60');
  await page.waitForTimeout(300);
  const fingerStart = (await station()).reach.fingers[0];
  const geometry = await page.evaluate(() => {
    const el = document.querySelector('.cad-viewport');
    const y = el.cadShop().station.fingerDistance;
    const a = el.cadProject([0, y + 45, 1002]),
      b = el.cadProject([0, y + 145, 1002]);
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return { back: [(b[0] - a[0]) / d, (b[1] - a[1]) / d], pxPerMm: d / 100 };
  });
  const along = (mm) => [
    fingerStart[0] + geometry.back[0] * mm * geometry.pxPerMm,
    fingerStart[1] + geometry.back[1] * mm * geometry.pxPerMm,
  ];
  await page.mouse.move(5, 5);
  await page.mouse.move(...fingerStart, { steps: 3 });
  await stationWhen("Boolean(s.reach.lit) && s.reach.lit.kind === 'fingers'", 5000);
  await page.mouse.down();
  // Past the click's dead zone first (toward the operator), then a millimetre at a time.
  const dead = Math.ceil(6 / geometry.pxPerMm);
  await page.mouse.move(...along(-Math.min(dead, 8)));
  await page.waitForTimeout(200);
  measured.drag = [];
  for (const target of [59, 60, 61, 62, 61, 59]) {
    await page.mouse.move(...along(target - 60));
    await page.waitForTimeout(200);
    await expect(chip).toHaveText(new RegExp(`^L ${target} mm · off bend 2 · flange`), { timeout: 5000 });
    await stationWhen(`!s.turning && s.fingerDistance === ${target}`, 5000);
    const words = (await chip.innerText()).split('\n')[0].trim();
    measured.drag.push({ L: target, chip: words, fingersAt: (await station()).fingerDistance });
    if (target === 62) await shot('06-fingers-dragged-off-bend-2');
  }
  await expect(L).toHaveValue('59');
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(L).toHaveValue('60');
  await expect(panel.locator('dd[aria-label="Backgauge L"]')).toHaveText("60 mm · off bend 2's flange");
  await expect(flatLine).toHaveText(flat60);
  await stationWhen('!s.turning && s.fingerDistance === 60', 5000);
  checks.push(
    `Automatic, L 60 → off bend 2's flange (${flat60}); drag ${measured.drag.map((d) => `${d.L}: "${d.chip}" @${d.fingersAt}`).join('; ')}; Esc → L 60 off bend 2's flange, ${flat60}`,
  );

  // 5.
  const lines = await page.locator('.cad-error').allInnerTexts();
  assert.deepEqual(lines, [], `no error line: ${JSON.stringify(lines)}`);
  if (errors.length) throw new Error(errors.join('\n'));
  checks.push('no page error; no .cad-error');
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ status: 'passed', errors, checks, measured }, null, 2),
  );
  console.log('Skin gauge SG-1 verification passed:\n- ' + checks.join('\n- '));
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` });
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}
