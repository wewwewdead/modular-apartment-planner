/* global process, console, document, window, performance, requestAnimationFrame, setTimeout, PointerEvent, Event, HTMLAnchorElement, HTMLSelectElement */
// The presentation-visuals guard (docs/floorplan-presentation-visuals.md §7).
// The plan canvas defaults to the rendered presentation style and toggles back
// to the drafting line drawing; the 3D preview's View presets frame the model,
// the four elevations are true orthographic views, Save image produces a real
// picture, and the sheet axonometric renders in the realistic style.
//   FLOORPLAN_VERIFY_URL=http://localhost:5199/playground node scripts/verify-presentation-visuals.mjs
// WebGL runs on the GPU through ANGLE by default; set FLOORPLAN_VERIFY_GL=swiftshader
// to force the software rasteriser (slow: allow several minutes).
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const directory = 'artifacts/floorplan/presentation-visuals';
await mkdir(directory, { recursive: true });
const baseUrl = process.env.FLOORPLAN_VERIFY_URL || 'http://localhost:5199/playground';
const url = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}renderProfile=1`;
const software = process.env.FLOORPLAN_VERIFY_GL === 'swiftshader';
const CANVAS = 'svg[class*="_svg"]';
const VIEW_PRESETS = [
  'free',
  'iso_northeast',
  'iso_northwest',
  'iso_southeast',
  'iso_southwest',
  'elevation_front',
  'elevation_rear',
  'elevation_left',
  'elevation_right',
];
// Measured 2026-11-02 before the Furniture popover replaced the seven fixture buttons.
const TOOLBAR_WIDTH_BEFORE = 2631;
const PAN_BUDGET_MS = 2;
const UNION_BUDGET_MS = 3;

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: [
    ...(software
      ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
      : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']),
    // Frames as fast as they can be made, so a pan frame's time is its work,
    // not the wait for the next vsync.
    '--disable-frame-rate-limit',
    '--disable-gpu-vsync',
  ],
});
const errors = [],
  checks = [],
  failures = [],
  metrics = {};
let page = null;

const check = (line, ok, failure = line) => {
  checks.push(`${ok ? 'ok' : 'FAIL'} — ${line}`);
  if (!ok) failures.push(failure);
};

try {
  page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector(CANVAS, { timeout: 30000 });
  await page.waitForTimeout(1200);
  // Downloads are anchors with a data URL: record them instead of saving.
  await page.evaluate(() => {
    window.__savedImages = [];
    const original = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function click() {
      if (this.download) {
        window.__savedImages.push({ name: this.download, href: this.href });
        return;
      }
      original.call(this);
    };
  });
  const savedImage = async (suffix) => {
    for (let i = 0; i < 60; i += 1) {
      const found = await page.evaluate(
        (end) =>
          (window.__savedImages || [])
            .filter((entry) => entry.name.endsWith(end))
            .map((entry) => ({ name: entry.name, prefix: entry.href.slice(0, 22), length: entry.href.length }))[0],
        suffix,
      );
      if (found) return found;
      await page.waitForTimeout(250);
    }
    return null;
  };

  const clickLabel = async (label) => {
    const found = await page.evaluate((l) => {
      const node = document.querySelector(`[aria-label="${l}"]`);
      node?.click();
      return Boolean(node);
    }, label);
    assert(found, `control "${label}" exists`);
    await page.waitForTimeout(450);
  };
  const clickText = async (text) => {
    const found = await page.evaluate((t) => {
      const node = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === t);
      node?.click();
      return Boolean(node);
    }, text);
    assert(found, `button "${text}" exists`);
    await page.waitForTimeout(500);
  };
  const setSelect = (selector, value) =>
    page.evaluate(
      ([s, v]) => {
        const select = typeof s === 'string' ? document.querySelector(s) : null;
        if (!select) return false;
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
        setter.call(select, v);
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      },
      [selector, value],
    );
  const planStyle = () => page.locator(CANVAS).first().getAttribute('data-plan-style');
  const visibleCanvas = () =>
    page.evaluate(() => {
      const svg = document.querySelector('svg[class*="_svg"]');
      const r = svg.getBoundingClientRect();
      const c = svg.parentElement.getBoundingClientRect();
      const left = Math.max(r.left, c.left, 0);
      const top = Math.max(r.top, c.top, 0);
      return {
        x: left,
        y: top,
        width: Math.min(r.right, c.right, window.innerWidth) - left,
        height: Math.min(r.bottom, c.bottom, window.innerHeight) - top,
      };
    });
  // Wheel-zoom until the floor's walls fill `fill` of the visible canvas, then
  // middle-drag them to the centre.
  const fitPlan = async (fill = 0.84) => {
    const view = await visibleCanvas();
    const cx = view.x + view.width / 2;
    const cy = view.y + view.height / 2;
    const planRect = () =>
      page.evaluate(() => {
        const nodes = [...document.querySelectorAll('[data-type="wall"]')];
        const boxes = nodes.map((n) => n.getBoundingClientRect()).filter((b) => b.width || b.height);
        if (!boxes.length) return null;
        const minX = Math.min(...boxes.map((b) => b.left));
        const minY = Math.min(...boxes.map((b) => b.top));
        const maxX = Math.max(...boxes.map((b) => b.right));
        const maxY = Math.max(...boxes.map((b) => b.bottom));
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
      });
    await page.mouse.move(cx, cy);
    for (let i = 0; i < 18; i += 1) {
      const plan = await planRect();
      if (!plan) return;
      const ratio = Math.max(plan.width / view.width, plan.height / view.height);
      if (ratio > fill * 1.1) await page.mouse.wheel(0, 200);
      else if (ratio < fill * 0.82) await page.mouse.wheel(0, -200);
      else break;
      await page.waitForTimeout(160);
    }
    const plan = await planRect();
    const dx = cx - (plan.x + plan.width / 2);
    const dy = cy - (plan.y + plan.height / 2);
    await page.mouse.down({ button: 'middle' });
    for (let s = 1; s <= 5; s += 1) {
      await page.mouse.move(cx + (dx * s) / 5, cy + (dy * s) / 5);
      await page.waitForTimeout(90);
    }
    await page.mouse.up({ button: 'middle' });
    await page.waitForTimeout(400);
  };

  // ── Step 1: rooms, and the presentation default ────────────────────────────
  await clickLabel('Auto-detect Rooms');
  await page.waitForTimeout(400);
  const style1 = await planStyle();
  check(`step 1: canvas plan style on a fresh profile is "${style1}"`, style1 === 'presentation');

  // ── Step 2: zones, unions, hooks, stair labels, filled dimension heads ─────
  const counts = await page.evaluate(() => {
    const canvas = document.querySelector('svg[class*="_svg"]');
    // The Floor panel's CONTENTS readout: a "Walls" label beside a read-only input.
    const panelWalls = [...document.querySelectorAll('label')]
      .find((n) => n.textContent.trim() === 'Walls' && n.parentElement?.querySelector('input'))
      ?.parentElement.querySelector('input').value;
    return {
      zones: canvas.querySelectorAll('[data-zone]').length,
      unions: canvas.querySelectorAll('[data-type="wall-union"]').length,
      walls: canvas.querySelectorAll('[data-type="wall"]').length,
      panelWalls: Number(panelWalls),
      stairLabels: [...canvas.querySelectorAll('[data-stair-label]')].map((n) => n.textContent.trim()),
    };
  });
  check(`step 2: ${counts.zones} [data-zone] room groups`, counts.zones > 0);
  check(`step 2: ${counts.unions} [data-type="wall-union"] paths`, counts.unions === 2);
  check(
    `step 2: ${counts.walls} [data-type="wall"] hooks vs ${counts.panelWalls} walls in the properties panel`,
    counts.walls === counts.panelWalls && counts.walls > 0,
  );
  check(`step 2: stair labels ${JSON.stringify(counts.stairLabels)}`, counts.stairLabels.includes('UP'));

  // One manual dimension (M), across the middle of the canvas.
  const canvasBox = await page.locator(CANVAS).first().boundingBox();
  const at = (fx, fy) => ({ x: canvasBox.x + canvasBox.width * fx, y: canvasBox.y + canvasBox.height * fy });
  const glideClick = async (p) => {
    for (let s = 0; s < 4; s += 1) {
      await page.mouse.move(p.x + (3 - s) * 5, p.y);
      await page.waitForTimeout(90);
    }
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(220);
  };
  await page.mouse.move(at(0.5, 0.5).x, at(0.5, 0.5).y);
  await page.keyboard.press('m');
  await page.waitForTimeout(200);
  await glideClick(at(0.42, 0.62));
  await glideClick(at(0.58, 0.62));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const heads = await page.evaluate(() =>
    [...document.querySelectorAll('svg[class*="_svg"] .annotations polygon')]
      .map((p) => p.getAttribute('fill'))
      .filter((fill) => fill && fill !== 'none'),
  );
  check(`step 2: ${heads.length} filled .annotations arrowhead polygons after one manual dimension`, heads.length >= 2);
  const fonts = await page.evaluate(() =>
    [...document.querySelectorAll('svg[class*="_svg"] .annotations text')].map((t) => t.getAttribute('font-family')),
  );
  check(
    `step 2: annotation text set in ${JSON.stringify([...new Set(fonts)])}`,
    fonts.every((f) => f === 'var(--font-ui)'),
  );

  // ── Step 3: the toggle back to drafting ────────────────────────────────────
  await clickLabel('Presentation style');
  const drafted = await page.evaluate(() => {
    const canvas = document.querySelector('svg[class*="_svg"]');
    return {
      style: canvas.getAttribute('data-plan-style'),
      unions: canvas.querySelectorAll('[data-type="wall-union"]').length,
      zones: canvas.querySelectorAll('[data-zone]').length,
      stairTexts: canvas.querySelectorAll('.stairs text').length,
      walls: canvas.querySelectorAll('[data-type="wall"]').length,
      pressed: document.querySelector('[aria-label="Presentation style"]').getAttribute('aria-pressed'),
    };
  });
  check(
    `step 3: toggled to "${drafted.style}" (aria-pressed ${drafted.pressed}): ${drafted.unions} unions, ${drafted.zones} zones, ${drafted.stairTexts} stair texts, ${drafted.walls} wall hooks`,
    drafted.style === 'drafting' &&
      drafted.pressed === 'false' &&
      drafted.unions === 0 &&
      drafted.zones === 0 &&
      drafted.stairTexts === 0 &&
      drafted.walls === counts.walls,
  );
  const remembered = await page.evaluate(() => window.localStorage.getItem('floorplan.plan.style'));
  check(`step 3: preference stored as "${remembered}"`, remembered === 'drafting');
  await clickLabel('Presentation style');
  check(`step 3: toggled back to "${await planStyle()}"`, (await planStyle()) === 'presentation');

  // Union + card build cost on the playground floor (spec A.7: ≤ 3 ms).
  const build = await page.evaluate(async () => {
    const geo = await import('/src/geometry/planPresentationGeometry.js');
    const recon = await import('/src/domain/roomReconcile.js');
    const demo = (await import('/src/pages/playground-demo.json')).default;
    const floor = recon.reconcileFloorRooms(demo.data.floors[0], {});
    const time = (fn, n = 40) => {
      fn();
      const t0 = performance.now();
      for (let i = 0; i < n; i += 1) fn();
      return (performance.now() - t0) / n;
    };
    const tiers = time(() => geo.buildWallTierRegions(floor.walls, floor.columns || []));
    const card = time(() => geo.buildPlanCardRegion(floor));
    return { walls: floor.walls.length, rooms: floor.rooms.length, tiersMs: tiers, cardMs: card };
  });
  metrics.unionBuild = build;
  check(
    `A.7: wall-tier union ${build.tiersMs.toFixed(2)} ms + card ${build.cardMs.toFixed(2)} ms on ${build.walls} walls / ${build.rooms} rooms`,
    build.tiersMs + build.cardMs <= UNION_BUDGET_MS,
  );

  // Toolbar: the Furniture popover must have shortened it.
  const toolbar = await page.evaluate(() => {
    const grid = document.querySelector('[aria-label="Toggle Grid"]');
    let scroller = grid;
    while (scroller && !(scroller.scrollWidth > scroller.clientWidth + 1)) scroller = scroller.parentElement;
    return {
      scrollWidth: scroller?.scrollWidth ?? null,
      furniture: document.querySelectorAll('[aria-label="Furniture"]').length,
    };
  });
  metrics.toolbar = { before: TOOLBAR_WIDTH_BEFORE, after: toolbar.scrollWidth };
  check(
    `toolbar content width ${TOOLBAR_WIDTH_BEFORE}px before → ${toolbar.scrollWidth}px after, ${toolbar.furniture} Furniture trigger`,
    toolbar.scrollWidth < TOOLBAR_WIDTH_BEFORE && toolbar.furniture === 1,
  );

  // ── Step 4: pan cost in both styles ────────────────────────────────────────
  await clickLabel('Hide Sidebar');
  await clickLabel('Hide Properties');
  await clickLabel('Focus canvas');
  await page.waitForTimeout(2600); // the "Detected N rooms" toast clears
  await fitPlan();
  const pan = async () => {
    const view = await visibleCanvas();
    return page.evaluate(async (rect) => {
      const svg = document.querySelector('svg[class*="_svg"]');
      const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
      const settle = () =>
        new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 0))));
      window.__MAP_RENDER_PROFILE__?.reset?.();
      const x0 = rect.x + rect.width / 2;
      const y0 = rect.y + rect.height / 2;
      const event = (x, y, buttons) => ({
        bubbles: true,
        clientX: x,
        clientY: y,
        button: 1,
        buttons,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
      });
      svg.dispatchEvent(new PointerEvent('pointerdown', event(x0, y0, 4)));
      await settle();
      const samples = [];
      for (let i = 1; i <= 30; i += 1) {
        const t0 = performance.now();
        svg.dispatchEvent(new PointerEvent('pointermove', event(x0 + i * 4, y0 + i * 2, 4)));
        await settle();
        samples.push(performance.now() - t0);
        await frame();
      }
      svg.dispatchEvent(new PointerEvent('pointerup', event(x0 + 120, y0 + 60, 0)));
      window.dispatchEvent(new PointerEvent('pointerup', event(x0 + 120, y0 + 60, 0)));
      await settle();
      // Pan back to where it started, so both styles pan the same picture.
      svg.dispatchEvent(new PointerEvent('pointerdown', event(x0 + 120, y0 + 60, 4)));
      await settle();
      for (let i = 1; i <= 6; i += 1) {
        svg.dispatchEvent(new PointerEvent('pointermove', event(x0 + 120 - i * 20, y0 + 60 - i * 10, 4)));
        await settle();
      }
      svg.dispatchEvent(new PointerEvent('pointerup', event(x0, y0, 0)));
      window.dispatchEvent(new PointerEvent('pointerup', event(x0, y0, 0)));
      await settle();
      const profile = window.__MAP_RENDER_PROFILE__?.snapshot?.() || [];
      const canvasRow = profile.find((row) => row.component === 'SvgCanvas');
      return {
        meanFrameMs: samples.reduce((a, b) => a + b, 0) / samples.length,
        commits: canvasRow?.commits ?? 0,
        meanCommitMs: canvasRow?.avgActualMs ?? null,
      };
    }, view);
  };
  const panResults = { presentation: [], drafting: [] };
  for (let round = 0; round < 3; round += 1) {
    for (const style of ['presentation', 'drafting']) {
      if ((await planStyle()) !== style) await clickLabel('Presentation style');
      await page.waitForTimeout(250);
      panResults[style].push(await pan());
    }
  }
  if ((await planStyle()) !== 'presentation') await clickLabel('Presentation style');
  const mean = (rows, key) => rows.reduce((sum, row) => sum + row[key], 0) / rows.length;
  metrics.pan = {
    presentation: {
      meanFrameMs: mean(panResults.presentation, 'meanFrameMs'),
      meanCommitMs: mean(panResults.presentation, 'meanCommitMs'),
      commitsPerRun: panResults.presentation[0].commits,
    },
    drafting: {
      meanFrameMs: mean(panResults.drafting, 'meanFrameMs'),
      meanCommitMs: mean(panResults.drafting, 'meanCommitMs'),
      commitsPerRun: panResults.drafting[0].commits,
    },
  };
  const p = metrics.pan.presentation;
  const d = metrics.pan.drafting;
  check(
    `step 4: 30-frame pan, mean frame ${p.meanFrameMs.toFixed(2)} ms presentation vs ${d.meanFrameMs.toFixed(2)} ms drafting (budget +${PAN_BUDGET_MS} ms)`,
    p.meanFrameMs <= d.meanFrameMs + PAN_BUDGET_MS,
  );
  check(
    `step 4: __MAP_RENDER_PROFILE__ SvgCanvas commit ${p.meanCommitMs.toFixed(2)} ms presentation vs ${d.meanCommitMs.toFixed(2)} ms drafting over ${p.commitsPerRun} commits`,
    p.commitsPerRun > 0 && p.meanCommitMs <= d.meanCommitMs + PAN_BUDGET_MS,
  );

  // ── Step 5: the plan in both styles ────────────────────────────────────────
  await fitPlan();
  const planView = await visibleCanvas();
  await page.screenshot({ path: `${directory}/plan-presentation.png`, clip: planView });
  await clickLabel('Presentation style');
  await page.screenshot({ path: `${directory}/plan-drafting.png`, clip: planView });
  await clickLabel('Presentation style');
  checks.push('step 5: plan-presentation.png and plan-drafting.png written');

  // Phase D: Save plan image — the drawing alone, at 3×, on a white margin.
  await clickLabel('Save plan image');
  const planImage = await savedImage('-plan.png');
  metrics.planImage = planImage;
  check(
    `phase D: Save plan image → ${planImage ? `${planImage.name}, ${Math.round(planImage.length / 1024)} kB data URL` : 'nothing'}`,
    Boolean(planImage) && planImage.prefix === 'data:image/png;base64,' && planImage.length > 100 * 1024,
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);

  // ── Step 6: every View preset, converged ───────────────────────────────────
  await clickLabel('Focus preview');
  await page.waitForTimeout(1500);
  const previewClip = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    const r = c.getBoundingClientRect();
    return {
      x: Math.max(0, r.x),
      y: Math.max(0, r.y),
      width: Math.min(r.width, window.innerWidth),
      height: Math.min(r.height, window.innerHeight - r.y),
    };
  });
  const converge = async () => {
    const start = Date.now();
    await page.waitForTimeout(300);
    while (Date.now() - start < (software ? 600000 : 90000)) {
      const stats = await page.evaluate(() => window.__previewPerf?.snapshot?.()?.progressive);
      if (stats && stats.samples > 0 && stats.samples >= stats.targetSamples) return stats;
      await page.waitForTimeout(250);
    }
    return null;
  };
  for (const view of VIEW_PRESETS) {
    const applied = await setSelect('[aria-label="Preview view preset"]', view);
    assert(applied, 'the View menu exists');
    const stats = await converge();
    const camera = await page.evaluate(() => window.__previewPerf?.camera?.());
    const shown = await page.evaluate(() => document.querySelector('[aria-label="Preview view preset"]').value);
    await page.screenshot({ path: `${directory}/preview-${view}.png`, clip: previewClip });
    const ortho = view.startsWith('elevation_');
    check(
      `step 6: ${view} — ${stats ? `${stats.samples}/${stats.targetSamples} samples` : 'did not converge'}, ${camera?.type}, menu shows "${shown}"`,
      Boolean(stats) &&
        camera?.isOrthographicCamera === ortho &&
        camera?.isPerspectiveCamera === !ortho &&
        shown === view &&
        (ortho || camera?.fov === 42),
    );
  }
  // An orbit drag out of an elevation returns to the perspective camera.
  await setSelect('[aria-label="Preview view preset"]', 'elevation_front');
  await converge();
  await page.mouse.move(previewClip.x + previewClip.width / 2, previewClip.y + previewClip.height / 2);
  await page.mouse.down();
  for (let s = 1; s <= 6; s += 1) {
    await page.mouse.move(
      previewClip.x + previewClip.width / 2 + s * 18,
      previewClip.y + previewClip.height / 2 + s * 4,
    );
    await page.waitForTimeout(60);
  }
  await page.mouse.up();
  await page.waitForTimeout(600);
  const afterOrbit = await page.evaluate(() => ({
    camera: window.__previewPerf?.camera?.(),
    shown: document.querySelector('[aria-label="Preview view preset"]').value,
  }));
  check(
    `step 6: an orbit drag out of Front → ${afterOrbit.camera?.type}, menu shows "${afterOrbit.shown}"`,
    afterOrbit.camera?.isPerspectiveCamera === true && afterOrbit.shown === 'free',
  );

  // ── Step 7: Save image ─────────────────────────────────────────────────────
  await setSelect('[aria-label="Preview view preset"]', 'iso_northeast');
  await converge();
  const saveEnabled = await page.evaluate(() => !document.querySelector('[aria-label="Save image"]').disabled);
  await clickLabel('Save image');
  const image = await savedImage('-iso_northeast.png');
  metrics.savedImage = image || null;
  check(
    `step 7: Save image (enabled ${saveEnabled}) → ${image ? `${image.name}, ${Math.round(image.length / 1024)} kB data URL` : 'nothing'}`,
    saveEnabled && Boolean(image) && image.prefix === 'data:image/png;base64,' && image.length > 100 * 1024,
  );

  // Night, for the record: the windows glow.
  await clickText('Night');
  await converge();
  await page.screenshot({ path: `${directory}/preview-night.png`, clip: previewClip });
  await clickText('Night');
  await converge();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);

  // ── Step 8: the sheet axonometric is realistic ─────────────────────────────
  await clickLabel('Show Properties');
  await clickText('Sheets');
  await page.waitForTimeout(1500);
  await clickText('Add viewport');
  const chosen = await page.evaluate(() => {
    const select = [...document.querySelectorAll('select')].find((s) =>
      [...s.options].some((option) => option.value === '3d_preview'),
    );
    if (!select) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(select, '3d_preview');
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  });
  assert(chosen, 'a sheet viewport source select offers 3D Preview');
  await page.waitForSelector('image[data-sheet-preview-style]', { timeout: software ? 300000 : 60000 });
  const sheetImage = await page.evaluate(() => {
    const node = document.querySelector('image[data-sheet-preview-style]');
    const href = node.getAttribute('href') || '';
    return { style: node.getAttribute('data-sheet-preview-style'), length: href.length, prefix: href.slice(0, 22) };
  });
  // A blank frame (sky and ground, no building) compresses to a few kB.
  check(
    `step 8: sheet axonometric <image> style "${sheetImage.style}", ${Math.round(sheetImage.length / 1024)} kB`,
    sheetImage.style === 'realistic' && sheetImage.prefix === 'data:image/png;base64,' && sheetImage.length > 60 * 1024,
  );
  await page.screenshot({ path: `${directory}/sheet-axonometric.png` });

  if (errors.length) throw new Error(`Page errors:\n${errors.join('\n')}`);
  if (failures.length) throw new Error(`Presentation visuals failures:\n${failures.join('\n')}`);
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ status: 'passed', errors, checks, metrics }, null, 2),
  );
  console.log('Presentation visuals verification passed:\n- ' + checks.join('\n- '));
  console.log('Metrics: ' + JSON.stringify(metrics, null, 2));
} catch (error) {
  if (page) await page.screenshot({ path: `${directory}/failure.png` });
  console.error('Checks so far:\n- ' + checks.join('\n- '));
  console.error(errors);
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ status: 'failed', error: error.message, errors, checks, failures, metrics }, null, 2),
  );
  process.exitCode = 1;
  console.error(error.message);
} finally {
  await browser.close();
}
