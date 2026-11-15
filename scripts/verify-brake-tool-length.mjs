/* global localStorage, process, console, document */
// Press brake punch and die length TL-1 (docs/sketch-studio-brake-tool-length.md
// §4), at 1366 × 768: a fresh model → Shop → Draw → Flanged panel 600 × 400,
// flanges 50 on all four edges → Cut the blank — I will bend it → Bend the
// two long edges → the third line: the Length field under the punch reads
// 391.8 fitted (the row measured with and without a note) → type 400: the
// collision card, the 3D punch run past the standing sides (screenshot) →
// the card's Fit the punch to the bend → type 380: the note (5.9 mm short at
// each end), the punch drawn shorter than the die (screenshot) → Bend → the
// sequence names the 380 mm punch → reload: still there. Then a fresh 200 mm
// tray: hit 3 meets the ram, the card with its facts (screenshot). No page
// errors.
//   CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-brake-tool-length.mjs
// Screenshots: artifacts/sketch-cad/brake-tool-length (or TL1_SHOTS).
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { cadSteps } from './sketch-cad-steps.mjs';

const URL = process.env.CAD_VERIFY_URL || 'http://localhost:5180/sketch';
const directory = process.env.TL1_SHOTS || 'artifacts/sketch-cad/brake-tool-length';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [],
  checks = [],
  measured = {};
page.on('pageerror', (e) => errors.push(e.message));
const { properties, current, savedWhen, shopStation } = cadSteps(page);
const footer = page.locator('.cad-status');
const bed = page.getByRole('figure', { name: 'Laser bed' });
const shot = (name) => page.screenshot({ path: `${directory}/${name}.png` });
const shop = () => page.evaluate(() => document.querySelector('.cad-viewport').cadShop());
const fill = async (scope, label, value) => {
  const field = scope.getByLabel(label, { exact: true });
  await field.fill(String(value));
  await field.press('Enter');
};
const round1 = (runs) => (runs || []).map((r) => r.map((v) => Math.round(v * 10) / 10));
// Where the Blades row and what follows it sit, in CSS px (no layout shift when a note appears).
const bladesLayout = () =>
  page.evaluate(() => {
    const region = document.querySelector('.cad-properties [aria-label="Press brake"]');
    const blades = region.querySelector('[aria-label="Blades"]');
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return {
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        left: Math.round(r.left),
        right: Math.round(r.right),
      };
    };
    const pane = document.querySelector('.cad-properties').getBoundingClientRect();
    const lengths = [...blades.querySelectorAll('.cad-blade-length')];
    return {
      blades: box(blades),
      tooling: box(region.querySelector('details.cad-shop-tooling')),
      lengths: lengths.map(box),
      // Nothing of the length lines past the pane's right edge.
      overflow: [...blades.querySelectorAll('.cad-blade-length, .cad-blade-length *')].some(
        (el) => el.getBoundingClientRect().right > pane.right + 0.5,
      ),
    };
  });

// A fresh model → Shop → Draw → Flanged panel 600 × 400, flanges `depth` on all four edges → cut → Bend.
const panelTray = async (depth) => {
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '3D Model & workshop', exact: true }).click();
  await current();
  await page.getByRole('button', { name: 'Shop', exact: true }).click();
  const draw = properties.getByRole('region', { name: 'Draw' });
  await draw.getByRole('button', { name: /^Flanged panel/ }).click();
  const form = draw.getByRole('group', { name: 'Flanged panel' });
  const preview = page.getByRole('figure', { name: 'Panel preview' });
  await expect(preview).toBeVisible();
  await fill(form, 'Width W (mm)', 600);
  await fill(form, 'Height H (mm)', 400);
  await fill(form, 'Flange depth (mm)', depth);
  for (let i = 1; i <= 4; i++) await preview.getByRole('button', { name: `Edge ${i}`, exact: true }).click();
  await expect(preview.getByRole('button', { name: new RegExp(`^Edge \\d: flange ${depth} mm up$`) })).toHaveCount(4);
  await draw.getByRole('button', { name: 'Cut the blank — I will bend it', exact: true }).click();
  await expect(bed).toHaveAttribute('data-state', 'cut', { timeout: 30000 });
  await savedWhen((m) => m.parts.length === 1 && m.parts[0].features[0].marks?.length === 4, 'the panel');
  await expect(footer).toContainText('Model current', { timeout: 60000 });
  await shopStation('Bend');
  const brake = properties.getByRole('region', { name: 'Press brake' });
  const map = page.getByRole('figure', { name: 'Flat blank' });
  await expect(map.getByRole('button', { name: /^Etched line \d/ })).toHaveCount(4);
  return { brake, map };
};
const strokeDone = async (count) => {
  await page.waitForFunction(
    () => document.querySelector('.cad-viewport').cadShop().station?.stroking === false,
    null,
    {
      timeout: 15000,
    },
  );
  const model = await savedWhen((m) => m.parts[0].features[0].bends.length === count, `${count} bends`);
  await page.waitForTimeout(200);
  return model;
};
// The two long edges (etched lines 1, 2), one click and the pedal each.
const longEdges = async ({ brake, map }) => {
  for (let k = 1; k <= 2; k++) {
    await map.getByRole('button', { name: new RegExp(`^Etched line ${k}`) }).click();
    await expect(brake.getByRole('status', { name: 'Collision check' })).toContainText('Clear through the stroke');
    await brake.getByRole('button', { name: 'Bend', exact: true }).click();
    await strokeDone(k);
  }
};
const typeLength = async (brake, label, value) => {
  const field = brake.getByRole('spinbutton', { name: label, exact: true });
  await field.fill(String(value));
  await field.press('Enter');
};

try {
  // 1. The 50 mm tray, its two long edges made, the third line picked.
  const tray = await panelTray(50);
  const { brake, map } = tray;
  await longEdges(tray);
  await map.getByRole('button', { name: /^Etched line 3/ }).click();
  await expect(brake.getByRole('status', { name: 'Collision check' })).toContainText('Clear through the stroke');
  const punchLength = brake.getByRole('spinbutton', { name: 'Punch length', exact: true });
  await expect(punchLength).toHaveValue('391.8');
  await expect(brake.getByLabel('Punch length note', { exact: true })).toHaveText('fitted');
  await expect(brake.getByRole('spinbutton', { name: 'Die length', exact: true })).toHaveValue('391.8');
  let state = await shop();
  assert.deepEqual(round1(state.station.ranges), [[-195.9, 195.9]], JSON.stringify(state.station.ranges));
  assert.deepEqual(round1(state.station.dieRanges), [[-195.9, 195.9]]);
  await brake.getByRole('group', { name: 'Blades' }).evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(300);
  measured.fitted = await bladesLayout();
  assert(!measured.fitted.overflow, `the length lines fit the pane: ${JSON.stringify(measured.fitted)}`);
  await shot('01-third-line-fitted');
  checks.push(
    `hit 3 of the 50 mm tray: Punch length 391.8 · fitted, Die length 391.8; station runs ${JSON.stringify(round1(state.station.ranges))}`,
  );

  // 2. 400 mm: the punch runs past the standing sides (398.5 apart) and meets them coming down.
  await typeLength(brake, 'Punch length', 400);
  const collision = brake.getByRole('alert', { name: 'Collision' });
  await expect(collision).toContainText('as the ram comes down');
  await expect(brake.getByLabel('Punch length note', { exact: true })).toHaveText('4.1 mm past each end');
  const card = brake.locator('.cad-problem').filter({ has: page.getByRole('alert', { name: 'Collision' }) });
  const fitFix = card.getByRole('button', { name: 'Fit the punch to the bend', exact: true });
  await expect(fitFix).toBeVisible({ timeout: 5000 });
  await expect(collision).toContainText('or fit the punch to the bend');
  measured.longCard = await collision.innerText();
  await stationWhen(page, "s.collision && (s.collision.tool === 'punch' || s.collision.tool === 'holder')");
  state = await shop();
  assert.deepEqual(round1(state.station.ranges), [[-200, 200]], JSON.stringify(state.station.ranges));
  assert.deepEqual(round1(state.station.dieRanges), [[-195.9, 195.9]]);
  measured.longCollision = state.station.collision;
  await collision.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(400);
  await shot('02-punch-400-collision');
  await page.locator('.cad-viewport').screenshot({ path: `${directory}/03-punch-400-3d.png` });
  checks.push(
    `400 mm: "${measured.longCard.replace(/\s+/g, ' ')}"; scene punch ${JSON.stringify(round1(state.station.ranges))}, die ${JSON.stringify(round1(state.station.dieRanges))}, collision ${JSON.stringify(measured.longCollision)}`,
  );

  // 3. The card's Fit the punch to the bend, then 380 mm: the note, the punch drawn shorter than the die.
  await fitFix.click();
  await expect(collision).toHaveCount(0);
  await expect(punchLength).toHaveValue('391.8');
  await typeLength(brake, 'Punch length', 380);
  await expect(brake.getByLabel('Punch length note', { exact: true })).toHaveText('5.9 mm short at each end');
  await expect(brake.getByRole('note').filter({ hasText: 'The punch stops 5.9 mm short of each end' })).toHaveCount(1);
  await expect(brake.getByRole('status', { name: 'Collision check' })).toContainText('Clear through the stroke');
  state = await shop();
  assert.deepEqual(round1(state.station.ranges), [[-190, 190]], JSON.stringify(state.station.ranges));
  assert.deepEqual(round1(state.station.dieRanges), [[-195.9, 195.9]]);
  await brake.getByRole('group', { name: 'Blades' }).evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(300);
  measured.custom = await bladesLayout();
  // The row does not move when the note and Fit to bend appear: the same
  // height, each length line at the same place within it, the same gap to
  // Machine and tooling below.
  const shape = (at) => ({
    height: at.blades.bottom - at.blades.top,
    lengths: at.lengths.map((b) => [b.top - at.blades.top, b.bottom - b.top, b.left, b.right]),
    below: at.tooling.top - at.blades.bottom,
  });
  assert.deepEqual(
    shape(measured.custom),
    shape(measured.fitted),
    `no layout shift: ${JSON.stringify({ fitted: measured.fitted, custom: measured.custom })}`,
  );
  await shot('04-punch-380-note');
  await page.locator('.cad-viewport').screenshot({ path: `${directory}/05-punch-380-3d.png` });
  checks.push(
    `380 mm: note "5.9 mm short at each end", the ends-not-pressed card, clear; scene punch ${JSON.stringify(round1(state.station.ranges))} under die ${JSON.stringify(round1(state.station.dieRanges))}; Blades row ${measured.custom.blades.bottom - measured.custom.blades.top} px tall with and without the note`,
  );

  // 4. Bend: the record keeps the trim, the sequence names the 380 mm punch.
  await brake.getByRole('button', { name: 'Bend', exact: true }).click();
  let model = await strokeDone(3);
  const third = model.parts[0].features[0].bends[2];
  assert.equal(third.punchTrim, 5.9, JSON.stringify(third));
  assert.equal('dieTrim' in third, false);
  const step3 = brake.getByRole('list', { name: 'Sequence' }).getByRole('listitem', { name: 'Step 3' });
  await expect(step3).toContainText('Straight 88° punch, 380 mm');
  await expect(step3.locator('.cad-brake-check')).toHaveText('ok');
  await step3.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(300);
  await shot('06-sequence-380');
  checks.push(
    `Bend → bend 3 saved with punchTrim 5.9; Step 3 "${(await step3.locator('small').innerText()).trim()}", ok`,
  );

  // 5. Reload: the length is still on the hit made.
  await page.reload();
  // The workshop reopens where it was left (the entry button only on the 2D side).
  const entry = page.getByRole('button', { name: '3D Model & workshop', exact: true });
  if (await entry.isVisible().catch(() => false)) await entry.click();
  await current();
  model = await savedWhen((m) => m.parts[0]?.features[0]?.bends?.length === 3, 'after reload');
  assert.equal(model.parts[0].features[0].bends[2].punchTrim, 5.9);
  await page.getByRole('button', { name: 'Shop', exact: true }).click();
  await shopStation('Bend');
  const again = properties.getByRole('region', { name: 'Press brake' });
  await expect(again.getByRole('list', { name: 'Sequence' }).getByRole('listitem', { name: 'Step 3' })).toContainText(
    'Straight 88° punch, 380 mm',
  );
  checks.push('reload: bend 3 keeps punchTrim 5.9, Step 3 still names the 380 mm punch');

  // 6. The 200 mm tray: hit 3 meets the ram; the card says the facts and only what was tried.
  const deep = await panelTray(200);
  await longEdges(deep);
  await deep.map.getByRole('button', { name: /^Etched line 3/ }).click();
  const ram = deep.brake.getByRole('alert', { name: 'Collision' });
  await expect(ram).toContainText('the part hits the ram');
  await expect(ram).toContainText('No punch in the list holds the ram high enough', { timeout: 10000 });
  measured.ramCard = await ram.innerText();
  // Tight bends TB-2 (docs/sketch-studio-tight-bends.md §5.2): no order and no part-way bend clears it
  // either, and nothing else is offered, so the card ends with try 3's words.
  assert.match(
    measured.ramCard.replace(/\s+/g, ' '),
    /^Bend 3: the part hits the ram as the ram comes down\. This punch and its holder stand the ram 166\.5 mm above the tip\. No punch in the list holds the ram high enough \(the tallest gives 245 mm\): this bend needs about \d+ mm\. Turning the sheet around was tried: it does not clear\. No order and no part-way bend clears it with this punch either: the shape cannot be closed with the tools in this rack\. Make the web wider or the flange shorter, or use tooling this rack does not hold\.$/,
  );
  await expect(
    deep.brake.getByRole('button', { name: /^Make this hit before|first, finish it after this hit$/ }),
  ).toHaveCount(0);
  await expect(deep.brake.getByRole('button', { name: /^(Use the|Shorten the|Fit the punch)/ })).toHaveCount(0);
  await ram.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(400);
  await shot('07-ram-200');
  checks.push(`200 mm tray, hit 3: "${measured.ramCard.replace(/\s+/g, ' ')}"; no fix button`);

  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ status: 'passed', errors, checks, measured }, null, 2),
  );
  console.log('Brake tool length TL-1 verification passed:\n- ' + checks.join('\n- '));
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` });
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}

// Wait (every frame) until the station's state passes `test`, a string of JS over `s` (cadShop().station).
function stationWhen(target, test, timeout = 20000) {
  return target.waitForFunction(
    (body) => {
      const s = document.querySelector('.cad-viewport')?.cadShop?.().station;
      return Boolean(s) && new Function('s', `return ${body};`)(s);
    },
    test,
    { polling: 'raf', timeout },
  );
}
