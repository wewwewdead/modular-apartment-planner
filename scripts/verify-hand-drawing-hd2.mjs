/* global localStorage, process, console, document */
// Hand drawing HD-2 (docs/sketch-studio-hand-drawing.md §6.7), driven the way
// a user would from an empty workspace: Shop → Draw → Draw the outline; an L
// outline drawn with Line by typed absolute X, Y only, its last end left
// 0.3 mm short of its start; the zero moved to the L's inner corner by a
// click and a hole placed by X, Y from it; a second hole by @25 from the
// first; Diameter typed; two construction lines and a hole clicked on their
// crossing ("intersection" in the status line); "open outline · 1 to fix" →
// Check → Close it → "closed profile"; Finish → ready to cut; Edit → the zero
// where it was. The bar and its row measured at 1600 × 1000 and 1366 × 768,
// and the Check panel against the view. No page error, no .cad-error.
//   CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-hand-drawing-hd2.mjs
// Screenshots: artifacts/sketch-cad/hand-drawing-hd2 (or HD2_SHOTS), each state
// at 1600 × 1000 and 1366 × 768.
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { cadSteps } from './sketch-cad-steps.mjs';

const directory = process.env.HD2_SHOTS || 'artifacts/sketch-cad/hand-drawing-hd2';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [],
  checks = [],
  measured = {};
page.on('pageerror', (e) => errors.push(e.message));
const { properties, savedWhen, toolbar, status, shopStation, project } = cadSteps(page);
const footer = page.locator('.cad-status');
const draw = properties.getByRole('region', { name: 'Draw' });
const readyList = draw.getByRole('list', { name: 'Outlines ready to cut' });
const row = page.getByRole('group', { name: 'Selection', exact: true });
const zeroRow = page.getByRole('group', { name: 'Zero options', exact: true });
const checkPanel = page.getByRole('region', { name: 'Check', exact: true });
const modelCurrent = () => expect(footer).toContainText('Model current', { timeout: 60000 });
const noErrorLine = async (where) =>
  assert.equal(await page.locator('.cad-error').count(), 0, `no error line ${where}`);
const button = (name) => toolbar.getByRole('button', { name, exact: true });
const tool = (name) => button(name).click();
const hud = (field) => page.getByLabel(`Sketch ${field}`, { exact: true });
// X and Y typed in the HUD (from the zero, or "@…" from the last point), then Enter.
const typeXY = async (x, y) => {
  await hud('x').fill(String(x));
  await hud('y').fill(String(y));
  await hud('y').press('Enter');
};
const overlay = () => page.evaluate(() => document.querySelector('.cad-viewport').cadSketchOverlay());
const at = async ([u, v]) => project([u, v, 0]);
const hover = async (point) => {
  const [x, y] = await at(point);
  await page.mouse.move(x, y);
  return [x, y];
};
const clickAt = async (point) => {
  const [x, y] = await hover(point);
  await page.mouse.click(x, y);
};
const saved = () => savedWhen((m) => m.sketches.length === 1, 'the finished outline');
// How much of the view the bar and its row cover (the spec's limit: a fifth), and the Check panel's height.
const coverage = () =>
  page.evaluate(() => {
    const view = document.querySelector('.cad-viewport').getBoundingClientRect();
    const top = document.querySelector('.cad-sketch-top').getBoundingClientRect();
    const bar = document.querySelector('.cad-sketch-toolbar').getBoundingClientRect();
    const rowBox = document.querySelector('.cad-sketch-options')?.getBoundingClientRect();
    const check = document.querySelector('.cad-sketch-check')?.getBoundingClientRect();
    return {
      view: Math.round(view.height),
      bar: Math.round(bar.height),
      row: rowBox ? Math.round(rowBox.height) : 0,
      covered: Math.round(top.bottom - view.top),
      share: Number(((top.bottom - view.top) / view.height).toFixed(3)),
      rowInside: !rowBox || (rowBox.right <= view.right + 0.5 && rowBox.left >= view.left - 0.5),
      ...(check
        ? {
            check: Math.round(check.height),
            checkShare: Number((check.height / view.height).toFixed(3)),
            checkInside: check.left >= view.left - 0.5 && check.bottom <= view.bottom + 0.5 && check.top >= top.bottom,
          }
        : {}),
    };
  });
const shot = async (name) => {
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${directory}/${name}.png` });
};
// The state at 1600 × 1000, then at 1366 × 768 (the pointer parked off the canvas unless `keep`).
const shots = async (name, measure = null, keep = false) => {
  if (!keep) await page.mouse.move(5, 600);
  await shot(`${name}-1600`);
  if (measure) measured[`${measure}-1600`] = await coverage();
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.waitForTimeout(350);
  await shot(`${name}-1366`);
  if (measure) measured[`${measure}-1366`] = await coverage();
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.waitForTimeout(350);
};
const lookAt = async () => {
  await tool('Look at');
  await page.waitForTimeout(400);
};

try {
  await page.goto(process.env.CAD_VERIFY_URL || 'http://localhost:5180/sketch');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '3D Model & workshop', exact: true }).click();
  await modelCurrent();

  // 1. Shop → Draw → Draw the outline: Zero and Check in the bar after Snap and Look at.
  await shopStation('Draw');
  await draw.getByRole('button', { name: /^Draw the outline/ }).click();
  await toolbar.waitFor();
  // By name: HD-4 (§8.6) shows "Finish" and "Cancel", their aria-labels the full names.
  const names = await toolbar
    .getByRole('button')
    .evaluateAll((list) => list.map((b) => b.getAttribute('aria-label') || b.textContent));
  assert.deepEqual(names.slice(names.indexOf('Redo') + 1), [
    'Zero',
    'Look at',
    'Check',
    'Finish sketch',
    'Cancel sketch',
  ]);
  await expect(button('Zero')).toHaveAttribute('aria-pressed', 'false');
  await expect(button('Zero')).toHaveAttribute('title', 'Zero (Z): click a point to measure X and Y from it');
  measured['bar-1600'] = await coverage();
  checks.push('Draw the outline → Zero after Snap, Check after Look at; Zero not pressed on a new sketch');

  // 2. An L outline with Line by typed absolute X, Y only; the last end 0.3 mm short of the start.
  await tool('Line');
  await typeXY(0, 0);
  await expect(hud('length')).toBeFocused();
  for (const [x, y] of [
    [200, 0],
    [200, 60],
    [80, 60],
    [80, 140],
    [0, 140],
    [0, 0.3],
  ])
    await typeXY(x, y);
  await page.keyboard.press('Escape');
  await expect(status).toContainText('6 items · open outline · 1 to fix');
  await lookAt();
  checks.push(
    'Line by typed X, Y only: (0, 0) → (200, 0) → (200, 60) → (80, 60) → (80, 140) → (0, 140) → (0, 0.3): "6 items · open outline · 1 to fix"',
  );

  // The four boxes of a line's next point, the pair not typed greyed (shot with the HUD up).
  await tool('Line');
  await typeXY(20, 20);
  await hover([60, 30]);
  await hud('length').fill('40');
  await expect(hud('x')).toHaveClass(/is-derived/);
  await expect(hud('y')).toHaveClass(/is-derived/);
  await hud('x').fill('@30');
  await expect(hud('length')).toHaveValue('');
  await expect(hud('length')).toHaveClass(/is-derived/);
  await expect(page.getByLabel('X resolves to')).toHaveText('= 50');
  measured.hudRows = await page.evaluate(() =>
    [...document.querySelectorAll('.cad-sketch-hud-row')].map((r) =>
      [...r.querySelectorAll('input')].map((i) => i.getAttribute('aria-label')),
    ),
  );
  assert.deepEqual(measured.hudRows, [
    ['Sketch length', 'Sketch angle'],
    ['Sketch x', 'Sketch y'],
  ]);
  await shots('01-line-next-point', null, true);
  await page.keyboard.press('Escape');
  await expect(status).toContainText('6 items · open outline');
  checks.push(
    'a line’s next point: rows Length, Angle · X, Y; Length typed greys X, Y; X "@30" empties Length, greys Length, Angle, and reads "= 50"',
  );

  // 3. The zero moved to the L's inner corner (80, 60) by a click.
  await tool('Zero');
  await expect(zeroRow).toHaveText('The zero is the sketch origin · click a point to measure from it');
  await shots('02-zero-tool', 'zero-row', true);
  await hover([80.4, 60.3]);
  await expect(status).toContainText('X 80 · Y 60 mm · endpoint');
  await clickAt([80.4, 60.3]);
  await expect(zeroRow).toHaveCount(0);
  await expect(button('Zero')).toHaveAttribute('aria-pressed', 'true');
  await expect(button('Zero')).toHaveAttribute('title', 'Zero at (80, 60): Z to move or reset it');
  let drawn = await overlay();
  assert.deepEqual(drawn.zero, { at: [80, 60], color: '#e2541c' });
  await hover([100, 70]);
  await expect(status).toContainText('X 20 · Y 10 mm from the zero');
  checks.push(
    'Zero → a click on the inner corner: marker at (80, 60) in #e2541c, Zero pressed "Zero at (80, 60)", the status reads "X 20 · Y 10 mm from the zero"',
  );

  // 4. A hole by X, Y from the zero (−40, 40 → (40, 100)), Diameter 10 typed; a second by @25 from the first.
  await tool('Circle');
  await typeXY(-40, 40);
  await hud('diameter').fill('10');
  await expect(hud('radius')).toHaveClass(/is-derived/);
  await hud('diameter').press('Enter');
  await expect(status).toContainText('7 items · open outline');
  await hud('x').fill('@25');
  await expect(page.getByLabel('X resolves to')).toHaveText('= -15');
  await hud('y').fill('@0');
  await hud('y').press('Enter');
  await hud('diameter').fill('10');
  await hud('diameter').press('Enter');
  await expect(status).toContainText('8 items · open outline');
  await page.keyboard.press('Escape');
  checks.push(
    'Circle: X −40, Y 40 from the zero, Diameter 10 (Radius greyed) → a hole at (40, 100); X "@25" (reads "= -15"), Y "@0", Diameter 10 → a hole at (65, 100)',
  );

  // 5. Two construction lines typed from the zero, crossing at (140, 30), and a hole clicked on the crossing.
  await page.keyboard.press('x');
  await expect(button('Construction')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('l');
  await typeXY(20, -50); // (100, 10)
  await typeXY(110, -5); // (190, 55)
  await page.keyboard.press('Escape');
  await page.keyboard.press('l');
  await typeXY(20, -10); // (100, 50)
  await typeXY(80, -40); // (160, 20)
  await page.keyboard.press('Escape');
  await page.keyboard.press('x');
  await expect(button('Construction')).toHaveAttribute('aria-pressed', 'false');
  await expect(status).toContainText('10 items · 2 construction · open outline');
  await tool('Circle');
  await hover([140.5, 30.4]);
  await expect(status).toContainText('X 60 · Y -30 mm from the zero · intersection');
  await shots('03-intersection', null, true);
  await clickAt([140.5, 30.4]);
  await hud('diameter').fill('8');
  await hud('diameter').press('Enter');
  await page.keyboard.press('Escape');
  await expect(status).toContainText('11 items · 2 construction · open outline · 1 to fix');
  checks.push(
    'two construction lines typed from the zero; the cursor near their crossing reads "X 60 · Y -30 mm from the zero · intersection"; a click there and Diameter 8: a hole at (140, 30)',
  );

  // 6. "open outline · 1 to fix" → Check (from the status line) → Close it → "closed profile".
  await status.getByRole('button', { name: '11 items · 2 construction · open outline · 1 to fix' }).click();
  await expect(checkPanel).toBeVisible();
  await expect(checkPanel).toContainText('Check · 1 to fix');
  const place = checkPanel.getByRole('button', {
    name: 'Open end at (-80, -59.7): 0.3 mm from the nearest other end',
    exact: true,
  });
  await expect(place).toBeFocused();
  drawn = await overlay();
  assert.equal(drawn.problems.length, 1);
  assert.deepEqual(drawn.problems[0].at, [0, 0.3]);
  assert.equal(drawn.problems[0].color, '#d22f27');
  // Enter on the focused row (a click does the same): its place framed, its two lines selected.
  await place.press('Enter');
  await expect(row.getByRole('note')).toHaveText('2 selected: 2 lines · Delete removes them');
  await page.waitForTimeout(400);
  // HD-3 §7.0: the frame shows the gap with its surroundings (four times its extent, at least
  // 10 mm across), and the ring, sized from the view after the camera change with no pointer
  // move, stays under 40 px on screen.
  drawn = await overlay();
  const [ringCentre, ringEdge] = await Promise.all([
    at(drawn.problems[0].at),
    at([drawn.problems[0].at[0] + drawn.problems[0].radius, drawn.problems[0].at[1]]),
  ]);
  measured.ringPx = Number(Math.hypot(ringEdge[0] - ringCentre[0], ringEdge[1] - ringCentre[1]).toFixed(1));
  assert.ok(measured.ringPx < 40, `the ring's radius on screen after the row is framed: ${measured.ringPx} px`);
  // The frame: the gap's two ends 0.3 mm apart, the view about 10 mm across (12 mm in a perspective view).
  const [gapA, gapB] = await Promise.all([at([0, 0]), at([0, 10])]);
  measured.framePxPerMm = Number((Math.hypot(gapB[0] - gapA[0], gapB[1] - gapA[1]) / 10).toFixed(1));
  checks.push(
    `§7.0: the row framed: ${measured.framePxPerMm} px a mm (the 0.3 mm gap with its corner around it); the ring ${measured.ringPx} px across its radius (< 40)`,
  );
  await shots('04-check-open', 'check-open', true);
  await checkPanel.getByRole('button', { name: 'Close it', exact: true }).click();
  await expect(status).toContainText('11 items · 2 construction · closed profile');
  await expect(status.getByRole('button')).toHaveCount(0);
  await expect(checkPanel).toContainText('Check · nothing to fix');
  await expect(checkPanel).toContainText('Nothing to fix: a closed outline with 3 cut-outs.');
  assert.ok(await checkPanel.evaluate((panel) => panel.contains(document.activeElement)), 'the focus stays in Check');
  drawn = await overlay();
  assert.deepEqual(drawn.problems, []);
  await lookAt();
  await shots('05-check-fixed', 'check-fixed');
  await checkPanel.getByRole('button', { name: 'Close', exact: true }).focus();
  await page.keyboard.press('Escape');
  await expect(checkPanel).toHaveCount(0);
  await expect(toolbar).toBeVisible();
  checks.push(
    'the status button "… open outline · 1 to fix" → Check · 1 to fix, its row focused, one red marker at (0, 0.3); Enter on the row frames it and selects the two lines; Close it → "closed profile", "Check · nothing to fix · a closed outline with 3 cut-outs", the focus kept in Check; Esc closes it',
  );

  // The selection row with the zero moved: a line's six boxes from the zero, and the coverage with it.
  await page.keyboard.press('Escape');
  await clickAt([140, 0.4]);
  await expect(row.getByRole('note')).toHaveText('Line 200 mm · Delete removes it');
  await expect(row.getByLabel('Selected X1 (mm)', { exact: true })).toHaveValue('-80');
  await expect(row.getByLabel('Selected Y1 (mm)', { exact: true })).toHaveValue('-60');
  await shots('06-line-row-from-zero', 'line-row');
  await page.keyboard.press('Escape');
  await expect(row).toHaveCount(0);
  checks.push('a click on the bottom line → its row from the zero: X1 −80, Y1 −60');

  // 7. Finish → Draw: an outline ready to cut, its zero stored.
  await tool('Finish sketch');
  await expect(toolbar).toHaveCount(0);
  await expect(readyList.getByRole('listitem')).toHaveCount(1);
  await expect(readyList.getByRole('listitem')).toContainText('200 × 140 mm');
  const [sketch] = (await saved()).sketches;
  assert.deepEqual(sketch.zero, [80, 60]);
  assert.equal(sketch.profile.holes?.length, 3, 'three cut-outs');
  assert.deepEqual(
    sketch.profile.holes.map((h) => [h.center, h.radius]),
    [
      [[40, 100], 5],
      [[65, 100], 5],
      [[140, 30], 4],
    ],
  );
  assert.deepEqual(
    sketch.entities.filter((e) => e.construction).map((e) => [e.a, e.b]),
    [
      [
        [100, 10],
        [190, 55],
      ],
      [
        [100, 50],
        [160, 20],
      ],
    ],
  );
  assert.deepEqual(sketch.entities[5].b, [0, 0], 'Close it moved the last end onto the start');
  measured.finished = { zero: sketch.zero, holes: sketch.profile.holes.length, entities: sketch.entities.length };
  await noErrorLine('after Finish');
  await shots('07-ready-to-cut');
  checks.push(
    'Finish → Draw: Sketch 1 ready to cut, 200 × 140 mm, three cut-outs (Ø10 at (40, 100) and (65, 100), Ø8 at (140, 30)); sketch.zero [80, 60] stored',
  );

  // 8. Edit: the zero where it was.
  await readyList.getByRole('button', { name: 'Edit Sketch 1', exact: true }).click();
  await toolbar.waitFor();
  await expect(status).toContainText('11 items · 2 construction · closed profile');
  await expect(button('Zero')).toHaveAttribute('aria-pressed', 'true');
  await expect(button('Zero')).toHaveAttribute('title', 'Zero at (80, 60): Z to move or reset it');
  drawn = await overlay();
  assert.deepEqual(drawn.zero, { at: [80, 60], color: '#e2541c' });
  await lookAt();
  await hover([100, 70]);
  await expect(status).toContainText('X 20 · Y 10 mm from the zero');
  await shots('08-edit-zero-kept', null);
  await tool('Cancel sketch');
  await expect(toolbar).toHaveCount(0);
  checks.push('Edit Sketch 1 → the zero marker at (80, 60), Zero pressed, the status from the zero; Cancel');

  // 9. The bar and its row cover no more than a sixth of the view at 1600 × 1000 and a quarter at
  // 1366 × 768 (HD-3 §7.5 restates HD-2's fifth: the selection row carries the actions on a
  // selection since); Check at most 40 % of it, inside it.
  for (const [key, value] of Object.entries(measured).filter(([k, v]) => v && /-(1600|1366)$/.test(k))) {
    const limit = key.endsWith('1600') ? 1 / 6 : 1 / 4;
    assert.ok(value.share <= limit, `${key}: the bar and its row cover ${value.share} of the view`);
    assert.ok(value.rowInside, `${key}: the row stands inside the view`);
    if (value.check != null) {
      assert.ok(value.checkShare <= 0.4, `${key}: Check covers ${value.checkShare} of the view's height`);
      assert.ok(value.checkInside, `${key}: Check stands inside the view, under the bar`);
    }
  }
  checks.push(
    'the bar and its row cover at most a sixth of the view at 1600 × 1000 and a quarter at 1366 × 768 (§7.5); Check at most 40 % of its height',
  );

  await noErrorLine('at the end');
  if (errors.length) throw new Error(errors.join('\n'));
  checks.push('no page error; no .cad-error');
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ status: 'passed', errors, checks, measured }, null, 2),
  );
  console.log('Hand drawing HD-2 verification passed:\n- ' + checks.join('\n- '));
  console.log(JSON.stringify(measured, null, 2));
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` });
  console.error(errors, JSON.stringify(measured));
  throw error;
} finally {
  await browser.close();
}
