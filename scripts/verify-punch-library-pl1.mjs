/* global localStorage, process, console, document */
// Punch library PL-1, horn sections (docs/sketch-studio-punch-library.md §4.6).
// The §2.2 tray (horn-probe.mjs's outline: a 400 × 300 base of 1.2 SPCC, side
// walls 30 deep with 15 mm lips bent in, 2 × 4 reliefs at the corners) made by
// data on a cut blank, the lips and walls made; the flange's line by two
// points (2, 300) → (398, 300):
//  1. straight punch, no horns → the collision card; its first button "Use
//     horn sections at the ends", then "Shorten the punch to 356 mm";
//  2. click it → the checkbox on, the note, "Clear through …", the hooked
//     warning; the 3D view draws the horn parts (a close-up from the end of
//     the punch, the horn under the lip);
//  3. pedal → the row's tooling line ends "· horn sections"; no "ends not
//     pressed" note on the way; the record has horns and no trim;
//  4. lips 15 on walls 20 deep: with horns the punch's horn meets the lip,
//     no horn button;
//  5. the plain tray: clear, no horn button;
//  6. horns on a 40 mm bend → the horn-short refusal; a radius punch → the
//     checkbox off and disabled;
//  7. the plain tray of 3 mm SPCC in a V8 die: no tooling-load without horns,
//     the tooling-load refusal with its words with them;
//  8. save, reload → the row still reads "· horn sections"; Re-run the step:
//     the horns are in the scene;
//  9. the job sheet names the horn sections; no page error.
// PL-1.1, horn lengths (§4.8):
// 10. lips 19: the card offers "Use 25 mm horn sections at the ends" (named in
//     its sentence) → the select reads 25, the note the 25 mm horn, clear;
// 11. lips 22: the 30 mm horn → pedal (a close-up as the bend starts) → the
//     record horns: 30, "· 30 mm horn sections"; reload, Re-run: drawn;
// 12. lips 40 on walls 60: the 55 mm special → pedal (a close-up);
// 13. lips 40 on walls 30: no horn button.
// The scene draws a horn in 1 mm slices: 40 parts for the standard over one run.
// Screenshots at 1600 × 1000 and 1366 × 768.
//   CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-punch-library-pl1.mjs
// Screenshots: artifacts/sketch-cad/punch-library-pl1 (or PL1_SHOTS).
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { cadSteps } from './sketch-cad-steps.mjs';
import { HOOKED } from '../src/features/sketchstudio/cad/brakeStation.js';

const URL = process.env.CAD_VERIFY_URL || 'http://localhost:5180/sketch';
const directory = process.env.PL1_SHOTS || 'artifacts/sketch-cad/punch-library-pl1';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [],
  checks = [],
  measured = {};
page.on('pageerror', (e) => errors.push(e.message));
const { properties, current, saved, savedWhen, shopStation, shopMore } = cadSteps(page);
const footer = page.locator('.cad-status');
const canvas = page.locator('.cad-viewport canvas');
const shop = () => page.evaluate(() => document.querySelector('.cad-viewport').cadShop());
const project = (p) => page.evaluate((q) => document.querySelector('.cad-viewport').cadProject(q), p);
// Both sizes (§4.6): the 1366 × 768 one taken and put back; `focus` scrolled into the panel's view.
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
const stationWhen = (test, timeout = 20000) =>
  page.waitForFunction(
    (body) => {
      const s = document.querySelector('.cad-viewport')?.cadShop?.().station;
      return Boolean(s) && new Function('s', `return ${body};`)(s);
    },
    test,
    { polling: 'raf', timeout },
  );

const W = 400,
  H = 300;
const bend = (id, a, b, extra = {}) => ({
  id,
  a,
  b,
  angle: 90,
  direction: 'up',
  radius: null,
  punch: 'straight-88',
  ...extra,
});
// The §2.2 tray's outline and its made bends (the lips first, then the walls).
const trayData = ({ depth = 30, lip = 0, die = null } = {}) => {
  const out = depth + lip;
  const tooling = die ? { die } : {};
  return {
    profile: {
      type: 'polygon',
      points: [
        [-out, 0],
        [W + out, 0],
        [W + out, H - 4],
        [W - 2, H - 4],
        [W - 2, H + depth],
        [2, H + depth],
        [2, H - 4],
        [-out, H - 4],
      ],
    },
    bends: [
      ...(lip
        ? [
            bend('lip-r', [W + depth, 0], [W + depth, H - 4], tooling),
            bend('lip-l', [-depth, H - 4], [-depth, 0], tooling),
          ]
        : []),
      bend('side-r', [W, 0], [W, H - 4], tooling),
      bend('side-l', [0, H - 4], [0, 0], tooling),
    ],
  };
};

// A fresh model: Draw → a rectangle cut of `t` mm SPCC; then (by data) its
// outline and bends replaced (`data`: { profile, bends }) → Bend.
const blank = async ({ data = null, t = 1.2, width = W, height = H } = {}) => {
  await page.goto(URL);
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
  await fill(cut, 'Custom thickness (mm)', t);
  await cut.getByRole('button', { name: 'Cut on the laser', exact: true }).click();
  await expect(page.getByRole('figure', { name: 'Laser bed' })).toHaveAttribute('data-state', 'cut', {
    timeout: 20000,
  });
  await expect(footer).toContainText('Model current', { timeout: 60000 });
  await savedWhen((m) => m.parts.some((p) => p.features[0]?.type === 'sheetmetal'), 'the blank');
  if (data) {
    const model = await saved();
    const feature = model.parts[0].features[0];
    model.sketches.find((s) => s.id === feature.sketchId).profile = data.profile;
    feature.bends = data.bends;
    await page.evaluate((m) => {
      const workspace = JSON.parse(localStorage.getItem('apartment-planner-sketch-recovery'));
      workspace.document.model = m;
      localStorage.setItem('apartment-planner-sketch-recovery', JSON.stringify(workspace));
    }, model);
    await page.reload();
    const entry = page.getByRole('button', { name: '3D Model & workshop', exact: true });
    if (await entry.isVisible().catch(() => false)) await entry.click();
    await current();
    await savedWhen((m) => bendsOf(m).length === data.bends.length, 'the tray by data');
    await page.getByRole('button', { name: 'Shop', exact: true }).click();
  }
  await shopStation('Bend');
  const panel = properties.getByRole('region', { name: 'Press brake' });
  await expect(page.getByRole('figure', { name: 'Flat blank' })).toBeVisible();
  return panel;
};
// The punch line by two points.
const points = async (panel, a, b) => {
  await panel.getByRole('group', { name: 'Punch line' }).getByRole('button', { name: 'Two points' }).click();
  for (const [label, value] of [
    ['A X (mm)', a[0]],
    ['A Y (mm)', a[1]],
    ['B X (mm)', b[0]],
    ['B Y (mm)', b[1]],
  ])
    await fill(panel, label, value);
};
const flangeLine = (panel) => points(panel, [2, H], [W - 2, H]);
// Machine and tooling (the Punch and Die selects), opened.
const toolingOpen = async (panel) => {
  const details = panel.locator('details.cad-shop-tooling');
  if (!(await details.evaluate((d) => d.open))) await details.locator('summary').click();
};
const alert = (panel) => panel.getByRole('alert', { name: 'Collision' });
const problem = (panel) =>
  panel.locator('.cad-problem').filter({ has: page.getByRole('alert', { name: 'Collision' }) });
const clearStatus = (panel) => panel.getByRole('status', { name: 'Collision check' });
const horns = (panel) => panel.getByRole('checkbox', { name: 'Horn sections at the ends', exact: true });
const hornNote = (panel) => panel.getByRole('note', { name: 'Horn sections', exact: true });
const row = (panel, n) => panel.getByRole('list', { name: 'Sequence' }).getByRole('listitem', { name: `Step ${n}` });
const NOTE =
  "The tip runs 20 mm past the punch body at each end, 10 mm high: it reaches under a lip. Half the punch's load (500 kN/m).";

// Bring a world point to the middle of the 3D view (right-drag pans), turn
// the view `turn` px (left drag orbits) and zoom in on it (the wheel).
const closeUp = async (point, { turn = [0, 0], notches = 6 } = {}) => {
  const box = await canvas.boundingBox();
  const centre = [box.x + box.width / 2, box.y + box.height / 2];
  const pan = async () => {
    const from = await project(point);
    await page.mouse.move(from[0], from[1]);
    await page.mouse.down({ button: 'right' });
    for (let i = 1; i <= 10; i++)
      await page.mouse.move(from[0] + ((centre[0] - from[0]) * i) / 10, from[1] + ((centre[1] - from[1]) * i) / 10);
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(150);
  };
  await pan();
  if (turn[0] || turn[1]) {
    await page.mouse.move(centre[0], centre[1]);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) await page.mouse.move(centre[0] + (turn[0] * i) / 12, centre[1] + (turn[1] * i) / 12);
    await page.mouse.up();
    await page.waitForTimeout(150);
    await pan();
  }
  for (let i = 0; i < notches; i++) {
    await page.mouse.move(centre[0], centre[1]);
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(60);
    if (i % 3 === 2) await pan();
  }
  await pan();
  await page.mouse.move(box.x + 5, box.y + box.height - 5);
  await page.waitForTimeout(500);
};

try {
  // 1. The §2.2 tray, lips 15: the straight punch meets the lips; the card's buttons.
  let panel = await blank({ data: trayData({ depth: 30, lip: 15 }) });
  await flangeLine(panel);
  await expect(alert(panel)).toContainText('the part hits the punch as the ram comes down', { timeout: 15000 });
  const hornButton = problem(panel).getByRole('button', { name: 'Use horn sections at the ends', exact: true });
  await expect(hornButton).toBeVisible({ timeout: 15000 });
  measured.card1 = await text(alert(panel));
  measured.buttons1 = await problem(panel).getByRole('button').allInnerTexts();
  assert.deepEqual(
    measured.buttons1.slice(0, 2),
    ['Use horn sections at the ends', 'Shorten the punch to 356 mm'],
    JSON.stringify(measured.buttons1),
  );
  assert.equal(
    await hornButton.getAttribute('title'),
    'Tried with horn sections, the hit clears: the corners are pressed',
  );
  await expect(horns(panel)).not.toBeChecked();
  await shot('01-card-horn-first', problem(panel));
  checks.push(`lips 15, straight punch: "${measured.card1}" buttons ${JSON.stringify(measured.buttons1)}`);

  // 2. The horn button: the checkbox on, the note, clear, the hooked warning, the horns in the scene.
  await hornButton.click();
  await expect(horns(panel)).toBeChecked();
  await expect(hornNote(panel)).toHaveText(NOTE);
  await expect(clearStatus(panel)).toContainText('Clear through the stroke', { timeout: 15000 });
  const hooked = panel.getByRole('note').filter({ hasText: 'The part stands over the horns' });
  await expect(hooked).toHaveText(HOOKED);
  await expect(panel.getByRole('note').filter({ hasText: 'the ends are not pressed' })).toHaveCount(0);
  await stationWhen('s.horns && s.hornParts === 40');
  let state = await shop();
  assert.equal(state.station.punchDrawn, 'straight-88:horns', JSON.stringify(state.station.punchDrawn));
  measured.ranges = state.station.ranges;
  await shot('02-horns-on-clear', hooked);
  // The close-up from the end of the punch (behind it, beside the right-hand
  // wall): the right horn at machine X 178 – 198, under the lip (the station
  // stands at the work height, 1000 mm). Parked, the punch waits 40 mm above
  // the sheet; the pedal below takes the shot as the bend starts, the tip on the sheet.
  await closeUp([190, 0, 1000 + 12], { turn: [-250, -10], notches: 8 });
  await page.locator('.cad-viewport').screenshot({ path: `${directory}/03-horn-parked-1600.png` });
  measured.camera = await page.evaluate(() => document.querySelector('.cad-viewport').cadCamera());
  checks.push(
    `"Use horn sections at the ends" → checkbox on, note "${NOTE}", "Clear through the stroke", warning "${HOOKED}", no ends-not-pressed note; scene: punch "${state.station.punchDrawn}", ${state.station.hornParts} horn parts over the runs ${JSON.stringify(measured.ranges)}`,
  );

  // 3. Pedal: the horn under the lip as the bend starts; the record carries horns (no trim), the row ends "· horn sections".
  await panel.getByRole('button', { name: 'Bend', exact: true }).click();
  await stationWhen("s.stroking && s.phase === 'bend' && s.angle > 1 && s.angle < 40 && s.hornParts === 40", 20000);
  await page.locator('.cad-viewport').screenshot({ path: `${directory}/03-horn-under-lip-1600.png` });
  measured.closeUpAngle = (await shop()).station.angle;
  let model = await savedWhen((m) => bendsOf(m).length === 5, 'the flange made');
  await expect(panel.getByRole('button', { name: 'Bend', exact: true })).toHaveText('Bend', { timeout: 30000 });
  const flange = bendsOf(model)[4];
  assert.equal(flange.horns, true, JSON.stringify(flange));
  assert.equal('punchTrim' in flange, false, JSON.stringify(flange));
  assert(
    bendsOf(model)
      .slice(0, 4)
      .every((b) => !('horns' in b)),
    'the earlier bends carry no horns',
  );
  await expect(row(panel, 5).locator('small')).toHaveText(/ · horn sections$/);
  await expect(row(panel, 5).locator('.cad-brake-check')).toHaveText('ok');
  measured.row5 = await text(row(panel, 5).locator('small'));
  await expect(row(panel, 4).locator('small')).not.toContainText('horn sections');
  await shot('04-row-horn-sections', row(panel, 5));
  checks.push(`pedal → bend 5 saved with horns: true, no punchTrim; Step 5 "${measured.row5}", ok`);

  // 8. Save, reload: the row still reads "· horn sections"; Re-run: the horns in the scene.
  await page.reload();
  const entry = page.getByRole('button', { name: '3D Model & workshop', exact: true });
  if (await entry.isVisible().catch(() => false)) await entry.click();
  await current();
  model = await savedWhen((m) => bendsOf(m).length === 5, 'after reload');
  assert.equal(bendsOf(model)[4].horns, true);
  await page.getByRole('button', { name: 'Shop', exact: true }).click();
  await shopStation('Bend');
  panel = properties.getByRole('region', { name: 'Press brake' });
  await expect(row(panel, 5).locator('small')).toHaveText(/ · horn sections$/);
  await row(panel, 5).getByRole('button', { name: 'Re-run', exact: true }).click();
  await stationWhen('s.stroking && s.horns && s.hornParts === 40', 10000);
  measured.rerun = await shop();
  await page.waitForFunction(
    () => document.querySelector('.cad-viewport').cadShop().station?.stroking === false,
    null,
    {
      timeout: 15000,
    },
  );
  await shot('05-reload-rerun', row(panel, 5));
  checks.push(
    `reload: bend 5 keeps horns, Step 5 still "· horn sections"; Re-run: the scene draws ${measured.rerun.station.hornParts} horn parts ("${measured.rerun.station.punchDrawn}")`,
  );

  // 9. The job sheet names the horn sections on the flange's step only.
  await shopMore('Job sheet');
  const job = properties.getByRole('region', { name: 'Job sheet' });
  const bendRow = (n) => job.locator('li:not([aria-label])').filter({ hasText: new RegExp(`· bend ${n} ·`) });
  await expect(bendRow(5)).toContainText('· horn sections');
  await expect(bendRow(4)).not.toContainText('horn sections');
  measured.jobRow = await text(bendRow(5));
  await shot('06-job-sheet', bendRow(5));
  checks.push(`job sheet: "${measured.jobRow}"`);

  // 4. Lips 15 on walls 20 deep: the horn is 10 mm high and rises into the lip.
  panel = await blank({ data: trayData({ depth: 20, lip: 15 }) });
  await flangeLine(panel);
  await expect(alert(panel)).toContainText('the part hits the punch as the ram comes down', { timeout: 15000 });
  await expect(problem(panel).getByRole('button', { name: /^Shorten the punch/ })).toBeVisible({ timeout: 15000 });
  await expect(problem(panel).getByRole('button', { name: 'Use horn sections at the ends' })).toHaveCount(0);
  await horns(panel).check();
  await expect(alert(panel)).toContainText("the part hits the punch's horn as the ram comes down", { timeout: 15000 });
  // The advice once tried (after the settle): a shorter punch with horns, never the horn button.
  await expect(alert(panel)).toContainText('shorten the punch to', { timeout: 15000 });
  await expect(problem(panel).getByRole('button', { name: 'Use horn sections at the ends' })).toHaveCount(0);
  measured.deepCard = await text(alert(panel));
  await stationWhen("s.collision && s.collision.tool === 'punch' && s.hornParts === 40");
  await shot('07-walls-20-horn-meets-lip', problem(panel));
  checks.push(`lips 15 on walls 20: no horn button; with horns "${measured.deepCard}"`);

  // 5. The plain tray: no horn button, the fitted punch clears as before.
  panel = await blank({ data: trayData({ depth: 30 }) });
  await flangeLine(panel);
  await expect(clearStatus(panel)).toContainText('Clear through the stroke', { timeout: 15000 });
  await expect(panel.getByRole('button', { name: 'Use horn sections at the ends' })).toHaveCount(0);
  await expect(horns(panel)).not.toBeChecked();
  await shot('08-plain-tray-clear', clearStatus(panel));
  checks.push('plain tray: clear with the fitted punch, no horn button');

  // 7. The load case: the plain tray of 3 mm SPCC in a V8 die.
  panel = await blank({ data: trayData({ depth: 30, die: 'v8-88' }), t: 3 });
  await flangeLine(panel);
  await toolingOpen(panel);
  await panel.getByLabel('Die', { exact: true }).selectOption('v8-88');
  await expect(clearStatus(panel)).toContainText('Clear through the stroke', { timeout: 15000 });
  await expect(panel.getByRole('alert').filter({ hasText: 'is rated' })).toHaveCount(0);
  await horns(panel).check();
  const load = panel.getByRole('alert').filter({ hasText: 'with horn sections is rated' });
  await expect(load).toBeVisible({ timeout: 15000 });
  measured.load = await text(load);
  assert.match(
    measured.load,
    /^This hit needs [\d.]+ kN; the Straight 88° punch with horn sections is rated 500 kN\/m \(half the punch's\), [\d.]+ kN over [\d.]+ mm\. Use a wider die, or bend it without horn sections\.$/,
  );
  await shot('09-load-refused', load);
  checks.push(`3 mm SPCC, V8: no load refusal without horns; with them "${measured.load}"`);

  // 6. Horns on a 40 mm bend; a radius punch.
  panel = await blank({ width: 40, height: 100 });
  await points(panel, [0, 50], [40, 50]);
  await expect(clearStatus(panel)).toContainText('Clear through the stroke', { timeout: 15000 });
  await horns(panel).check();
  const short = panel.getByRole('alert').filter({ hasText: 'Horn sections need a bend' });
  await expect(short).toHaveText('Horn sections need a bend of at least 50 mm: this one is 40 mm.');
  await shot('10-horn-short', short);
  await toolingOpen(panel);
  await panel.getByLabel('Punch', { exact: true }).selectOption('radius-10');
  await expect(horns(panel)).not.toBeChecked();
  await expect(horns(panel)).toBeDisabled();
  measured.radiusTitle = await horns(panel).evaluate((el) => el.closest('label').title);
  assert.equal(measured.radiusTitle, 'A radius punch has no horn sections');
  await expect(hornNote(panel)).toHaveCount(0);
  await shot('11-radius-punch-no-horns', horns(panel));
  checks.push(
    'a 40 mm bend with horns: "Horn sections need a bend of at least 50 mm: this one is 40 mm."; the R10 radius punch: the checkbox off and disabled, its title',
  );

  // PL-1.1 (§4.8): horn lengths. The card tries them shortest first; the scene draws each to its profile.
  const hornLength = (panel) => panel.getByRole('combobox', { name: 'Horn length', exact: true });
  // The card's horn for a tray, clicked: the box on, the select on that horn, clear.
  const takeHorn = async (panel, reach, label) => {
    await flangeLine(panel);
    await expect(alert(panel)).toContainText('the part hits the punch as the ram comes down', { timeout: 15000 });
    const button = problem(panel).getByRole('button', { name: label, exact: true });
    await expect(button).toBeVisible({ timeout: 20000 });
    const sentence = await text(alert(panel));
    await button.click();
    await expect(horns(panel)).toBeChecked();
    await expect(hornLength(panel)).toHaveValue(String(reach));
    await expect(clearStatus(panel)).toContainText('Clear through the stroke', { timeout: 15000 });
    return sentence;
  };
  // The close-up of a horn as the pedal's bend starts (the punch on the sheet), then the hit made.
  const pedalCloseUp = async (panel, name, { parts, point, count }) => {
    await closeUp(point, { turn: [-250, -10], notches: 8 });
    await panel.getByRole('button', { name: 'Bend', exact: true }).click();
    await stationWhen(
      `s.stroking && s.phase === 'bend' && s.angle > 1 && s.angle < 40 && s.hornParts === ${parts}`,
      20000,
    );
    await page.locator('.cad-viewport').screenshot({ path: `${directory}/${name}-1600.png` });
    const model = await savedWhen((m) => bendsOf(m).length === count, `${name}: the flange made`);
    await expect(panel.getByRole('button', { name: 'Bend', exact: true })).toHaveText('Bend', { timeout: 30000 });
    return model;
  };

  // 10. Lips 19 on walls 30: the standard horn meets them; the card offers the 25 mm horn.
  panel = await blank({ data: trayData({ depth: 30, lip: 19 }) });
  measured.lips19 = await takeHorn(panel, 25, 'Use 25 mm horn sections at the ends');
  assert(
    measured.lips19.includes('use 25 mm horn sections at the ends or shorten the punch to 356 mm.'),
    measured.lips19,
  );
  await expect(hornNote(panel)).toHaveText(
    "The tip runs 25 mm past the punch body at each end, 10 mm high: it reaches under a lip. Half the punch's load (500 kN/m).",
  );
  await stationWhen('s.hornReach === 25 && s.hornParts === 50');
  await shot('12-lips-19-25mm-horn', hornNote(panel));
  checks.push(`lips 19: "${measured.lips19}" → the 25 mm horn chosen, clear`);

  // 11. Lips 22: the 30 mm horn; made, saved, reloaded and re-run.
  panel = await blank({ data: trayData({ depth: 30, lip: 22 }) });
  measured.lips22 = await takeHorn(panel, 30, 'Use 30 mm horn sections at the ends');
  model = await pedalCloseUp(panel, '13-horn-30-close-up', { parts: 60, point: [185, 0, 1000 + 12], count: 5 });
  assert.equal(bendsOf(model)[4].horns, 30, JSON.stringify(bendsOf(model)[4]));
  await expect(row(panel, 5).locator('small')).toHaveText(/ · 30 mm horn sections$/);
  await page.reload();
  if (await entry.isVisible().catch(() => false)) await entry.click();
  await current();
  model = await savedWhen((m) => bendsOf(m).length === 5, 'after reload, the 30 mm horn');
  assert.equal(bendsOf(model)[4].horns, 30);
  await page.getByRole('button', { name: 'Shop', exact: true }).click();
  await shopStation('Bend');
  panel = properties.getByRole('region', { name: 'Press brake' });
  await expect(row(panel, 5).locator('small')).toHaveText(/ · 30 mm horn sections$/);
  await row(panel, 5).getByRole('button', { name: 'Re-run', exact: true }).click();
  await stationWhen('s.stroking && s.hornReach === 30 && s.hornParts === 60', 10000);
  measured.rerun30 = (await shop()).station.punchDrawn;
  await page.waitForFunction(
    () => document.querySelector('.cad-viewport').cadShop().station?.stroking === false,
    null,
    {
      timeout: 15000,
    },
  );
  await shot('14-horn-30-reloaded', row(panel, 5));
  checks.push(
    `lips 22: "${measured.lips22}" → the 30 mm horn → pedal → bend 5 horns: 30, Step 5 "· 30 mm horn sections"; reload, Re-run: "${measured.rerun30}" with 60 horn parts drawn`,
  );

  // 12. Lips 40 on walls 60: the special 55 mm horn.
  panel = await blank({ data: trayData({ depth: 60, lip: 40 }) });
  measured.lips40 = await takeHorn(panel, 55, 'Use 55 mm horn sections at the ends');
  await expect(hornLength(panel).locator('option:checked')).toHaveText('55 mm · 45 high (special)');
  await pedalCloseUp(panel, '15-horn-55-close-up', { parts: 110, point: [175, 0, 1000 + 40], count: 5 });
  checks.push(`lips 40 on walls 60: "${measured.lips40}" → the 55 mm horn, made`);

  // 13. Lips 40 on walls 30: no horn clears, the card offers none.
  panel = await blank({ data: trayData({ depth: 30, lip: 40 }) });
  await flangeLine(panel);
  await expect(problem(panel).getByRole('button', { name: /^Shorten the punch/ })).toBeVisible({ timeout: 20000 });
  await expect(problem(panel).getByRole('button', { name: /horn sections at the ends$/ })).toHaveCount(0);
  measured.lips40low = await text(alert(panel));
  await shot('16-lips-40-walls-30-no-horn', problem(panel));
  checks.push(`lips 40 on walls 30: no horn button; "${measured.lips40low}"`);

  // The 20 mm horn's close-up for the comparison (taken in step 3): 03-horn-under-lip-1600.png.

  if (errors.length) throw new Error(errors.join('\n'));
  checks.push('no page error');
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ status: 'passed', errors, checks, measured }, null, 2),
  );
  console.log('Punch library PL-1 verification passed:\n- ' + checks.join('\n- '));
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
