/* global process, console, window, getComputedStyle, HTMLElement */
// The floor-plan sidebar fit guard. Every element of the left sidebar must sit
// inside it on every lifecycle stage, at a laptop and a desktop viewport, and
// the surveyed-lot form must take a real five-line lot end to end.
//   FLOORPLAN_VERIFY_URL=http://localhost:5199/playground node scripts/verify-sidebar-fit.mjs
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const directory = 'artifacts/floorplan/sidebar-fit';
await mkdir(directory, { recursive: true });
const url = process.env.FLOORPLAN_VERIFY_URL || 'http://localhost:5199/playground';
const VIEWPORTS = [
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
];
const STAGES = ['Brief', 'Site', 'Spaces', 'Structure', 'Systems', 'Validate', 'Quantities', 'Documents'];

// Lot 812-I-1-A, the user's real lot (src/domain/surveyTraverse.test.js):
// closes at ~6 mm, 1:5,938, 59.91 m². Setbacks are this script's own choice.
const LOT_812_I_1_A = [
  { ns: 'N', degrees: '50', minutes: '56', ew: 'W', distance: '12.69', setback: '2' },
  { ns: 'N', degrees: '47', minutes: '0', ew: 'E', distance: '4.51', setback: '1' },
  { ns: 'S', degrees: '54', minutes: '57', ew: 'E', distance: '5.97', setback: '1' },
  { ns: 'S', degrees: '54', minutes: '57', ew: 'E', distance: '5.94', setback: '1' },
  { ns: 'S', degrees: '37', minutes: '2', ew: 'W', distance: '5.31', setback: '1' },
];

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [],
  checks = [],
  failures = [];
let page = null;

/**
 * Walks every element under the sidebar root. Edges are measured against the
 * client box of the sidebar's scroller (inside its scrollbar), which is
 * stricter than the sidebar's border box: a control under the scrollbar is as
 * unreachable as one past the edge. Overflow is checked for every HTML element
 * except form controls (an input scrolling its own long value is not a layout
 * fault) and elements that clip on purpose (ellipsized text, visually-hidden
 * screen-reader text).
 */
function fitWalk(root, scroller) {
  const box = scroller.getBoundingClientRect();
  const left = box.left + scroller.clientLeft;
  const right = left + scroller.clientWidth;
  const offenders = [];
  // The row grids the stylesheet budget test guards; reported so a run says
  // which of them it actually measured.
  const rows = {};
  const describe = (element) => {
    const raw = typeof element.className === 'string' ? element.className : element.getAttribute('class') || '';
    const classes = raw.trim() ? `.${raw.trim().split(/\s+/).join('.')}` : '';
    const label = element.getAttribute('aria-label');
    return `${element.tagName.toLowerCase()}${classes}${label ? `[aria-label="${label}"]` : ''}`;
  };
  let count = 0;
  for (const element of root.querySelectorAll('*')) {
    if (element === scroller) continue; // its own border is the edge being measured to
    count += 1;
    const row = (typeof element.className === 'string' ? element.className : '').match(
      /_(traverseRow|quantityRow|mappingRow|placementRow|structuralIntentRow)_/,
    );
    if (row) rows[row[1]] = (rows[row[1]] || 0) + 1;
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      if (rect.right > right + 0.5) offenders.push(`${describe(element)} right ${rect.right.toFixed(1)} > ${right}`);
      if (rect.left < left - 0.5) offenders.push(`${describe(element)} left ${rect.left.toFixed(1)} < ${left}`);
    }
    if (!(element instanceof HTMLElement) || ['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName)) continue;
    const style = getComputedStyle(element);
    // Deliberate clipping: ellipsized text, and visually-hidden screen-reader text.
    if (style.textOverflow === 'ellipsis' || style.clipPath !== 'none' || style.clip !== 'auto') continue;
    if (element.scrollWidth > element.clientWidth + 1) {
      offenders.push(`${describe(element)} scrollWidth ${element.scrollWidth} > clientWidth ${element.clientWidth}`);
    }
  }
  return { count, rows, sidebar: { left, right }, offenders };
}

try {
  for (const viewport of VIEWPORTS) {
    const size = `${viewport.width}×${viewport.height}`;
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    await context.addInitScript(`window.__fitWalk = ${fitWalk.toString()};`);
    page = await context.newPage();
    page.on('pageerror', (e) => errors.push(`${size}: ${e.message}`));
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForSelector('svg[class*="_svg"]', { timeout: 30000 });
    const nav = page.getByRole('navigation', { name: 'Building lifecycle stages' });
    await expect(nav).toBeVisible();
    // The outermost "_sidebar_" ancestor is the layout's grid cell (walked);
    // the innermost is the scroller whose client box is the usable width.
    const sidebarAncestors = (element, outermost) => {
      let found = null;
      for (let node = element; node; node = node.parentElement) {
        if (/(^|\s)_sidebar_/.test(node.className)) {
          found = node;
          if (!outermost) break;
        }
      }
      return found;
    };
    const sidebar = await nav.evaluateHandle(sidebarAncestors, true);
    const scroller = await nav.evaluateHandle(sidebarAncestors, false);
    assert(await sidebar.evaluate((element) => Boolean(element)), 'Sidebar root not found.');

    const stageButton = (label) => nav.getByRole('button', { name: new RegExp(`\\b${label}\\b`) });
    const walk = async (name) => {
      const result = await page.evaluate(([root, inner]) => window.__fitWalk(root, inner), [sidebar, scroller]);
      const rows = Object.entries(result.rows).map(([key, value]) => `${value} ${key}`);
      const line = `${size} ${name}: ${result.offenders.length} offenders (${result.count} elements, sidebar ${result.sidebar.left}–${result.sidebar.right}px${rows.length ? `; rows: ${rows.join(', ')}` : ''})`;
      checks.push(line);
      if (result.offenders.length) failures.push(`${line}\n    ${result.offenders.slice(0, 10).join('\n    ')}`);
      return result;
    };

    for (const label of STAGES) {
      await stageButton(label).click();
      await expect(stageButton(label)).toHaveAttribute('aria-current', 'step');
      await page.waitForTimeout(250); // the stage content's fade-in
      await walk(label);
    }

    // Spaces with linked units, so the placement and room-mapping rows are
    // measured too (the demo project has none until a program is generated).
    await stageButton('Spaces').click();
    const createProgram = page.getByRole('button', { name: 'Create typical unit program', exact: true });
    if (await createProgram.count()) await createProgram.click();
    await page.getByRole('button', { name: /^Generate \d+ linked units across \d+ levels$/ }).click();
    await expect(page.getByLabel(/^X placement for /).first()).toBeVisible();
    const spaces = await walk('Spaces · linked units');
    assert(spaces.rows.placementRow > 0, 'Unit placement rows were measured');
    // Room-to-unit mapping rows need rooms on the plan; the demo floors have none,
    // so that grid is held by the stylesheet budget test alone.
    if (!spaces.rows.mappingRow)
      checks.push(
        `${size} mappingRow not rendered (no rooms on the demo plan): ${await page.getByText(/Draw or detect rooms/).count()} empty-state notes`,
      );

    // Site stage, both lot modes.
    await stageButton('Site').click();
    const card = page.locator('[class*="stageContent"]').first();
    await page.getByRole('button', { name: 'Rectangular lot', exact: true }).click();
    await expect(page.getByLabel('Lot width', { exact: true })).toBeVisible();
    await walk('Site · Rectangular lot');

    await page.getByRole('button', { name: 'Surveyed boundary', exact: true }).click();
    await expect(page.getByLabel('Line 1 east or west', { exact: true })).toBeVisible();
    for (let guard = 0; guard < 10; guard += 1) {
      if ((await page.getByLabel(/^Line \d+ distance$/).count()) >= LOT_812_I_1_A.length) break;
      await page.getByRole('button', { name: 'Add boundary line', exact: true }).click();
    }
    assert.equal(await page.getByLabel(/^Line \d+ distance$/).count(), 5, 'Five boundary lines');
    for (const [index, line] of LOT_812_I_1_A.entries()) {
      const n = index + 1;
      await page.getByLabel(`Line ${n} north or south`, { exact: true }).selectOption(line.ns);
      await page.getByLabel(`Line ${n} bearing degrees`, { exact: true }).fill(line.degrees);
      await page.getByLabel(`Line ${n} bearing minutes`, { exact: true }).fill(line.minutes);
      await page.getByLabel(`Line ${n} east or west`, { exact: true }).selectOption(line.ew);
      await page.getByLabel(`Line ${n} distance`, { exact: true }).fill(line.distance);
      await page.getByLabel(`Line ${n} setback`, { exact: true }).fill(line.setback);
    }
    const cardText = await card.innerText();
    const closure = cardText.match(/\d+ mm \(1:[\d,]+\)/);
    assert(closure, `Closure readout shows a 1: ratio (card text: ${cardText.slice(0, 400)})`);
    assert.match(cardText, /59\.91 m²/, 'Computed area reads 59.91 m²');
    checks.push(`${size} surveyed lot 812-I-1-A: closure "${closure[0]}", area 59.91 m²`);

    const remove = page.getByLabel('Remove line 5', { exact: true });
    await expect(remove).toBeEnabled();
    const fit = await remove.evaluate((element, root) => {
      const r = element.getBoundingClientRect();
      const box = root.getBoundingClientRect();
      const left = box.left + root.clientLeft;
      return { left: r.left, right: r.right, min: left, max: left + root.clientWidth };
    }, scroller);
    assert(
      fit.left >= fit.min - 0.5 && fit.right <= fit.max + 0.5,
      `Remove line 5 inside the sidebar (${fit.left}–${fit.right} in ${fit.min}–${fit.max})`,
    );
    checks.push(
      `${size} Remove line 5 enabled at ${fit.left.toFixed(1)}–${fit.right.toFixed(1)}px (sidebar ${fit.min}–${fit.max}px)`,
    );
    await walk('Site · Surveyed boundary (5 lines)');
    if (viewport.width === 1366) {
      // The card is taller than the window; a tall viewport (same sidebar
      // width) photographs it whole instead of a scrolled slice.
      await page.setViewportSize({ width: viewport.width, height: 2600 });
      await card.screenshot({ path: `${directory}/site-surveyed-after.png`, animations: 'disabled' });
      await page.setViewportSize(viewport);
    }

    await page.getByRole('button', { name: 'Apply surveyed boundary', exact: true }).click();
    await expect(page.getByText('Surveyed boundary applied and checked.', { exact: true })).toBeVisible();
    checks.push(`${size} Apply surveyed boundary → "Surveyed boundary applied and checked."`);
    await walk('Site · after apply');
    if (viewport.width === 1366) {
      await sidebar.evaluate((element) => (element.scrollTop = 0));
      await page
        .locator('[class*="_sidebar_"]')
        .first()
        .screenshot({ path: `${directory}/sidebar-after.png` });
    }

    // The grab strip on the sidebar's edge: drag, keys, double-click, storage.
    const strip = page.getByRole('separator', { name: 'Resize sidebar' });
    const sidebarWidth = () => sidebar.evaluate((element) => Math.round(element.getBoundingClientRect().width));
    const box = await strip.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + 200);
    await page.mouse.down();
    for (let step = 1; step <= 5; step += 1) {
      await page.mouse.move(box.x + box.width / 2 + step * 20, box.y + 200);
      await page.waitForTimeout(30);
    }
    await page.mouse.up();
    await expect(strip).toHaveAttribute('aria-valuenow', '356');
    assert.equal(await sidebarWidth(), 356, 'Dragging 100px right widens the sidebar to 356px');
    assert.equal(await page.evaluate(() => window.localStorage.getItem('floorplan.sidebar.width')), '356');
    await walk('Site · sidebar dragged to 356px');
    await strip.focus();
    await page.keyboard.press('ArrowRight');
    await expect(strip).toHaveAttribute('aria-valuenow', '372');
    await page.keyboard.press('End');
    await expect(strip).toHaveAttribute('aria-valuenow', '420');
    await page.keyboard.press('ArrowRight');
    await expect(strip).toHaveAttribute('aria-valuenow', '420');
    await walk('Site · sidebar at 420px');
    await page.keyboard.press('Home');
    await expect(strip).toHaveAttribute('aria-valuenow', '240');
    await walk('Site · sidebar at 240px (minimum)');
    await page.keyboard.press('End');
    // A second tab on the same storage, rather than a reload: reloading while
    // the 3D preview is still compiling shaders throws inside three.js
    // (`program.isReady` on a disposed renderer), which is not this check's
    // business.
    const reopened = await context.newPage();
    reopened.on('pageerror', (e) => errors.push(`${size} (second tab): ${e.message}`));
    await reopened.goto(url, { waitUntil: 'networkidle' });
    await reopened.waitForSelector('svg[class*="_svg"]', { timeout: 30000 });
    const reopenedStrip = reopened.getByRole('separator', { name: 'Resize sidebar' });
    await expect(reopenedStrip).toHaveAttribute('aria-valuenow', '420');
    await reopenedStrip.dblclick();
    await expect(reopenedStrip).toHaveAttribute('aria-valuenow', '256');
    checks.push(
      `${size} resizer: drag +100px → 356px (stored), → 372, End → 420 (clamped), Home → 240, 420 in a new tab, double-click → 256`,
    );
    page = null;
    await context.close();
  }

  // Under the overlay breakpoint the sidebar floats at its fixed width: no strip.
  page = await browser.newPage({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => errors.push(`1000×700: ${e.message}`));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('svg[class*="_svg"]', { timeout: 30000 });
  assert.equal(await page.getByRole('separator', { name: 'Resize sidebar' }).count(), 0, 'No resizer at 1000px');
  checks.push('1000×700 (overlay layout): no sidebar resizer rendered');
  await page.close();
  page = null;

  if (errors.length) throw new Error(`Page errors:\n${errors.join('\n')}`);
  if (failures.length) throw new Error(`Sidebar fit offenders:\n${failures.join('\n')}`);
  await writeFile(`${directory}/verification.json`, JSON.stringify({ status: 'passed', errors, checks }, null, 2));
  console.log('Sidebar fit verification passed:\n- ' + checks.join('\n- '));
} catch (error) {
  if (page) await page.screenshot({ path: `${directory}/failure.png` });
  console.error('Checks so far:\n- ' + checks.join('\n- '));
  console.error(errors);
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ status: 'failed', error: error.message, errors, checks }, null, 2),
  );
  process.exitCode = 1;
  console.error(error.message);
} finally {
  await browser.close();
}
