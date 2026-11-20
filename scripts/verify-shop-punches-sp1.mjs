/* global localStorage, process, console, document, window, performance, requestAnimationFrame, DOMPoint, PerformanceObserver */
// Shop punches SP-1 (docs/sketch-studio-shop-punches.md §5.8): the shop's own
// punches in the rack, the part taken off the punch along a slant, the card
// trying the whole rack, the punch staying in the machine. A 605.4 × 420.4
// rectangle of 1.2 mm SPCC, the right edge on the backgauge:
//  1. the punch picker: "Your shop's punches" with four cards, the catalogue
//     below; choose the A 101: the Blades row shows it, Reverse punch offered;
//  2. L 15, 90° → hit; L 30, 90°: clears after one click on the card's own
//     button, the take-off note shows; the pedal: mid-return the part has slid
//     along Y (the stage's test state), screenshots of the stage and the side
//     view; folded size = the same two bends made with the catalogue gooseneck;
//  3. a fresh part, Straight 88° in: L 15 → hit; L 30 → the card's button
//     names a shop punch → click → clears → pedal;
//  4. a fresh part: L 20 → hit; L 30 → the new NO_WAY, no button; Undo; L 30 →
//     hit; L 20 → the same;
//  5. a fresh part, the A 101 in: L 30 → hit; L 15 → "Make this hit before
//     bend 1" → pedal → two rows, both ok;
//  6. reload the page, open the brake: the punch is the A 101;
//  7. timing: the advice for steps 2 – 5 (worst, the app's own modules), and
//     the frames while the punch line is dragged on step 4's blank (no frame
//     over 50 ms from it);
//  8. no page error; no .cad-error but the refusals asked for.
// Screenshots at 1600 × 1000 and 1366 × 768.
//   CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-shop-punches-sp1.mjs
// Screenshots: artifacts/sketch-cad/shop-punches-sp1 (or SP1_SHOTS).
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { cadSteps } from './sketch-cad-steps.mjs';
import { foldSheet, foldedBounds } from '../src/features/sketchstudio/cad/sheetMetal.js';
import { NO_WAY, brakeSessionDefaults, brakeStation } from '../src/features/sketchstudio/cad/brakeStation.js';
import { gaugeEdges } from '../src/features/sketchstudio/cad/pressBrake.js';
import { emptyModel } from '../src/features/sketchstudio/cad/model.js';

const directory = process.env.SP1_SHOTS || 'artifacts/sketch-cad/shop-punches-sp1';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [],
  checks = [],
  measured = {};
page.on('pageerror', (e) => errors.push(e.message));
const { properties, current, savedWhen, shopStation } = cadSteps(page);
const footer = page.locator('.cad-status');
const files = page.locator('.cad-file-actions');
const shop = () => page.evaluate(() => document.querySelector('.cad-viewport').cadShop());
const sideView = page.getByRole('figure', { name: 'Side view' });
const viewport3d = page.locator('.cad-viewport');
// Both sizes (§5.8): the 1366 × 768 one taken and put back; `focus` scrolled into the panel's view at each.
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
const rectangle = (w, h) => ({ type: 'rectangle', width: w, height: h, origin: [0, 0] });
// The lip 15 then the inner bend 30 in, made with the catalogue gooseneck: step 2's folded size.
const [lo, hi] = foldedBounds(
  foldSheet(
    {
      thickness: 1.2,
      stock: 'spcc',
      kFactor: null,
      bends: [
        { id: 'lip', a: [W - 15, 0], b: [W - 15, H], angle: 90, direction: 'up', punch: 'gooseneck-88' },
        { id: 'inner', a: [W - 30, 0], b: [W - 30, H], angle: 90, direction: 'up', punch: 'gooseneck-88' },
      ],
    },
    rectangle(W, H),
  ),
);
const withGooseneck = lo.map((v, i) => Number((hi[i] - v).toFixed(2)));

// A fresh model, then Draw → Cut the blank of 1.2 SPCC → Bend.
const blank = async () => {
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
  return { panel, map };
};
// The right edge (edge 2) on the backgauge, L and 90°.
const pick = async ({ panel, map }, L) => {
  await map.getByRole('button', { name: 'Gauge edge 2', exact: true }).click();
  await fill(panel, 'Backgauge L (mm)', L);
  await fill(panel, 'Bend angle (°)', 90);
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
const rowChecks = async (panel) => (await rows(panel).locator('.cad-brake-check').allInnerTexts()).map((t) => t.trim());
const card = (panel) => panel.getByRole('alert', { name: 'Collision' });
// The collision card with its buttons (the alert is its text).
const problem = (panel) =>
  panel.locator('.cad-problem').filter({ has: page.getByRole('alert', { name: 'Collision' }) });
// A punch chosen from the picker (the Punch select sits in the closed Machine and tooling).
const choosePunch = async (panel, name, value) => {
  await panel
    .getByRole('group', { name: 'Blades' })
    .getByRole('button', { name: /^Top: punch/ })
    .click();
  await panel.getByRole('region', { name: 'Punches' }).getByRole('button', { name, exact: true }).click();
  await expect(panel.getByLabel('Punch', { exact: true })).toHaveValue(value);
};

try {
  // 1. The punch picker, its two groups; the A 101 chosen.
  let station = await blank();
  let { panel } = station;
  await pick(station, 15);
  const blades = panel.getByRole('group', { name: 'Blades' });
  const top = blades.getByRole('button', { name: /^Top: punch/ });
  await expect(top).toHaveText('Top: punchStraight 88°tip R0.8');
  await top.click();
  const picker = panel.getByRole('region', { name: 'Punches' });
  await expect(picker).toBeVisible();
  const groups = await picker.locator('h5').allInnerTexts();
  assert.deepEqual(groups, ["Your shop's punches", 'Catalogue punches']);
  const shopCards = picker.getByRole('list', { name: "Your shop's punches" }).locator('.cad-blade-card');
  const catalogueCards = picker.getByRole('list', { name: 'Catalogue punches' }).locator('.cad-blade-card');
  await expect(shopCards).toHaveCount(4);
  measured.shopCards = await shopCards.evaluateAll((list) => list.map((b) => b.getAttribute('aria-label')));
  assert.deepEqual(measured.shopCards, ['A 101', 'A 102', 'A 103', 'A 108']);
  measured.catalogueCards = await catalogueCards.count();
  // Below the shop's group.
  const shopBox = await picker.getByRole('list', { name: "Your shop's punches" }).boundingBox();
  const catalogueBox = await picker.getByRole('list', { name: 'Catalogue punches' }).boundingBox();
  assert(catalogueBox.y > shopBox.y + shopBox.height - 1, 'the catalogue below the shop’s punches');
  await expect(picker.getByRole('button', { name: 'A 101', exact: true }).locator('.cad-blade-verdict')).toHaveText(
    'Clears this hit',
    { timeout: 10000 },
  );
  await shot('01-punch-picker-shop-group', picker.locator('h5').first());
  // The four cards at once: the window made tall for this one picture, then back.
  await page.setViewportSize({ width: 1600, height: 2400 });
  await page.waitForTimeout(300);
  await picker.getByRole('list', { name: "Your shop's punches" }).screenshot({
    path: `${directory}/02-shop-punch-cards.png`,
  });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.waitForTimeout(300);
  await picker.getByRole('button', { name: 'A 101', exact: true }).click();
  await expect(picker).toHaveCount(0);
  await expect(top).toHaveText('Top: punchA 101tip R0.8');
  await expect(panel.getByRole('checkbox', { name: 'Reverse punch' })).toBeVisible();
  await expect(panel.getByLabel('Punch', { exact: true })).toHaveValue('a101');
  const optgroups = await panel
    .getByLabel('Punch', { exact: true })
    .evaluate((s) => [...s.querySelectorAll('optgroup')].map((g) => [g.label, g.children.length]));
  assert.deepEqual(optgroups[0], ["Your shop's punches", 4]);
  assert.equal(optgroups[1][0], 'Catalogue punches');
  let state = await shop();
  assert.equal(state.station.punchDrawn, 'a101', JSON.stringify(state.station));
  checks.push(
    `picker: groups ${JSON.stringify(groups)}, the shop's ${JSON.stringify(measured.shopCards)}, ${measured.catalogueCards} catalogue cards below; A 101 chosen: Blades "Top: punch A 101 tip R0.8", Reverse punch offered, select groups ${JSON.stringify(optgroups)}`,
  );

  // 2. L 15 (the lip) with the A 101; L 30: one click on the card's button, the take-off note, the pedal.
  await pedal(panel, 1, 'step 2: the lip with the A 101');
  await pick(station, 30);
  await expect(card(panel)).toContainText('Bend 2: the part hits the punch', { timeout: 10000 });
  const turnPunch = problem(panel).getByRole('button', { name: 'Turn the punch round', exact: true });
  await expect(turnPunch).toBeVisible({ timeout: 10000 });
  measured.card2 = await card(panel).innerText();
  await shot('03-a101-inner-card', card(panel));
  await turnPunch.click();
  await clear(panel);
  const note = panel.getByRole('note', { name: 'Take-off' });
  await expect(note).toHaveText(
    'Comes off the punch toward the backgauge: the part is drawn off along the nose as the ram lifts.',
  );
  measured.note2 = await note.innerText();
  await shot('04-take-off-note', note);
  // The pedal in slow motion (view only: the page's clock runs at 1/20 for the stroke), the stage read every frame.
  await page.evaluate(() => {
    const real = performance.now.bind(performance);
    const base = real();
    const raf = window.requestAnimationFrame.bind(window);
    window.__slow = { real, raf };
    performance.now = () => base + (real() - base) * 0.05;
    window.requestAnimationFrame = (callback) => raf(() => callback(performance.now()));
    const record = (window.__return = { slides: [], phases: new Set(), takeOff: null, on: true });
    const tick = () => {
      const station = document.querySelector('.cad-viewport').cadShop().station;
      if (station) {
        record.phases.add(station.phase);
        if (station.phase === 'return') {
          record.slides.push(station.slide);
          record.takeOff = station.takeOff;
        }
      }
      if (record.on) raf(tick);
    };
    raf(tick);
  });
  await panel.getByRole('button', { name: 'Bend', exact: true }).click();
  // Mid-return: the part slid along Y a few mm (tan 15° × the ram's lift so far).
  await page.waitForFunction(() => window.__return.slides.some((s) => Math.abs(s) > 4), null, { timeout: 30000 });
  state = await shop();
  measured.midReturn = { phase: state.station.phase, slide: state.station.slide, takeOff: state.station.takeOff };
  await viewport3d.screenshot({ path: `${directory}/05-mid-return-stage.png` });
  await sideView.screenshot({ path: `${directory}/06-mid-return-side-view.png` });
  const model2 = await savedWhen((m) => bendsOf(m).length === 2, 'step 2: the inner bend with the A 101 reversed');
  const record = await page.evaluate(() => {
    const r = window.__return;
    r.on = false;
    performance.now = window.__slow.real;
    window.requestAnimationFrame = window.__slow.raf;
    return { phases: [...r.phases], slides: r.slides, takeOff: r.takeOff };
  });
  await expect(panel.getByRole('button', { name: 'Bend', exact: true })).toHaveText('Bend', { timeout: 30000 });
  measured.return = {
    takeOff: record.takeOff,
    frames: record.slides.length,
    firstSlide: record.slides[0],
    lastSlide: record.slides.at(-1),
    maxSlide: Math.max(...record.slides.map(Math.abs)),
  };
  assert.equal(record.takeOff, 15, `the stroke's take-off: ${JSON.stringify(measured.return)}`);
  assert(measured.return.maxSlide > 8 && measured.return.maxSlide < 12, JSON.stringify(measured.return));
  assert.deepEqual(
    bendsOf(model2).map((b) => b.punch),
    ['a101', 'a101'],
  );
  const folded2 = await size(panel, 'Folded size');
  assert.deepEqual(folded2, withGooseneck, `folded ${folded2} against the gooseneck's ${withGooseneck}`);
  assert.deepEqual(await rowChecks(panel), ['ok', 'ok']);
  await shot('07-step-2-made', rows(panel).last());
  await noErrorLine('after step 2');
  checks.push(
    `A 101: L 15 made; L 30 → "${measured.card2}" → Turn the punch round → clear, note "${measured.note2}"; pedal: return with take-off ${record.takeOff}°, ${measured.return.frames} frames, the part slid ${measured.return.firstSlide?.toFixed(2)} → ${measured.return.lastSlide?.toFixed(2)} mm along Y (mid-return ${JSON.stringify(measured.midReturn)}); folded ${folded2.join(' × ')} = the gooseneck's ${withGooseneck.join(' × ')}; rows ok ok`,
  );

  // 3. A fresh part, Straight 88° in: L 15 made; L 30 → a shop punch on the card → click → clears → pedal.
  station = await blank();
  ({ panel } = station);
  await expect(panel.getByLabel('Punch', { exact: true })).toHaveValue('straight-88');
  await pick(station, 15);
  await pedal(panel, 1, 'step 3: the lip, straight');
  await pick(station, 30);
  const shopFix = problem(panel).getByRole('button', { name: /^Use the A 10\d punch/ });
  await expect(shopFix).toBeVisible({ timeout: 10000 });
  measured.fix3 = await shopFix.innerText();
  measured.card3 = await card(panel).innerText();
  await shot('08-shop-punch-offered', card(panel));
  await shopFix.click();
  await clear(panel);
  const model3 = await pedal(panel, 2, 'step 3: the inner bend with the shop punch');
  measured.made3 = bendsOf(model3).map((b) => b.punch);
  assert.deepEqual(await rowChecks(panel), ['ok', 'ok']);
  checks.push(`straight in: L 15 made; L 30 → "${measured.card3}" → ${measured.fix3} → clear → made ${measured.made3}`);

  // 4. A fresh part: lip 20 / web 10, either order: the new NO_WAY, no button.
  station = await blank();
  ({ panel } = station);
  measured.noWay = {};
  for (const [what, firstL, secondL] of [
    ['lip first', 20, 30],
    ['inner first', 30, 20],
  ]) {
    await pick(station, firstL);
    await pedal(panel, 1, `step 4 ${what}: the first hit`);
    await pick(station, secondL);
    await expect(card(panel)).toContainText(NO_WAY, { timeout: 10000 });
    await page.waitForTimeout(500);
    await expect(problem(panel).getByRole('button')).toHaveCount(0);
    measured.noWay[what] = await card(panel).innerText();
    await shot(`09-no-way-${what.replace(' ', '-')}`, card(panel));
    if (what === 'lip first') await undo(0, 'step 4: Undo');
    checks.push(`lip 20 / web 10, ${what}: no button; "${measured.noWay[what]}"`);
  }

  // 7 (frames). The punch line dragged on step 4's blank (the inner made, the lip pending: NO_WAY).
  const flatAt = (x, y) =>
    page.evaluate(
      ([fx, fy]) => {
        const line = document.querySelector('[aria-label="Punch line"]');
        const p = new DOMPoint(fx, -fy).matrixTransform(line.getScreenCTM());
        return [p.x, p.y];
      },
      [x, y],
    );
  // The line's place on the card (screen px across it), and the station's L (null where no backgauge reading
  // is had: past the made bend its standing flange is between the line and the edge; the hit is still checked).
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
    `the punch line dragged 48 moves on step 4's blank (L ${measured.dragL.map((L) => (L == null ? 'no reading' : Number(L.toFixed(1)))).join(' → ')}): frames ${JSON.stringify(frames)}${measured.devBuild ? ' (dev build)' : ''}, buttons on the card mid-drag: ${buttonsDuring}`,
  );
  await noErrorLine('after step 4');

  // 5. A fresh part, the A 101 in: L 30 made; L 15 → "Make this hit before bend 1" → pedal → two rows ok.
  station = await blank();
  ({ panel } = station);
  await choosePunch(panel, 'A 101', 'a101');
  await pick(station, 30);
  await pedal(panel, 1, 'step 5: the inner bend with the A 101');
  await pick(station, 15);
  const before = problem(panel).getByRole('button', { name: 'Make this hit before bend 1', exact: true });
  await expect(before).toBeVisible({ timeout: 10000 });
  measured.card5 = await card(panel).innerText();
  await shot('10-a101-before-bend-1', card(panel));
  await before.click();
  await expect(panel.getByRole('status', { name: 'Bend order', exact: true }).locator('p')).toHaveText(
    'This hit goes in before bend 1: the view shows the sheet as it is then.',
  );
  await pedal(panel, 2, 'step 5: the lip, made first');
  assert.deepEqual(await rowChecks(panel), ['ok', 'ok']);
  await shot('11-step-5-made', rows(panel).last());
  checks.push(`A 101: L 30 made; L 15 → "${measured.card5}" → Make this hit before bend 1 → pedal → rows ok ok`);

  // 6. Reload, the brake again on the part: the A 101 still in.
  await page.reload();
  const workshop = page.getByRole('button', { name: '3D Model & workshop', exact: true });
  if (await workshop.isVisible().catch(() => false)) await workshop.click();
  await current();
  await shopStation('Bend');
  panel = properties.getByRole('region', { name: 'Press brake' });
  await expect(panel.getByLabel('Punch', { exact: true })).toHaveValue('a101');
  measured.remembered = await page.evaluate(() => localStorage.getItem('sketchstudio.brake.punch'));
  await expect(panel.getByRole('group', { name: 'Blades' }).getByRole('button', { name: /^Top: punch/ })).toHaveText(
    'Top: punchA 101tip R0.8',
  );
  await shot('12-reloaded-a101-in', panel.getByRole('group', { name: 'Blades' }));
  checks.push(`reload → Bend: the A 101 in (stored ${measured.remembered})`);

  // 7 (advice). The whole advice (every punch, the turn, lengths, the tries) on the app's own modules, worst of three.
  const edge = gaugeEdges([
    [0, 0],
    [W, 0],
    [W, H],
    [0, H],
  ]).findIndex((e) => Math.abs(e.a[0] - W) < 1e-6 && Math.abs(e.b[0] - W) < 1e-6);
  const modelOf = (bends) => {
    const m = emptyModel();
    m.sketches = [{ id: 's', name: 'S', plane: 'XY', profile: rectangle(W, H), primitives: [], constrained: false }];
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
  const cases = {
    'step 2 (A 101, the room away from the lip)': [modelOf([line('lip', 15, 'a101')]), { distance: 30, punch: 'a101' }],
    'step 3 (straight: a shop punch found)': [modelOf([line('lip', 15)]), { distance: 30 }],
    'step 4 lip first (nothing)': [modelOf([line('lip', 20)]), { distance: 30 }],
    'step 4 inner first (nothing)': [modelOf([line('inner', 30)]), { distance: 20 }],
    'step 5 (A 101: this hit first)': [modelOf([line('inner', 30, 'a101')]), { distance: 15, punch: 'a101' }],
  };
  measured.advice = {};
  for (const [name, [m, patch]] of Object.entries(cases)) {
    const session = {
      ...brakeSessionDefaults(),
      stage: 'setup',
      key: 'k',
      instanceId: 'i',
      mode: 'gauge',
      edge,
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
      offered: [c.fix?.label, c.turn?.label, c.length?.label, c.ways?.first?.label, c.ways?.partway?.label].filter(
        Boolean,
      ),
    };
  }
  measured.adviceWorstMs = Math.max(...Object.values(measured.advice).map((a) => a.worstMs));
  checks.push(
    `the advice (node, worst of three): ${JSON.stringify(measured.advice)}; worst ${measured.adviceWorstMs} ms`,
  );

  // 8.
  await noErrorLine('at the end');
  if (errors.length) throw new Error(errors.join('\n'));
  checks.push('no page error; no .cad-error');
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ status: 'passed', errors, checks, measured }, null, 2),
  );
  console.log('Shop punches SP-1 verification passed:\n- ' + checks.join('\n- '));
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
