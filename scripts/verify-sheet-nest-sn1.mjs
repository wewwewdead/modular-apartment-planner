/* global localStorage, process, console, document, performance, requestAnimationFrame, window */
// Sheet nest and batch cut SN-1 (docs/sketch-studio-outline-edit-sheet-nest.md
// §4.7), driven the way a user would on the Shop tab.
//
// Part A, one part at a time on an empty workspace (§4.7 steps 1–6): a 300 ×
// 200 rectangle × 3 from Cut from sheet → the bed on Whole sheet with 3 blanks,
// 1 part and 3 instances → Quantity 5 (no overlaps in the view), 2, Undo → 5 →
// one copy painted, Quantity 1 keeps it and says so → a 500 × 400 of the same
// stock lands beside the earlier blanks ("Blank of …", On this sheet, Sheet use
// by hand) → the same in 2.0 mm on its own sheet → enough copies for two
// sheets: the Sheet switch, sheet 2, "2 sheets", the notice for the rest.
//
// Part B, the batch on an empty workspace (§4.7 steps 10, 9, 7, 8): two
// outlines in one sketch → the route's Cut opens Cut from sheet on both →
// a third outline → Cut all 3 outlines → Quantity, a row unticked (Leave out
// until docs/sketch-studio-cut-pick.md), Back to Draw,
// Cut all again → Cut on the laser: one commit, the cut through all four
// blanks, This cut, the job board, no overlaps → a This cut row moves the lead
// → Next: Bend opens the brake on the lead → two bends → Undo / Redo of the
// batch → Group → Replay: the earlier scenes' blanks lie cut on the bed →
// timing: commit → Model current for +9 copies of the two-bend part, the bed
// with 50 blanks opened and the frames during their cut.
//   CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-sheet-nest-sn1.mjs
// Screenshots: artifacts/sketch-cad/sheet-nest-sn1 (or SN1_SHOTS), each state
// at 1600 × 1000 and at 1366 × 768.
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { cadSteps } from './sketch-cad-steps.mjs';

const directory = process.env.SN1_SHOTS || 'artifacts/sketch-cad/sheet-nest-sn1';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [],
  checks = [],
  measured = {};
page.on('pageerror', (e) => errors.push(e.message));
const { properties, savedWhen, typeHud, toolbar, status, route, shopStation, shopMore } = cadSteps(page);
const footer = page.locator('.cad-status');
const bed = page.getByRole('figure', { name: 'Laser bed' });
const draw = properties.getByRole('region', { name: 'Draw' });
const cutPanel = properties.getByRole('region', { name: 'Cut from sheet' });
const laser = properties.getByRole('region', { name: 'Laser station' });
const readyList = draw.getByRole('list', { name: 'Outlines ready to cut' });
const jobBoard = page.getByRole('region', { name: 'Job board' });
const hud = bed.getByLabel('Laser head', { exact: true });
const modelCurrent = () => expect(footer).toContainText('Model current', { timeout: 60000 });
const bodies = () => page.evaluate(() => document.querySelector('.cad-viewport').cadViewMode().bodies);
const film = () => page.evaluate(() => document.querySelector('.cad-workspace').cadFilm());
const fill = async (scope, label, value) => {
  const field = scope.getByLabel(label, { exact: true });
  await field.fill(String(value));
  await field.press('Enter');
};
const noErrorLine = async (where) =>
  assert.equal(await page.locator('.cad-error').count(), 0, `no error line ${where}`);
const blanksOnBed = () => bed.getByLabel(/^Blank \d+$/);
const others = () => bed.getByLabel(/^Blank of /);
// The shot at 1600 × 1000, then the same state at 1366 × 768; at the smaller
// size every control of the Properties pane named in `visible` must be in view
// after scrolling to it, and nothing in the pane may stick out sideways.
const clippedInPane = () =>
  page.evaluate(() => {
    const pane = document.querySelector('.cad-properties');
    if (!pane) return [];
    const box = pane.getBoundingClientRect();
    return [...pane.querySelectorAll('button, input, select, li, dd, strong')]
      .filter((el) => el.getClientRects().length)
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.right > box.right + 1 || r.left < box.left - 1);
      })
      .map(
        (el) =>
          `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent).trim().slice(0, 40)}"`,
      );
  });
const shots = async (name, visible = []) => {
  await page.mouse.move(5, 600);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${directory}/${name}-1600.png` });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.waitForTimeout(350);
  // Each named control is brought to the middle of its pane (the pinned footer
  // covers the pane's foot) and must then be in the window.
  for (const locator of visible) {
    await locator.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await expect(locator).toBeInViewport({ ratio: 1 });
  }
  assert.deepEqual(await clippedInPane(), [], `nothing clipped sideways at 1366 × 768 (${name})`);
  await page.screenshot({ path: `${directory}/${name}-1366.png` });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.waitForTimeout(350);
};
// The sketcher's tools, typed through its HUD (the pointer off the canvas: a
// typed rectangle opens toward +X, +Y), as in verify-outline-edit-oe1.mjs.
const tool = (name) => toolbar.getByRole('button', { name, exact: true }).click();
const typeAt = async (field, ...values) => {
  await expect(page.getByLabel(`Sketch ${field}`, { exact: true })).toBeFocused();
  await typeHud(...values);
};
const rectangle = async (x, y, width, height) => {
  await tool('Rectangle');
  await typeAt('x', x, y);
  await typeAt('width', width, height);
  await page.keyboard.press('Escape');
};
const circle = async (x, y, radius) => {
  await tool('Circle');
  await typeAt('x', x, y);
  await typeAt('radius', radius);
  await page.keyboard.press('Escape');
};
// No two parts' boxes overlap in the view (X, Y: the blanks lie flat side by side).
const apart = (list) => {
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++) {
      const [a, b] = [list[i].bounds, list[j].bounds];
      const overlaps =
        a[0][0] < b[1][0] - 1e-3 && b[0][0] < a[1][0] - 1e-3 && a[0][1] < b[1][1] - 1e-3 && b[0][1] < a[1][1] - 1e-3;
      if (overlaps) return `${list[i].id} and ${list[j].id}`;
    }
  return '';
};
const bodiesOf = async (ids) => {
  await expect.poll(async () => (await bodies()).filter((b) => ids.includes(b.id) && b.bounds).length).toBe(ids.length);
  return (await bodies()).filter((b) => ids.includes(b.id));
};
const undo = () => page.locator('.cad-file-actions').getByRole('button', { name: 'Undo', exact: true }).click();
const redo = () => page.locator('.cad-file-actions').getByRole('button', { name: 'Redo', exact: true }).click();
const cutDone = () => expect(bed).toHaveAttribute('data-state', 'cut', { timeout: 30000 });
const pct = (value) => Number((value * 100).toFixed(1));
const SHEET_AREA = 2438 * 1219;
const fresh = async () => {
  await page.goto(process.env.CAD_VERIFY_URL || 'http://localhost:5180/sketch');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '3D Model & workshop', exact: true }).click();
  await modelCurrent();
};
// Draw → Rectangle W × H → Cut from sheet (SPCC; `thickness` 1.5 is the panel's own default).
const cutRectangle = async (width, height, { quantity = 1, thickness = null } = {}) => {
  await shopStation('Draw');
  await draw.getByRole('button', { name: /^Rectangle/ }).click();
  await fill(draw, 'Width W (mm)', width);
  await fill(draw, 'Height H (mm)', height);
  await draw.getByRole('button', { name: 'Cut this rectangle', exact: true }).click();
  await cutPanel.getByLabel('Sheet stock', { exact: true }).selectOption('spcc');
  if (thickness) await cutPanel.getByLabel('Thickness', { exact: true }).selectOption(String(thickness));
  if (quantity !== 1) await fill(cutPanel, 'Quantity', quantity);
  await cutPanel.getByRole('button', { name: 'Cut on the laser', exact: true }).click();
};

try {
  // ------------------------------------------------------------ Part A
  await fresh();

  // 1. 300 × 200, Quantity 3 in Cut from sheet → Cut on the laser.
  await cutRectangle(300, 200, { quantity: 3 });
  await expect(bed).toHaveAttribute('data-state', 'cutting', { timeout: 10000 });
  await expect(bed.getByRole('button', { name: 'Whole sheet', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(blanksOnBed()).toHaveCount(3);
  await expect(hud).toContainText(/blank \d of 3/, { timeout: 10000 });
  await cutDone();
  await expect(laser.getByText(/^Cut 3 blanks on the 1219 × 2438 mm sheet/)).toBeVisible();
  let model = await savedWhen((m) => m.instances.length === 3, 'three instances');
  assert.equal(model.parts.length, 1, 'one part');
  assert.equal(model.parts[0].name, 'Sheet-metal part', 'a single cut keeps its name');
  await expect(jobBoard.locator('.cad-job-row')).toHaveCount(3);
  await expect(laser.getByLabel('Quantity', { exact: true })).toHaveValue('3');
  await modelCurrent();
  await noErrorLine('after the first cut');
  await shots('01-three-blanks', [laser.getByRole('button', { name: 'Cut', exact: true })]);
  checks.push(
    '300 × 200, Quantity 3 → Whole sheet, 3 blanks, "Cut 3 blanks on the 1219 × 2438 mm sheet", 1 part, 3 instances, 3 job-board rows',
  );

  // 2. Quantity 5 → 5 instances, none overlapping; Quantity 2 → 2; Undo → 5.
  await fill(laser, 'Quantity', 5);
  model = await savedWhen((m) => m.instances.length === 5, 'five instances');
  await modelCurrent();
  let overlap = apart(await bodiesOf(model.instances.map((i) => i.id)));
  assert.equal(overlap, '', `no two copies overlap in the view (${overlap})`);
  await expect(blanksOnBed()).toHaveCount(5);
  await shots('02-five-copies');
  await fill(laser, 'Quantity', 2);
  model = await savedWhen((m) => m.instances.length === 2, 'two instances');
  await expect(blanksOnBed()).toHaveCount(2);
  await undo();
  model = await savedWhen((m) => m.instances.length === 5, 'Undo: five again');
  await expect(laser.getByLabel('Quantity', { exact: true })).toHaveValue('5');
  await modelCurrent();
  checks.push('Quantity 5 → 5 instances, none overlapping (view bounds); Quantity 2 → 2; Undo → 5');

  // 3. Paint the last copy; Quantity 1 → the painted copy stays, the warning card.
  await laser.getByRole('button', { name: 'Leave laser', exact: true }).click();
  await jobBoard.locator('.cad-job-row').nth(4).click();
  await shopStation('Paint');
  const paint = properties.getByRole('region', { name: 'Paint booth' });
  await paint.getByRole('button', { name: 'RAL 5010 Gentian blue', exact: true }).click();
  await paint.getByRole('button', { name: 'Paint', exact: true }).click();
  model = await savedWhen((m) => m.finishes?.length === 1, 'the painted copy');
  const painted = model.finishes[0].instanceId;
  assert.equal(painted, model.instances[4].id, 'the last copy is painted');
  await paint.getByRole('button', { name: 'Leave paint booth', exact: true }).click();
  await jobBoard.locator('.cad-job-row').first().click();
  await shopStation('Cut');
  await expect(laser).toBeVisible();
  await fill(laser, 'Quantity', 1);
  model = await savedWhen((m) => m.instances.length === 2, 'the painted copy kept');
  assert.deepEqual(
    model.instances.map((i) => i.id),
    [model.instances[0].id, painted],
    'the station’s instance and the painted copy stay',
  );
  await expect(laser.getByRole('note').filter({ hasText: 'painted, printed or grouped' })).toHaveText(
    '1 copy is painted, printed or grouped: delete it in the view if you mean to.',
  );
  await expect(laser.getByLabel('Quantity', { exact: true })).toHaveValue('2');
  await shots('03-painted-copy-stays');
  checks.push('one copy painted, Quantity 1 → the painted copy stays, "1 copy is painted, printed or grouped: …"');

  // 4. A 500 × 400 of the same stock and thickness lands beside the earlier blanks.
  await cutRectangle(500, 400);
  await cutDone();
  await expect(bed.getByRole('button', { name: 'Whole sheet', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(others()).toHaveCount(2);
  await expect(others().first()).toHaveAttribute('aria-label', 'Blank of Sheet-metal part');
  await expect(blanksOnBed()).toHaveCount(1);
  await expect(laser.getByLabel('On this sheet', { exact: true })).toHaveText('1 blank · 2 of other parts');
  const use4 = pct((2 * 300 * 200 + 500 * 400) / SHEET_AREA);
  await expect(laser.getByLabel('Sheet use', { exact: true })).toHaveText(`${use4}% · 1 sheet`);
  await expect(laser.getByRole('button', { name: 'Draw another part', exact: true })).toBeVisible();
  await expect(laser.getByLabel('Laser results', { exact: true })).toBeVisible();
  model = await savedWhen((m) => m.parts.length === 2, 'the 500 × 400 part');
  await modelCurrent();
  // BQ-1 §7.7: a new cut never lands on a part — with the camera not moved it
  // moves along +X clear of the copies standing on the drop point.
  overlap = apart(await bodiesOf(model.instances.map((i) => i.id)));
  assert.equal(overlap, '', `a second single cut does not stand on the earlier parts (${overlap})`);
  await shots('04-shared-sheet', [laser.getByLabel('On this sheet', { exact: true })]);
  measured.sheetUseStep4 = use4;
  checks.push(
    `500 × 400 same stock → beside 2 "Blank of Sheet-metal part", On this sheet "1 blank · 2 of other parts", Sheet use ${use4}% (by hand); in the view clear of the earlier parts (BQ-1 §7.7)`,
  );

  // 5. The same rectangle in 2.0 mm: its own sheet.
  await cutRectangle(500, 400, { thickness: 2 });
  await cutDone();
  await expect(others()).toHaveCount(0);
  await expect(laser.getByLabel('On this sheet', { exact: true })).toHaveText('1 blank');
  await expect(bed.getByRole('button', { name: 'Close-up', exact: true })).toHaveAttribute('aria-pressed', 'true');
  checks.push('the same rectangle in 2.0 mm → its own sheet: no other blank, Close-up');

  // 6. Copies past one sheet (500 × 400: 4 to a row, 2 rows = 8 a sheet): 9 → 2 sheets.
  await fill(laser, 'Quantity', 9);
  model = await savedWhen((m) => m.instances.length === 12, 'nine of the 2 mm part');
  const sheetSwitch = bed.getByRole('group', { name: 'Sheet', exact: true });
  await expect(sheetSwitch.getByRole('button')).toHaveText(['Sheet 1', 'Sheet 2']);
  await expect(blanksOnBed()).toHaveCount(8);
  const use6 = pct((9 * 500 * 400) / (2 * SHEET_AREA));
  await expect(laser.getByLabel('Sheet use', { exact: true })).toHaveText(`${use6}% · 2 sheets`);
  await laser.getByRole('button', { name: 'Cut', exact: true }).click();
  await cutDone();
  await expect(
    laser.getByText(
      /^Cut 8 blanks on the 1219 × 2438 mm sheet: .* 1 more on sheet 2: switch the sheet and cut again\.$/,
    ),
  ).toBeVisible();
  await shots('05-sheet-1-of-2', [sheetSwitch]);
  await sheetSwitch.getByRole('button', { name: 'Sheet 2', exact: true }).click();
  await expect(sheetSwitch.getByRole('button', { name: 'Sheet 2', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(blanksOnBed()).toHaveCount(1);
  await expect(laser.getByLabel('On this sheet', { exact: true })).toHaveText('1 blank');
  await shots('06-sheet-2');
  await modelCurrent();
  await noErrorLine('after part A');
  checks.push(
    `Quantity 9 of 500 × 400 → the Sheet switch (Sheet 1, Sheet 2), 8 then 1 blank, "${use6}% · 2 sheets", the notice names sheet 2`,
  );

  // ------------------------------------------------------------ Part B
  await fresh();
  await shopStation('Draw');

  // 10a. Two outlines in one sketch; the route's Cut opens Cut from sheet on both.
  await draw.getByRole('button', { name: /^Draw the outline/ }).click();
  await toolbar.waitFor();
  await rectangle(0, 0, 300, 200);
  await rectangle(360, 0, 200, 100);
  await expect(status).toContainText('2 items · closed profile');
  await tool('Finish sketch');
  await expect(readyList.getByRole('listitem').locator('strong')).toHaveText(['Sketch 1', 'Sketch 1 · 2']);
  await route.getByRole('button', { name: 'Cut', exact: true }).click();
  const toCut = cutPanel.getByRole('list', { name: 'Outlines to cut' });
  await expect(toCut.getByRole('listitem').locator('strong')).toHaveText(['Sketch 1', 'Sketch 1 · 2']);
  await expect(page.getByText(/Several outlines/)).toHaveCount(0);
  checks.push(
    'two outlines ready, no part: the route’s Cut opens Cut from sheet on both (no "Several outlines…" card)',
  );

  // 9. A third outline (150 × 150 with a Ø20) → Cut all 3 outlines → the batch.
  await shopStation('Draw');
  await draw.getByRole('button', { name: /^Draw the outline/ }).click();
  await toolbar.waitFor();
  await rectangle(0, 0, 150, 150);
  await circle(75, 75, 10);
  await expect(status).toContainText('2 items · closed profile');
  await tool('Finish sketch');
  await expect(readyList.getByRole('listitem')).toHaveCount(3);
  // The second sketch's name is the sketcher's next free one (the split took "Sketch 1 · 2").
  const third = await readyList.getByRole('listitem').nth(2).locator('strong').innerText();
  const cutAll = draw.getByRole('button', { name: 'Cut all outlines', exact: true });
  await expect(cutAll).toHaveText(/^Cut all 3 outlines/);
  await shots('07-draw-cut-all', [cutAll]);
  await cutAll.click();
  await expect(toCut.getByRole('listitem').locator('strong')).toHaveText(['Sketch 1', 'Sketch 1 · 2', third]);
  // Cut all opens Cut's picker with every outline ticked (docs/sketch-studio-cut-pick.md §4.1):
  // unticking a row is what Leave out was.
  const selected = cutPanel.getByLabel('Selected outlines', { exact: true });
  await expect(selected).toHaveText('3 of 3 selected');
  await fill(cutPanel, 'Quantity of Sketch 1 · 2', 2);
  await cutPanel.getByRole('checkbox', { name: `Select ${third}`, exact: true }).uncheck();
  await expect(toCut.getByRole('listitem')).toHaveCount(3);
  await expect(selected).toHaveText('2 of 3 selected');
  await expect(cutPanel.getByLabel('Batch', { exact: true })).toHaveText('3 blanks from 2 outlines');
  await cutPanel.getByRole('button', { name: 'Back: Draw', exact: true }).click();
  await cutAll.click();
  await expect(selected).toHaveText('3 of 3 selected');
  await fill(cutPanel, 'Quantity of Sketch 1 · 2', 2);
  await expect(cutPanel.getByLabel('Batch', { exact: true })).toHaveText('4 blanks from 3 outlines');
  await shots('08-batch-panel', [
    cutPanel.getByRole('checkbox', { name: `Select ${third}`, exact: true }),
    cutPanel.getByLabel('Batch', { exact: true }),
    cutPanel.getByRole('button', { name: 'Cut on the laser', exact: true }),
  ]);
  const commitsBefore = (await film()).commits;
  await cutPanel.getByRole('button', { name: 'Cut on the laser', exact: true }).click();
  await expect(bed).toHaveAttribute('data-state', 'cutting', { timeout: 10000 });
  await expect(bed.getByRole('button', { name: 'Whole sheet', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(blanksOnBed()).toHaveCount(4);
  assert.deepEqual(await blanksOnBed().evaluateAll((nodes) => nodes.map((n) => n.getAttribute('aria-label'))), [
    'Blank 1',
    'Blank 2',
    'Blank 3',
    'Blank 4',
  ]);
  // The head runs through all four blanks.
  const seenBlanks = new Set();
  const until = Date.now() + 30000;
  while (Date.now() < until && (await bed.getAttribute('data-state')) === 'cutting') {
    const k = (await hud.locator('strong').innerText()).match(/blank (\d) of 4/)?.[1];
    if (k) seenBlanks.add(Number(k));
    await page.waitForTimeout(80);
  }
  assert.deepEqual(
    [...seenBlanks].sort(),
    [1, 2, 3, 4],
    `the HUD reads blank k of 4 for every blank (${[...seenBlanks]})`,
  );
  await cutDone();
  await expect(laser.getByText(/^Cut 4 blanks on the 1219 × 2438 mm sheet/)).toBeVisible();
  assert.equal((await film()).commits, commitsBefore + 1, 'one commit makes the whole batch');
  model = await savedWhen((m) => m.instances.length === 4, 'the batch');
  assert.deepEqual(
    model.parts.map((p) => p.name),
    ['Sketch 1', 'Sketch 1 · 2', third],
    'each part named after its outline',
  );
  const jobList = laser.getByRole('list', { name: 'This cut' });
  await expect(jobList.getByRole('button')).toHaveCount(3);
  await expect(jobList.getByRole('button').nth(1)).toContainText('Sketch 1 · 2 × 2');
  await expect(jobList.getByRole('button').first()).toHaveAttribute('aria-current', 'true');
  await expect(laser.locator('.cad-shell-subject')).toHaveText('Sketch 1 + 2 more');
  await expect(jobBoard.locator('.cad-job-row')).toHaveCount(4);
  await modelCurrent();
  overlap = apart(await bodiesOf(model.instances.map((i) => i.id)));
  assert.equal(overlap, '', `no two batch parts overlap in the view (${overlap})`);
  await shots('09-batch-cut', [jobList, laser.getByLabel('Laser results', { exact: true })]);
  // A This cut row moves Quantity and Edit outline to that part.
  await jobList.getByRole('button').nth(1).click();
  await expect(jobList.getByRole('button').nth(1)).toHaveAttribute('aria-current', 'true');
  await expect(laser.getByLabel('Quantity', { exact: true })).toHaveValue('2');
  await expect(laser.locator('.cad-shell-subject')).toHaveText('Sketch 1 · 2 + 2 more');
  await expect(bed).toHaveAttribute('data-state', 'cut');
  await expect(laser.getByLabel('Blank', { exact: true })).toHaveText('200 × 100 mm');
  await shots('10-this-cut-lead', [jobList]);
  // Edit outline acts on the lead (Sketch 1 · 2): the sketcher opens on its 200 × 100; Cancel comes
  // back to the laser on it with the batch's job as it was.
  await laser.getByRole('button', { name: 'Edit outline', exact: true }).click();
  await toolbar.waitFor();
  await expect(status).toContainText('1 item · closed profile');
  await tool('Cancel sketch');
  await expect(laser).toBeVisible();
  await expect(jobList.getByRole('button')).toHaveCount(3);
  await expect(jobList.getByRole('button').nth(1)).toHaveAttribute('aria-current', 'true');
  await jobList.getByRole('button').first().click();
  await expect(laser.getByLabel('Quantity', { exact: true })).toHaveValue('1');
  checks.push(
    'Cut all 3 → the picker, 3 of 3 ticked → Quantity, one unticked (Leave out until cut-pick), Back to Draw, Cut all again → one commit: 3 parts named after their outlines, 4 instances, Whole sheet with Blank 1 … Blank 4, the HUD through blank 1–4 of 4, "Cut 4 blanks…", This cut (3 rows), 4 job-board rows, no overlaps; a This cut row moves Quantity, the blank and Edit outline to that part (its Cancel comes back to the same job)',
  );

  // 10b. Next: Bend opens the press brake on the lead (Sketch 1); two bends on its 200 mm edges.
  await laser.getByRole('button', { name: 'Next: Bend', exact: true }).click();
  const brake = properties.getByRole('region', { name: 'Press brake' });
  await expect(brake.locator('.cad-shell-subject')).toHaveText('Sketch 1');
  const map = page.getByRole('figure', { name: 'Flat blank' });
  const edges = map.getByRole('button', { name: /^Gauge edge \d+$/ });
  const hit = async (index) => {
    let found = 0;
    await expect(edges.first()).toBeVisible();
    for (let i = 0; i < (await edges.count()); i++) {
      await edges.nth(i).click();
      if (!(await brake.getByLabel('Gauge edge', { exact: true }).innerText()).endsWith('· 200 mm')) continue;
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
  await savedWhen((m) => m.parts[0].features[0].bends.length === 1, 'the first bend');
  await hit(1);
  model = await savedWhen((m) => m.parts[0].features[0].bends.length === 2, 'the second bend');
  await brake.getByRole('button', { name: 'Leave press brake', exact: true }).click();
  await modelCurrent();
  checks.push('Next: Bend after the batch → the press brake on the lead (Sketch 1); two hits on its 200 mm edges');

  // Undo the two bends, then the batch: no part left; Redo all of it.
  await undo();
  await undo();
  await savedWhen((m) => m.parts[0]?.features[0].bends.length === 0, 'the bends undone');
  await undo();
  model = await savedWhen((m) => m.parts.length === 0 && m.instances.length === 0, 'one Undo takes the batch back');
  await redo();
  await savedWhen((m) => m.instances.length === 4, 'Redo brings the batch back');
  await redo();
  await redo();
  model = await savedWhen((m) => m.parts[0].features[0].bends.length === 2, 'Redo brings the bends back');
  await modelCurrent();
  checks.push('one Undo takes the whole batch back (no part, no instance), Redo brings all four back');

  // 7. Group the four, Replay: in a later laser scene the earlier scenes' blanks lie cut on the bed.
  await page.mouse.move(5, 500);
  await page.keyboard.press('Control+a');
  await shopMore('Group');
  await savedWhen((m) => m.groups?.length === 1 && m.instances.every((i) => i.groupId), 'the group');
  const commitsBeforeReplay = (await film()).commits;
  await route.getByRole('button', { name: 'Replay', exact: true }).click();
  const replayPanel = properties.getByRole('region', { name: 'Replay' });
  await expect(replayPanel).toBeVisible();
  await replayPanel.getByRole('button', { name: 'Pause', exact: true }).click();
  const scenes = (await film()).scenes;
  const cutScenes = scenes.map((s, i) => [s, i]).filter(([s]) => s.station === 'cut');
  assert.equal(cutScenes.length, 3, 'three laser scenes, one per part');
  const steps = replayPanel.getByRole('list', { name: 'Replay steps' });
  const [, second] = cutScenes[1];
  await steps.getByRole('button').nth(second).click();
  await page.waitForFunction((k) => document.querySelector('.cad-workspace').cadFilm().index === k, second);
  await expect(bed).toBeVisible();
  const cutOthers = bed.locator('.cad-laser-other.is-cut');
  await expect(cutOthers).toHaveCount(1);
  await expect(cutOthers).toHaveAttribute('aria-label', 'Blank of Sketch 1');
  await expect(bed.locator('.cad-laser-other:not(.is-cut)')).toHaveAttribute('aria-label', `Blank of ${third}`);
  await shots('11-replay-second-cut');
  const [, last] = cutScenes[2];
  await steps.getByRole('button').nth(last).click();
  await page.waitForFunction((k) => document.querySelector('.cad-workspace').cadFilm().index === k, last);
  await expect(bed.locator('.cad-laser-other.is-cut')).toHaveCount(3);
  await expect(bed.locator('.cad-laser-other:not(.is-cut)')).toHaveCount(0);
  assert.equal((await film()).commits, commitsBeforeReplay, 'the replay commits nothing');
  await route.getByRole('button', { name: 'End replay', exact: true }).click();
  await expect(replayPanel).toHaveCount(0);
  checks.push(
    'Replay of the grouped batch: scene 2 shows the first part’s blank cut and the third’s as its programmed path; scene 3 shows all three earlier blanks cut',
  );

  // 8a. Timing: +9 copies of the two-bend part, commit → Model current.
  await jobBoard.locator('.cad-job-row').first().click();
  await shopStation('Cut');
  await expect(laser).toBeVisible();
  await modelCurrent();
  const quantityField = laser.getByLabel('Quantity', { exact: true });
  const buildsBefore = (await film()).builds;
  await quantityField.fill('10');
  const t0 = Date.now();
  await quantityField.press('Enter');
  await page.waitForFunction(
    (b) => {
      const f = document.querySelector('.cad-workspace').cadFilm();
      return f.builds > b && f.status === 'ready';
    },
    buildsBefore,
    { polling: 16, timeout: 120000 },
  );
  measured.plusNineTwoBendMs = Date.now() - t0;
  measured.plusNineBuilds = (await film()).builds - buildsBefore;
  await modelCurrent();
  model = await savedWhen(
    (m) => m.instances.filter((i) => i.partId === m.parts[0].id).length === 10,
    'ten of the bent part',
  );
  overlap = apart(await bodiesOf(model.instances.map((i) => i.id)));
  assert.equal(overlap, '', `the nine copies of the bent part stand clear (${overlap})`);
  await shots('12-ten-bent-copies');
  checks.push(
    `+9 copies of the two-bend part: commit → Model current ${measured.plusNineTwoBendMs} ms (${measured.plusNineBuilds} kernel build), none overlapping`,
  );

  // 8b. 50 blanks of Sketch 1 · 2: the station opened → the bed drawn, then the frames of their cut.
  await laser.getByRole('button', { name: 'Leave laser', exact: true }).click();
  await jobBoard.locator('.cad-job-row').filter({ hasText: 'Sketch 1 · 2' }).first().click();
  await shopStation('Cut');
  await fill(laser, 'Quantity', 50);
  await savedWhen((m) => m.instances.filter((i) => i.partId === m.parts[1].id).length === 50, 'fifty');
  await modelCurrent();
  await laser.getByRole('button', { name: 'Leave laser', exact: true }).click();
  await expect(bed).toHaveCount(0);
  const open0 = Date.now();
  await route.getByRole('button', { name: 'Cut', exact: true }).click();
  await expect(blanksOnBed()).toHaveCount(50);
  measured.openBedWith50Ms = Date.now() - open0;
  await page.evaluate(() => {
    window.__frames = [];
    let last = performance.now();
    const tick = (now) => {
      window.__frames.push(now - last);
      last = now;
      if (document.querySelector('.cad-laser-bed')?.dataset.state !== 'cut') requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await laser.getByRole('button', { name: 'Cut', exact: true }).click();
  await cutDone();
  const frames = (await page.evaluate(() => window.__frames)).slice(2).sort((a, b) => a - b);
  measured.cut50Frames = {
    count: frames.length,
    medianMs: Number(frames[Math.floor(frames.length / 2)].toFixed(2)),
    p95Ms: Number(frames[Math.floor(frames.length * 0.95)].toFixed(2)),
    maxMs: Number(frames.at(-1).toFixed(2)),
  };
  await shots('13-fifty-blanks');
  checks.push(
    `50 blanks: the station opened → the bed drawn in ${measured.openBedWith50Ms} ms; the cut ran ${frames.length} frames (median ${measured.cut50Frames.medianMs} ms, p95 ${measured.cut50Frames.p95Ms} ms)`,
  );

  // No page error, no error line.
  await noErrorLine('at the end');
  if (errors.length) throw new Error(errors.join('\n'));
  checks.push('no page error; no .cad-error (checked along the way)');
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ status: 'passed', errors, checks, measured }, null, 2),
  );
  console.log('Sheet nest SN-1 verification passed:\n- ' + checks.join('\n- '));
  console.log(JSON.stringify(measured, null, 2));
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` });
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}
