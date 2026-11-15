/* global localStorage, process, console, document, window, MutationObserver, performance */
// Round bends RB-3 (docs/sketch-studio-round-bend.md §13.4 – §13.5): a fresh
// model → Shop → More → Example: kiosk (timed) → the saved model holds the
// corner piece part, four instances in the "Kiosk frame" group (set in the
// round corners, no seams since docs/sketch-studio-shop-trim.md), its one
// round bend (UP 90° R28.5, 10 bump hits) → Bend on
// each corner piece: the finished card lists "1 · UP 90° R28.5 · 10 hits" →
// Watch the bends on the front right one plays its ten hits on the press brake
// → close-up screenshots of that top corner in the 3D view (isometric and from
// the front). No page errors.
//   CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-round-bend-rb3.mjs
// Screenshots: artifacts/sketch-cad/round-bend-rb3 (or RB3_SHOTS).
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { cadSteps } from './sketch-cad-steps.mjs';

const directory = process.env.RB3_SHOTS || 'artifacts/sketch-cad/round-bend-rb3';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [],
  checks = [],
  measured = {};
page.on('pageerror', (e) => errors.push(e.message));
const { properties, savedWhen, route, shopMore, shopStation } = cadSteps(page);
const footer = page.locator('.cad-status');
const modelCurrent = () => expect(footer).toContainText('Model current', { timeout: 90000 });
const shot = (name) => page.screenshot({ path: `${directory}/${name}.png` });
const film = () => page.evaluate(() => document.querySelector('.cad-workspace').cadFilm());
const shop = () => page.evaluate(() => document.querySelector('.cad-viewport').cadShop());
const camera = () => page.evaluate(() => document.querySelector('.cad-viewport').cadCamera());
const project = (p) => page.evaluate((q) => document.querySelector('.cad-viewport').cadProject(q), p);
const canvas = page.locator('.cad-viewport canvas');
const seeThrough = page.getByRole('group', { name: 'See-through mode' });
const CORNERS = [
  'Front left corner piece',
  'Front right corner piece',
  'Rear left corner piece',
  'Rear right corner piece',
];

// Bring a world point to the middle of the 3D view (right-drag pans) and zoom in on it (the wheel).
const closeUp = async (point, notches) => {
  const box = await canvas.boundingBox();
  const centre = [box.x + box.width / 2, box.y + box.height / 2];
  const pan = async () => {
    // cadProject: client px.
    const from = await project(point);
    await page.mouse.move(from[0], from[1]);
    await page.mouse.down({ button: 'right' });
    for (let i = 1; i <= 10; i++)
      await page.mouse.move(from[0] + ((centre[0] - from[0]) * i) / 10, from[1] + ((centre[1] - from[1]) * i) / 10);
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(150);
  };
  await pan();
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
  await page.goto(process.env.CAD_VERIFY_URL || 'http://localhost:5180/sketch');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '3D Model & workshop', exact: true }).click();
  await modelCurrent();

  // 1. Shop → More → Example: kiosk, timed from the click to Model current.
  await page.evaluate(() => {
    window.__rb3 = { log: [] };
    const status = document.querySelector('.cad-status');
    new MutationObserver(() => window.__rb3.log.push([performance.now(), status.textContent])).observe(status, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    document.addEventListener(
      'click',
      (event) => {
        if (event.target.closest('button')?.textContent === 'Example: kiosk') window.__rb3.clicked = performance.now();
      },
      true,
    );
  });
  await shopMore('Example: kiosk');
  const model = await savedWhen((m) => m.instances.length === 37, 'the kiosk with its four corner pieces');
  await modelCurrent();
  await page.waitForFunction(() => document.querySelector('.cad-viewport').cadViewMode().bodies.length === 37, null, {
    timeout: 30000,
  });
  measured.load = await page.evaluate(() => {
    const { log, clicked } = window.__rb3;
    const after = log.filter(([t]) => t >= clicked);
    const rebuilding = after.find(([, text]) => /Rebuilding|Building/.test(text));
    const current = after.find(([t, text]) => /Model current/.test(text) && (!rebuilding || t > rebuilding[0]));
    return {
      clickToRebuildingMs: rebuilding ? Math.round(rebuilding[0] - clicked) : null,
      rebuildMs: rebuilding && current ? Math.round(current[0] - rebuilding[0]) : null,
      clickToCurrentMs: current ? Math.round(current[0] - clicked) : null,
    };
  });
  assert(measured.load.clickToCurrentMs != null, 'the status went to Model current after the click');
  // The saved model: one corner piece part, four instances in the frame group, one round bend.
  const part = model.parts.find((p) => p.name === 'Kiosk corner piece — sheet metal');
  assert(part, 'the corner piece part');
  const instances = model.instances.filter((i) => i.partId === part.id);
  assert.deepEqual(
    instances.map((i) => i.name),
    CORNERS,
  );
  const frame = model.groups.find((g) => g.name === 'Kiosk frame');
  assert(
    instances.every((i) => i.groupId === frame.id),
    'the corner pieces are in the Kiosk frame group',
  );
  assert.equal(frame.weldment, undefined, 'an ordinary group');
  const [bend] = part.features[0].bends;
  assert.equal(part.features[0].bends.length, 1);
  assert.deepEqual(
    [bend.angle, bend.direction, bend.radius, bend.steps, bend.punch, bend.die],
    [90, 'up', 28.5, 10, 'straight-88', 'v10-88'],
    JSON.stringify(bend),
  );
  assert.equal(model.welds, undefined, 'no seam records');
  assert(
    instances.every((i) => model.finishes.some((f) => f.instanceId === i.id && f.name === 'RAL 9005 Jet black')),
    'the corner pieces are powder-coated with the frame',
  );
  await expect(route.getByRole('button', { name: 'Bend', exact: true })).toHaveAttribute('aria-description', '64 hits');
  await expect(route.getByRole('button', { name: 'Weld', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Fit', exact: true }).click();
  await page.waitForTimeout(600);
  await shot('01-kiosk-loaded');
  checks.push(
    `Example: kiosk loaded (${JSON.stringify(measured.load)}): 37 instances, the corner piece ×4 in the "Kiosk frame" group, bend UP 90° R28.5 · 10 hits (V10), no seams, painted with the frame; route Bend "64 hits"`,
  );

  // 2. Bend on each corner piece: the finished card lists its one round bend.
  const brake = properties.getByRole('region', { name: 'Press brake' });
  // The part chosen on the job board (the route's subject), then Bend; or picked from Bend's own list.
  const board = page.getByRole('region', { name: 'Job board' });
  const open = async (name) => {
    await board
      .getByRole('button', { name: new RegExp(`^${name}`) })
      .first()
      .click();
    await shopStation('Bend');
    const choose = brake.getByRole('list', { name: 'Choose a part' });
    if (await choose.count()) await choose.getByRole('button', { name: new RegExp(`^${name}`) }).click();
    await expect(brake).toContainText(name);
    await expect(brake.getByRole('status', { name: 'Finished here' })).toBeVisible();
  };
  for (const name of CORNERS) {
    await open(name);
    const made = brake.getByRole('list', { name: 'Hits made' }).getByRole('listitem');
    await expect(made).toHaveCount(1);
    await expect(made.first()).toContainText('1 · UP 90° R28.5 · 10 hits');
    assert.equal(await brake.getByRole('alert').count(), 0, `${name}: the finished card is not a refusal`);
    if (name === CORNERS[1]) {
      measured.card = (await brake.getByRole('status', { name: 'Finished here' }).innerText()).trim();
      await page.waitForTimeout(300);
      await shot('02-bend-corner-piece-card');
    }
    await brake.getByRole('button', { name: 'Cancel', exact: true }).click();
  }
  checks.push(`Bend on each of the four corner pieces: "1 · UP 90° R28.5 · 10 hits" ("${measured.card}")`);

  // 3. Watch the bends on the front right one: the ten hits on the press brake.
  await open(CORNERS[1]);
  const panel = properties.getByRole('region', { name: 'Replay' });
  const startedAt = Date.now();
  await brake.getByRole('button', { name: 'Watch the bends', exact: true }).click();
  await expect(panel.getByRole('heading', { name: '▶ · Watch the bends' })).toBeVisible();
  await expect(panel.getByRole('list', { name: 'Replay steps' }).getByRole('button')).toHaveCount(1);
  // Mid-bump: a later hit in the die.
  await page.waitForFunction(
    () => {
      const s = document.querySelector('.cad-viewport').cadShop().station;
      return s?.stroking && s.hits === 10 && s.hit >= 5;
    },
    null,
    { timeout: 20000, polling: 'raf' },
  );
  const mid = (await shop()).station;
  measured.midBump = { hit: mid.hit, hits: mid.hits, angle: Number(mid.angle?.toFixed?.(1) ?? mid.angle) };
  await page.locator('.cad-viewport').screenshot({ path: `${directory}/03-watch-the-bends-mid-bump.png` });
  const hitsSeen = new Set();
  for (let i = 0; i < 200; i++) {
    const s = (await shop()).station;
    if (s?.hit) hitsSeen.add(s.hit);
    const f = await film();
    if (f.stage === 'ended') break;
    await page.waitForTimeout(50);
  }
  measured.watch = {
    seconds: (await film()).seconds,
    wallSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
  };
  assert.equal((await film()).stage, 'ended', 'Watch the bends plays to its end');
  assert(Math.max(...hitsSeen) === 10, `every hit played (${[...hitsSeen].sort((a, b) => a - b).join(', ')})`);
  await page.waitForTimeout(300);
  await shot('04-watch-the-bends-done');
  await panel.getByRole('button', { name: 'Back to the press brake', exact: true }).click();
  await expect(brake.getByRole('status', { name: 'Finished here' })).toBeVisible();
  await brake.getByRole('button', { name: 'Cancel', exact: true }).click();
  checks.push(
    `Watch the bends (front right corner piece): one step, hit ${measured.midBump.hit} of ${measured.midBump.hits} seen mid-bump, hits seen ${[...hitsSeen].sort((a, b) => a - b).join(',')}; film ${measured.watch.seconds} s, played in ${measured.watch.wallSeconds} s; back to the card`,
  );

  // 4. Close-ups of the front right top corner in the 3D view, nothing selected.
  // The arc's middle on the outside: centre (610, 1670) in X, Z, R30, half way up the 40 mm strip.
  await modelCurrent();
  const view = await canvas.boundingBox();
  await page.mouse.move(view.x + view.width - 30, view.y + view.height - 60);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.mouse.click(view.x + view.width - 30, view.y + view.height - 60);
  await page.waitForTimeout(300);
  const arc = [610 + 30 * Math.SQRT1_2, -35, 1670 + 30 * Math.SQRT1_2];
  const shown = {};
  for (const [standard, name] of [
    ['isometric', '05-corner-close-up-isometric'],
    ['front', '06-corner-close-up-front'],
  ]) {
    await page.getByLabel('Standard view').selectOption(standard);
    await page.getByRole('button', { name: 'Fit', exact: true }).click();
    await page.waitForTimeout(500);
    await closeUp(arc, standard === 'isometric' ? 21 : 15);
    const after = await camera();
    // The corner in the middle of the view.
    const at = await project(arc);
    shown[standard] = {
      target: after.target.map((v) => Math.round(v)),
      cornerFromCentre: [Math.round(at[0] - (view.x + view.width / 2)), Math.round(at[1] - (view.y + view.height / 2))],
    };
    assert(
      Math.hypot(...shown[standard].cornerFromCentre) < 60,
      `${standard}: the corner in the middle of the view (${shown[standard].cornerFromCentre})`,
    );
    await page.locator('.cad-viewport').screenshot({ path: `${directory}/${name}.png` });
    if (standard === 'isometric') {
      // The same, seen through (X-ray): the corner piece's legs on the flange ends, its inside on the face.
      await seeThrough.getByRole('button', { name: 'X-ray', exact: true }).click();
      await page.waitForTimeout(600);
      await page.locator('.cad-viewport').screenshot({ path: `${directory}/07-corner-close-up-xray.png` });
      await seeThrough.getByRole('button', { name: 'Solid', exact: true }).click();
      await page.waitForTimeout(300);
    }
  }
  measured.closeUps = shown;
  checks.push(`close-ups of the front right top corner (isometric, front, X-ray): ${JSON.stringify(shown)}`);
  assert.equal(await page.locator('.cad-error').count(), 0, 'no error line');

  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ status: 'passed', errors, checks, measured }, null, 2),
  );
  console.log('Round bend RB-3 verification passed:\n- ' + checks.join('\n- '));
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` });
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}
