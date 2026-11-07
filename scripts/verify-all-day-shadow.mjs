// The "All day" sun-study freeze on the time slider, measured in a real browser
// (docs/all-day-shadow-freeze.md §6).
//
// One session on the bench fixture with the site placed in Manila (December
// solstice default). It prints one table — A1–A4 (slider steps and a paced
// drag in each mode), D1–D3 (what the overlay draws) and the P1 pixel check —
// with PASS/FAIL per row against §3, and exits non-zero on any FAIL.
//
// "Gap" is the longest gap between two animation frames from the input event
// (its timeStamp) to the end of the window. The freeze this guards against is
// GPU raster, not main-thread work, so a long-task observer does not see it;
// the frame gap does. A slider step is read 1.5 s after it, or a freeze longer
// than the wait would read as a 0 ms gap.
//
// D3 is sampled after every step and after every drag, in every mode — never
// during a timed window, because parsing a 945 KB path in the page would add to
// the gap it is measuring.
//
// The P1 pixels come from a run of this script against the code before the
// change (a baseline worktree or server, or the same server before the edit):
//   MSYS_NO_PATHCONV=1 node scripts/verify-all-day-shadow.mjs --json before.json
//   MSYS_NO_PATHCONV=1 node scripts/verify-all-day-shadow.mjs --baseline before.json
// Without --baseline the pixel check is reported as SKIP.
//
// Usage (dev server already up: npx vite --port 5199 --strictPort):
//   MSYS_NO_PATHCONV=1 node scripts/verify-all-day-shadow.mjs
//   … --base http://localhost:5198   another server (e.g. a baseline worktree)
//   … --json out.json                also write the raw results (incl. the pixels)
//   … --baseline before.json         compare the All day 15:00 pixels against a baseline run
//   … --only sun | overlay           only the slider timings (A1–A4) or only the drawing checks (D1–D3, P1)
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PROJECT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(PROJECT, 'package.json'));
const { chromium } = require('@playwright/test');

const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const BASE = argValue('--base', 'http://localhost:5199');
const JSON_OUT = argValue('--json', null);
const BASELINE = argValue('--baseline', null);
const ONLY = argValue('--only', null);
const RUN_TIMING = ONLY !== 'overlay';
const RUN_OVERLAY = ONLY !== 'sun';

/** §3 targets. */
const LIMITS = {
  stepGap: 50,
  dragGap: 60,
  longTask: 50,
  envelopeChars: 20000,
  envelopeRegions: 10,
  layerVertices: 5000,
  pixelMean: 2,
};

const envelope = JSON.parse(await readFile(path.join(PROJECT, 'scripts/fixtures/bench-ceiling-project.json'), 'utf8'));
const project = envelope.data;
// Give the site a real location so the sun study can run (Manila, December solstice default).
project.building = project.building || {};
project.building.site = {
  ...(project.building.site || {}),
  latitude: 14.5995,
  longitude: 120.9842,
  timeZone: 'Asia/Manila',
  northAngle: 0,
  locationLabel: 'Manila',
};
const baseline = BASELINE ? JSON.parse(await readFile(BASELINE, 'utf8')) : null;

const STEP_MINUTES = [14 * 60 + 30, 15 * 60, 16 * 60, 17 * 60, 17 * 60 + 30];
const DRAG = { from: 14 * 60, to: 19 * 60, moves: 100, pauseMs: 16 };

const rows = [];
const assertions = [];
const assert = (name, ok, detail = '') => {
  assertions.push({ name, ok: Boolean(ok), detail });
};

/* The in-page probe: animation frames, long tasks and the slider's input events. */
function installProbe({ id, name, env }) {
  window.localStorage.setItem('apartment-planner-projects', JSON.stringify([{ id, name, savedAt: env.savedAt }]));
  window.localStorage.setItem(`apartment-planner-project-${id}`, JSON.stringify(env));
  const probe = { frames: [], longTasks: [], input: 0, inputs: 0 };
  window.__probe = probe;
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) probe.longTasks.push({ start: entry.startTime, ms: entry.duration });
    }).observe({ entryTypes: ['longtask'] });
  } catch {
    // no long task timing
  }
  window.addEventListener(
    'input',
    (event) => {
      if (!probe.input) probe.input = event.timeStamp;
      probe.inputs += 1;
    },
    true,
  );
  window.addEventListener(
    'click',
    (event) => {
      if (!probe.input) probe.input = event.timeStamp;
    },
    true,
  );
  const tick = () => {
    probe.frames.push(performance.now());
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  probe.reset = () => {
    probe.frames = [];
    probe.longTasks = [];
    probe.input = 0;
    probe.inputs = 0;
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Reads the probe after the NEXT animation frame. The freeze is on the GPU
 * raster worker: the main thread stays free, so an evaluate made during it
 * returns at once with no frame after the input, and the gap would read as
 * ~0 ms. Waiting for one more frame closes the gap that is still open.
 */
async function read(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => resolve());
        setTimeout(resolve, 10000);
      }),
  );
  const data = await page.evaluate(() => ({
    frames: window.__probe.frames,
    longTasks: window.__probe.longTasks.filter((task) => task.start >= window.__probe.input - 5),
    input: window.__probe.input,
    inputs: window.__probe.inputs,
  }));
  if (!data.input) data.input = data.frames[0] || 0;
  return data;
}

/** Longest gap between consecutive frames that overlaps [from, to]. */
function maxGap(frames, from, to = Infinity) {
  let max = 0;
  for (let i = 1; i < frames.length; i++) {
    if (frames[i] < from || frames[i - 1] > to) continue;
    max = Math.max(max, frames[i] - Math.max(frames[i - 1], from));
  }
  return Math.round(max);
}

const clock = (minutes) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;

function row(key, label, ok, measured, target) {
  const verdict = ok === null ? 'info' : ok ? 'PASS' : 'FAIL';
  if (ok !== null) assert(`${key}: ${label} — ${target}`, ok, measured);
  rows.push({ key, label, measured, target, verdict });
  console.log(`${key.padEnd(4)} ${label.padEnd(52)} ${String(measured).padEnd(44)} ${target.padEnd(18)} ${verdict}`);
}

async function openDraft(page) {
  await page.getByRole('button', { name: 'Load Project' }).click();
  await page.getByText(project.name).first().waitFor();
  await page
    .locator('[class*="modalCard"]')
    .filter({ hasText: project.name })
    .first()
    .locator('button')
    .first()
    .click();
  await page.waitForFunction(() => document.querySelectorAll('[data-type="wall"]').length > 0, null, {
    timeout: 30000,
  });
}

const paneReady = (page) =>
  page.waitForFunction(
    () => document.querySelector('[data-preview-pane="model"]')?.getAttribute('data-loading-state') === 'ready',
    null,
    { timeout: 90000 },
  );

async function setSlider(page, minutes) {
  await page.evaluate((m) => {
    const input = document.querySelector('input[aria-label="Time of day"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String(m));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, minutes);
}

/**
 * What the sun-study layer draws right now: the envelope fill's `d` length,
 * its region count (the `data-envelope-regions` attribute when the overlay
 * reports it, else its subpath count), the envelope route, and the vertices of
 * every path in the layer (a path's coordinate pairs).
 */
async function layerState(page) {
  return page.evaluate(() => {
    const layer = document.querySelector('g[data-layer="sun-study"]');
    if (!layer) return null;
    const pairs = (d) => Math.floor((d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || []).length / 2);
    const fill = layer.querySelector('path[data-type="shadow-envelope-fill"]');
    const fillD = fill?.getAttribute('d') || '';
    let vertices = 0;
    let envelopeVertices = 0;
    let instantPaths = 0;
    for (const node of layer.querySelectorAll('path')) {
      if (node.closest('clipPath')) continue;
      const count = pairs(node.getAttribute('d') || '');
      vertices += count;
      const type = node.getAttribute('data-type');
      if (type === 'shadow-envelope-fill') envelopeVertices += count;
      if (type === 'shadow-instant') instantPaths += 1;
    }
    const regionsAttr = layer.getAttribute('data-envelope-regions');
    return {
      mode: layer.getAttribute('data-mode'),
      envelopeChars: fillD.length,
      envelopeRegions: regionsAttr !== null ? Number(regionsAttr) : (fillD.match(/M/g) || []).length,
      envelopeRegionsSource: regionsAttr !== null ? 'attribute' : 'subpaths',
      envelopeRender: layer.getAttribute('data-envelope-render') || (fill ? 'path (unlabelled)' : 'none'),
      envelopeVerticesAttr: layer.getAttribute('data-envelope-vertices'),
      envelopeImage: Boolean(layer.querySelector('image[data-type="shadow-envelope-image"]')),
      envelopeVertices,
      instantPaths,
      vertices,
    };
  });
}

const d3Samples = [];
async function sampleLayer(page, where) {
  const state = await layerState(page);
  if (state) d3Samples.push({ where, vertices: state.vertices, mode: state.mode });
  return state;
}

async function step(page, minutes) {
  await page.evaluate(() => window.__probe.reset());
  await setSlider(page, minutes);
  await sleep(1500);
  const data = await read(page);
  await sampleLayer(page, `step ${clock(minutes)}`);
  return maxGap(data.frames, data.input);
}

async function stepSeries(page, key, modeLabel) {
  await setSlider(page, 14 * 60);
  await sleep(2500);
  await sampleLayer(page, `${modeLabel} 14:00`);
  const gaps = [];
  for (const minutes of STEP_MINUTES) gaps.push([minutes, await step(page, minutes)]);
  const worst = Math.max(...gaps.map(([, gap]) => gap));
  row(
    key,
    `${modeLabel}, steps ${STEP_MINUTES.map(clock).join('/')}`,
    worst <= LIMITS.stepGap,
    `${gaps.map(([m, gap]) => `${clock(m)} ${gap}`).join(' · ')} ms`,
    `each ≤ ${LIMITS.stepGap} ms`,
  );
  return gaps;
}

async function drag(page, key, modeLabel) {
  const slider = page.locator('input[aria-label="Time of day"]');
  await slider.scrollIntoViewIfNeeded();
  await setSlider(page, DRAG.from);
  await sleep(2500);
  const box = await slider.boundingBox();
  const xAt = (minutes) => box.x + 8 + ((box.width - 16) * minutes) / 1439;
  const y = box.y + box.height / 2;
  await page.evaluate(() => window.__probe.reset());
  await page.mouse.move(xAt(DRAG.from), y);
  await page.mouse.down();
  for (let i = 1; i <= DRAG.moves; i++) {
    await page.mouse.move(xAt(DRAG.from + ((DRAG.to - DRAG.from) * i) / DRAG.moves), y);
    await sleep(DRAG.pauseMs);
  }
  // The thumb's inset is not exactly 8 px; nudge the last pixels so the drag
  // really ends on 19:00 rather than a step short of it.
  for (let nudge = 1; nudge <= 24 && Number(await slider.inputValue()) < DRAG.to; nudge++) {
    await page.mouse.move(xAt(DRAG.to) + nudge * 0.5, y);
    await sleep(DRAG.pauseMs);
  }
  await page.mouse.up();
  await sleep(1500);
  const data = await read(page);
  const value = Number(await slider.inputValue());
  await sampleLayer(page, `${modeLabel} after drag`);
  const gap = maxGap(data.frames, data.input);
  const longest = Math.round(Math.max(0, ...data.longTasks.map((task) => task.ms)));
  row(
    key,
    `${modeLabel}, paced drag ${clock(DRAG.from)} → ${clock(DRAG.to)} (${DRAG.moves} × ${DRAG.pauseMs} ms)`,
    gap <= LIMITS.dragGap && longest <= LIMITS.longTask && value === DRAG.to,
    `gap ${gap} ms · longest task ${longest} ms · ${data.inputs} inputs · ends ${clock(value)}`,
    `≤ ${LIMITS.dragGap} ms, task ≤ ${LIMITS.longTask}`,
  );
}

async function chooseMode(page, label) {
  const sunPanel = page.locator('[data-panel="sun-study"]');
  await sunPanel.scrollIntoViewIfNeeded();
  await sunPanel
    .locator('button', { hasText: new RegExp(`^${label}$`) })
    .first()
    .click();
}

/** Screenshot of the plan <svg>'s on-screen box, plus the box itself. */
async function planShot(page) {
  const box = await page.evaluate(() => {
    const svg = document.querySelector('svg[data-plan-style]') || document.querySelector('main svg');
    const rect = svg.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  const clip = {
    x: Math.round(box.x),
    y: Math.round(box.y),
    width: Math.round(box.width),
    height: Math.round(box.height),
  };
  const png = await page.screenshot({ clip });
  return { png: png.toString('base64'), clip };
}

/** The envelope's on-screen box, relative to the plan <svg>'s box, clipped to it. */
async function envelopeBox(page) {
  return page.evaluate(() => {
    const svg = document.querySelector('svg[data-plan-style]') || document.querySelector('main svg');
    const layer = svg.querySelector('g[data-layer="sun-study"]');
    const node =
      layer?.querySelector('path[data-type="shadow-envelope-fill"]') ||
      layer?.querySelector('image[data-type="shadow-envelope-image"]');
    if (!node) return null;
    const outer = svg.getBoundingClientRect();
    const rect = node.getBoundingClientRect();
    const x0 = Math.max(0, Math.floor(rect.left - outer.left));
    const y0 = Math.max(0, Math.floor(rect.top - outer.top));
    const x1 = Math.min(Math.round(outer.width), Math.ceil(rect.right - outer.left));
    const y1 = Math.min(Math.round(outer.height), Math.ceil(rect.bottom - outer.top));
    return x1 > x0 && y1 > y0 ? { x0, y0, x1, y1 } : null;
  });
}

/** Mean absolute difference per channel value (0–255) inside `box`, decoded in the page. */
async function meanDiff(page, a, b, box) {
  return page.evaluate(
    async ([first, second, region]) => {
      const decode = async (base64) => {
        const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob();
        const bitmap = await createImageBitmap(blob);
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext('2d');
        context.drawImage(bitmap, 0, 0);
        return context.getImageData(0, 0, bitmap.width, bitmap.height);
      };
      const [x, y] = await Promise.all([decode(first), decode(second)]);
      if (x.width !== y.width || x.height !== y.height)
        return { error: `size ${x.width}×${x.height} vs ${y.width}×${y.height}` };
      const box = region || { x0: 0, y0: 0, x1: x.width, y1: x.height };
      let total = 0;
      let count = 0;
      let changed = 0;
      for (let row = box.y0; row < Math.min(box.y1, x.height); row++) {
        for (let column = box.x0; column < Math.min(box.x1, x.width); column++) {
          const i = (row * x.width + column) * 4;
          let pixel = 0;
          for (let channel = 0; channel < 3; channel++) pixel += Math.abs(x.data[i + channel] - y.data[i + channel]);
          total += pixel;
          count += 3;
          if (pixel > 6) changed += 1;
        }
      }
      return { mean: count ? total / count : 0, changedShare: count ? changed / (count / 3) : 0 };
    },
    [a, b, box],
  );
}

const pixels = {};
let envelopeBoxAt15 = null;
let overlayAt15 = null;

async function overlayChecks(page) {
  // D1/D2: the drawn envelope, settled, at 15:00.
  await setSlider(page, 15 * 60);
  await sleep(2500);
  overlayAt15 = await sampleLayer(page, 'All day 15:00');
  if (!overlayAt15) {
    assert('D1: sun-study layer present', false, 'no g[data-layer="sun-study"]');
    return;
  }
  row(
    'D1',
    'envelope fill `d` length (All day, 15:00)',
    overlayAt15.envelopeImage ? false : overlayAt15.envelopeChars <= LIMITS.envelopeChars,
    `${overlayAt15.envelopeChars.toLocaleString('en-US')} chars · render ${overlayAt15.envelopeRender}`,
    `≤ ${LIMITS.envelopeChars.toLocaleString('en-US')} chars`,
  );
  row(
    'D2',
    'regions in the drawn envelope',
    overlayAt15.envelopeRegions > 0 && overlayAt15.envelopeRegions <= LIMITS.envelopeRegions,
    `${overlayAt15.envelopeRegions.toLocaleString('en-US')} (${overlayAt15.envelopeRegionsSource}) · ${overlayAt15.envelopeVertices.toLocaleString('en-US')} vertices`,
    `≤ ${LIMITS.envelopeRegions}`,
  );

  // P1: the layer's pixels at 15:00 against the baseline run.
  envelopeBoxAt15 = await envelopeBox(page);
  pixels.allDay15 = await planShot(page);
  // The same frame with the dashed outline hidden: fills only (informational).
  await page.evaluate(() => {
    for (const node of document.querySelectorAll('[data-type="shadow-envelope-outline"]')) node.style.display = 'none';
  });
  await sleep(400);
  pixels.allDay15Fill = await planShot(page);
  await page.evaluate(() => {
    for (const node of document.querySelectorAll('[data-type="shadow-envelope-outline"]')) node.style.display = '';
  });
  await sleep(400);
}

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const hardStop = setTimeout(() => {
  console.log('HARD STOP after 420 s');
  process.exit(2);
}, 420000);
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await context.addInitScript(installProbe, { id: project.id, name: project.name, env: envelope });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(BASE + '/floorplan', { waitUntil: 'networkidle' });
  await sleep(800);
  await openDraft(page);
  await paneReady(page);
  await sleep(2500);

  console.log(`All day sun-study freeze — ${BASE}`);
  console.log(`${'Row'.padEnd(4)} ${'Check'.padEnd(52)} ${'Measured'.padEnd(44)} ${'Target'.padEnd(18)} Verdict`);

  const sunPanel = page.locator('[data-panel="sun-study"]');
  await sunPanel.scrollIntoViewIfNeeded();
  await sunPanel.locator('button[aria-pressed]').first().click();
  await page.waitForSelector('input[aria-label="Time of day"]', { timeout: 10000 });
  await sleep(2500);

  // Moment (A3).
  await chooseMode(page, 'Moment');
  await sleep(1500);
  if (RUN_TIMING) {
    await stepSeries(page, 'A3', 'Moment');
    await drag(page, 'A3d', 'Moment');
  } else {
    await sampleLayer(page, 'Moment');
  }

  // All day (A1, A2, D1, D2, P1).
  await chooseMode(page, 'All day');
  await page
    .waitForFunction(
      () =>
        document.querySelector(
          'g[data-layer="sun-study"] [data-type="shadow-envelope-fill"], g[data-layer="sun-study"] [data-type="shadow-envelope-image"]',
        ),
      null,
      { timeout: 30000 },
    )
    .catch(() => assert('All day: the envelope appears within 30 s', false, 'no envelope drawn'));
  await sleep(2500);
  if (RUN_OVERLAY) await overlayChecks(page);
  if (RUN_TIMING) {
    await stepSeries(page, 'A1', 'All day');
    await drag(page, 'A2', 'All day');
  }

  // Sun hours (A4).
  await chooseMode(page, 'Sun hours');
  await page
    .waitForFunction(() => document.querySelector('g[data-layer="sun-study"][data-mode="sunHours"]'), null, {
      timeout: 30000,
    })
    .catch(() => {});
  await sleep(3000);
  if (RUN_TIMING) await stepSeries(page, 'A4', 'Sun hours');
  else await sampleLayer(page, 'Sun hours');

  if (RUN_OVERLAY) {
    const worst = d3Samples.reduce((best, sample) => (sample.vertices > (best?.vertices ?? -1) ? sample : best), null);
    row(
      'D3',
      `sun-study layer path vertices, ${d3Samples.length} samples, all modes`,
      Boolean(worst) && worst.vertices <= LIMITS.layerVertices,
      worst ? `max ${worst.vertices.toLocaleString('en-US')} (${worst.where})` : 'no samples',
      `≤ ${LIMITS.layerVertices.toLocaleString('en-US')}`,
    );

    const reference = baseline?.pixels?.allDay15;
    const box = baseline?.envelopeBoxAt15;
    if (!reference || !box) {
      row('P1', 'All day 15:00 pixels vs baseline, old envelope box', null, 'SKIP (no --baseline)', '');
    } else {
      const diff = await meanDiff(page, reference.png, pixels.allDay15.png, box);
      row(
        'P1',
        'All day 15:00 pixels vs baseline, old envelope box',
        !diff.error && diff.mean <= LIMITS.pixelMean,
        diff.error ||
          `mean |Δ| ${diff.mean.toFixed(2)}/255 · ${(diff.changedShare * 100).toFixed(1)}% px changed · box ${box.x1 - box.x0}×${box.y1 - box.y0}`,
        `≤ ${LIMITS.pixelMean}/255`,
      );
      if (baseline.pixels.allDay15Fill) {
        const fills = await meanDiff(page, baseline.pixels.allDay15Fill.png, pixels.allDay15Fill.png, box);
        row(
          'P1f',
          'same, dashed outline hidden in both (fills only)',
          null,
          fills.error || `mean |Δ| ${fills.mean.toFixed(2)}/255 · ${(fills.changedShare * 100).toFixed(1)}% px changed`,
          'info',
        );
      }
    }
  }
} finally {
  await browser.close();
  clearTimeout(hardStop);
}

console.log('\nAssertions:');
for (const { name, ok, detail } of assertions)
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
if (errors.length) {
  console.log('\nPage errors:');
  for (const message of errors.slice(0, 8)) console.log(`  ${message}`);
}
const failed = assertions.filter((entry) => !entry.ok).length + (errors.length ? 1 : 0);
console.log(`\n${failed ? `${failed} FAIL` : 'All PASS'}`);
if (JSON_OUT)
  await writeFile(
    JSON_OUT,
    JSON.stringify({ base: BASE, rows, assertions, d3Samples, overlayAt15, envelopeBoxAt15, pixels, errors }, null, 2),
  );
process.exit(failed ? 1 : 0);
