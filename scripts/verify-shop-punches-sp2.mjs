/* global localStorage, process, console, document, window, performance, requestAnimationFrame, DOMPoint, PerformanceObserver */
// Shop punches SP-2 (docs/sketch-studio-shop-punches.md §6.7): the earlier
// bends with another punch, 45° first, a quicker card. A 605.4 × 420.4
// rectangle of 1.2 mm SPCC, the right edge on the backgauge, the stored punch
// cleared first (every blank starts from an empty localStorage):
//  1. Straight 88° in: L 30, 90° → hit; L 15 → the card offers "Make this hit
//     before bend 1, and bend 1 with the A 101 punch" → click: the armed
//     card's words, the view with the inner line flat → pedal → two rows,
//     both ok, the status line; the job sheet names the A 101 for the inner
//     bend; Undo takes it all back in one step;
//  2. the tight Z (315 × 200: 150 from the left up, 150 from the right down)
//     → "Bend 1 to 45° first, finish it after this hit" → pedal → three rows,
//     all ok;
//  3. lip 20 / web 10 (L 30 made, L 20 pending) → the new NO_WAY, no button;
//  4. a stored sequence made by data (the lip, then the inner bend, both with
//     the straight punch): row 2's card offers "Make step 2 with the A 101
//     punch" → click → both rows ok;
//  5. timing: the whole advice on steps 1 – 3 and on SP-1's verify steps
//     2 – 5 (worst of three, the app's own modules in node) and on the
//     100 × 60 web of brakeBlades.test.js; the frames while the punch line is
//     dragged on step 3's blank (no frame over 50 ms from it);
//  6. no page error; no .cad-error but the refusals asked for.
// Screenshots at 1600 × 1000 and 1366 × 768.
//   CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-shop-punches-sp2.mjs
// Screenshots: artifacts/sketch-cad/shop-punches-sp2 (or SP2_SHOTS).
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { cadSteps } from './sketch-cad-steps.mjs';
import { foldSheet, foldedBounds } from '../src/features/sketchstudio/cad/sheetMetal.js';
import { NO_WAY, brakeSessionDefaults, brakeStation } from '../src/features/sketchstudio/cad/brakeStation.js';
import { gaugeEdges } from '../src/features/sketchstudio/cad/pressBrake.js';
import { emptyModel } from '../src/features/sketchstudio/cad/model.js';

const directory = process.env.SP2_SHOTS || 'artifacts/sketch-cad/shop-punches-sp2';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [],
  checks = [],
  measured = {};
page.on('pageerror', (e) => errors.push(e.message));
const { properties, current, saved, savedWhen, shopStation, shopMore } = cadSteps(page);
const footer = page.locator('.cad-status');
const files = page.locator('.cad-file-actions');
const shop = () => page.evaluate(() => document.querySelector('.cad-viewport').cadShop());
const sideView = page.getByRole('figure', { name: 'Side view' });
// Both sizes (§6.7): the 1366 × 768 one taken and put back; `focus` scrolled into the panel's view at each.
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
const errorLines = () => page.locator('.cad-error').allInnerTexts();
const noErrorLine = async (where) => {
  const lines = await errorLines();
  assert.deepEqual(lines, [], `no error line ${where}: ${JSON.stringify(lines)}`);
};
const bendsOf = (m) => m.parts[0].features[0].bends;

const W = 605.4,
  H = 420.4;
const ZW = 315,
  ZH = 200;
const rectangle = (w, h) => ({ type: 'rectangle', width: w, height: h, origin: [0, 0] });
// The lip 15 then the inner bend 30 in (the lip-first part): step 1's folded size.
const [lo, hi] = foldedBounds(
  foldSheet(
    {
      thickness: 1.2,
      stock: 'spcc',
      kFactor: null,
      bends: [
        { id: 'lip', a: [W - 15, 0], b: [W - 15, H], angle: 90, direction: 'up', punch: 'straight-88' },
        { id: 'inner', a: [W - 30, 0], b: [W - 30, H], angle: 90, direction: 'up', punch: 'a101' },
      ],
    },
    rectangle(W, H),
  ),
);
const lipFirst = lo.map((v, i) => Number((hi[i] - v).toFixed(2)));

// A fresh model (the stored punch cleared with the rest), then Draw → Cut the blank of 1.2 SPCC → Bend.
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
  assert.equal(
    await page.evaluate(() => localStorage.getItem('sketchstudio.brake.punch')),
    null,
    'the stored punch cleared',
  );
  await expect(panel.getByLabel('Punch', { exact: true })).toHaveValue('straight-88');
  return { panel, map };
};
// The right edge (edge 2) on the backgauge, L and the angle.
const pick = async ({ panel, map }, L, angle = 90) => {
  await map.getByRole('button', { name: 'Gauge edge 2', exact: true }).click();
  await fill(panel, 'Backgauge L (mm)', L);
  await fill(panel, 'Bend angle (°)', angle);
};
const clear = (panel) =>
  expect(panel.getByRole('status', { name: 'Collision check' })).toContainText('Clear through the stroke', {
    timeout: 10000,
  });
const pedal = async (panel, count, what) => {
  await clear(panel);
  await panel.getByRole('button', { name: 'Bend', exact: true }).click();
  const model = await savedWhen((m) => bendsOf(m).length === count, what);
  await expect(panel.getByRole('button', { name: 'Bend', exact: true })).toHaveText('Bend', { timeout: 30000 });
  return model;
};
const undo = async (count, what) => {
  await files.getByRole('button', { name: 'Undo', exact: true }).click();
  return savedWhen((m) => bendsOf(m).length === count, what);
};
const rows = (panel) => panel.getByRole('list', { name: 'Sequence' }).getByRole('listitem');
const row = (panel, n) => panel.getByRole('listitem', { name: `Step ${n}`, exact: true });
const rowTexts = async (panel) => (await rows(panel).locator('strong').allInnerTexts()).map((t) => t.trim());
const rowChecks = async (panel) => (await rows(panel).locator('.cad-brake-check').allInnerTexts()).map((t) => t.trim());
const card = (panel) => panel.getByRole('alert', { name: 'Collision' });
// The collision card with its buttons (the alert is its text).
const problem = (panel) =>
  panel.locator('.cad-problem').filter({ has: page.getByRole('alert', { name: 'Collision' }) });

try {
  // 1. Straight in: L 30 made; L 15 → this hit before bend 1, and bend 1 with the A 101 → armed → pedal.
  let station = await blank();
  let { panel } = station;
  await pick(station, 30);
  let model = await pedal(panel, 1, 'step 1: the inner bend, straight');
  const inner = bendsOf(model)[0];
  assert.equal(inner.punch, 'straight-88');
  await pick(station, 15);
  await expect(card(panel)).toContainText('Bend 2: the part hits the ram', { timeout: 10000 });
  const compound = problem(panel).getByRole('button', {
    name: 'Make this hit before bend 1, and bend 1 with the A 101 punch',
    exact: true,
  });
  await expect(compound).toBeVisible({ timeout: 10000 });
  measured.card1 = await card(panel).innerText();
  assert(measured.card1.includes('Make this hit before bend 1 and make bend 1 with the A 101 punch.'), measured.card1);
  assert(!measured.card1.includes(NO_WAY), `no NO_WAY: ${measured.card1}`);
  measured.buttons1 = await problem(panel).getByRole('button').allInnerTexts();
  await shot('01-compound-offered', card(panel));
  await compound.click();
  const armedNote = panel.getByRole('status', { name: 'Bend order', exact: true });
  await expect(armedNote.locator('p')).toHaveText(
    'This hit goes in before bend 1, and bend 1 is made with the A 101 punch: the view shows the sheet as it is then.',
  );
  let state = await shop();
  assert.equal(state.station.angles[inner.id], 0, `the inner line flat: ${JSON.stringify(state.station.angles)}`);
  await sideView.screenshot({ path: `${directory}/02-armed-side-view.png` });
  await shot('03-compound-armed', armedNote);
  model = await pedal(panel, 2, 'step 1: the lip first, the inner bend with the A 101');
  const made1 = bendsOf(model);
  assert.deepEqual(
    made1.map((b) => [b.id === inner.id ? 'inner' : 'lip', b.punch]),
    [
      ['lip', 'straight-88'],
      ['inner', 'a101'],
    ],
    JSON.stringify(made1),
  );
  assert.deepEqual(await rowChecks(panel), ['ok', 'ok']);
  const status1 = panel.getByRole('status', { name: 'Punch changed', exact: true });
  await expect(status1).toHaveText('Bend 2 is now made with the A 101 punch.');
  measured.status1 = await status1.innerText();
  measured.folded1 = await size(panel, 'Folded size');
  assert.deepEqual(measured.folded1, lipFirst, `folded ${measured.folded1} against the lip-first ${lipFirst}`);
  await shot('04-compound-made', status1);
  await noErrorLine('after step 1');
  // The job sheet names the A 101 for the inner bend (bend 2 now) and the straight punch for the lip.
  await shopMore('Job sheet');
  const job = properties.getByRole('region', { name: 'Job sheet' });
  // A step's items (the step's own row carries an aria-label; its items do not).
  const bendRow = (n) => job.locator('li:not([aria-label])').filter({ hasText: new RegExp(`· bend ${n} ·`) });
  await expect(bendRow(2)).toContainText('A 101 punch');
  await expect(bendRow(1)).toContainText('Straight 88° punch');
  measured.jobRows = [await bendRow(1).innerText(), await bendRow(2).innerText()];
  await shot('05-job-sheet', bendRow(2));
  // One Undo takes the hit and the punch back.
  model = await undo(1, 'step 1: Undo');
  assert.deepEqual(
    bendsOf(model),
    [inner],
    `one Undo: the inner bend alone, straight: ${JSON.stringify(bendsOf(model))}`,
  );
  checks.push(
    `straight in: L 30 made; L 15 → "${measured.card1}" buttons ${JSON.stringify(measured.buttons1)} → armed "This hit goes in before bend 1, and bend 1 is made with the A 101 punch: …", inner flat in the view → pedal → one commit ${JSON.stringify(made1.map((b) => b.punch))}, rows ok ok, "${measured.status1}", folded ${measured.folded1.join(' × ')} (lip first); job sheet ${JSON.stringify(measured.jobRows)}; one Undo → the inner bend alone, straight`,
  );

  // 2. The tight Z: 45° first.
  const z = await blank(ZW, ZH);
  await pick(z, 165, 90);
  model = await pedal(z.panel, 1, 'the Z: line 1 up');
  const b1 = bendsOf(model)[0];
  assert.equal(b1.a[0], 150, `line 1 150 from the left edge: ${JSON.stringify(b1.a)}`);
  await pick(z, 150, 90);
  await z.panel.locator('.cad-flip').getByText('Flipped over').click();
  await expect(card(z.panel)).toBeVisible();
  const partway = problem(z.panel).getByRole('button', {
    name: 'Bend 1 to 45° first, finish it after this hit',
    exact: true,
  });
  await expect(partway).toBeVisible({ timeout: 10000 });
  measured.card2 = await card(z.panel).innerText();
  measured.buttons2 = await problem(z.panel).getByRole('button').allInnerTexts();
  await shot('06-tight-z-45-offered', card(z.panel));
  await partway.click();
  await expect(z.panel.getByRole('status', { name: 'Bend order', exact: true }).locator('p')).toHaveText(
    'Bend 1 goes to 45° first and is finished after this hit: the view shows bend 1 at 45°.',
  );
  state = await shop();
  assert(Math.abs(state.station.angles[b1.id] - 45) < 1e-9, JSON.stringify(state.station.angles));
  model = await pedal(z.panel, 3, 'the Z: line 2 down, bend 1 at 45° first');
  measured.zRows = await rowTexts(z.panel);
  assert.deepEqual(measured.zRows, ['1 · UP 45° R1.28', '2 · DOWN 90° R1.28', '3 · bend 1 on: 45° → 90°']);
  assert.deepEqual(await rowChecks(z.panel), ['ok', 'ok', 'ok']);
  await shot('07-tight-z-made', row(z.panel, 3));
  await noErrorLine('after step 2');
  checks.push(
    `tight Z: 150 up made, 150 from the right DOWN → buttons ${JSON.stringify(measured.buttons2)} → armed, bend 1 at 45° in the view → pedal → rows ${JSON.stringify(measured.zRows)} ok ok ok`,
  );

  // 3. Lip 20 / web 10: L 30 made, L 20 → the new NO_WAY, no button; then the drag on that blank.
  station = await blank();
  ({ panel } = station);
  await pick(station, 30);
  await pedal(panel, 1, 'step 3: the inner bend');
  await pick(station, 20);
  await expect(card(panel)).toContainText(NO_WAY, { timeout: 10000 });
  await page.waitForTimeout(500);
  await expect(problem(panel).getByRole('button')).toHaveCount(0);
  measured.card3 = await card(panel).innerText();
  assert(measured.card3.endsWith(NO_WAY), measured.card3);
  await shot('08-no-way', card(panel));
  checks.push(`lip 20 / web 10, inner first: no button; "${measured.card3}"`);

  // 5 (frames). The punch line dragged on step 3's blank (the inner made, the lip pending: NO_WAY).
  const flatAt = (x, y) =>
    page.evaluate(
      ([fx, fy]) => {
        const line = document.querySelector('[aria-label="Punch line"]');
        const p = new DOMPoint(fx, -fy).matrixTransform(line.getScreenCTM());
        return [p.x, p.y];
      },
      [x, y],
    );
  const lineAt = () =>
    page.evaluate(() => {
      const r = document.querySelector('[aria-label="Punch line"]').getBoundingClientRect();
      return Number((r.x + r.width / 2).toFixed(1));
    });
  const lineL = async () => (await shop()).station.gaugeDistance;
  measured.dragL = [await lineL()];
  measured.dragAt = [await lineAt()];
  await station.map.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  let grabY = null;
  for (let y = 10; y < H - 10 && grabY == null; y += 2) {
    const [px, py] = await flatAt(W - 20, y);
    const on = await page.evaluate(
      ([x, yy]) => document.elementFromPoint(x, yy)?.getAttribute('aria-label') === 'Punch line',
      [px, py],
    );
    if (on) grabY = y;
  }
  assert(grabY != null, 'a point on the punch line to grab');
  const start = await flatAt(W - 20, grabY);
  // One screen pixel a move into the blank (over the made line and on): every move a new line.
  const step = await flatAt(W - 20 - 1, grabY).then((p) => {
    const d = [p[0] - start[0], p[1] - start[1]];
    const n = Math.hypot(...d);
    return [d[0] / n, d[1] / n];
  });
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
  let buttonsDuring = 0;
  await page.mouse.move(...start);
  await page.mouse.down();
  for (let i = 1; i <= 48; i++) {
    const at = i <= 24 ? i : 48 - i;
    await page.mouse.move(start[0] + step[0] * at, start[1] + step[1] * at);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())));
    if (i % 6 === 0) {
      buttonsDuring += await problem(panel).getByRole('button').count();
      measured.dragL.push(await lineL());
      measured.dragAt.push(await lineAt());
    }
  }
  await page.evaluate(() => (window.__frames.release = performance.now()));
  await page.mouse.up();
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
  assert(
    measured.dragAt.every((x, i) => i === 0 || x !== measured.dragAt[i - 1]),
    `the line moved between every check: ${measured.dragAt}`,
  );
  measured.devBuild = await page.evaluate(() => Boolean(document.querySelector('script[src*="/@vite/client"]')));
  assert(
    frames.worst < 50 && frames.longTasksDuring.every((ms) => ms < 50),
    `a frame over 50 ms during the drag: ${JSON.stringify(frames)}`,
  );
  checks.push(
    `the punch line dragged 48 moves on step 3's blank (L ${measured.dragL.map((L) => (L == null ? 'no reading' : Number(L.toFixed(1)))).join(' → ')}): frames ${JSON.stringify(frames)}${measured.devBuild ? ' (dev build)' : ''}, buttons on the card mid-drag: ${buttonsDuring}`,
  );
  await noErrorLine('after step 3');

  // 4. A stored sequence made by data: the lip, then the inner bend, both straight → row 2's punch button.
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
  data.parts[0].features[0].bends = [vertical('lip-data', 15), vertical('inner-data', 30)];
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
        .join() === 'lip-data,inner-data',
    'the file by data',
  );
  await shopStation('Bend');
  const stored = properties.getByRole('region', { name: 'Press brake' });
  await expect(rows(stored)).toHaveCount(2);
  assert.deepEqual(await rowChecks(stored), ['ok', 'refused']);
  const withPunch = row(stored, 2).getByRole('button', { name: 'Make step 2 with the A 101 punch', exact: true });
  await expect(withPunch).toBeVisible({ timeout: 10000 });
  measured.storedRow = await row(stored, 2).locator('.cad-shop-error').innerText();
  measured.storedButtons = await row(stored, 2).locator('.cad-brake-row-fix').getByRole('button').allInnerTexts();
  await shot('09-stored-row-punch', row(stored, 2));
  await withPunch.click();
  const changed = await savedWhen((m) => bendsOf(m).find((b) => b.id === 'inner-data')?.punch === 'a101', 'the punch');
  assert.deepEqual(
    bendsOf(changed).map((b) => [b.id, b.punch]),
    [
      ['lip-data', 'straight-88'],
      ['inner-data', 'a101'],
    ],
  );
  await expect(rows(stored).locator('.cad-brake-check')).toHaveText(['ok', 'ok']);
  await noErrorLine('after the stored row');
  await shot('10-stored-row-fixed', row(stored, 2));
  checks.push(
    `stored lip then inner, both straight: row 2 "${measured.storedRow.slice(0, 90)}…" buttons ${JSON.stringify(measured.storedButtons)} → lip straight, inner A 101; ok ok`,
  );

  // 5 (advice). The whole advice on the app's own modules (node), worst of three.
  const edgeOf = (w, h) =>
    gaugeEdges([
      [0, 0],
      [w, 0],
      [w, h],
      [0, h],
    ]).findIndex((e) => Math.abs(e.a[0] - w) < 1e-6 && Math.abs(e.b[0] - w) < 1e-6);
  const modelOf = (bends, w = W, h = H, thickness = 1.2) => {
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
            thickness,
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
  const line = (id, L, punch = 'straight-88') => ({
    id,
    a: [W - L, 0],
    b: [W - L, H],
    angle: 90,
    direction: 'up',
    radius: null,
    punch,
    die: 'v8-88',
  });
  const right = edgeOf(W, H);
  const cases = {
    'SP-2 step 1 (the earlier bend with the A 101)': [modelOf([line('inner', 30)]), { edge: right, distance: 15 }],
    'SP-2 step 2 (the tight Z: 45° first)': [
      modelOf(
        [
          {
            id: 'b1',
            a: [150, 0],
            b: [150, ZH],
            angle: 90,
            direction: 'up',
            radius: null,
            punch: 'straight-88',
            die: 'v8-88',
          },
        ],
        ZW,
        ZH,
      ),
      { edge: edgeOf(ZW, ZH), distance: 150, flip: true },
    ],
    'SP-2 step 3 / SP-1 step 4 inner first (nothing)': [modelOf([line('inner', 30)]), { edge: right, distance: 20 }],
    'SP-1 step 4 lip first (nothing)': [modelOf([line('lip', 20)]), { edge: right, distance: 30 }],
    'SP-1 step 2 (A 101, the room away from the lip)': [
      modelOf([line('lip', 15, 'a101')]),
      { edge: right, distance: 30, punch: 'a101' },
    ],
    'SP-1 step 3 (straight: a shop punch found)': [modelOf([line('lip', 15)]), { edge: right, distance: 30 }],
    'SP-1 step 5 (A 101: this hit first)': [
      modelOf([line('inner', 30, 'a101')]),
      { edge: right, distance: 15, punch: 'a101' },
    ],
    // brakeBlades.test.js "offers no punch when the hit does not clear with it": a web between two standing flanges.
    '100 × 60 web (nothing)': [
      modelOf(
        [
          { id: 'b1', a: [20, -1], b: [20, 61], angle: 90, direction: 'up', radius: null },
          { id: 'b2', a: [75, -1], b: [75, 61], angle: 90, direction: 'up', radius: null },
        ],
        100,
        60,
        1.5,
      ),
      { edge: 3, distance: 47.5 },
    ],
  };
  measured.advice = {};
  for (const [name, [m, patch]] of Object.entries(cases)) {
    const session = {
      ...brakeSessionDefaults(),
      stage: 'setup',
      key: 'k',
      instanceId: 'i',
      mode: 'gauge',
      angle: 90,
      ...patch,
    };
    const times = [];
    let pending = null;
    for (let k = 0; k < 3; k++) {
      const started = performance.now();
      ({ pending } = brakeStation({ model: m, session }));
      times.push(performance.now() - started);
    }
    const c = pending.collision;
    measured.advice[name] = {
      worstMs: Number(Math.max(...times).toFixed(1)),
      offered: [
        c.fix?.label,
        c.turn?.label,
        c.length?.label,
        c.ways?.first?.label,
        c.ways?.partway?.label,
        c.ways?.compound?.label,
      ].filter(Boolean),
    };
  }
  measured.adviceWorstMs = Math.max(...Object.values(measured.advice).map((a) => a.worstMs));
  checks.push(
    `the advice (node, worst of three): ${JSON.stringify(measured.advice)}; worst ${measured.adviceWorstMs} ms`,
  );

  // 6.
  await noErrorLine('at the end');
  if (errors.length) throw new Error(errors.join('\n'));
  checks.push('no page error; no .cad-error');
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ status: 'passed', errors, checks, measured }, null, 2),
  );
  console.log('Shop punches SP-2 verification passed:\n- ' + checks.join('\n- '));
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` });
  console.error(errors);
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ status: 'failed', error: String(error), errors, checks, measured }, null, 2),
  );
  throw error;
} finally {
  await browser.close();
}
