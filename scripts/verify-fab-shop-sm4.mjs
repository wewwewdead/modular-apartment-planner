/* global localStorage, process, console, document */
// Fabrication shop SM-4 (docs/sketch-studio-fab-shop.md §9 SM-4): the whole
// route from an empty workspace, through the UI the way a user drives it —
// draw a 120 × 80 outline with a Ø12 hole in the 3D sketcher → Cut from sheet
// → (the sketch panel's button, into the Shop tab's route since
// docs/sketch-studio-shop-floor.md SF-1) 1.5 SPCC → Cut on the laser: watch the
// head (pierce, the hole first, the outline last), then the readouts → Bend:
// the press brake, two hits off the 80 mm edges, L 20
// → Laser again: Etch bend lines → a 160 × 120 plate cut, the channel laid on
// it → Group the two (Shop → More, since docs/sketch-studio-shop-trim.md:
// no Weld station) → Paint the group → Print a text → Job sheet: every step
// done with times → Drawings → Flat pattern sheet: the bend
// labels and the bend table → reload: everything intact → Example: control
// box: it builds, shows its paint and prints, its job sheet is complete.
//   CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-fab-shop-sm4.mjs
// Screenshots: artifacts/sketch-cad/fab-shop-sm4 (or SM4_SHOTS).
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { cadSteps } from './sketch-cad-steps.mjs';

const directory = process.env.SM4_SHOTS || 'artifacts/sketch-cad/fab-shop-sm4';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [],
  checks = [],
  measured = {};
page.on('pageerror', (e) => errors.push(e.message));
const {
  properties,
  current,
  savedWhen,
  saved,
  project,
  setPosition,
  view,
  sketchOnPlane,
  typeHud,
  toolbar,
  status,
  route,
  shopStation,
  shopMore,
  showTree,
} = cadSteps(page);
const ribbon = page.locator('.cad-ribbon');
const viewToolbar = page.locator('.cad-view-toolbar');
const footer = page.locator('.cad-status');
const canvas = page.locator('.cad-viewport canvas');
const shot = (name) => page.screenshot({ path: `${directory}/${name}.png` });
const shop = () => page.evaluate(() => document.querySelector('.cad-viewport').cadShop());
const bodies = () => page.evaluate(() => document.querySelector('.cad-viewport').cadViewMode().bodies);
const modelCurrent = () => expect(footer).toContainText('Model current', { timeout: 60000 });
const fill = async (scope, label, value) => {
  const field = scope.getByLabel(label, { exact: true });
  await field.fill(String(value));
  await field.press('Enter');
};
const fit = async () => {
  await view('isometric');
  await viewToolbar.getByRole('button', { name: 'Fit', exact: true }).click();
  await page.waitForTimeout(300);
};
const click = async (point) => {
  const [x, y] = await project(point);
  await page.mouse.move(x, y, { steps: 3 });
  await page.waitForTimeout(60);
  await page.mouse.click(x, y);
  await page.waitForTimeout(120);
};
const tab = (name) =>
  page.getByRole('navigation', { name: 'Modeling ribbon' }).getByRole('button', { name, exact: true });
const command = async (tabName, name) => {
  await tab(tabName).click();
  await ribbon.getByRole('button', { name, exact: true }).click();
};
const treeItem = (name) => page.locator('.cad-tree .cad-tree-item', { hasText: name }).first();
// A part from the parts tree (on the Shop tab the left pane opens on the job board).
const selectInTree = async (name) => {
  await showTree();
  await treeItem(name).click();
};
// A station's Machine numbers, opened where the script reads one (shop floor §4.6).
const openNumbers = async (scope) => {
  const numbers = scope.locator('details.cad-shop-numbers');
  if (!(await numbers.evaluate((d) => d.open))) await numbers.locator('summary').click();
};
const seconds = (text) => Number(text.match(/([\d.]+) s/)[1]);
// The Properties pane at full length: a tall window for the shot, then back.
const panelShot = async (name) => {
  await page.setViewportSize({ width: 1600, height: 2600 });
  await page.waitForTimeout(250);
  await page.locator('.cad-properties').screenshot({ path: `${directory}/${name}.png` });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.waitForTimeout(250);
};
// The drawing sheet on show, rendered alone at 1600 px wide.
const sheetShot = async (name) => {
  const markup = await page
    .locator('.cad-drawing svg')
    .first()
    .evaluate((el) => el.outerHTML);
  const sheetPage = await browser.newPage({ viewport: { width: 1600, height: 1140 } });
  await sheetPage.setContent(
    `<body style="margin:0;background:#fff">${markup.replace(/ width="[^"]*mm" height="[^"]*mm"/, ' width="1600"')}</body>`,
  );
  await sheetPage.screenshot({ path: `${directory}/${name}.png`, fullPage: true });
  await sheetPage.close();
};

// The shop's numbers for the verify blank (shopCatalog.js §8.5): 1.5 SPCC on
// the 2 kW fiber, 25 + (5.5 − 25) × 0.5 = 15.25 m/min; pierce 0.1 + 0.18 ×
// 0.5 = 0.19 s; a 120 × 80 outline and a Ø12 hole.
const W = 120,
  H = 80,
  hole = 6;
const cutLength = 2 * (W + H) + 2 * Math.PI * hole;
const cutTime = 2 * 0.19 + cutLength / ((15.25 * 1000) / 60);

try {
  await page.goto(process.env.CAD_VERIFY_URL || 'http://localhost:5180/sketch');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '3D Model & workshop', exact: true }).click();
  await current();

  // 0. The Shop ribbon is its route, in process order.
  await tab('Shop').click();
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

  // 1. Draw: a 120 × 80 rectangle from the origin with a Ø12 circle in it, in the 3D sketcher on XY.
  await sketchOnPlane('XY');
  await toolbar.getByRole('button', { name: 'Rectangle', exact: true }).click();
  await typeHud(0, 0);
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 - 90, { steps: 4 });
  await typeHud(W, H);
  await toolbar.getByRole('button', { name: 'Circle', exact: true }).click();
  await typeHud(W / 2, H / 2);
  await typeHud(hole);
  await page.keyboard.press('Escape');
  await expect(status).toContainText('2 items · closed profile');
  await page.waitForTimeout(200);
  await shot('01-sketch-outline-with-hole');
  await toolbar.getByRole('button', { name: 'Finish sketch', exact: true }).click();
  await current();
  let model = await savedWhen((m) => m.sketches.length === 1, 'the sketch');
  const sketch = model.sketches[0];
  assert.equal(sketch.profile.holes?.length, 1, 'The circle is the outline’s hole.');
  checks.push(
    `sketch: ${sketch.profile.type} with ${sketch.profile.holes.length} hole (${sketch.profile.holes[0].type})`,
  );

  // 2. The sketch panel's Cut from sheet → the Shop tab's Cut station on that outline, 1.5 SPCC.
  await properties.getByRole('button', { name: 'Cut from sheet', exact: true }).click();
  const cutPanel = properties.getByRole('region', { name: 'Cut from sheet' });
  await expect(route.getByRole('button', { name: 'Cut', exact: true })).toHaveAttribute('aria-current', 'step');
  await cutPanel.getByLabel('Sheet stock', { exact: true }).selectOption('spcc');
  await fill(cutPanel, 'Custom thickness (mm)', 1.5);
  await expect(cutPanel.getByLabel('Blank size', { exact: true })).toHaveText(
    `Blank 120 × 80 mm · cut length ${Number(cutLength.toFixed(2))} mm · 2 pierces`,
  );
  await shot('02-cut-from-sheet');

  // 3. Cut on the laser: the part is made and the laser opens on it, cutting —
  // watch the head (the hole first, the outline last), then the readouts against §8.5.
  await cutPanel.getByRole('button', { name: 'Cut on the laser', exact: true }).click();
  const laser = properties.getByRole('region', { name: 'Laser station' });
  const bed = page.getByRole('figure', { name: 'Laser bed' });
  await expect(bed).toBeVisible();
  await expect(bed).toHaveAttribute('data-state', 'cutting');
  const hud = bed.getByLabel('Laser head', { exact: true });
  await expect(hud).toContainText('cut-out 1 of 1', { timeout: 4000 });
  const firstContour = await hud.locator('strong').innerText();
  await page.waitForTimeout(1200);
  await shot('04-laser-cutting-hole');
  await expect(hud).toContainText('the outline', { timeout: 8000 });
  await page.waitForTimeout(1200);
  await shot('05-laser-cutting-outline');
  const watchStart = Date.now();
  await expect(bed).toHaveAttribute('data-state', 'cut', { timeout: 20000 });
  measured.laserWatchMsAfterOutline = Date.now() - watchStart;
  const clock = await bed.getByLabel('Laser clock', { exact: true }).innerText();
  const [elapsed, total] = clock.match(/[\d.]+/g).map(Number);
  assert.equal(elapsed, total, `the clock ends on its total: ${clock}`);
  assert(Math.abs(total - cutTime) < 0.01, `machine time ${total} s against ${cutTime.toFixed(3)} s`);
  await page.waitForTimeout(200);
  await shot('06-laser-cut-done');
  checks.push(
    `laser cut (Cut on the laser runs it at once): "${firstContour}" first, then the outline; clock ${clock}`,
  );
  model = await savedWhen((m) => m.parts.length === 1 && m.parts[0].features[0].type === 'sheetmetal', 'the blank');
  const blankPart = model.parts[0];
  assert.equal(blankPart.features[0].sketchId, sketch.id, 'The XY sketch at the origin is the blank itself.');
  checks.push(`Cut from sheet → ${blankPart.name}, ${blankPart.material}, t ${blankPart.features[0].thickness}`);
  await openNumbers(laser);
  await expect(laser.getByLabel('Cut length', { exact: true })).toHaveText(`${Number(cutLength.toFixed(1))} mm`);
  await expect(laser.getByLabel('Pierces', { exact: true })).toHaveText('2 × 0.19 s');
  await expect(laser.getByLabel('Cutting speed', { exact: true })).toHaveText('15.25 m/min');
  await expect(laser.getByLabel('Kerf', { exact: true })).toHaveText('0.1 mm');
  const cutTimeText = await laser.getByLabel('Cut time', { exact: true }).innerText();
  assert(Math.abs(seconds(cutTimeText) - cutTime) < 0.051, `cut time ${cutTimeText} against ${cutTime.toFixed(3)} s`);
  const use = await laser.getByLabel('Sheet use', { exact: true }).innerText();
  await expect(laser.getByRole('status', { name: 'Laser checks' })).toContainText('Ready to cut');
  await expect(footer).toContainText('Laser — 1219 × 2438 mm sheet · Model current');
  await page.waitForTimeout(200);
  await shot('03-laser-ready');
  measured.verifyBlankCutTime = Number(cutTime.toFixed(3));
  const scaleText = await laser.getByText(/^The cut on the bed is/).innerText();
  measured.verifyTimeScale = scaleText;
  checks.push(`laser: cut ${cutLength.toFixed(1)} mm, 2 pierces, ${cutTimeText}, sheet use ${use}; ${scaleText}`);
  await laser.getByRole('button', { name: 'Leave laser', exact: true }).click();
  await expect(bed).toHaveCount(0);

  // 4. Press brake (the route's Bend): the two 80 mm edges on the backgauge, L 20, 90° up.
  await selectInTree('Sheet-metal part');
  await shopStation('Bend');
  const brake = properties.getByRole('region', { name: 'Press brake' });
  const map = page.getByRole('figure', { name: 'Flat blank' });
  const hit = async (index) => {
    // The index-th outline edge 80 mm long.
    const edges = map.getByRole('button', { name: /^Gauge edge \d+$/ });
    let found = 0;
    for (let i = 0; i < (await edges.count()); i++) {
      await edges.nth(i).click();
      if (!(await brake.getByLabel('Gauge edge', { exact: true }).innerText()).endsWith('· 80 mm')) continue;
      if (found++ === index) break;
    }
    await fill(brake, 'Backgauge L (mm)', 20);
    await fill(brake, 'Bend angle (°)', 90);
    await expect(brake.getByRole('status', { name: 'Collision check' })).toContainText('Clear through the stroke');
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
  model = await savedWhen((m) => m.parts[0].features[0].bends.length === 1, 'the first hit');
  await page.waitForTimeout(300);
  await shot('07-brake-first-hit');
  await hit(1);
  model = await savedWhen((m) => m.parts[0].features[0].bends.length === 2, 'the second hit');
  const folded = await brake.getByLabel('Folded size', { exact: true }).innerText();
  await page.waitForTimeout(300);
  await shot('08-brake-second-hit');
  checks.push(
    `press brake: ${model.parts[0].features[0].bends.map((b) => `${b.direction} ${b.angle}° ${b.punch}/${b.die}`).join(', ')}; ${folded}`,
  );
  await brake.getByRole('button', { name: 'Leave press brake', exact: true }).click();
  await current();

  // 5. Laser again: Etch bend lines (the marks go on the blank; the solid rebuilds once, the same).
  const solidBefore = (await bodies())[0].bounds;
  await selectInTree('Sheet-metal part');
  await shopStation('Cut');
  await laser.getByRole('button', { name: 'Etch bend lines', exact: true }).click();
  model = await savedWhen((m) => m.parts[0].features[0].marks?.length === 2, 'the etched marks');
  await expect(laser.getByLabel('Etched marks', { exact: true })).toHaveText('2 etched lines');
  await expect(bed.getByLabel('Etched line')).toHaveCount(2);
  await modelCurrent();
  await page.waitForTimeout(300);
  await shot('09-laser-etched-bend-lines');
  await laser.getByRole('button', { name: 'Leave laser', exact: true }).click();
  await current();
  const solidAfter = (await bodies())[0].bounds;
  assert.deepEqual(solidAfter, solidBefore, 'The etched marks leave the folded solid as it was.');
  checks.push(`etched ${model.parts[0].features[0].marks.length} bend lines; folded solid unchanged`);

  // 6. A second part: a 160 × 120 plate (Draw → Rectangle → Cut on the laser), the channel laid on it (base down, centred).
  await shopStation('Draw');
  const draw = properties.getByRole('region', { name: 'Draw' });
  await draw.getByRole('button', { name: /^Rectangle/ }).click();
  await fill(draw, 'Width W (mm)', 160);
  await fill(draw, 'Height H (mm)', 120);
  await draw.getByRole('button', { name: 'Cut this rectangle', exact: true }).click();
  await cutPanel.getByLabel('Sheet stock', { exact: true }).selectOption('spcc');
  await fill(cutPanel, 'Custom thickness (mm)', 1.5);
  await cutPanel.getByRole('button', { name: 'Cut on the laser', exact: true }).click();
  await expect(bed).toHaveAttribute('data-state', 'cut', { timeout: 20000 });
  await laser.getByRole('button', { name: 'Leave laser', exact: true }).click();
  await current();
  model = await savedWhen((m) => m.instances.length === 2, 'the plate');
  const [channel, plate] = model.instances.map((i) => i.id);
  await fit();
  const bodyOf = async (id) => (await bodies()).find((b) => b.id === id);
  let C = await bodyOf(channel);
  const P = await bodyOf(plate);
  const centre = (b, i) => (b.bounds[0][i] + b.bounds[1][i]) / 2;
  const position = model.instances[0].position;
  await selectInTree('Sheet-metal part');
  await setPosition(
    Math.round((position[0] + centre(P, 0) - centre(C, 0)) * 1000) / 1000,
    Math.round((position[1] + centre(P, 1) - centre(C, 1)) * 1000) / 1000,
    1.5,
  );
  await current();
  await fit();
  C = await bodyOf(channel);
  assert(Math.abs(C.bounds[0][2] - 1.5) < 0.01, 'The channel lies on the plate.');

  // 7. Put together: both parts selected (Ctrl+A), Shop → More → Group.
  const xMid = centre(C, 0);
  await page.mouse.move(5, 500);
  await page.keyboard.press('Control+a');
  await shopMore('Group');
  model = await savedWhen((m) => m.groups?.length === 1 && m.instances.every((i) => i.groupId), 'the group');
  await page.mouse.move(5, 500);
  await page.waitForTimeout(200);
  await shot('10-grouped');
  checks.push(`grouped from Shop → More: "${model.groups[0].name}", ${model.instances.length} parts`);

  // 8. Paint the group (select it, open the booth): RAL 5010 Gentian blue.
  await click([xMid, centre(C, 1), 1.5 + 0.75]);
  await shopStation('Paint');
  const paint = properties.getByRole('region', { name: 'Paint booth' });
  await paint.getByRole('button', { name: 'RAL 5010 Gentian blue', exact: true }).click();
  const area = await paint.getByLabel('Painted area', { exact: true }).innerText();
  const powder = await paint.getByLabel('Powder', { exact: true }).innerText();
  await paint.getByRole('button', { name: 'Paint', exact: true }).click();
  model = await savedWhen((m) => m.finishes?.length === 2, 'the finishes');
  await paint.getByRole('button', { name: 'Leave paint booth', exact: true }).click();
  await fit();
  await shot('11-paint');
  checks.push(`paint: both parts ${model.finishes[0].name}, area ${area}, powder ${powder}`);

  // 9. Print "SM-4" (silk-screen, white) on the plate's top face beside the channel.
  await shopStation('Print');
  const print = properties.getByRole('region', { name: 'Print station' });
  await fill(print, 'Text', 'SM-4');
  await fill(print, 'Width (mm)', 24);
  await fill(print, 'Text height (mm)', 8);
  await print.getByLabel('Ink colour', { exact: true }).fill('#ffffff');
  const freeY = (P.bounds[0][1] + C.bounds[0][1]) / 2;
  await click([centre(P, 0), freeY, 1.5]);
  model = await savedWhen((m) => m.prints?.length === 1, 'the print');
  assert.equal(model.prints[0].instanceId, plate);
  await print.getByRole('button', { name: 'Leave print station', exact: true }).click();
  await page.waitForTimeout(300);
  await shot('12-print');
  checks.push(`print: "${model.prints[0].text}" ${model.prints[0].method} on the plate`);

  // 10. Job sheet: the group's four steps done, with times (shop trim §4.5: Cut, Bend, Paint, Print).
  await shopMore('Job sheet');
  const job = properties.getByRole('region', { name: 'Job sheet' });
  const product = job.getByRole('article', { name: 'Product Group 1' });
  await expect(product.getByLabel('Route status', { exact: true })).toHaveText('All steps done');
  await expect(product.getByLabel('Weld status', { exact: true })).toHaveCount(0);
  await expect(product.getByLabel('Assemble status', { exact: true })).toHaveCount(0);
  const steps = {};
  for (const step of ['Cut', 'Bend', 'Paint', 'Print']) {
    await expect(product.getByLabel(`${step} status`, { exact: true })).toHaveText('Done');
    steps[step] = await product.getByLabel(`${step} time`, { exact: true }).innerText();
    assert.match(steps[step], /^\d+ · est\. /, `${step} has a time`);
  }
  const jobTotal = await product.getByLabel('Group 1 total', { exact: true }).innerText();
  await panelShot('13-job-sheet');
  checks.push(
    `job sheet: ${Object.entries(steps)
      .map(([k, v]) => `${k} ${v}`)
      .join('; ')}; ${jobTotal}`,
  );
  measured.jobSheet = { steps, total: jobTotal };

  // 11. Drawings → Flat pattern sheet for the channel: bend labels and the bend table.
  await selectInTree('Sheet-metal part');
  await command('Drawings', 'Flat pattern sheet');
  model = await savedWhen((m) => m.sheets.some((s) => s.views.length === 1 && s.views[0] === 'flat'), 'the flat sheet');
  const drawing = page.locator('.cad-drawing svg [data-view="flat"]');
  await expect(drawing).toHaveCount(1, { timeout: 60000 });
  const flatSvg = await page.locator('.cad-drawing').innerHTML();
  assert(flatSvg.includes('BEND TABLE — IN THE ORDER MADE'), 'The bend table is on the sheet.');
  assert((flatSvg.match(/· UP 90° R1\.6</g) || []).length === 2, 'Both bends are labelled.');
  assert(flatSvg.includes('Straight 88° / V10 88°'), 'The tooling is in the table.');
  await page.waitForTimeout(300);
  await shot('14-flat-pattern-sheet');
  await sheetShot('14b-flat-pattern-sheet-page');
  checks.push('flat sheet: two "UP 90° R1.6" bend labels, the bend table with Straight 88° / V10 88°');

  // 12. Reload: every record intact.
  await page.waitForTimeout(1200);
  const kept = await saved();
  await page.reload();
  const workshop = page.getByRole('button', { name: '3D Model & workshop', exact: true });
  if (await workshop.isVisible().catch(() => false)) await workshop.click();
  await current();
  const after = await saved();
  for (const key of ['parts', 'finishes', 'prints', 'groups', 'sheets'])
    assert.deepEqual(after[key], kept[key], `${key} survive the reload`);
  await shopMore('Job sheet');
  await expect(
    properties.getByRole('article', { name: 'Product Group 1' }).getByLabel('Route status', { exact: true }),
  ).toHaveText('All steps done');
  await fit();
  await shot('15-after-reload');
  checks.push(
    `reload → ${after.parts[0].features[0].bends.length} bends, ${after.parts[0].features[0].marks.length} marks, ${after.finishes.length} finishes, ${after.prints.length} print, ${after.sheets.length} sheets; job sheet still complete`,
  );

  // 13. Example: control box: it builds, shows its paint and prints, its job sheet is complete.
  const t0 = Date.now();
  await shopMore('Example: control box');
  await current();
  measured.controlBoxLoadToCurrentMs = Date.now() - t0;
  // "Model current" can still be the last model's, and the recovery copy is
  // written shortly after the load: wait until it holds the example.
  model = await savedWhen(
    (m) => m.groups?.some((g) => g.name === 'Control box') && m.instances.some((i) => i.groupId),
    'the control box example',
  );
  const boxIds = model.instances.filter((i) => model.groups.find((g) => g.id === i.groupId)?.name === 'Control box');
  assert.equal(boxIds.length, 2, 'The box and its lid, in one group.');
  await page.waitForFunction(
    () => {
      const s = document.querySelector('.cad-viewport').cadShop();
      return s.records.prints.length === 3 && s.records.prints.every((p) => p.ready);
    },
    null,
    { timeout: 10000 },
  );
  // Nothing selected, so the parts show their own colours.
  const canvasBox = await canvas.boundingBox();
  await page.mouse.click(canvasBox.x + 30, canvasBox.y + canvasBox.height - 40);
  await page.waitForTimeout(300);
  const shown = await bodies();
  const boxBodies = shown.filter((b) => boxIds.some((i) => i.id === b.id));
  assert(
    boxBodies.every((b) => b.color === '#c5c7c4'),
    `RAL 7035 on the box: ${JSON.stringify(boxBodies.map((b) => b.color))}`,
  );
  await shopMore('Job sheet');
  const boxProduct = properties.getByRole('article', { name: 'Product Control box' });
  await expect(boxProduct.getByLabel('Route status', { exact: true })).toHaveText('All steps done');
  // No seam and no assembly step since the shop trim: the box and its lid are one group.
  await expect(boxProduct.getByLabel('Assemble status', { exact: true })).toHaveCount(0);
  const boxTotal = await boxProduct.getByLabel('Control box total', { exact: true }).innerText();
  await panelShot('17-control-box-job-sheet');
  // The box from the isometric view, nothing selected (the first product hidden for the shot).
  await selectInTree('Group 1');
  await command('Assemble', 'Hide / show');
  await current();
  await fit();
  await page.mouse.click(canvasBox.x + 30, canvasBox.y + canvasBox.height - 40);
  await page.mouse.move(5, 500);
  await page.waitForTimeout(500);
  await shot('16-control-box');
  checks.push(
    `control box: built in ${measured.controlBoxLoadToCurrentMs} ms (load → Model current), RAL 7035, 2 prints; job sheet complete, ${boxTotal}`,
  );

  // The box body on the laser (its etched bend lines) and its flat-pattern sheet.
  await selectInTree('Control box body');
  await shopStation('Cut');
  await expect(bed.getByLabel('Etched line')).toHaveCount(4);
  const boxCut = await laser.getByLabel('Cut time', { exact: true }).innerText();
  measured.controlBoxBodyCutTime = boxCut;
  await laser.getByRole('button', { name: 'Cut', exact: true }).click();
  await expect(bed.getByLabel('Laser head', { exact: true })).toContainText('cut-out 3 of 5', { timeout: 6000 });
  await shot('18-control-box-laser');
  await laser.getByRole('button', { name: 'Stop', exact: true }).click();
  await laser.getByRole('button', { name: 'Leave laser', exact: true }).click();
  await selectInTree('Control box lid');
  await shopStation('Cut');
  measured.controlBoxLidCutTime = await laser.getByLabel('Cut time', { exact: true }).innerText();
  await laser.getByRole('button', { name: 'Leave laser', exact: true }).click();
  await selectInTree('Control box body');
  await command('Drawings', 'Flat pattern sheet');
  await expect(page.locator('.cad-drawing svg [data-view="flat"]')).toHaveCount(1, { timeout: 60000 });
  const boxSvg = await page.locator('.cad-drawing').innerHTML();
  assert((boxSvg.match(/· UP 90° R1\.28</g) || []).length === 4, 'The four body bends are labelled.');
  await page.waitForTimeout(300);
  await shot('19-control-box-flat-sheet');
  await sheetShot('19b-control-box-flat-sheet-page');
  checks.push(
    `control box body on the laser: ${boxCut}; lid ${measured.controlBoxLidCutTime}; flat sheet with 4 bend labels`,
  );

  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ status: 'passed', errors, checks, measured }, null, 2),
  );
  console.log('Fab shop SM-4 verification passed:\n- ' + checks.join('\n- '));
  console.log('Measured:', JSON.stringify(measured, null, 2));
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` });
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}
