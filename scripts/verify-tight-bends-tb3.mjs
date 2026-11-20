/* global localStorage, process, console, document */
// Tight bends TB-3 (docs/sketch-studio-tight-bends.md §7.6): the line finds the bend.
// A 605.4 × 420.4 blank of 1.2 SPCC, straight punch:
//  1. right edge, L 29, 45° → hit;
//  2. right edge, L 30 typed → no problem card; the note "This is bend 1's
//     line: it stands at 45°. This hit bends it on."; the seated note "L 30 is
//     1 mm from bend 1's line. …"; "Bend on to (°)" reads 90; after blur the L
//     field reads 29;
//  3. Gauge off: The edge, L 34 → the short-leg card with "Bend 1 on instead";
//     click → L 29, the note (since SG-1, docs/sketch-studio-skin-gauge.md
//     §4.4, a typed L 34 reads off bend 1's flange: only the edge held puts the
//     line 34 from the edge);
//  4. left edge, L 576 → the L field and the backgauge readout 576.4, the
//     bend-on note; pedal → two rows, "2 · bend 1 on: 45° → 90°"; Undo;
//  5. the fingers dragged from L 20 past the bend, a millimetre at a time
//     (the hands-on script's drag): between 26 and 33 the chip reads "L 29 mm
//     · on bend 1" and the fingers stand at 29; at 34 (SG-1) the fingers stand
//     at 34 off bend 1's flange; let go at 31 → the bend-on note;
//  6. two points typed A (576.7, 5), B (576.6, 415) → the bend-on note and the
//     seated note's two-point words (typed A X, A Y, B Y, B X: the line seats
//     when it first comes near the bend, and B Y typed after that would edit
//     the seated point, leaving the line exactly on the bend, no seat to tell);
//  7. the line cleared (Esc); bend 1's line clicked on the flat blank → L 29, the note;
//  8. two points (0, 200) → (605.4, 200) → "This line runs across bend 1, which
//     is already made: the brake cannot bend across a formed bend."; no button;
//  9. the technique, a second part: L 29 at 30° → hit; L 11 at 90° → hit; the
//     right edge is now on the lip's face, so the left edge, L 576 → seated on
//     bend 1, "Bend on to (°)" 90 → pedal: three rows; the folded size equals
//     (0.01 mm) the lip-first part's;
// 10. no page error; no .cad-error but step 8's refusal.
// Screenshots at 1600 × 1000 and 1366 × 768.
//   CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-tight-bends-tb3.mjs
// Screenshots: artifacts/sketch-cad/tight-bends-tb3 (or TB3_SHOTS).
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { cadSteps } from './sketch-cad-steps.mjs';
import { foldSheet, foldedBounds } from '../src/features/sketchstudio/cad/sheetMetal.js';

const directory = process.env.TB3_SHOTS || 'artifacts/sketch-cad/tight-bends-tb3';
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
// Both sizes the spec asks for (§7.6): the 1366 × 768 one taken and put back.
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
const text = async (locator) => (await locator.innerText()).replace(/\s+/g, ' ').trim();

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
// Edge 2 is the right edge, edge 4 the left; L and the angle.
const pick = async ({ panel, map }, L, angle = null, edge = 2) => {
  await map.getByRole('button', { name: `Gauge edge ${edge}`, exact: true }).click();
  if (L != null) await fill(panel, 'Backgauge L (mm)', L);
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
const rowTexts = async (panel) => (await rows(panel).locator('strong').allInnerTexts()).map((t) => t.trim());
const NOTE = "This is bend 1's line: it stands at 45°. This hit bends it on.";

try {
  // 1. Bend 1: right edge, L 29, 45°.
  const first = await blank();
  const { panel, map } = first;
  await pick(first, 29, 45);
  await pedal(panel, 1, 'bend 1 at 45°');
  assert.deepEqual(await rowTexts(panel), ['1 · UP 45° R1.28']);
  checks.push('right edge, L 29, 45° → hit: row "1 · UP 45° R1.28"');

  // 2. Right edge, L 30 typed: seated on bend 1.
  await map.getByRole('button', { name: 'Gauge edge 2', exact: true }).click();
  const L = panel.getByLabel('Backgauge L (mm)', { exact: true });
  await L.fill('30');
  const note = panel.getByRole('note', { name: 'Bend on', exact: true });
  const seatedNote = panel.getByRole('note', { name: 'Seated on the bend', exact: true });
  await expect(note).toHaveText(NOTE);
  await expect(seatedNote).toHaveText(
    "L 30 is 1 mm from bend 1's line. A bent line seats itself in the die, so the line is on bend 1.",
  );
  // Still focused: the field keeps what was typed.
  await expect(L).toHaveValue('30');
  await expect(panel.getByLabel('Bend on to (°)', { exact: true })).toHaveValue('90');
  assert.equal(await panel.locator('.cad-problem').count(), 0, 'no problem card at L 30');
  await expect(panel.getByRole('status', { name: 'Collision check' })).toContainText('Clear through the stroke');
  await shot('01-l30-seated', seatedNote);
  await L.press('Enter');
  await expect(L).toHaveValue('29');
  measured.seatedNote = await text(seatedNote);
  checks.push(
    `right edge, L 30 → no problem card; "${await text(note)}"; "${measured.seatedNote}"; Bend on to 90; after blur L reads 29`,
  );

  // 3. L 34 from the edge itself: the short-leg card with Bend 1 on instead. Since SG-1
  // (docs/sketch-studio-skin-gauge.md §4.4) a typed L past the seat reads off bend 1's flange,
  // so the edge is held (Gauge off: The edge); the card that says the fingers would stop on the
  // flange stands beside it.
  await panel.getByLabel('Gauge off', { exact: true }).selectOption({ label: 'The edge' });
  await fill(panel, 'Backgauge L (mm)', 34);
  await expect(L).toHaveValue('34');
  const instead = panel.getByRole('button', { name: 'Bend 1 on instead', exact: true });
  await expect(instead).toBeVisible();
  const shortCard = panel.locator('.cad-problem', {
    has: page.getByRole('button', { name: 'Bend 1 on instead', exact: true }),
  });
  await expect(shortCard).toContainText('The flange is 4.29 mm from the punch line in the flat');
  measured.shortLeg = await text(shortCard);
  await shot('02-l34-short-leg', shortCard);
  await instead.click();
  await expect(L).toHaveValue('29');
  await expect(note).toHaveText(NOTE);
  await expect(seatedNote).toHaveCount(0);
  checks.push(`Gauge off: The edge, L 34 → card "${measured.shortLeg}"; click → L 29, the note`);

  // 4. Left edge, L 576: seated at 576.4; pedal → two rows; Undo.
  await pick(first, 576, null, 4);
  await expect(L).toHaveValue('576.4');
  await expect(note).toHaveText(NOTE);
  await expect(seatedNote).toHaveText(
    "L 576 is 0.4 mm from bend 1's line. A bent line seats itself in the die, so the line is on bend 1.",
  );
  const readout = await panel.locator('dd[aria-label="Backgauge L"]').textContent();
  assert.equal(readout.trim(), '576.4 mm', `the backgauge readout: ${readout}`);
  await expect(map.locator('.cad-map-reading')).toHaveText('L 576.4');
  await shot('03-left-576-seated', seatedNote);
  await pedal(panel, 2, 'bend 1 on from the left edge');
  assert.deepEqual(await rowTexts(panel), ['1 · UP 45° R1.28', '2 · bend 1 on: 45° → 90°']);
  const onEntry = bendsOf(await saved())[1];
  assert.equal(onEntry.angle, 90);
  assert(onEntry.again, JSON.stringify(onEntry));
  await shot('04-two-rows', rows(panel).nth(1));
  await files.getByRole('button', { name: 'Undo', exact: true }).click();
  await savedWhen((m) => bendsOf(m).length === 1, 'Undo the bend on');
  await expect(rows(panel)).toHaveCount(1);
  await noErrorLine('after step 4');
  checks.push(
    `left edge, L 576 → L 576.4, readout "${readout.trim()}", the note; pedal → rows "1 · UP 45° R1.28", "2 · bend 1 on: 45° → 90°"; Undo → one row`,
  );

  // 5. The fingers from L 20 past the bend, a millimetre at a time.
  await pick(first, 20, null, 2);
  await expect(note).toHaveCount(0);
  await page.evaluate(() => document.activeElement?.blur?.());
  await stationWhen('!s.turning && s.reach.fingersOffered && s.reach.fingers.length === 2 && s.gaugeDistance === 20');
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
  measured.fingers = [];
  measured.fingerPxPerMm = Number(geometry.pxPerMm.toFixed(3));
  // The drag starts past the click's dead zone (4 px): first toward the operator, as far as that
  // takes (a millimetre is under a pixel at this zoom), then back up a millimetre at a time.
  const dead = Math.ceil(6 / geometry.pxPerMm);
  await page.mouse.move(...along(-Math.min(dead, 15)));
  await page.waitForTimeout(200);
  // To L 34, one past the seat: from there the right edge is on the flange bend 1 separates from
  // the line. Since SG-1 (docs/sketch-studio-skin-gauge.md §4.4, §4.5) the fingers stop on that
  // flange's skin: they stand at 34, the chip "L 34 mm · off bend 1 · flange …" (before SG-1 the
  // station had no reading there and the fingers stood nowhere).
  for (let target = 21; target <= 34; target++) {
    await page.mouse.move(...along(target - 20));
    // The chip as the pick settles (the workspace re-renders, the grip's offer comes back).
    await page.waitForTimeout(200);
    // The automatic V8 die seats within 4 mm of the bend: L 25 … 33 (the spec asks 26 … 33).
    const seats = Math.abs(target - 29) <= 4;
    const past = target > 33;
    if (seats) await expect(chip).toHaveText(/^L 29 mm · on bend 1/, { timeout: 5000 });
    else if (past) await expect(chip).toHaveText(new RegExp(`^L ${target} mm · off bend 1`), { timeout: 5000 });
    else await expect(chip).toHaveText(new RegExp(`^L ${target} mm`), { timeout: 5000 });
    // Onto or off the bend the sheet swings (flat ↔ the bend in the die): read the fingers at rest.
    await stationWhen(
      `!s.turning && s.fingerDistance != null && Math.abs(s.fingerDistance - ${seats ? 29 : target}) < 1e-6`,
      5000,
    ).catch(async (error) => {
      const s = await station();
      throw new Error(
        `L ${target}: the fingers never came to rest (${JSON.stringify({ turning: s.turning, fingerDistance: s.fingerDistance, gaugeDistance: s.gaugeDistance, chip: await chip.innerText() })}): ${error.message}`,
      );
    });
    const s = await station();
    const words = (await chip.innerText()).split('\n')[0].trim();
    measured.fingers.push({ L: target, chip: words, fingersAt: s.fingerDistance });
    assert(
      Math.abs(s.fingerDistance - (seats ? 29 : target)) < 1e-6,
      `the fingers for L ${target}: ${s.fingerDistance}`,
    );
    if (target === 31) await shot('05-fingers-31-on-bend-1');
    if (past) await shot('05b-fingers-34-off-bend-1');
  }
  // Back to 31 and let go there.
  await page.mouse.move(...along(11));
  await page.waitForTimeout(200);
  await expect(chip).toHaveText(/^L 29 mm · on bend 1/, { timeout: 5000 });
  await page.mouse.up();
  await expect(note).toHaveText(NOTE);
  await expect(seatedNote).toHaveText(/^L 31 is 2 mm from bend 1's line\./);
  await expect(L).toHaveValue('29');
  await shot('06-fingers-let-go-31', seatedNote);
  checks.push(
    `fingers dragged L 21 → 34: ${measured.fingers.map((f) => `${f.L}: "${f.chip}" @${f.fingersAt}`).join('; ')}; let go at 31 → the note, "${await text(seatedNote)}"`,
  );

  // 6. Two points typed.
  await panel.getByRole('group', { name: 'Punch line' }).getByRole('button', { name: 'Two points' }).click();
  for (const [label, value] of [
    ['A X (mm)', 576.7],
    ['A Y (mm)', 5],
    ['B Y (mm)', 415],
    ['B X (mm)', 576.6],
  ])
    await fill(panel, label, value);
  await expect(note).toHaveText(NOTE);
  await expect(seatedNote).toHaveText(
    "The line you set is 0.3 mm from bend 1's line. A bent line seats itself in the die, so the line is on bend 1.",
  );
  measured.points = await page.evaluate(() =>
    ['A X (mm)', 'A Y (mm)', 'B X (mm)', 'B Y (mm)'].map(
      (label) => document.querySelector(`input[aria-label="${label}"]`).value,
    ),
  );
  assert.deepEqual(measured.points, ['576.4', '0', '576.4', '420.4'], JSON.stringify(measured.points));
  await shot('07-two-points-seated', seatedNote);
  checks.push(
    `two points A (576.7, 5), B (576.6, 415) → the note, "${await text(seatedNote)}"; points ${measured.points}`,
  );

  // 7. The line cleared; bend 1's line clicked on the flat blank.
  await panel.getByRole('group', { name: 'Punch line' }).getByRole('button', { name: 'Backgauge edge' }).click();
  await page.mouse.move(5, 5);
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press('Escape');
  await expect(panel.getByLabel('Gauge edge', { exact: true })).toHaveText(
    'Click a straight outline edge on the flat blank',
  );
  await expect(note).toHaveCount(0);
  const bendButton = map.getByRole('button', { name: "Bend 1's line: bend it on", exact: true });
  await bendButton.click();
  await expect(L).toHaveValue('29');
  await expect(note).toHaveText(NOTE);
  await expect(panel.getByLabel('Gauge edge', { exact: true })).toHaveText('Edge 2 · 420.4 mm');
  await shot('08-flat-blank-bend-click', map);
  checks.push('Esc clears the line; "Bend 1\'s line: bend it on" clicked on the flat blank → Edge 2, L 29, the note');

  // 8. Two points across the bend.
  await panel.getByRole('group', { name: 'Punch line' }).getByRole('button', { name: 'Two points' }).click();
  for (const [label, value] of [
    ['A X (mm)', 0],
    ['A Y (mm)', 200],
    ['B X (mm)', W],
    ['B Y (mm)', 200],
  ])
    await fill(panel, label, value);
  const across = 'This line runs across bend 1, which is already made: the brake cannot bend across a formed bend.';
  const acrossCard = panel.locator('.cad-problem', { hasText: 'runs across bend 1' });
  await expect(acrossCard).toHaveText(across);
  assert.equal(await acrossCard.getByRole('button').count(), 0, 'no button on the across card');
  await expect(panel.getByRole('button', { name: 'Bend', exact: true })).toBeDisabled();
  asked.push(across);
  await shot('09-across-refused', acrossCard);
  await noErrorLine('after step 8');
  checks.push(`two points (0, 200) → (605.4, 200) → "${await text(acrossCard)}", no button, Bend off`);

  // 9. The technique, a second part.
  const second = await blank();
  await pick(second, 29, 30);
  await pedal(second.panel, 1, 'bend 1 at 30°');
  await pick(second, 11, 90);
  await pedal(second.panel, 2, 'the lip at 90°');
  await pick(second, 576, null, 4);
  const L2 = second.panel.getByLabel('Backgauge L (mm)', { exact: true });
  await expect(L2).toHaveValue('576.4');
  await expect(second.panel.getByRole('note', { name: 'Bend on', exact: true })).toHaveText(
    "This is bend 1's line: it stands at 30°. This hit bends it on.",
  );
  await expect(second.panel.getByRole('note', { name: 'Seated on the bend', exact: true })).toHaveText(
    /^L 576 is 0\.4 mm from bend 1's line\./,
  );
  await expect(second.panel.getByLabel('Bend on to (°)', { exact: true })).toHaveValue('90');
  await shot('10-technique-seated', second.panel.getByRole('note', { name: 'Seated on the bend', exact: true }));
  await pedal(second.panel, 3, 'bend 1 on to 90°');
  assert.deepEqual(await rowTexts(second.panel), ['1 · UP 30° R1.28', '2 · UP 90° R1.28', '3 · bend 1 on: 30° → 90°']);
  const folded = await size(second.panel, 'Folded size');
  near(folded, expected, 'the folded size against the lip-first part');
  measured.folded = folded;
  await shot('11-technique-three-rows', rows(second.panel).nth(2));
  checks.push(
    `technique: L 29 at 30°, L 11 at 90°, left edge L 576 → seated, Bend on to 90 → rows ${JSON.stringify(await rowTexts(second.panel))}; folded ${folded.join(' × ')} mm = lip-first ${expected.join(' × ')} mm`,
  );
  await noErrorLine('after step 9');

  // 10.
  if (errors.length) throw new Error(errors.join('\n'));
  checks.push('no page error; .cad-error only for step 8’s refusal');
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ status: 'passed', errors, checks, measured }, null, 2),
  );
  console.log('Tight bends TB-3 verification passed:\n- ' + checks.join('\n- '));
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` });
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}
