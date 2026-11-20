/* global localStorage, process, console, document, window, performance, requestAnimationFrame, DOMPoint, PerformanceObserver */
// Tight bends TB-2 (docs/sketch-studio-tight-bends.md §5.3): the brake finds the way.
//  1. The screenshot's part in the user's order: 605.4 × 420.4, t 1.2; right
//     edge L 29, 90° → hit; L 11, 90° → the card offers "Make this hit before
//     bend 1" → click: the view shows the sheet flat at the inner line → pedal
//     → two rows (the lip first), both ok, folded 577.47 × 420.4 × 20.14 mm;
//  3. lip 20 / web 10 on the same blank (lines 20 and 30 from the edge), inner
//     first → try 3's words, no button; the lip first, then the inner → the same
//     (docs/sketch-studio-shop-punches.md §5.8 item 8: lip 15 / web 15 now passes
//     with the shop's punches and the slanted take-off);
//  4. a stored sequence that collides (the file made by data: inner then lip):
//     the row's card offers "Move step 2 before step 1" → click → ok;
//  2. the tight Z: a 315 × 200 rectangle, t 1.2; 150 from the left edge up 90°
//     → hit; 150 from the right edge DOWN 90° → the card offers "Bend 1 to 45°
//     first, finish it after this hit" (no "Make this hit before"; 45° first
//     since docs/sketch-studio-shop-punches.md §6.4, it was 60°) → click →
//     pedal → three rows: 1 at 45°, 2, "bend 1 on: 45° → 90°", all ok; Undo
//     takes the three changes back in one step;
//  5. timing: the tries for step 1's and step 2's cards (and step 3's, where
//     every try is made), worst case, on the app's own modules; no frame over
//     50 ms from them while the punch line is dragged on the flat blank (the
//     tries never run during the drag: the card's buttons wait for the settle);
//  6. no page error; no .cad-error but the refusals asked for.
// (3 and 4 run on step 1's blank, 2 on a fresh model.) Screenshots at 1600 × 1000 and 1366 × 768.
//   CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-tight-bends-tb2.mjs
// Screenshots: artifacts/sketch-cad/tight-bends-tb2 (or TB2_SHOTS).
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { cadSteps } from './sketch-cad-steps.mjs';
import { foldSheet, foldedBounds } from '../src/features/sketchstudio/cad/sheetMetal.js';
import {
  NO_WAY,
  brakeSessionDefaults,
  brakeStation,
  sequenceChecks,
  wayTries,
} from '../src/features/sketchstudio/cad/brakeStation.js';
import { gaugeEdges } from '../src/features/sketchstudio/cad/pressBrake.js';
import { emptyModel } from '../src/features/sketchstudio/cad/model.js';

const directory = process.env.TB2_SHOTS || 'artifacts/sketch-cad/tight-bends-tb2';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [],
  checks = [],
  measured = {};
page.on('pageerror', (e) => errors.push(e.message));
const { properties, current, saved, savedWhen, shopStation } = cadSteps(page);
const footer = page.locator('.cad-status');
const files = page.locator('.cad-file-actions');
const shop = () => page.evaluate(() => document.querySelector('.cad-viewport').cadShop());
const sideView = page.getByRole('figure', { name: 'Side view' });
// Both sizes (§5.3): the 1366 × 768 one taken and put back; `focus` scrolled into the panel's view at each.
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
const size = async (scope, label) => {
  const text = await scope.getByLabel(label, { exact: true }).innerText();
  const match = text.match(/([\d.]+) × ([\d.]+) × ([\d.]+) mm/);
  assert(match, `${label} readout: "${text}"`);
  return match.slice(1).map(Number);
};
const near = (actual, expected, what, tolerance = 0.01) =>
  actual.forEach((v, i) =>
    assert(
      Math.abs(v - expected[i]) <= tolerance + 1e-9,
      `${what}: ${actual.join(' × ')} against ${expected.join(' × ')}`,
    ),
  );
const errorLines = () => page.locator('.cad-error').allInnerTexts();
const asked = [];
const noErrorLine = async (where) => {
  const lines = await errorLines();
  assert(
    lines.every((l) => asked.some((a) => l.startsWith(a))),
    `no error line ${where} but the refusals asked for: ${JSON.stringify(lines)}`,
  );
};
const bendsOf = (m) => m.parts[0].features[0].bends;

// The lip-first part (§2: both bends at 90°, lip first), folded by the same module the app uses.
const W = 605.4,
  H = 420.4;
const ZW = 315,
  ZH = 200;
const rectangle = (w, h) => ({ type: 'rectangle', width: w, height: h, origin: [0, 0] });
const lipFirst = foldSheet(
  {
    thickness: 1.2,
    stock: 'spcc',
    kFactor: null,
    bends: [
      { id: 'lip', a: [W - 11, 0], b: [W - 11, H], angle: 90, direction: 'up', punch: 'straight-88' },
      { id: 'inner', a: [W - 29, 0], b: [W - 29, H], angle: 90, direction: 'up', punch: 'straight-88' },
    ],
  },
  rectangle(W, H),
);
const [lo, hi] = foldedBounds(lipFirst);
const expected = lo.map((v, i) => Number((hi[i] - v).toFixed(2)));

// A fresh model, then Draw → Cut the blank of 1.2 SPCC → Bend.
const blank = async (width = W, height = H) => {
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
  return { panel, map };
};
// The right edge (edge 2) on the backgauge, L and the angle.
const pick = async ({ panel, map }, L, angle = null) => {
  await map.getByRole('button', { name: 'Gauge edge 2', exact: true }).click();
  await fill(panel, 'Backgauge L (mm)', L);
  if (angle != null) await fill(panel, 'Bend angle (°)', angle);
};
const pedal = async (panel, count, what) => {
  await expect(panel.getByRole('status', { name: 'Collision check' })).toContainText('Clear through the stroke');
  await panel.getByRole('button', { name: 'Bend', exact: true }).click();
  const model = await savedWhen((m) => bendsOf(m).length === count, what);
  await expect(panel.getByRole('button', { name: 'Bend', exact: true })).toHaveText('Bend', { timeout: 20000 });
  return model;
};
const undo = async (count, what) => {
  await files.getByRole('button', { name: 'Undo', exact: true }).click();
  return savedWhen((m) => bendsOf(m).length === count, what);
};
const rows = (panel) => panel.getByRole('list', { name: 'Sequence' }).getByRole('listitem');
const row = (panel, n) => panel.getByRole('list', { name: 'Sequence' }).getByRole('listitem', { name: `Step ${n}` });
const rowTexts = async (panel) => (await rows(panel).locator('strong').allInnerTexts()).map((t) => t.trim());
const rowChecks = async (panel) => (await rows(panel).locator('.cad-brake-check').allInnerTexts()).map((t) => t.trim());
const card = (panel) => panel.getByRole('alert', { name: 'Collision' });
const wayButtons = (panel) =>
  panel.getByRole('button', { name: /^Make this hit before|first, finish it after this hit$/ });
// The card's button and the panel's Bend in the window at a size (nothing clipped).
const reachable = async (panel, locator, where) => {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  const view = page.viewportSize();
  assert(box && box.y >= 0 && box.y + box.height <= view.height, `${where}: the card's button in the window`);
  const bend = await panel.getByRole('button', { name: 'Bend', exact: true }).boundingBox();
  assert(bend && bend.y + bend.height <= view.height, `${where}: the Bend button in the window`);
  return { button: Math.round(box.y), bend: Math.round(bend.y) };
};

try {
  // 1. The screenshot's part in the user's order.
  const station = await blank();
  const { panel } = station;
  await pick(station, 29, 90);
  let model = await pedal(panel, 1, 'the inner bend at 90°');
  const inner = bendsOf(model)[0];
  await pick(station, 11, 90);
  await expect(card(panel)).toContainText('Bend 2: the part hits the ram as the ram comes down.');
  const first = panel.getByRole('button', { name: 'Make this hit before bend 1', exact: true });
  await expect(first).toBeVisible({ timeout: 10000 });
  await expect(panel.getByRole('button', { name: /first, finish it after this hit$/ })).toHaveCount(0);
  measured.card1 = await card(panel).innerText();
  assert.match(measured.card1, /Bend this one earlier\./);
  measured.reach1600 = await reachable(panel, first, '1600 × 1000');
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.waitForTimeout(400);
  measured.reach1366 = await reachable(panel, first, '1366 × 768');
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.waitForTimeout(300);
  await shot('01-screenshot-part-card', card(panel));
  await first.click();
  const note = panel.getByRole('status', { name: 'Bend order', exact: true });
  await expect(note.locator('p')).toHaveText('This hit goes in before bend 1: the view shows the sheet as it is then.');
  measured.note1 = await note.locator('p').innerText();
  let state = await shop();
  assert.equal(
    state.station.angles[inner.id],
    0,
    `the inner line flat in the view: ${JSON.stringify(state.station.angles)}`,
  );
  await expect(panel.getByRole('status', { name: 'Collision check' })).toContainText('Clear through the stroke');
  await sideView.screenshot({ path: `${directory}/02-side-view-armed.png` });
  await shot('03-armed-before-bend-1', note);
  model = await pedal(panel, 2, 'the lip, made first');
  const ids = bendsOf(model).map((b) => b.id);
  assert.equal(ids[1], inner.id, `the lip first: ${JSON.stringify(ids)}`);
  assert.deepEqual(await rowTexts(panel), ['1 · UP 90° R1.28', '2 · UP 90° R1.28']);
  assert.deepEqual(await rowChecks(panel), ['ok', 'ok']);
  const folded = await size(panel, 'Folded size');
  near(folded, expected, 'the folded size against the lip-first part');
  assert.deepEqual(expected, [577.47, 420.4, 20.14]);
  await expect(note).toHaveCount(0);
  await shot('04-lip-first-made', row(panel, 2));
  await noErrorLine('after step 1');
  checks.push(
    `screenshot's part: L 29 made, L 11 → "${measured.card1}" + "Make this hit before bend 1" (button at y ${measured.reach1366.button} of 768, Bend at ${measured.reach1366.bend}) → armed: "${measured.note1}", the inner line at 0° in the view → pedal → order ${JSON.stringify(ids)}, rows ok ok, folded ${folded.join(' × ')} mm = lip-first ${expected.join(' × ')} mm`,
  );

  // 3. Lip 20 / web 10 on the same blank (shop punches §5.8 item 8): inner first, then the lip first.
  await undo(1, 'Undo the lip');
  await undo(0, 'Undo the inner bend');
  // Lip first, the inner line (flat 30) lies behind the standing lip: since SG-1
  // (docs/sketch-studio-skin-gauge.md §4.4, §4.6) L is read off the lip's skin, 30 − (20 + BA/2 −
  // (r + t)) = 11.07, which Automatic takes as a line inside the lip: Gauge off the lip's flange
  // (bend 1's). Before SG-1 the flat 30 was typed.
  for (const [what, firstL, secondL, off] of [
    ['inner first', 30, 20, null],
    ['lip first', 20, 11.0694, "Bend 1's flange"],
  ]) {
    await pick(station, firstL, 90);
    await pedal(panel, 1, `${what}: the first hit`);
    if (off) {
      await station.map.getByRole('button', { name: 'Gauge edge 2', exact: true }).click();
      await panel.getByLabel('Gauge off', { exact: true }).selectOption({ label: off });
    }
    await pick(station, secondL, 90);
    if (off) await expect(panel.locator('dd[aria-label="Line on the flat blank"]')).toHaveText('30 mm from edge 2');
    await expect(card(panel)).toContainText(NO_WAY, { timeout: 10000 });
    await page.waitForTimeout(400);
    await expect(wayButtons(panel)).toHaveCount(0);
    const text = await card(panel).innerText();
    assert(!/Bend this one earlier/.test(text), `${what}: no untried "bend this one earlier": ${text}`);
    measured[`lip20 ${what}`] = text;
    await shot(`05-lip20-${what.replace(' ', '-')}`, card(panel));
    await undo(0, `${what}: Undo`);
    checks.push(`lip 20 / web 10, ${what}: no button; "${text}"`);
  }

  // 4. A stored sequence that collides, made by data: inner then lip.
  const data = await saved();
  const vertical = (id, L) => ({
    id,
    a: [W - L, 0],
    b: [W - L, H],
    angle: 90,
    direction: 'up',
    radius: null,
    punch: 'straight-88',
    die: 'v8-88',
  });
  data.parts[0].features[0].bends = [vertical('inner-data', 29), vertical('lip-data', 11)];
  await page.evaluate((m) => {
    const workspace = JSON.parse(localStorage.getItem('apartment-planner-sketch-recovery'));
    workspace.document.model = m;
    localStorage.setItem('apartment-planner-sketch-recovery', JSON.stringify(workspace));
  }, data);
  await page.reload();
  const workshop = page.getByRole('button', { name: '3D Model & workshop', exact: true });
  if (await workshop.isVisible().catch(() => false)) await workshop.click();
  await current();
  await savedWhen(
    (m) =>
      bendsOf(m)
        .map((b) => b.id)
        .join() === 'inner-data,lip-data',
    'the file by data',
  );
  await shopStation('Bend');
  const stored = properties.getByRole('region', { name: 'Press brake' });
  await expect(rows(stored)).toHaveCount(2);
  assert.deepEqual(await rowChecks(stored), ['ok', 'refused']);
  const move = row(stored, 2).getByRole('button', { name: 'Move step 2 before step 1', exact: true });
  await expect(move).toBeVisible({ timeout: 10000 });
  measured.storedRow = await row(stored, 2).locator('.cad-shop-error').innerText();
  await shot('06-stored-row-move', row(stored, 2));
  await move.click();
  await savedWhen(
    (m) =>
      bendsOf(m)
        .map((b) => b.id)
        .join() === 'lip-data,inner-data',
    'the move',
  );
  await expect(rows(stored).locator('.cad-brake-check')).toHaveText(['ok', 'ok']);
  await noErrorLine('after the move');
  await shot('07-stored-row-moved', row(stored, 2));
  checks.push(
    `stored inner then lip: row 2 "${measured.storedRow.slice(0, 80)}…" + "Move step 2 before step 1" → lip-data, inner-data; ok ok`,
  );

  // 2. The tight Z on a fresh model (45° first since docs/sketch-studio-shop-punches.md §6.4; it was 60°).
  const z = await blank(ZW, ZH);
  await pick(z, 165, 90);
  model = await pedal(z.panel, 1, 'the Z: line 1 up');
  const b1 = bendsOf(model)[0];
  assert.equal(b1.a[0], 150, `line 1 150 from the left edge: ${JSON.stringify(b1.a)}`);
  await pick(z, 150, 90);
  await z.panel.locator('.cad-flip').getByText('Flipped over').click();
  await expect(card(z.panel)).toBeVisible();
  const partway = z.panel.getByRole('button', { name: 'Bend 1 to 45° first, finish it after this hit', exact: true });
  await expect(partway).toBeVisible({ timeout: 10000 });
  await expect(z.panel.getByRole('button', { name: /^Make this hit before/ })).toHaveCount(0);
  measured.card2 = await card(z.panel).innerText();
  measured.reachZ1366 = await (async () => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.waitForTimeout(400);
    const at = await reachable(z.panel, partway, '1366 × 768 (Z)');
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.waitForTimeout(300);
    return at;
  })();
  await shot('08-tight-z-card', card(z.panel));
  await partway.click();
  const zNote = z.panel.getByRole('status', { name: 'Bend order', exact: true });
  await expect(zNote.locator('p')).toHaveText(
    'Bend 1 goes to 45° first and is finished after this hit: the view shows bend 1 at 45°.',
  );
  state = await shop();
  assert(
    Math.abs(state.station.angles[b1.id] - 45) < 1e-9,
    `bend 1 at 45° in the view: ${JSON.stringify(state.station.angles)}`,
  );
  await sideView.screenshot({ path: `${directory}/09-side-view-bend-1-at-45.png` });
  await shot('10-tight-z-armed', zNote);
  model = await pedal(z.panel, 3, 'the Z: line 2 down, bend 1 part-way');
  const made = bendsOf(model);
  assert.deepEqual(
    made.map((b) => [b.again ?? null, b.angle, b.direction ?? null]),
    [
      [null, 45, 'up'],
      [null, 90, 'down'],
      [b1.id, 90, null],
    ],
    JSON.stringify(made),
  );
  measured.zRows = await rowTexts(z.panel);
  assert.deepEqual(measured.zRows, ['1 · UP 45° R1.28', '2 · DOWN 90° R1.28', '3 · bend 1 on: 45° → 90°']);
  assert.deepEqual(await rowChecks(z.panel), ['ok', 'ok', 'ok']);
  await expect(z.panel.getByRole('status', { name: 'Part-way bend', exact: true })).toHaveText(
    'Bend 1 now stands at 45° and is finished in step 3.',
  );
  await shot('11-tight-z-made', row(z.panel, 3));
  // One Undo takes the three changes back.
  model = await undo(1, 'Undo the part-way commit');
  assert.deepEqual(bendsOf(model), [b1], 'one Undo: bend 1 back at 90°, alone');
  await expect(rows(z.panel)).toHaveCount(1);
  assert.deepEqual(await rowTexts(z.panel), ['1 · UP 90° R1.28']);
  checks.push(
    `tight Z: 150 up made, 150 from the right DOWN → "${measured.card2}" + "Bend 1 to 45° first, finish it after this hit" (no "Make this hit before"; button at y ${measured.reachZ1366.button} of 768) → armed, bend 1 at 45° in the view → pedal → one commit ${JSON.stringify(made.map((b) => [b.again ? 'bend-on' : b.direction, b.angle]))}, rows ${JSON.stringify(measured.zRows)} ok ok ok, "Bend 1 now stands at 45° and is finished in step 3."; one Undo → bend 1 at 90° alone, one row`,
  );

  // 5. Timing. The tries on the app's own modules (node, the same code the page runs), worst of five.
  const edgeOf = (w, h) =>
    gaugeEdges([
      [0, 0],
      [w, 0],
      [w, h],
      [0, h],
    ]).findIndex((e) => Math.abs(e.a[0] - w) < 1e-6 && Math.abs(e.b[0] - w) < 1e-6);
  const modelOf = (bends, w, h) => {
    const m = emptyModel();
    m.sketches = [{ id: 's', name: 'S', plane: 'XY', profile: rectangle(w, h), primitives: [], constrained: false }];
    m.parts = [
      {
        id: 'p',
        name: 'Tray',
        features: [
          {
            id: 'f',
            type: 'sheetmetal',
            sketchId: 's',
            thickness: 1.2,
            stock: 'spcc',
            kFactor: null,
            base: null,
            marks: [],
            bends,
          },
        ],
      },
    ];
    m.instances = [{ id: 'i', partId: 'p', name: '', position: [0, 0, 0], rotation: [0, 0, 0], visible: true }];
    return m;
  };
  const line = (id, x, h, direction = 'up') => ({
    id,
    a: [x, 0],
    b: [x, h],
    angle: 90,
    direction,
    radius: null,
    punch: 'straight-88',
    die: 'v8-88',
  });
  const cases = {
    'step 1 (this hit first)': [modelOf([line('inner', W - 29, H)], W, H), { edge: edgeOf(W, H), distance: 11 }],
    'step 2 (part-way)': [modelOf([line('b1', 150, ZH)], ZW, ZH), { edge: edgeOf(ZW, ZH), distance: 150, flip: true }],
    'step 3 (nothing: every try made)': [
      modelOf([line('inner', W - 30, H)], W, H),
      { edge: edgeOf(W, H), distance: 15 },
    ],
  };
  measured.tries = {};
  for (const [name, [m, pick]] of Object.entries(cases)) {
    const session = {
      ...brakeSessionDefaults(),
      stage: 'setup',
      key: 'k',
      instanceId: 'i',
      mode: 'gauge',
      angle: 90,
      ...pick,
    };
    const facts = brakeStation({ model: m, session, advise: false });
    const times = [];
    let ways = null;
    for (let k = 0; k < 5; k++) {
      const started = performance.now();
      ways = wayTries({
        model: m,
        session,
        params: {},
        fold: facts.fold,
        machine: facts.machine,
        pending: facts.pending,
      });
      times.push(performance.now() - started);
    }
    const advice = [];
    for (let k = 0; k < 3; k++) {
      const started = performance.now();
      brakeStation({ model: m, session });
      advice.push(performance.now() - started);
    }
    measured.tries[name] = {
      found: ways.first?.label || ways.partway?.label || 'nothing',
      places: ways.places,
      openings: ways.openings,
      worstMs: Number(Math.max(...times).toFixed(1)),
      medianMs: Number(times.sort((a, b) => a - b)[2].toFixed(1)),
      wholeAdviceWorstMs: Number(Math.max(...advice).toFixed(1)),
      checksOfTheSequence: sequenceChecks({ fold: facts.fold, machine: facts.machine }).length,
    };
  }
  // In the page: the punch line dragged on the flat blank (the Z's line 2 at L 150, colliding), every move a
  // frame; the card's buttons must not appear during the drag (the tries wait for the settle).
  await pick(z, 150, 90);
  // The last hit was made flipped over: the switch may still be on.
  if (!(await z.panel.getByRole('switch', { name: 'Flip sheet' }).isChecked()))
    await z.panel.locator('.cad-flip').getByText('Flipped over').click();
  await expect(partway).toBeVisible({ timeout: 10000 });
  // Flat mm to the screen through the punch line's own transform (the blank may be drawn turned over).
  const flatAt = (x, y) =>
    page.evaluate(
      ([fx, fy]) => {
        const line = document.querySelector('[aria-label="Punch line"]');
        const p = new DOMPoint(fx, -fy).matrixTransform(line.getScreenCTM());
        return [p.x, p.y];
      },
      [x, y],
    );
  // The station's own reading (the L field keeps its typed draft while it has the focus).
  const lineL = async () => (await shop()).station.gaugeDistance;
  measured.dragL = [await lineL()];
  let buttonsDuring = 0;
  await z.map.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  // A point on a dash of the punch line (a dashed stroke is hit only on its dashes).
  let grabY = null;
  for (let y = 10; y < ZH - 10 && grabY == null; y += 2) {
    const [px, py] = await flatAt(ZW - 150, y);
    const on = await page.evaluate(
      ([x, yy]) => document.elementFromPoint(x, yy)?.getAttribute('aria-label') === 'Punch line',
      [px, py],
    );
    if (on) grabY = y;
  }
  assert(grabY != null, 'a point on the punch line to grab');
  const start = await flatAt(ZW - 150, grabY);
  // One screen pixel a move, away from the made line (the pointer lands on whole pixels): every move a new line.
  const step = await flatAt(ZW - 150 + 1, grabY).then((p) => {
    const d = [p[0] - start[0], p[1] - start[1]];
    const n = Math.hypot(...d);
    return [d[0] / n, d[1] / n];
  });
  // Every frame and every long task from the press to the settle after the release.
  await page.evaluate(() => {
    const record = (window.__frames = { gaps: [], long: [], last: null, on: true, release: null });
    const tick = (now) => {
      if (record.last != null && record.release == null) record.gaps.push(now - record.last);
      record.last = now;
      if (record.on) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    try {
      record.observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          record.long.push({ at: entry.startTime, ms: Number(entry.duration.toFixed(1)) });
      });
      record.observer.observe({ entryTypes: ['longtask'] });
    } catch {
      record.observer = null;
    }
  });
  await page.mouse.move(...start);
  await page.mouse.down();
  // Out 24 pixels and back to the line where it collides, so the settle after the release has advice to work out.
  for (let i = 1; i <= 48; i++) {
    const at = i <= 24 ? i : 48 - i;
    await page.mouse.move(start[0] + step[0] * at, start[1] + step[1] * at);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())));
    if (i % 6 === 0) {
      buttonsDuring += await wayButtons(z.panel).count();
      measured.dragL.push(await lineL());
    }
  }
  await page.evaluate(() => (window.__frames.release = performance.now()));
  await page.mouse.up();
  // The settle: the advice (the remedies and the tries) runs once, LIVE_DEBOUNCE_MS after the last pick.
  await page.waitForTimeout(1500);
  const frames = await page.evaluate(() => {
    const record = window.__frames;
    record.on = false;
    record.observer?.disconnect();
    const gaps = record.gaps.slice(1).sort((a, b) => a - b);
    return {
      frames: gaps.length,
      median: Number(gaps[Math.floor(gaps.length / 2)].toFixed(1)),
      worst: Number(gaps.at(-1).toFixed(1)),
      longTasksDuring: record.long.filter((t) => t.at < record.release).map((t) => t.ms),
      longTasksAfterRelease: record.long.filter((t) => t.at >= record.release).map((t) => t.ms),
    };
  });
  measured.drag = { ...frames, buttonsDuring };
  measured.devBuild = await page.evaluate(() => Boolean(document.querySelector('script[src*="/@vite/client"]')));
  assert(
    measured.dragL.every((L, i) => i === 0 || L !== measured.dragL[i - 1]),
    `the line moved between every check: ${measured.dragL}`,
  );
  assert.equal(buttonsDuring, 0, `no try ran during the drag: no button on the card (L ${measured.dragL})`);
  assert(
    frames.worst < 50 && frames.longTasksDuring.every((ms) => ms < 50),
    `a frame over 50 ms during the drag: ${JSON.stringify(frames)}`,
  );
  measured.afterDrag = {
    L: await lineL(),
    card: (await card(z.panel).count()) ? await card(z.panel).innerText() : 'no collision',
    buttons: await wayButtons(z.panel).allInnerTexts(),
  };
  const worstTries = Math.max(...Object.values(measured.tries).map((t) => t.worstMs));
  checks.push(
    `timing: the tries ${JSON.stringify(measured.tries)}; worst ${worstTries} ms; the punch line dragged 48 moves on the flat blank, out and back (L ${measured.dragL.join(' → ')}): frames ${JSON.stringify(frames)}${measured.devBuild ? ' (dev build)' : ''}, no try during it (buttons on the card mid-drag: ${buttonsDuring}); after the release and the settle: ${JSON.stringify(measured.afterDrag)}`,
  );

  // 6.
  await noErrorLine('at the end');
  if (errors.length) throw new Error(errors.join('\n'));
  checks.push('no page error; no .cad-error');
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ status: 'passed', errors, checks, measured }, null, 2),
  );
  console.log('Tight bends TB-2 verification passed:\n- ' + checks.join('\n- '));
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` });
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}
