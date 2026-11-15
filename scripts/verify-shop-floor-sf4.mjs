/* global localStorage, process, console, document, performance, window, MutationObserver */
// Shop floor SF-4 (docs/sketch-studio-shop-floor.md §7): the kiosk example,
// walked the way the shop would on its own product. From an empty workspace:
// Shop → More → Example: kiosk (measured: from the click to the model on
// screen, and the worker's rebuild) → the route bar reads done at every
// station → the job sheet says All steps done → each station opens on it
// with no error line (Draw; Cut and Bend ask which part, then the laser bed
// and the press brake on the front face frame; Paint; Print — no Weld or
// Assembly station since docs/sketch-studio-shop-trim.md) → the Assemble
// tab's Interference finds no clash → reload: the same model, the same
// route. (Every kiosk part is painted, so Bend shows the finished-here card
// with the hits made; the brake's two cards are checked apart in
// verify-shop-floor-sf3.mjs.) No page errors, no .cad-error.
//   CAD_VERIFY_URL=http://localhost:5192/sketch node scripts/verify-shop-floor-sf4.mjs
// Screenshots: artifacts/sketch-cad/shop-floor-sf4 (or SF4_SHOTS), at 1600 × 1000 and 1366 × 768.
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { cadSteps } from './sketch-cad-steps.mjs';

const directory = process.env.SF4_SHOTS || 'artifacts/sketch-cad/shop-floor-sf4';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [],
  checks = [],
  measured = {};
page.on('pageerror', (e) => errors.push(e.message));
const { properties, savedWhen, saved, route, shopMore, shopStation } = cadSteps(page);
const footer = page.locator('.cad-status');
const modelCurrent = () => expect(footer).toContainText('Model current', { timeout: 90000 });
const station = (name) => route.getByRole('button', { name, exact: true });
const noErrorLine = async (where) =>
  assert.equal(await page.locator('.cad-error').count(), 0, `no error line ${where}`);
const sizes = [
  [1600, 1000],
  [1366, 768],
];
const shots = async (name, each = null) => {
  await page.mouse.move(5, 600);
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(400);
    if (each) await each(width, height);
    await page.screenshot({ path: `${directory}/${name}-${width}.png` });
  }
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.waitForTimeout(300);
};
// RB-3 (docs/sketch-studio-round-bend.md §13.4): + the corner pieces' outline, four blanks and 40 hits (10 each).
const STATIONS = [
  ['Draw', 'Draw', '5 outlines'],
  ['Cut', 'Laser station', '11 blanks'],
  ['Bend', 'Press brake', '64 hits'],
  ['Paint', 'Paint booth', 'RAL 9005, RAL 9003'],
  ['Print', 'Print station', '2 prints'],
];
const routeReadsDone = async (where) => {
  for (const [name, , status] of STATIONS) {
    await expect(station(name)).toHaveAttribute('aria-description', status);
    assert.equal(await station(name).locator('.cad-route-mark.is-done').count(), 1, `${name} done ${where}`);
  }
};
try {
  await page.goto(process.env.CAD_VERIFY_URL || 'http://localhost:5173/sketch');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '3D Model & workshop', exact: true }).click();
  await modelCurrent();

  // 1. Shop → More → Example: kiosk, timed: the click, the model committed,
  //    the worker's rebuild, the model current on screen.
  await page.getByRole('button', { name: 'Shop', exact: true }).click();
  await route.getByRole('button', { name: 'More', exact: true }).click();
  await page.evaluate(() => {
    window.__sf4 = { log: [] };
    const status = document.querySelector('.cad-status');
    new MutationObserver(() => window.__sf4.log.push([performance.now(), status.textContent])).observe(status, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    document.addEventListener(
      'click',
      (event) => {
        if (event.target.closest('button')?.textContent === 'Example: kiosk') window.__sf4.clicked = performance.now();
      },
      true,
    );
  });
  await page.getByRole('group', { name: 'More shop commands' }).getByRole('button', { name: 'Example: kiosk' }).click();
  const model = await savedWhen((m) => m.instances.length === 37, 'the kiosk');
  await modelCurrent();
  await page.waitForFunction(() => document.querySelector('.cad-viewport').cadViewMode().bodies.length === 37, null, {
    timeout: 30000,
  });
  const timing = await page.evaluate(() => {
    const { log, clicked } = window.__sf4;
    const after = log.filter(([t]) => t >= clicked);
    const rebuilding = after.find(([, text]) => /Rebuilding|Building/.test(text));
    const current = after.find(([t, text]) => /Model current/.test(text) && (!rebuilding || t > rebuilding[0]));
    return {
      clickToRebuildingMs: rebuilding ? Math.round(rebuilding[0] - clicked) : null,
      rebuildMs: rebuilding && current ? Math.round(current[0] - rebuilding[0]) : null,
      clickToCurrentMs: current ? Math.round(current[0] - clicked) : null,
    };
  });
  measured.load = timing;
  assert(timing.clickToCurrentMs != null, 'the status went to Model current after the click');
  checks.push(`loaded: ${JSON.stringify(timing)}`);
  assert.equal(model.parts.length, 8);
  assert.deepEqual(
    [model.finishes.length, model.prints.length, model.connections.length, model.groups.length],
    [11, 2, 24, 2],
  );
  assert.equal(model.welds, undefined, 'no seam records');
  assert.equal(model.assembly, undefined, 'no assembly steps');
  await routeReadsDone('after loading');
  await expect(route).toContainText('Kiosk');
  await noErrorLine('after loading');
  await page.getByRole('button', { name: 'Fit', exact: true }).click();
  await page.waitForTimeout(600);
  await shots('01-kiosk-loaded');

  // 2. The job sheet: every step done.
  await shopMore('Job sheet');
  const job = properties.getByRole('region', { name: 'Job sheet' }).getByRole('article', { name: 'Product Kiosk' });
  await expect(job.getByLabel('Route status', { exact: true })).toHaveText('All steps done');
  for (const step of ['Cut', 'Bend', 'Paint', 'Print'])
    await expect(job.getByLabel(`${step} status`, { exact: true })).toHaveText('Done');
  await expect(job.getByLabel('Kiosk not made here', { exact: true })).toHaveText(
    'Not made here (not timed): 2 × Display (bought in), 16 × M4 × 12 pan head, 8 × M4 hex nut',
  );
  measured.jobTimes = Object.fromEntries(
    await Promise.all(
      ['Cut', 'Bend', 'Paint', 'Print'].map(async (s) => [
        s,
        await job.getByLabel(`${s} time`, { exact: true }).innerText(),
      ]),
    ),
  );
  await shots('02-job-sheet');
  checks.push(`job sheet: All steps done; times ${JSON.stringify(measured.jobTimes)}`);

  // 3. Each station opens on it with no error line.
  // Draw.
  await shopStation('Draw');
  await expect(properties.getByRole('region', { name: 'Draw' })).toBeVisible();
  await noErrorLine('at Draw');
  await shots('03-draw');
  // Cut: which part? The front face frame → the laser bed with its blank on the sheet.
  await shopStation('Cut');
  const laser = properties.getByRole('region', { name: 'Laser station' });
  await expect(laser).toBeVisible();
  const pickFront = async (region) => {
    const choice = region.getByRole('button', { name: /^Front face frame/ });
    if (await choice.count()) await choice.first().click();
  };
  await pickFront(laser);
  const bed = page.getByRole('figure', { name: 'Laser bed' });
  await expect(bed).toBeVisible();
  await expect(bed).toHaveAttribute('data-state', /ready|cut/);
  await noErrorLine('at the laser');
  measured.laser = await laser.innerText().then((t) => t.split('\n').slice(0, 6).join(' · '));
  await shots('04-cut-laser');
  // Bend: the front face frame on the press brake.
  await shopStation('Bend');
  const brake = properties.getByRole('region', { name: 'Press brake' });
  await expect(brake).toBeVisible();
  await pickFront(brake);
  await expect(brake.getByRole('list', { name: 'Hits made' })).toBeVisible();
  await expect(brake.getByRole('list', { name: 'Hits made' }).getByRole('listitem')).toHaveCount(4);
  await expect(brake.getByRole('list', { name: 'Hits made' })).toContainText('1 · UP 90° R1.6 · 2 flanges');
  await expect(brake.getByRole('list', { name: 'Hits made' })).toContainText('4 · DOWN 15° R1.6');
  measured.brake = await brake.innerText().then((t) => t.replace(/\s+/g, ' ').slice(0, 400));
  await noErrorLine('at the press brake');
  await shots('05-bend');
  // Paint.
  await shopStation('Paint');
  await expect(properties.getByRole('region', { name: 'Paint booth' })).toBeVisible();
  await noErrorLine('at the paint booth');
  await shots('07-paint');
  // Print.
  await shopStation('Print');
  await expect(properties.getByRole('region', { name: 'Print station' })).toBeVisible();
  await noErrorLine('at the print station');
  await shots('08-print');
  // The parts put together: the Assemble tab's Interference (the kernel's inspect), no clash, fasteners included.
  await properties
    .getByRole('region', { name: 'Print station' })
    .getByRole('button', { name: 'Leave print station', exact: true })
    .click();
  await page
    .getByRole('navigation', { name: 'Modeling ribbon' })
    .getByRole('button', { name: 'Assemble', exact: true })
    .click();
  await page.locator('.cad-ribbon').getByRole('button', { name: 'Interference', exact: true }).click();
  await expect(properties.getByText('No solid intersections detected.', { exact: true })).toBeVisible({
    timeout: 120000,
  });
  await noErrorLine('after Interference');
  checks.push('Interference (Assemble tab): no solid intersections between the kiosk parts and fasteners');

  // 4. The finished kiosk, painted and put together, framed.
  await page.getByLabel('Standard view').selectOption('isometric');
  await page.getByRole('button', { name: 'Fit', exact: true }).click();
  await page.waitForTimeout(800);
  await shots('12-kiosk-finished');

  // 5. Reload: the same model, the same route.
  await page.waitForTimeout(1200);
  const kept = await saved();
  await page.reload();
  const workshop = page.getByRole('button', { name: '3D Model & workshop', exact: true });
  if (await workshop.isVisible().catch(() => false)) await workshop.click();
  await modelCurrent();
  const after = await savedWhen((m) => m.instances.length === 37, 'after reload');
  for (const key of ['parts', 'instances', 'finishes', 'prints', 'groups', 'connections', 'sketches'])
    assert.deepEqual(after[key], kept[key], `${key} unchanged by the reload`);
  // One product: it is the route's subject without a click (§4.1).
  await page.getByRole('button', { name: 'Shop', exact: true }).click();
  await routeReadsDone('after reload');
  await noErrorLine('after reload');
  checks.push('reload: the same parts, instances, records, groups and connections; the route still done');
  assert.deepEqual(errors, [], 'no page errors');
  await writeFile(`${directory}/report.json`, JSON.stringify({ checks, measured }, null, 2));
  console.log(JSON.stringify({ checks, measured }, null, 2));
  console.log('verify-shop-floor-sf4: PASS');
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` }).catch(() => {});
  console.error(JSON.stringify({ checks, measured, errors }, null, 2));
  console.error('verify-shop-floor-sf4: FAIL', error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
