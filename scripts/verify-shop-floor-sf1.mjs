/* global localStorage, process, console, document */
// Shop floor SF-1 (docs/sketch-studio-shop-floor.md §4.8): the Shop tab as a
// guided route, driven the way a newcomer would — an empty workspace → Shop:
// Draw opens by itself → Rectangle 120 × 80 → Cut on the laser (the head runs,
// the part appears on the job board) → Next → Bend: two hits → Next → Paint
// (the part is the target; no Weld station since docs/sketch-studio-shop-
// trim.md) → Print (a text on its face) →
// the route marks every step; Example: control box → Bend with the group
// selected asks which part (no error line); an empty model → Bend says what is
// missing (Go to Draw, in one hop since the SF-1 audit) → Draw the outline in the sketcher, back in
// Draw with it chosen → Cut on the laser. No page errors, no .cad-error.
//   CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-shop-floor-sf1.mjs
// Screenshots: artifacts/sketch-cad/shop-floor-sf1 (or SF1_SHOTS), each station
// at 1600 × 1000 and at 1366 × 768.
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { cadSteps } from './sketch-cad-steps.mjs';

const directory = process.env.SF1_SHOTS || 'artifacts/sketch-cad/shop-floor-sf1';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [],
  checks = [],
  measured = {};
page.on('pageerror', (e) => errors.push(e.message));
const { properties, savedWhen, project, typeHud, toolbar, status, route, shopStation, shopMore } = cadSteps(page);
const footer = page.locator('.cad-status');
const canvas = page.locator('.cad-viewport canvas');
const board = page.getByRole('region', { name: 'Job board' });
const bed = page.getByRole('figure', { name: 'Laser bed' });
const modelCurrent = () => expect(footer).toContainText('Model current', { timeout: 60000 });
const station = (name) => route.getByRole('button', { name, exact: true });
const fill = async (scope, label, value) => {
  const field = scope.getByLabel(label, { exact: true });
  await field.fill(String(value));
  await field.press('Enter');
};
// Never an error line from the route (§4.3).
const noErrorLine = async (where) =>
  assert.equal(await page.locator('.cad-error').count(), 0, `no error line ${where}`);
// The shot at 1600 × 1000, then the same state at 1366 × 768.
const shots = async (name) => {
  await page.mouse.move(5, 600);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${directory}/${name}-1600.png` });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${directory}/${name}-1366.png` });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.waitForTimeout(350);
};
const open = async () => {
  await page.goto(process.env.CAD_VERIFY_URL || 'http://localhost:5180/sketch');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '3D Model & workshop', exact: true }).click();
  await modelCurrent();
};
// Where the route says the product stands, station by station.
const marks = async () => {
  const result = {};
  for (const name of ['Draw', 'Cut', 'Bend', 'Paint', 'Print'])
    result[name] = await station(name).getAttribute('aria-description');
  return result;
};

try {
  // 1. An empty workspace → Shop: the route, and Draw opens by itself.
  await open();
  await page.getByRole('button', { name: 'Shop', exact: true }).click();
  await expect(route.getByRole('button')).toHaveText([
    /^1.*Draw/,
    /^2.*Cut/,
    /^3.*Bend/,
    /^4.*Paint/,
    /^5.*Print/,
    // SF-5: Replay, at the end of the route.
    /^Replay$/,
    /More/,
  ]);
  const draw = properties.getByRole('region', { name: 'Draw' });
  await expect(draw).toBeVisible();
  await expect(station('Draw')).toHaveAttribute('aria-current', 'step');
  await expect(board).toContainText('No parts yet');
  await shots('01-draw');
  checks.push(`empty workspace → Shop: route ${JSON.stringify(await marks())}, Draw open by itself`);

  // 2. Rectangle 120 × 80 → Cut: the outline, the stock, the blank → Cut on the laser.
  await draw.getByRole('button', { name: /^Rectangle/ }).click();
  await fill(draw, 'Width W (mm)', 120);
  await fill(draw, 'Height H (mm)', 80);
  await draw.getByRole('button', { name: 'Cut this rectangle', exact: true }).click();
  const cut = properties.getByRole('region', { name: 'Cut from sheet' });
  await expect(cut.getByLabel('Outline', { exact: true })).toContainText('Rectangle 120 × 80 mm');
  await expect(cut.getByLabel('Blank size', { exact: true })).toHaveText(
    'Blank 120 × 80 mm · cut length 400 mm · 1 pierce',
  );
  await expect(station('Cut')).toHaveAttribute('aria-current', 'step');
  await shots('02-cut');
  const t0 = Date.now();
  await cut.getByRole('button', { name: 'Cut on the laser', exact: true }).click();
  // One click: the laser opens on the new part with the head already running.
  await expect(bed).toHaveAttribute('data-state', 'cutting', { timeout: 5000 });
  measured.cutClickToCuttingMs = Date.now() - t0;
  const hud = bed.getByLabel('Laser head', { exact: true });
  await expect(hud).toContainText('Cutting the outline', { timeout: 4000 });
  await page.waitForTimeout(1200);
  await shots('03-laser-cutting');
  await expect(bed).toHaveAttribute('data-state', 'cut', { timeout: 20000 });
  measured.cutClickToCutDoneMs = Date.now() - t0;
  const laser = properties.getByRole('region', { name: 'Laser station' });
  await expect(laser.getByText(/^Cut 1 blank on the 1219 × 2438 mm sheet/)).toBeVisible();
  let model = await savedWhen((m) => m.parts.length === 1 && m.parts[0].features[0].type === 'sheetmetal', 'the part');
  const partId = model.instances[0].id;
  // The part is on the job board, its next step Bend; the route marks Draw and Cut done, Bend next.
  const row = board.getByRole('button', { name: /^Sheet-metal part/ });
  await expect(row).toContainText('t 1.5 SPCC · 120 × 80');
  await expect(row).toContainText('Next: Bend');
  await expect(station('Cut')).toHaveAttribute('aria-description', '1 blank');
  await expect(station('Bend')).toHaveAttribute('aria-description', 'flat · next step');
  await modelCurrent();
  await shots('04-laser-cut');
  await noErrorLine('after the cut');
  checks.push(
    `Cut on the laser → cutting in ${measured.cutClickToCuttingMs} ms, cut done in ${measured.cutClickToCutDoneMs} ms; job board: "${(await row.innerText()).replace(/\s+/g, ' ')}"`,
  );

  // 3. Next → Bend: two hits off the 80 mm edges, L 20, on the same part.
  await laser.getByRole('button', { name: 'Next: Bend', exact: true }).click();
  const brake = properties.getByRole('region', { name: 'Press brake' });
  await expect(brake.getByLabel('On the brake', { exact: true })).toContainText('blank 120 × 80 mm');
  await expect(station('Bend')).toHaveAttribute('aria-current', 'step');
  const map = page.getByRole('figure', { name: 'Flat blank' });
  const hit = async (index) => {
    const edges = map.getByRole('button', { name: /^Gauge edge \d+$/ });
    let found = 0;
    for (let i = 0; i < (await edges.count()); i++) {
      await edges.nth(i).click();
      if (!(await brake.getByLabel('Gauge edge', { exact: true }).innerText()).endsWith('· 80 mm')) continue;
      if (found++ === index) break;
    }
    await fill(brake, 'Backgauge L (mm)', 20);
    await expect(brake.getByRole('status', { name: 'Collision check' })).toContainText('Clear through the stroke');
    // What the hit makes is on show; the machine's numbers one click away.
    measured[`hit${index + 1}Flange`] = await brake.getByLabel('Flange', { exact: true }).innerText();
    if (index === 1) {
      await brake.locator('details.cad-shop-numbers > summary').click();
      await expect(brake.getByLabel('Inside radius', { exact: true })).toHaveText('R1.6 mm');
      await shots('06-bend-second-hit-set');
    }
    await brake.getByRole('button', { name: 'Bend', exact: true }).click();
    await page.waitForFunction(
      () => document.querySelector('.cad-viewport').cadShop().station?.stroking === false,
      null,
      {
        timeout: 8000,
      },
    );
  };
  await hit(0);
  await savedWhen((m) => m.parts[0].features[0].bends.length === 1, 'the first hit');
  await page.waitForTimeout(300);
  await shots('05-bend-first-hit');
  await hit(1);
  model = await savedWhen((m) => m.parts[0].features[0].bends.length === 2, 'the second hit');
  await expect(station('Bend')).toHaveAttribute('aria-description', '2 hits');
  // Between hits the folded size stays on show.
  const folded = await brake.getByLabel('Folded', { exact: true }).innerText();
  await page.waitForTimeout(300);
  await shots('06-bend-second-hit');
  checks.push(
    `Bend: 2 hits (${model.parts[0].features[0].bends.map((b) => `${b.direction} ${b.angle}°`).join(', ')}), flanges on show ${measured.hit1Flange} / ${measured.hit2Flange}, folded ${folded}`,
  );

  // 4. Next → Paint the part (Bend's Next is Paint), Next → Print on it.
  await brake.getByRole('button', { name: 'Next: Paint', exact: true }).click();
  const paint = properties.getByRole('region', { name: 'Paint booth' });
  await expect(station('Paint')).toHaveAttribute('aria-current', 'step');
  await expect(footer).toContainText('Paint booth');
  await expect(paint.getByLabel('Painting', { exact: true })).toHaveText('Sheet-metal part');
  await paint.getByRole('button', { name: 'RAL 5010 Gentian blue', exact: true }).click();
  await expect(paint.getByLabel('Powder', { exact: true })).toContainText(' g');
  await shots('08-paint');
  await paint.getByRole('button', { name: 'Paint', exact: true }).click();
  model = await savedWhen((m) => m.finishes?.length === 1, 'the finish');
  assert.equal(model.finishes[0].instanceId, partId);
  await expect(station('Paint')).toHaveAttribute('aria-description', 'RAL 5010');
  await paint.getByRole('button', { name: 'Next: Print', exact: true }).click();
  const print = properties.getByRole('region', { name: 'Print station' });
  // While the print station picks in the view, the job board only shows.
  await expect(row).toHaveAttribute('aria-disabled', 'true');
  await shots('07-print-station');
  await fill(print, 'Text', 'SF-1');
  await fill(print, 'Width (mm)', 30);
  await fill(print, 'Text height (mm)', 10);
  // The part's base, seen from above: its middle.
  const body = (await page.evaluate(() => document.querySelector('.cad-viewport').cadViewMode().bodies))[0];
  const [x, y] = await project([
    (body.bounds[0][0] + body.bounds[1][0]) / 2,
    (body.bounds[0][1] + body.bounds[1][1]) / 2,
    body.bounds[0][2] + 1.5,
  ]);
  await page.mouse.move(x, y, { steps: 3 });
  await page.waitForTimeout(80);
  await page.mouse.click(x, y);
  model = await savedWhen((m) => m.prints?.length === 1, 'the print');
  await expect(station('Print')).toHaveAttribute('aria-description', '1 print');
  await shots('09-print');
  await print.getByRole('button', { name: 'Leave print station', exact: true }).click();
  const route1 = await marks();
  assert.deepEqual(route1, {
    Draw: '1 outline',
    Cut: '1 blank',
    Bend: '2 hits',
    Paint: 'RAL 5010',
    Print: '1 print',
  });
  await expect(row).toContainText('Route done');
  await shots('10-route-marked');
  await noErrorLine('along the route');
  checks.push(`Bend → Next: Paint, painted RAL 5010, printed "SF-1": route ${JSON.stringify(route1)}`);

  // 5. More → Job sheet agrees with the route.
  await shopMore('Job sheet');
  const product = properties.getByRole('article', { name: 'Product Sheet-metal part' });
  for (const [step, state] of [
    ['Cut', 'Done'],
    ['Bend', 'Done'],
    ['Paint', 'Done'],
    ['Print', 'Done'],
  ])
    await expect(product.getByLabel(`${step} status`, { exact: true })).toHaveText(state);
  await expect(product.getByLabel('Weld status', { exact: true })).toHaveCount(0);
  checks.push('job sheet: Cut, Bend, Paint, Print done (no Weld, no Assemble) — as the route marks them');

  // 6. Example: control box → Bend with the group selected: which part? (no error line)
  await shopMore('Example: control box');
  await modelCurrent();
  await shopStation('Bend');
  const gate = properties.getByRole('region', { name: 'Press brake' });
  const parts = gate.getByRole('list', { name: 'Choose a part' });
  await expect(parts.getByRole('button')).toHaveText([/^Control box body.*4 bends/, /^Control box lid.*2 bends/]);
  await noErrorLine('with the group selected');
  await shots('11-bend-which-part');
  await parts.getByRole('button', { name: /^Control box body/ }).click();
  // The box is bent and painted: since SF-5 the brake says the body is
  // finished here (no refusal), with the hits made and the one-click remedy kept.
  await expect(gate.getByRole('status', { name: 'Finished here' })).toContainText(
    'Bending is done on this part: 4 hits made.',
  );
  assert.equal(await gate.getByRole('alert').count(), 0, 'the finished body is not refused');
  await expect(gate.getByRole('button', { name: /^Remove .* and bend$/ })).toBeVisible();
  await shots('12-bend-shop-order');
  checks.push(
    'control box: Bend with the group selected lists body (4 bends) and lid (2 bends); the body opens on its finished-here card',
  );

  // 7. An empty model → Bend: what is missing, and the button that makes it.
  await open();
  await shopStation('Bend');
  const blocked = properties.getByRole('region', { name: 'Press brake' });
  await expect(blocked.getByRole('status')).toHaveText('Nothing to bend yet: draw the outline first.');
  await noErrorLine('on an empty model');
  await shots('13-bend-blocked');
  // In one hop to the station that fixes it (SF-1 audit): Draw, not Cut → Draw.
  await blocked.getByRole('button', { name: 'Go to Draw', exact: true }).click();
  await expect(properties.getByRole('region', { name: 'Draw' })).toBeVisible();
  await shopStation('Cut');
  const cutGate = properties.getByRole('region', { name: 'Laser station' });
  await expect(cutGate.getByRole('status')).toHaveText('Nothing to cut yet: draw the outline first.');
  await cutGate.getByRole('button', { name: 'Go to Draw', exact: true }).click();
  checks.push(
    'empty model: Bend → "Nothing to bend yet: draw the outline first." → Go to Draw in one hop; Cut → "Nothing to cut yet" → Go to Draw',
  );

  // 8. Draw the outline: the sketcher on XY; finishing it comes back to Draw with it chosen → Cut on the laser.
  await properties
    .getByRole('region', { name: 'Draw' })
    .getByRole('button', { name: /^Draw the outline/ })
    .click();
  await toolbar.waitFor();
  await toolbar.getByRole('button', { name: 'Rectangle', exact: true }).click();
  await typeHud(0, 0);
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 - 90, { steps: 4 });
  await typeHud(90, 50);
  await expect(status).toContainText('1 item · closed profile');
  await toolbar.getByRole('button', { name: 'Finish sketch', exact: true }).click();
  const back = properties.getByRole('region', { name: 'Draw' });
  const ready = back.getByRole('list', { name: 'Outlines ready to cut' });
  await expect(ready.getByRole('listitem')).toHaveClass('is-chosen');
  await expect(ready).toContainText('90 × 50 mm');
  await expect(station('Draw')).toHaveAttribute('aria-description', '1 outline');
  await shots('14-draw-outline-ready');
  await ready.getByRole('button', { name: /^Cut / }).click();
  await properties
    .getByRole('region', { name: 'Cut from sheet' })
    .getByRole('button', { name: 'Cut on the laser', exact: true })
    .click();
  await expect(bed).toHaveAttribute('data-state', 'cutting', { timeout: 5000 });
  model = await savedWhen((m) => m.parts.length === 1, 'the drawn blank');
  assert.equal(model.parts[0].features[0].sketchId, model.sketches[0].id, 'The drawn XY sketch is the blank itself.');
  await expect(bed).toHaveAttribute('data-state', 'cut', { timeout: 20000 });
  await noErrorLine('after drawing an outline');
  checks.push(
    'Draw the outline → sketcher → back in Draw, the outline chosen (90 × 50 mm) → Cut on the laser: the sketch is the blank',
  );

  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ status: 'passed', errors, checks, measured }, null, 2),
  );
  console.log('Shop floor SF-1 verification passed:\n- ' + checks.join('\n- '));
  console.log('Measured:', JSON.stringify(measured, null, 2));
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` });
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}
