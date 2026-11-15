/* global localStorage, process, console, document, performance, window, requestAnimationFrame */
// Shop floor SF-5 (docs/sketch-studio-shop-floor.md §8): Replay the build.
// From an empty workspace: Replay is off and says why → Shop → More →
// Example: kiosk → Replay plays the whole route at normal speed (the laser
// bed's cuts, every hit on the press brake, the powder, the prints, the
// finished kiosk with its displays and fasteners — no seams or assembly steps
// since docs/sketch-studio-shop-trim.md), measured frame by frame;
// one frame of each station's part of the film and the controls are shot at
// 1600 × 1000 and 1366 × 768, and no control runs past its container at
// either size → Esc: the model, the camera and the panel are as they were, no
// commit and no kernel build happened → Example: control box → Replay,
// paused, stepped with Next step to the end (Previous, a row of the step
// list, the speeds), played out, End replay on the route → the same checks →
// the press brake on its finished body: Watch the bends, back to the card →
// a station open (the paint booth) comes back after a replay. No page
// errors, no .cad-error.
//   CAD_VERIFY_URL=http://localhost:5193/sketch node scripts/verify-shop-floor-sf5.mjs
// Screenshots: artifacts/sketch-cad/shop-floor-sf5 (or SF5_SHOTS).
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { cadSteps } from './sketch-cad-steps.mjs';

const directory = process.env.SF5_SHOTS || 'artifacts/sketch-cad/shop-floor-sf5';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [],
  checks = [],
  measured = {};
page.on('pageerror', (e) => errors.push(e.message));
const { properties, saved, savedWhen, route, shopMore, shopStation } = cadSteps(page);
const footer = page.locator('.cad-status');
const modelCurrent = () => expect(footer).toContainText('Model current', { timeout: 90000 });
const film = () => page.evaluate(() => document.querySelector('.cad-workspace').cadFilm());
const camera = () => page.evaluate(() => document.querySelector('.cad-viewport').cadCamera());
const shop = () => page.evaluate(() => document.querySelector('.cad-viewport').cadShop());
const panel = properties.getByRole('region', { name: 'Replay' });
const steps = panel.getByRole('list', { name: 'Replay steps' });
const controls = panel.getByRole('group', { name: 'Replay controls' });
const noErrorLine = async (where) =>
  assert.equal(await page.locator('.cad-error').count(), 0, `no error line ${where}`);
const sizes = [
  [1600, 1000],
  [1366, 768],
];
// Every control of the replay (its panel, the caption over the view, the
// route's Replay button) inside its container: the panel or its card, the
// model view, the route bar on screen.
const clipped = () =>
  page.evaluate(() => {
    const out = [];
    const check = (el, container) => {
      if (!el.getClientRects().length) return;
      const box = el.getBoundingClientRect(),
        room = container.getBoundingClientRect();
      if (
        box.right > room.right + 0.5 ||
        box.left < room.left - 0.5 ||
        el.scrollWidth > el.clientWidth + 1 ||
        box.right > window.innerWidth + 0.5
      )
        out.push((el.getAttribute('aria-label') || el.textContent).trim().slice(0, 50));
    };
    const region = document.querySelector('[aria-label="Replay"]');
    if (region)
      for (const el of region.querySelectorAll('button, select, input, .cad-film-now, .cad-film-progress'))
        check(el, el.closest('.cad-film-now, .cad-film-controls, .cad-segmented') || region);
    const caption = document.querySelector('.cad-film-caption');
    if (caption) check(caption, document.querySelector('.cad-model-view'));
    const replay = document.querySelector('.cad-route-replay');
    if (replay) check(replay, document.querySelector('.cad-ribbon'));
    return out;
  });
const shots = async (name, each = null) => {
  await page.mouse.move(5, 600);
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(450);
    if (each) await each(width, height);
    await page.screenshot({ path: `${directory}/${name}-${width}.png` });
  }
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.waitForTimeout(300);
};
const unclipped = async (where) => {
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(350);
    assert.deepEqual(await clipped(), [], `no replay control overflows at ${width} × ${height} (${where})`);
  }
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.waitForTimeout(250);
};
// The frame sampler: the interval between animation frames while it is on.
const sampler = (on) =>
  page.evaluate((state) => {
    const s = (window.__sf5 ||= { deltas: [], long: [], last: 0, on: false, started: false });
    s.on = state;
    s.last = 0;
    if (!s.started) {
      s.started = true;
      const loop = (now) => {
        if (s.on && s.last) {
          const d = now - s.last;
          s.deltas.push(d);
          if (d > 25) {
            const f = document.querySelector('.cad-workspace').cadFilm();
            s.long.push({ ms: Math.round(d * 10) / 10, scene: f.index, station: f.scene?.station || null });
          }
        }
        s.last = now;
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
  }, on);
const sameCamera = (a, b, where) => {
  for (const key of ['position', 'target'])
    a[key].forEach((v, i) => assert(Math.abs(v - b[key][i]) < 1e-6, `${where}: camera ${key} back as it was`));
  assert.equal(a.span, b.span, `${where}: camera span back as it was`);
};
// Before / after a film: the model as saved, the camera, no commit, no build.
const state = async () => ({ model: await saved(), camera: await camera(), film: await film() });
const unchanged = async (before, where) => {
  await page.waitForTimeout(1500);
  const after = await state();
  assert.deepEqual(after.model, before.model, `${where}: the model is identical`);
  sameCamera(after.camera, before.camera, where);
  assert.equal(after.film.commits, before.film.commits, `${where}: no commit`);
  assert.equal(after.film.builds, before.film.builds, `${where}: no kernel build`);
  assert.equal(after.film.open, false, `${where}: the film is closed`);
  await expect(footer).toContainText('Model current');
  return { commits: after.film.commits, builds: after.film.builds };
};

try {
  await page.goto(process.env.CAD_VERIFY_URL || 'http://localhost:5173/sketch');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '3D Model & workshop', exact: true }).click();
  await modelCurrent();

  // 1. An empty workspace: Replay is off and says what is missing.
  await page.getByRole('button', { name: 'Shop', exact: true }).click();
  const replay = route.getByRole('button', { name: 'Replay', exact: true });
  await expect(replay).toBeDisabled();
  await expect(replay).toHaveAttribute('title', 'Nothing to replay yet: draw and cut a part first.');
  checks.push('empty workspace: Replay off — "Nothing to replay yet: draw and cut a part first."');

  // 2. The kiosk, played at normal speed from the route bar.
  await shopMore('Example: kiosk');
  // RB-3 (docs/sketch-studio-round-bend.md §13.4): 33 + the four corner pieces.
  await savedWhen((m) => m.instances.length === 37, 'the kiosk');
  await modelCurrent();
  await page.waitForFunction(() => document.querySelector('.cad-viewport').cadViewMode().bodies.length === 37, null, {
    timeout: 30000,
  });
  await page.getByRole('button', { name: 'Fit', exact: true }).click();
  await page.waitForTimeout(800);
  const kioskBefore = await state();
  await expect(replay).toBeEnabled();
  await sampler(true);
  const started = Date.now();
  let paused = 0;
  await replay.click();
  await expect(panel).toBeVisible();
  let f = await film();
  // RB-3: + the corner pieces' blank and their round bend. Shop trim: 25 scenes (36 with the weld and assembly ones).
  assert.equal(f.count, 25, 'the kiosk film has 25 scenes');
  measured.kiosk = { scenes: f.count, seconds: f.seconds, stations: {} };
  for (const s of f.scenes) measured.kiosk.stations[s.station] = (measured.kiosk.stations[s.station] || 0) + 1;
  // Read-only while it plays: the stations wait, only End replay is live.
  for (const name of ['Draw', 'Cut', 'Bend', 'Paint', 'Print'])
    await expect(route.getByRole('button', { name, exact: true })).toBeDisabled();
  await expect(route.getByRole('button', { name: 'End replay', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  await expect(footer).toContainText('Replay — playing');
  // One frame of each station's part of the film (paused there, shot at both sizes).
  const order = ['cut', 'bend', 'paint', 'print', 'finished'];
  let shot = 0;
  for (;;) {
    f = await film();
    if (f.stage === 'ended') break;
    const station = f.scene.station;
    if (order.indexOf(station) >= shot) {
      shot = order.indexOf(station) + 1;
      // Into the scene: the machine moving, the colour on (a hit a third of the way in: mid-stroke).
      const into = { cut: 0.5, bend: 0.3, paint: 0.6, print: 0.6, finished: 0.2 }[station];
      await page
        .waitForFunction(
          ([i, part]) => {
            const g = document.querySelector('.cad-workspace').cadFilm();
            return g.index !== i || g.stage !== 'playing' || g.elapsed >= part * g.scene.seconds * 1000;
          },
          [f.index, into],
          { timeout: 10000, polling: 20 },
        )
        .catch(() => {});
      await sampler(false);
      const pausedAt = Date.now();
      if ((await film()).stage === 'playing') await panel.getByRole('button', { name: 'Pause', exact: true }).click();
      await expect(footer).toContainText(/Replay — (paused|finished)/);
      const g = await film();
      await shots(`${String(shot).padStart(2, '0')}-kiosk-${g.scene.station}`);
      await unclipped(`kiosk ${g.scene.station}`);
      if (g.scene.station === 'bend') {
        const brake = await shop();
        assert(brake.station, 'a hit shows the press brake');
        assert.equal(brake.station.stroking, true, 'the hit is mid-stroke while paused');
      }
      if (g.stage === 'paused') await panel.getByRole('button', { name: 'Play', exact: true }).click();
      paused += Date.now() - pausedAt;
      await sampler(true);
    }
    await page.waitForTimeout(80);
  }
  await sampler(false);
  measured.kiosk.wallSeconds = Math.round(((Date.now() - started - paused) / 1000) * 10) / 10;
  measured.kiosk.frames = await page.evaluate(() => {
    const d = window.__sf5.deltas;
    const sorted = [...d].sort((a, b) => a - b);
    const result = {
      frames: d.length,
      meanMs: Number((d.reduce((a, b) => a + b, 0) / d.length).toFixed(2)),
      p99Ms: Number(sorted[Math.floor(d.length * 0.99)].toFixed(2)),
      worstMs: Number(sorted.at(-1).toFixed(1)),
      over34Ms: d.filter((x) => x > 34).length,
      long: window.__sf5.long,
    };
    window.__sf5.deltas = [];
    window.__sf5.long = [];
    return result;
  });
  f = await film();
  assert.equal(f.stage, 'ended', 'the kiosk film waits on the finished product');
  assert.equal(f.scene.station, 'finished');
  assert.deepEqual(f.hidden, [], 'the finished kiosk: every part in the view');
  assert.deepEqual([f.finishes, f.prints], [11, 2], 'every record back on the finished kiosk');
  await shots('08-kiosk-finished-controls', async () => {
    await panel.getByRole('heading', { name: 'Steps' }).scrollIntoViewIfNeeded();
  });
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  const kioskAfter = await unchanged(kioskBefore, 'after the kiosk film');
  checks.push(
    `kiosk: ${measured.kiosk.scenes} scenes, ${measured.kiosk.seconds} s at 1× (played in ${measured.kiosk.wallSeconds} s); frames mean ${measured.kiosk.frames.meanMs} ms, worst ${measured.kiosk.frames.worstMs} ms; model identical, camera back, ${kioskAfter.commits} commits and ${kioskAfter.builds} builds before and after`,
  );

  // 3. The control box: stepped with Next step to the end, then played out.
  await shopMore('Example: control box');
  // Examples are appended: the kiosk stays, the control box is the new product (selected).
  await savedWhen((m) => m.instances.length === 39, 'the control box');
  await modelCurrent();
  await page.waitForTimeout(800);
  const boxBefore = await state();
  await replay.click();
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Pause', exact: true }).click();
  f = await film();
  // Shop trim: 12 scenes (14 with its weld and assembly scenes).
  assert.equal(f.count, 12, 'the control box film has 12 scenes');
  measured.box = { scenes: f.count, seconds: f.seconds, titles: f.scenes.map((s) => `${s.station}: ${s.title}`) };
  const next = controls.getByRole('button', { name: /Next step/ });
  const seen = [];
  for (let i = 1; i < f.count; i++) {
    await next.click();
    await page.waitForFunction((k) => document.querySelector('.cad-workspace').cadFilm().index === k, i);
    const g = await film();
    assert.equal(g.stage, 'paused', 'stepping keeps the film paused');
    if (!seen.includes(g.scene.station)) {
      seen.push(g.scene.station);
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${directory}/${String(19 + seen.length)}-box-${g.scene.station}-1600.png` });
    }
  }
  await expect(next).toBeDisabled();
  // Previous, a row of the step list, the speeds.
  await controls.getByRole('button', { name: /Previous step/ }).click();
  await page.waitForFunction((k) => document.querySelector('.cad-workspace').cadFilm().index === k, f.count - 2);
  await steps.getByRole('button', { name: 'Bend one end flange up 90°', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.cad-workspace').cadFilm().index === 2);
  await expect(steps.getByRole('button', { name: 'Bend one end flange up 90°', exact: true })).toHaveAttribute(
    'aria-current',
    'step',
  );
  const speed = panel.getByRole('group', { name: 'Replay speed' });
  await speed.getByRole('button', { name: '4×', exact: true }).click();
  assert.equal((await film()).speed, 4, 'the speed is 4×');
  await panel.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.cad-workspace').cadFilm().stage === 'ended', null, {
    timeout: 30000,
  });
  await speed.getByRole('button', { name: '1×', exact: true }).click();
  await route.getByRole('button', { name: 'End replay', exact: true }).click();
  await expect(panel).toHaveCount(0);
  const boxAfter = await unchanged(boxBefore, 'after the control box film');
  checks.push(
    `control box: ${measured.box.scenes} scenes, ${measured.box.seconds} s at 1×; stepped to the end, Previous, a step row, 4× to the end; End replay on the route; model identical, camera back, ${boxAfter.commits} commits and ${boxAfter.builds} builds before and after`,
  );

  // 4. The press brake on the finished body: Watch the bends, then back to the card.
  await shopStation('Bend');
  const gate = properties.getByRole('region', { name: 'Press brake' });
  await gate
    .getByRole('list', { name: 'Choose a part' })
    .getByRole('button', { name: /^Control box body/ })
    .click();
  const card = properties.getByRole('region', { name: 'Press brake' });
  await expect(card.getByRole('status', { name: 'Finished here' })).toContainText(
    'Bending is done on this part: 4 hits made.',
  );
  assert.equal(await card.getByRole('alert').count(), 0, 'the finished card is not a refusal');
  await expect(card.getByRole('button', { name: /^Remove .* and bend$/ })).toBeVisible();
  await shots('14-bend-finished-here');
  const cardBefore = await state();
  await card.getByRole('button', { name: 'Watch the bends', exact: true }).click();
  await expect(panel.getByRole('heading', { name: '▶ · Watch the bends' })).toBeVisible();
  await expect(steps.getByRole('button')).toHaveCount(4);
  await page.waitForTimeout(1200);
  await shots('15-watch-the-bends');
  await panel.getByRole('button', { name: 'Back to the press brake', exact: true }).click();
  await expect(
    properties.getByRole('region', { name: 'Press brake' }).getByRole('status', { name: 'Finished here' }),
  ).toBeVisible();
  await unchanged(cardBefore, 'after Watch the bends');
  checks.push(
    'control box body on the press brake: "Finished here" (no alert), Watch the bends plays its 4 hits, back to the card',
  );

  // 5. A station open before the replay comes back after it.
  await shopStation('Paint');
  await expect(properties.getByRole('region', { name: 'Paint booth' })).toBeVisible();
  await replay.click();
  await expect(panel).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(properties.getByRole('region', { name: 'Paint booth' })).toBeVisible();
  await noErrorLine('after a replay from the paint booth');
  checks.push('the paint booth, open before a replay, is back after Esc');

  assert.deepEqual(errors, [], 'no page errors');
  await writeFile(`${directory}/report.json`, JSON.stringify({ checks, measured }, null, 2));
  console.log(JSON.stringify({ checks, measured }, null, 2));
  console.log('verify-shop-floor-sf5: PASS');
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` }).catch(() => {});
  console.error(JSON.stringify({ checks, measured, errors }, null, 2));
  console.error('verify-shop-floor-sf5: FAIL', error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
