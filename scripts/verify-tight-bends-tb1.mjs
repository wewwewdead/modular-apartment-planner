/* global localStorage, process, console, document */
// Tight bends TB-1 (docs/sketch-studio-tight-bends.md §4.6): bending a bend on.
// A 605.4 × 420.4 blank of 1.2 SPCC (the user's screenshot, §1):
//  1. control: the right edge, L 29, 90° → hit; L 11, 90° → refused (the ram,
//     as the screenshot); Undo the first hit;
//  2. L 29 at 30° → hit; L 11, 90° → clear → hit;
//  3. bend 1's line again, L 19.07 (since SG-1 read off the lip's skin; it was
//     the flat 29) → the note "This is bend 1's line …", "Bend on to (°)" reads
//     90, "now 30° · this hit adds 60°"; (4.) typed 20° → §4.1's refusal, nothing
//     committed; back to 90° → the pedal: the stroke starts at 30° (side view),
//     ends at 90°; three rows, the third a bend-on row; the folded size equals
//     the lip-first part's (0.01 mm), and the kernel's solid the fold's;
//  5. Remove row 3 → two rows, bend 1 at 30°; Undo → three; Earlier on row 3
//     (twice) → refused (the lip then meets the ram); the lip first (Later on
//     row 1) then Earlier on the bend-on row → refused in §4.1's words; Undo;
//  6. Scrub row 3 Before / After; Re-run on row 3 (from 30°);
//  8. Job sheet: "3 hits on the press brake"; Replay: three bend scenes, the
//     third "Bend 1 on to 90°"; Save, reload: the same three rows;
//  7. a second part: inner 45°, then the lip to 90° → refused, the ram at about
//     79° (the fact; TB-1 gives no advice);
//  9. no page error; no .cad-error but the refusals asked for.
// (4 is made while bend 1 still stands at 30°, before 3's pedal; 8 runs before
// 7, which starts a fresh model.) Screenshots at 1600 × 1000 and 1366 × 768.
//   CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-tight-bends-tb1.mjs
// Screenshots: artifacts/sketch-cad/tight-bends-tb1 (or TB1_SHOTS).
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { cadSteps } from './sketch-cad-steps.mjs';
import { foldSheet, foldedBounds } from '../src/features/sketchstudio/cad/sheetMetal.js';

const directory = process.env.TB1_SHOTS || 'artifacts/sketch-cad/tight-bends-tb1';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [],
  checks = [],
  measured = {};
page.on('pageerror', (e) => errors.push(e.message));
const { properties, current, saved, savedWhen, shopStation, shopMore, showTree } = cadSteps(page);
const footer = page.locator('.cad-status');
const files = page.locator('.cad-file-actions');
const route = page.getByRole('navigation', { name: 'Shop route' });
const shop = () => page.evaluate(() => document.querySelector('.cad-viewport').cadShop());
const film = () => page.evaluate(() => document.querySelector('.cad-workspace').cadFilm());
const sideView = page.getByRole('figure', { name: 'Side view' });
// Both sizes the spec asks for (§4.6): the 1366 × 768 one taken and put back.
// `focus`: what the shot is about, scrolled into the panel's view at each size.
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
// §9: an error line only where a refusal was asked for (the workspace keeps its last one on show until
// the next edit, so a refusal asked for may still stand there).
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
  { type: 'rectangle', width: W, height: H, origin: [0, 0] },
);
const [lo, hi] = foldedBounds(lipFirst);
const expected = lo.map((v, i) => Number((hi[i] - v).toFixed(2)));

// A fresh model, then Draw → Cut the 605.4 × 420.4 blank of 1.2 SPCC → Bend.
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
const rows = (panel) => panel.getByRole('list', { name: 'Sequence' }).getByRole('listitem');
const row = (panel, n) => panel.getByRole('list', { name: 'Sequence' }).getByRole('listitem', { name: `Step ${n}` });
const rowTexts = async (panel) => (await rows(panel).locator('strong').allInnerTexts()).map((t) => t.trim());
// The press brake's Bend button and the sequence in reach at a size (the pinned footer, nothing clipped).
const reachable = async (panel, where) => {
  const bend = await panel.getByRole('button', { name: 'Bend', exact: true }).boundingBox();
  const view = page.viewportSize();
  assert(bend && bend.y >= 0 && bend.y + bend.height <= view.height, `${where}: the Bend button in the window`);
  const list = panel.getByRole('list', { name: 'Sequence' });
  await list.scrollIntoViewIfNeeded();
  const box = await list.boundingBox();
  assert(box && box.height > 0 && box.y < view.height, `${where}: the sequence reachable`);
  return { bend: Math.round(bend.y), list: Math.round(box.y) };
};

try {
  // 1. The control: the user's order, all at 90°.
  const station = await blank();
  const { panel } = station;
  await pick(station, 29, 90);
  await pedal(panel, 1, 'the inner bend at 90°');
  await pick(station, 11, 90);
  const card = panel.getByRole('alert', { name: 'Collision' });
  await expect(card).toContainText('Bend 2: the part hits the ram as the ram comes down.');
  await expect(panel.getByRole('button', { name: 'Bend', exact: true })).toBeDisabled();
  measured.control = await card.innerText();
  await shot('01-control-lip-refused', card);
  await files.getByRole('button', { name: 'Undo', exact: true }).click();
  await savedWhen((m) => bendsOf(m).length === 0, 'Undo the first hit');
  checks.push(
    `control: L 29 at 90° made, L 11 at 90° refused — "${measured.control.split('. ')[0].replace(/\.$/, '')}." — Undo → flat`,
  );

  // 2. The inner bend part-way, then the lip.
  await pick(station, 29, 30);
  let model = await pedal(panel, 1, 'the inner bend at 30°');
  const inner = bendsOf(model)[0];
  assert.equal(inner.angle, 30);
  await pick(station, 11, 90);
  model = await pedal(panel, 2, 'the lip at 90°');
  await noErrorLine('after the lip');
  assert.deepEqual(await rowTexts(panel), ['1 · UP 30° R1.28', '2 · UP 90° R1.28']);
  checks.push('L 29 at 30° → hit; L 11 at 90° → clear → hit: rows "1 · UP 30° R1.28", "2 · UP 90° R1.28"');

  // 3. Bend 1's line again. The lip (bend 2, 11 from the right edge) now stands between the edge
  // and it, so since SG-1 (docs/sketch-studio-skin-gauge.md §4.4) L is read off the lip's skin:
  // 29 − (11 + BA/2 − (r + t)) = 19.07 (it was the flat 29 before; typed now, 29 is off the lip).
  await pick(station, 19.07);
  const note = panel.getByRole('note', { name: 'Bend on', exact: true });
  await expect(note).toHaveText("This is bend 1's line: it stands at 30°. This hit bends it on.");
  await expect(panel.locator('dd[aria-label="Backgauge L"]')).toHaveText("19.07 mm · off bend 2's flange");
  await expect(panel.locator('dd[aria-label="Line on the flat blank"]')).toHaveText('29 mm from edge 2');
  const onTo = panel.getByLabel('Bend on to (°)', { exact: true });
  await expect(onTo).toHaveValue('90');
  await expect(panel.getByRole('note', { name: 'Bend on note', exact: true })).toHaveText(
    'now 30° · this hit adds 60°',
  );
  await expect(panel.getByLabel('Flip sheet', { exact: true })).toBeDisabled();
  let state = await shop();
  assert.equal(Math.round(state.station.angle), 30, `the sheet in the die at 30° (${state.station.angle})`);
  measured.reach1600 = await reachable(panel, '1600 × 1000');
  await shot('02-bend-on-pending', panel.getByRole('note', { name: 'Bend on', exact: true }));
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.waitForTimeout(400);
  measured.reach1366 = await reachable(panel, '1366 × 768');
  await page.setViewportSize({ width: 1600, height: 1000 });
  await sideView.screenshot({ path: `${directory}/03-side-view-at-30.png` });
  checks.push(
    `bend 1's line again, L 19.07 off the lip's skin (SG-1) → note "${await note.innerText()}", "Bend on to (°)" 90, "now 30° · this hit adds 60°", Flip off; sheet in the die at 30°; Bend at y ${measured.reach1366.bend} of 768`,
  );

  // 4. Bend on to 20° on a bend at 30°: refused, nothing committed.
  const before = bendsOf(await saved()).length;
  await fill(panel, 'Bend on to (°)', 20);
  const refused = panel.getByRole('alert').filter({ hasText: 'already at' });
  await expect(refused).toHaveText('Bend 1 is already at 30°: a hit only bends it further.');
  await expect(panel.getByRole('button', { name: 'Bend', exact: true })).toBeDisabled();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  assert.equal(bendsOf(await saved()).length, before, 'nothing committed at 20°');
  await shot('04-bend-on-20-refused', refused.first());
  checks.push('Bend on to 20° → "Bend 1 is already at 30°: a hit only bends it further.", Bend off, nothing committed');
  await fill(panel, 'Bend on to (°)', 90);

  // The pedal: the stroke starts at 30°, ends at 90°.
  await expect(panel.getByRole('status', { name: 'Collision check' })).toContainText('Clear through the stroke');
  await panel.getByRole('button', { name: 'Bend', exact: true }).click();
  const approach = await page.waitForFunction(
    () => {
      const s = document.querySelector('.cad-viewport').cadShop().station;
      return s?.stroking && s.phase === 'approach' ? s.angle : null;
    },
    null,
    { timeout: 15000, polling: 'raf' },
  );
  measured.strokeStart = await approach.jsonValue();
  assert(Math.abs(measured.strokeStart - 30) < 0.01, `the stroke starts at ${measured.strokeStart}°`);
  await page.waitForFunction(
    () => {
      const s = document.querySelector('.cad-viewport').cadShop().station;
      return s?.stroking && s.phase === 'bend' && s.angle > 50 && s.angle < 80;
    },
    null,
    { timeout: 15000, polling: 'raf' },
  );
  await sideView.screenshot({ path: `${directory}/05-side-view-bending-on.png` });
  model = await savedWhen((m) => bendsOf(m).length === 3, 'the bend-on hit');
  await expect(panel.getByRole('button', { name: 'Bend', exact: true })).toHaveText('Bend', { timeout: 20000 });
  const on = bendsOf(model)[2];
  assert.deepEqual([on.again, on.angle, on.a], [inner.id, 90, undefined], JSON.stringify(on));
  state = await shop();
  assert.equal(Math.round(state.station.angle), 90, `the stroke ends at 90° (${state.station.angle})`);
  assert.deepEqual(await rowTexts(panel), ['1 · UP 30° R1.28', '2 · UP 90° R1.28', '3 · bend 1 on: 30° → 90°']);
  await expect(row(panel, 3).locator('.cad-brake-check')).toHaveText('ok');
  const folded = await size(panel, 'Folded size');
  near(folded, expected, 'the folded size against the lip-first part');
  await sideView.screenshot({ path: `${directory}/06-side-view-at-90.png` });
  await shot('07-three-rows', row(panel, 3));
  checks.push(
    `pedal → the stroke starts at ${measured.strokeStart}° (approach), ends at 90°; committed ${JSON.stringify(on)}; rows ${JSON.stringify(await rowTexts(panel))}; folded ${folded.join(' × ')} mm = lip-first ${expected.join(' × ')} mm`,
  );
  // The kernel's solid: the same size.
  await panel.getByRole('button', { name: 'Leave press brake', exact: true }).click();
  await current();
  await showTree();
  await page.locator('.cad-tree-item', { hasText: 'Sheet-metal part' }).first().click();
  const solid = await size(properties, 'Part size');
  near(solid, folded, 'the kernel solid against the fold');
  checks.push(`kernel part size ${solid.join(' × ')} mm = the fold's`);
  await shopStation('Bend');
  const brake = properties.getByRole('region', { name: 'Press brake' });
  await expect(rows(brake)).toHaveCount(3);

  // 5. Remove row 3, Undo; Earlier refused (twice); before its bend: §4.1's words.
  await row(brake, 3).getByRole('button', { name: 'Remove', exact: true }).click();
  await savedWhen((m) => bendsOf(m).length === 2, 'row 3 removed');
  await expect(rows(brake)).toHaveCount(2);
  assert.deepEqual(await rowTexts(brake), ['1 · UP 30° R1.28', '2 · UP 90° R1.28']);
  await files.getByRole('button', { name: 'Undo', exact: true }).click();
  await savedWhen((m) => bendsOf(m).length === 3, 'Undo the remove');
  await expect(rows(brake)).toHaveCount(3);
  const order = async () => bendsOf(await saved()).map((b) => b.id);
  const made = await order();
  for (const time of [1, 2]) {
    await row(brake, 3).getByRole('button', { name: 'Earlier', exact: true }).click();
    await expect(page.locator('.cad-error')).toContainText('That order is refused: step 3 could not be made then.');
    await expect(page.locator('.cad-error')).toContainText('the part hits the ram');
    assert.deepEqual(await order(), made, `Earlier ${time}: nothing committed`);
  }
  measured.earlier = (await errorLines()).join(' ');
  asked.push('That order is refused: step 3 could not be made then.');
  await shot('08-earlier-refused', row(brake, 3));
  await row(brake, 1).getByRole('button', { name: 'Later', exact: true }).click();
  await savedWhen((m) => bendsOf(m)[0].id === made[1], 'the lip first');
  await row(brake, 3).getByRole('button', { name: 'Earlier', exact: true }).click();
  await expect(page.locator('.cad-error')).toHaveText(
    'Step 2 bends a bend on before it is made: a bend is made first, then bent on.',
  );
  measured.beforeItsBend = (await errorLines()).join(' ');
  asked.push('Step 2 bends a bend on before it is made');
  assert.deepEqual(await order(), [made[1], made[0], made[2]], 'refused: nothing committed');
  await files.getByRole('button', { name: 'Undo', exact: true }).click();
  await savedWhen((m) => bendsOf(m)[0].id === made[0], 'Undo the lip first');
  await expect(rows(brake)).toHaveCount(3);
  checks.push(
    `Remove row 3 → two rows (bend 1 "UP 30°"), Undo → three; Earlier on row 3 twice → "${measured.earlier.slice(0, 120)}…"; lip first then Earlier on the bend-on row → "${measured.beforeItsBend}"; Undo`,
  );

  // 6. Scrub row 3 before / after; Re-run row 3 from 30°.
  await row(brake, 3).getByRole('button', { name: 'Before', exact: true }).click();
  await page.waitForTimeout(300);
  state = await shop();
  assert.equal(Math.round(state.station.angle), 30, `row 3 before: ${state.station.angle}°`);
  await sideView.screenshot({ path: `${directory}/09-scrub-before.png` });
  await row(brake, 3).getByRole('button', { name: 'After', exact: true }).click();
  await page.waitForTimeout(300);
  state = await shop();
  assert.equal(Math.round(state.station.angle), 90, `row 3 after: ${state.station.angle}°`);
  await sideView.screenshot({ path: `${directory}/10-scrub-after.png` });
  await row(brake, 3).getByRole('button', { name: 'After', exact: true }).click();
  const commits = bendsOf(await saved()).length;
  await row(brake, 3).getByRole('button', { name: 'Re-run', exact: true }).click();
  const rerun = await page.waitForFunction(
    () => {
      const s = document.querySelector('.cad-viewport').cadShop().station;
      return s?.stroking && s.phase === 'approach' ? s.angle : null;
    },
    null,
    { timeout: 15000, polling: 'raf' },
  );
  measured.rerunStart = await rerun.jsonValue();
  assert(Math.abs(measured.rerunStart - 30) < 0.01, `the re-run starts at ${measured.rerunStart}°`);
  await page.waitForFunction(() => !document.querySelector('.cad-viewport').cadShop().station?.stroking, null, {
    timeout: 15000,
  });
  assert.equal(bendsOf(await saved()).length, commits, 'a re-run commits nothing');
  await noErrorLine('after the re-run');
  checks.push(`scrub row 3: before 30°, after 90°; Re-run row 3 from ${measured.rerunStart}°, nothing committed`);

  // 8. The job sheet, the replay, Save and reload.
  await brake.getByRole('button', { name: 'Leave press brake', exact: true }).click();
  await current();
  await shopMore('Job sheet');
  const job = properties.getByRole('region', { name: 'Job sheet' });
  await expect(job).toContainText('3 hits on the press brake');
  await expect(job).toContainText('bend 1 on: 30° → 90°');
  await shot('11-job-sheet');
  await route.getByRole('button', { name: 'Replay', exact: true }).click();
  await expect(properties.getByRole('region', { name: 'Replay' })).toBeVisible();
  let f = await film();
  const bendScenes = f.scenes.filter((s) => s.station === 'bend');
  assert.equal(bendScenes.length, 3, JSON.stringify(f.scenes));
  assert.equal(bendScenes[2].title, 'Bend 1 on to 90°');
  measured.scenes = f.scenes.map((s) => s.title);
  // Into the third bend scene: the stroke from 30°.
  const third = f.scenes.findIndex((s) => s.key === bendScenes[2].key);
  await page.waitForFunction((i) => document.querySelector('.cad-workspace').cadFilm().index === i, third, {
    timeout: 60000,
  });
  await page.waitForTimeout(600);
  await shot('12-replay-bend-on');
  await route.getByRole('button', { name: 'End replay', exact: true }).click();
  f = await film();
  assert.equal(f.open, false);
  const before8 = await saved();
  await page.reload();
  const workshop = page.getByRole('button', { name: '3D Model & workshop', exact: true });
  if (await workshop.isVisible().catch(() => false)) await workshop.click();
  await current();
  const after8 = await saved();
  assert.deepEqual(bendsOf(after8), bendsOf(before8), 'the three entries survive the reload');
  await shopStation('Bend');
  const reloaded = properties.getByRole('region', { name: 'Press brake' });
  await expect(rows(reloaded)).toHaveCount(3);
  assert.deepEqual(await rowTexts(reloaded), ['1 · UP 30° R1.28', '2 · UP 90° R1.28', '3 · bend 1 on: 30° → 90°']);
  checks.push(
    `job sheet "3 hits on the press brake"; Replay scenes ${JSON.stringify(measured.scenes)}; reload → the same three rows`,
  );
  await noErrorLine('after the reload');

  // 7. A second part: inner 45°, then the lip → refused, the ram at about 79°.
  const second = await blank();
  await pick(second, 29, 45);
  await pedal(second.panel, 1, 'the inner bend at 45°');
  await pick(second, 11, 90);
  const deep = second.panel.getByRole('alert', { name: 'Collision' });
  await expect(deep).toContainText('Bend 2: the part hits the ram at');
  measured.deep = await deep.innerText();
  const at = Number(measured.deep.match(/the ram at ([\d.]+)°/)[1]);
  assert(at > 77 && at < 81, `the ram at ${at}°`);
  await expect(second.panel.getByRole('button', { name: 'Bend', exact: true })).toBeDisabled();
  await shot('13-inner-45-lip-refused', deep);
  checks.push(
    `second part: inner 45°, lip 90° → refused at ${at}° — "${measured.deep.split('. ')[0].replace(/\.$/, '')}."`,
  );

  // 9.
  if (errors.length) throw new Error(errors.join('\n'));
  checks.push('no page error; .cad-error only for the two refused moves asked for');
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ status: 'passed', errors, checks, measured }, null, 2),
  );
  console.log('Tight bends TB-1 verification passed:\n- ' + checks.join('\n- '));
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` });
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}
