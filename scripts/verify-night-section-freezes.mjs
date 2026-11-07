// Night crossing and section view freezes, measured in a real browser
// (docs/night-section-freezes.md §6).
//
// One session on the bench fixture with the site placed in Manila (so the sun
// study can run; December solstice default, sunset 17:26). It prints the §2.1
// table — S0, S1a–S1e, N1, N2, V1, V2, V3, V-floor-2, E (Front, Left, warm
// Front) — with the longest frame gap, long tasks, shader programs linked (by
// SHADER_NAME / SHADER_TYPE) and getProgramInfoLog time, PASS/FAIL against §3.
// It then asserts the section view's DOM contract (pressed button ≤ 100 ms, the
// placeholder in the plan <svg> before the drawing, words at 300 ± 50 ms that
// stay ≥ 400 ms, the drawn count equal to the synchronous count) and the
// pixel check for §4.1 (the sun-down frame unchanged, the noon shadow still
// there). Exits non-zero on any FAIL.
//
// "Gap" is the longest gap between two animation frames from the input event
// (its timeStamp) to the end of the transition. A slider step is read 1.5 s
// after it, or a freeze longer than the wait would read as a 0 ms gap.
//
// The synchronous count and the baseline pixels come from a run of this script
// against the code before the change (a baseline worktree or server):
//   MSYS_NO_PATHCONV=1 node scripts/verify-night-section-freezes.mjs --base http://localhost:5198 --json before.json
//   MSYS_NO_PATHCONV=1 node scripts/verify-night-section-freezes.mjs --baseline before.json
// Without --baseline the drawn count is compared between the cold and the warm
// entry and the "unchanged" pixel checks are reported as SKIP.
//
// Usage (dev server already up: npx vite --port 5199 --strictPort):
//   MSYS_NO_PATHCONV=1 node scripts/verify-night-section-freezes.mjs
//   … --base http://localhost:5198   another server (e.g. a baseline worktree)
//   … --json out.json                also write the raw results (incl. the pixels)
//   … --baseline before.json         compare drawn counts and pixels against a baseline run
//   … --only sun | section           run one half
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
const RUN_SUN = ONLY !== 'section';
const RUN_SECTION = ONLY !== 'sun';

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

/** One-time conversion programs §3 allows at S0 (0 when they are warmed at creation). */
const CONVERSION_PROGRAMS = new Set(['EquirectangularToCubeUV', 'PMREMGGXConvolution', 'CubemapFromEquirect']);

const rows = [];
const assertions = [];
const assert = (name, ok, detail = '') => {
  assertions.push({ name, ok: Boolean(ok), detail });
};

/*
 * The in-page probe: animation frames, long tasks, every program link (named
 * from its SHADER_NAME / SHADER_TYPE define) and the time spent blocked in
 * getProgramInfoLog, plus a per-frame snapshot of the section/elevation view's
 * markers so a mark's time is the frame it was first on screen.
 */
function installProbe({ id, name, env }) {
  window.localStorage.setItem('apartment-planner-projects', JSON.stringify([{ id, name, savedAt: env.savedAt }]));
  window.localStorage.setItem(`apartment-planner-project-${id}`, JSON.stringify(env));
  const probe = { frames: [], longTasks: [], links: [], infoLogMs: 0, input: 0, events: [], last: {} };
  window.__probe = probe;
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) probe.longTasks.push({ start: entry.startTime, ms: entry.duration });
    }).observe({ entryTypes: ['longtask'] });
  } catch {
    // no long task timing
  }
  const noteInput = (event) => {
    if (!probe.input) probe.input = event.timeStamp;
  };
  window.addEventListener('click', noteInput, true);
  window.addEventListener('input', noteInput, true);
  window.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Enter') noteInput(event);
    },
    true,
  );
  const patch = (proto) => {
    if (!proto) return;
    const link = proto.linkProgram;
    proto.linkProgram = function (program) {
      let shaderName = '';
      try {
        for (const shader of this.getAttachedShaders(program) || []) {
          const source = this.getShaderSource(shader) || '';
          const named = source.match(/#define SHADER_NAME ([^\n]*)/);
          const typed = source.match(/#define SHADER_TYPE ([^\n]*)/);
          shaderName = (named && named[1].trim()) || (typed && typed[1].trim()) || '';
          if (shaderName) break;
        }
      } catch {
        // unnamed
      }
      probe.links.push({ t: performance.now(), name: shaderName });
      return link.call(this, program);
    };
    const info = proto.getProgramInfoLog;
    proto.getProgramInfoLog = function (program) {
      const started = performance.now();
      const result = info.call(this, program);
      probe.infoLogMs += performance.now() - started;
      return result;
    };
  };
  patch(window.WebGL2RenderingContext?.prototype);
  patch(window.WebGLRenderingContext?.prototype);

  let viewButton = null;
  const snapshot = () => {
    const svg = document.querySelector('svg[data-plan-style]') || document.querySelector('main svg');
    const placeholder = svg?.querySelector('[data-loading-state="loading"]');
    const wordsNode = svg?.querySelector('[data-section-placeholder] [role="status"]');
    // Words are revealed by a CSS animation at their due time (the
    // compositor's clock), then marked shown by a timer. A scheduled word
    // counts as visible once its reveal has started, and its due time is kept.
    let words = '';
    let wordsDue = null;
    if (wordsNode?.dataset.words === 'shown') words = wordsNode.textContent;
    else if (wordsNode?.dataset.words === 'scheduled') {
      const reveal = wordsNode.getAnimations?.()[0];
      const delay = reveal?.effect?.getTiming?.().delay ?? Infinity;
      if (reveal && reveal.currentTime !== null) {
        wordsDue = Math.round(document.timeline.currentTime - reveal.currentTime + delay);
        if (reveal.currentTime >= delay) words = wordsNode.textContent;
      }
    }
    const sectionLayer = svg?.querySelector('g.section-view g.section');
    const drawn = sectionLayer
      ? sectionLayer.querySelectorAll(':scope > g[data-section-source], :scope > path').length
      : 0;
    const elevationLayer = svg?.querySelector('g.elevation');
    const elevationDrawn = elevationLayer
      ? elevationLayer.querySelectorAll(':scope > g[data-elevation-source], :scope > path:not([data-elevation-shadow])')
          .length
      : 0;
    if (probe.viewLabel && (!viewButton || !viewButton.isConnected || viewButton.textContent !== probe.viewLabel)) {
      viewButton = [...document.querySelectorAll('button')].find((button) => button.textContent === probe.viewLabel);
    }
    return {
      pressed: viewButton
        ? viewButton.getAttribute('aria-pressed') === 'true' || /Active/.test(viewButton.className)
        : false,
      placeholder: Boolean(placeholder),
      words,
      wordsDue,
      drawn,
      elevationDrawn,
      status: svg?.querySelector('[data-drawing-status]')?.getAttribute('data-drawing-status') || '',
      busy: Boolean(document.querySelector('[aria-busy="true"]')),
      bar: Boolean(document.querySelector('[data-loading-bar="region"]')),
      pill: document.querySelector('[data-loading-pill][data-words="shown"]')?.textContent || '',
    };
  };
  const tick = () => {
    const now = performance.now();
    probe.frames.push(now);
    if (probe.watch) {
      const state = snapshot();
      for (const [key, value] of Object.entries(state)) {
        if (probe.last[key] !== value) {
          probe.events.push({ t: now, key, value });
          probe.last[key] = value;
        }
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  probe.reset = (watch = false, viewLabel = null) => {
    probe.frames = [];
    probe.longTasks = [];
    probe.links = [];
    probe.infoLogMs = 0;
    probe.input = 0;
    probe.events = [];
    probe.last = {};
    probe.watch = watch;
    probe.viewLabel = viewLabel;
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function read(page) {
  const data = await page.evaluate(() => ({
    frames: window.__probe.frames,
    longTasks: window.__probe.longTasks.filter((task) => task.start >= window.__probe.input - 5),
    links: window.__probe.links,
    infoLogMs: window.__probe.infoLogMs,
    input: window.__probe.input,
    events: window.__probe.events,
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

/** First time at/after `from` that `key` took a value matching `test`. */
function markAt(data, key, test, from = data.input) {
  const event = data.events.find((entry) => entry.t >= from && entry.key === key && test(entry.value));
  return event ? event.t : null;
}

function valueAt(data, key, t) {
  let value;
  for (const entry of data.events) {
    if (entry.t > t) break;
    if (entry.key === key) value = entry.value;
  }
  return value;
}

/** Longest frame gap that starts while the page is aria-busy, inside [from, to]. */
function busyGap(data, from, to = Infinity) {
  let max = 0;
  for (let i = 1; i < data.frames.length; i++) {
    const a = data.frames[i - 1];
    if (a < from || a > to) continue;
    if (valueAt(data, 'busy', a)) max = Math.max(max, data.frames[i] - a);
  }
  return Math.round(max);
}

const rel = (data, t) => (t === null || t === undefined ? null : Math.round(t - data.input));

function linkSummary(links) {
  const names = new Map();
  for (const link of links) names.set(link.name || '?', (names.get(link.name || '?') || 0) + 1);
  return [...names].map(([name, count]) => `${name}×${count}`).join(', ');
}

/**
 * One table row. `limits`: gap cap, link cap (and which names are allowed),
 * plus any extra checks the caller computed — each a [label, ok, detail].
 */
function record(key, label, data, { gap, limits = null, checks = [], extra = {} }) {
  const linkCount = data.links.length;
  const infoLogMs = Math.round(data.infoLogMs);
  const all = [];
  if (limits) {
    if (limits.gap !== undefined) all.push([`gap ≤ ${limits.gap} ms`, gap <= limits.gap, `${gap} ms`]);
    if (limits.links !== undefined) {
      const counted = limits.allowed ? data.links.filter((link) => !limits.allowed.has(link.name)).length : linkCount;
      const allowedCount = linkCount - counted;
      all.push([
        `programs linked ≤ ${limits.links}${limits.allowed ? ' (conversion programs only)' : ''}`,
        counted === 0 && allowedCount <= limits.links,
        `${linkCount}${linkCount ? ` (${linkSummary(data.links)})` : ''}`,
      ]);
    }
  }
  all.push(...checks);
  const verdict = limits || checks.length ? (all.every(([, ok]) => ok) ? 'PASS' : 'FAIL') : 'info';
  for (const [name, ok, detail] of all) assert(`${key}: ${name}`, ok, detail);
  const row = {
    key,
    label,
    gap,
    longTasks: data.longTasks.map((task) => `${Math.round(task.start - data.input)}+${Math.round(task.ms)}`),
    links: linkCount,
    linkNames: linkSummary(data.links),
    infoLogMs,
    verdict,
    ...extra,
  };
  rows.push(row);
  const extraText = Object.entries(extra)
    .filter(([, value]) => value !== null && value !== undefined && typeof value !== 'object')
    .map(([name, value]) => `${name} ${value}`)
    .join(' · ');
  console.log(
    `${key.padEnd(9)} ${label.padEnd(44)} gap ${String(gap).padStart(5)} ms · long [${row.longTasks.join(', ') || 'none'}] · links ${linkCount}${
      linkCount ? ` (${row.linkNames})` : ''
    } · infoLog ${infoLogMs} ms${extraText ? ` · ${extraText}` : ''} · ${verdict}`,
  );
  return row;
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
    { timeout: 60000 },
  );

async function setSlider(page, minutes) {
  await page.evaluate((m) => {
    const input = document.querySelector('input[aria-label="Time of day"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String(m));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, minutes);
}

/** Waits for the realistic refine to finish (Save image enables), then screenshots the 3D pane's canvas. */
async function paneShot(page) {
  await page
    .waitForFunction(() => !document.querySelector('button[aria-label="Save image"]')?.disabled, null, {
      timeout: 30000,
    })
    .catch(() => {});
  await sleep(500);
  const canvas = page.locator('[data-preview-pane="model"] canvas').first();
  const png = await canvas.screenshot();
  return png.toString('base64');
}

/** Mean absolute difference per channel value (0–255) between two PNGs, decoded in the page. */
async function meanDiff(page, a, b) {
  return page.evaluate(
    async ([first, second]) => {
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
      let total = 0;
      let count = 0;
      for (let i = 0; i < x.data.length; i += 4) {
        for (let channel = 0; channel < 3; channel++) total += Math.abs(x.data[i + channel] - y.data[i + channel]);
        count += 3;
      }
      return { mean: total / count };
    },
    [a, b],
  );
}

const pixels = {};
const counts = {};

async function sunSession(page) {
  const sunPanel = page.locator('[data-panel="sun-study"]');
  await sunPanel.scrollIntoViewIfNeeded();
  const toggle = sunPanel.locator('button[aria-pressed]').first();

  // S0 — the study's first start in the session, at noon.
  await page.evaluate(() => window.__probe.reset(true));
  await toggle.click();
  await page.waitForSelector('input[aria-label="Time of day"]', { timeout: 10000 });
  await sleep(2500);
  {
    const data = await read(page);
    const gap = maxGap(data.frames, data.input);
    const busy = busyGap(data, data.input);
    record('S0', 'Sun study Off → On, 12:00', data, {
      gap,
      limits: { gap: 150, links: 3, allowed: CONVERSION_PROGRAMS },
      checks: [['no gap > 150 ms while anything is aria-busy', busy <= 150, `${busy} ms`]],
      extra: { busyGap: busy },
    });
  }
  pixels.noon = await paneShot(page);

  await setSlider(page, 17 * 60 + 20);
  await sleep(2000);
  const step = async (key, label, minutes, limits) => {
    await page.evaluate(() => window.__probe.reset());
    await setSlider(page, minutes);
    await sleep(1500);
    const data = await read(page);
    return record(key, label, data, { gap: maxGap(data.frames, data.input), limits });
  };
  const quiet = { gap: 50, links: 0 };
  await step('S1a', '17:20 → 17:20 (control)', 17 * 60 + 20, null);
  await step('S1b', '17:20 → 17:30, sun sets (first time)', 17 * 60 + 30, quiet);
  await step('S1c', '17:30 → 20:00', 20 * 60, null);
  await step('S1d', '20:00 → 17:20, sun back up', 17 * 60 + 20, quiet);
  await step('S1e', '17:20 → 17:40, second sunset', 17 * 60 + 40, null);
  pixels.sunset = await paneShot(page);

  // Night on / off with the sun up, which is where the old code flipped the shadow flag.
  await setSlider(page, 12 * 60);
  await sleep(2500);
  const night = page.locator('button[title^="Night"]').first();
  for (const [key, label] of [
    ['N1', '3D pane Night On (sun up)'],
    ['N2', '3D pane Night Off'],
  ]) {
    await page.evaluate(() => window.__probe.reset());
    await night.click();
    await sleep(1500);
    const data = await read(page);
    record(key, label, data, { gap: maxGap(data.frames, data.input), limits: quiet });
  }

  await toggle.click();
  await sleep(1500);
}

/**
 * Enters a view from its toolbar button and records when the click was
 * answered, when the drawing was complete, and the frame gaps in between.
 */
async function enterView(page, { key, label, button, kind, cold, limits }) {
  await page.evaluate((viewLabel) => window.__probe.reset(true, viewLabel), button);
  await sleep(50);
  await page
    .locator('button', { hasText: new RegExp(`^${button}$`) })
    .first()
    .click();
  const drawnKey = kind === 'section' ? 'drawn' : 'elevationDrawn';
  await page.waitForFunction(
    (k) => {
      const last = window.__probe.last;
      return last[k] > 0 && !last.placeholder && (!last.status || last.status === 'ready');
    },
    drawnKey,
    { timeout: 30000 },
  );
  await sleep(900);
  const data = await read(page);
  const finalCount = data.events.filter((entry) => entry.key === drawnKey).at(-1)?.value ?? 0;
  const pressedAt = markAt(data, 'pressed', (value) => value === true);
  const placeholderAt = markAt(data, 'placeholder', (value) => value === true);
  const drawnAt = markAt(data, drawnKey, (value) => value > 0);
  const completeAt = (() => {
    // The first frame on which the final drawing is up and nothing is loading.
    for (const frame of data.frames) {
      if (frame < data.input) continue;
      if (
        valueAt(data, drawnKey, frame) === finalCount &&
        !valueAt(data, 'placeholder', frame) &&
        ['', 'ready', undefined].includes(valueAt(data, 'status', frame))
      )
        return frame;
    }
    return null;
  })();
  const first = [pressedAt, placeholderAt, drawnAt].filter((t) => t !== null);
  const firstAt = first.length ? Math.min(...first) : null;
  const gap = maxGap(data.frames, data.input, completeAt ?? Infinity);
  // Visible at the reveal's due time when it was seen scheduled before then
  // and the words were up at the next look; else as sampled.
  const sampledOn = markAt(data, 'words', (value) => value !== '');
  const due = data.events
    .filter(
      (entry) =>
        entry.key === 'wordsDue' && entry.value !== null && entry.t >= data.input && entry.t <= entry.value + 5,
    )
    .map((entry) => entry.value)
    .filter((value) => sampledOn !== null && value <= sampledOn + 5);
  const wordsOn = due.length ? Math.min(...due) : sampledOn;
  const wordsOff = wordsOn === null ? null : markAt(data, 'words', (value) => value === '', wordsOn);
  const extra = {
    first: rel(data, firstAt),
    pressed: rel(data, pressedAt),
    placeholder: rel(data, placeholderAt),
    complete: rel(data, completeAt),
    words: rel(data, wordsOn),
    wordsHeld: wordsOn === null ? null : wordsOff === null ? 'to end' : Math.round(wordsOff - wordsOn),
    drawn: finalCount,
  };
  const checks = [];
  if (limits.first !== undefined)
    checks.push([
      `first visible response ≤ ${limits.first} ms`,
      extra.first !== null && extra.first <= limits.first,
      `${extra.first} ms`,
    ]);
  if (limits.complete !== undefined)
    checks.push([
      `drawing complete ≤ ${limits.complete} ms`,
      extra.complete !== null && extra.complete <= limits.complete,
      `${extra.complete} ms`,
    ]);
  if (limits.noWords)
    checks.push(['no words flash', wordsOn === null, wordsOn === null ? 'none' : `at ${extra.words} ms`]);
  if (cold && limits.contract) {
    checks.push([
      'view button aria-pressed ≤ 100 ms',
      extra.pressed !== null && extra.pressed <= 100,
      `${extra.pressed} ms`,
    ]);
    checks.push([
      'placeholder ([data-loading-state="loading"]) in the plan <svg> before the drawing',
      placeholderAt !== null && (drawnAt === null || placeholderAt <= drawnAt),
      `placeholder ${extra.placeholder} ms · drawing ${rel(data, drawnAt)} ms`,
    ]);
    if (extra.complete !== null && extra.complete > 350) {
      checks.push([
        'words appear at 300 ± 50 ms',
        extra.words !== null && extra.words >= 250 && extra.words <= 350,
        `${extra.words} ms`,
      ]);
      checks.push([
        'words stay ≥ 400 ms',
        wordsOn !== null && (wordsOff === null || wordsOff - wordsOn >= 390),
        `${extra.wordsHeld} ms`,
      ]);
    } else {
      checks.push([
        'no words (complete before 300 ms)',
        wordsOn === null,
        wordsOn === null ? 'none' : `at ${extra.words} ms`,
      ]);
    }
  }
  return record(key, label, data, { gap, limits: { gap: limits.gap, links: 0 }, checks, extra });
}

async function sectionSession(page) {
  const plan = () =>
    page
      .locator('button', { hasText: /^Plan$/ })
      .first()
      .click();

  const v1 = await enterView(page, {
    key: 'V1',
    label: 'Toolbar Section (cold)',
    button: 'Section',
    kind: 'section',
    cold: true,
    limits: { first: 100, gap: 150, complete: 1500, contract: true },
  });
  counts.V1 = v1.drawn;

  // V3: depth edit while in the view — the old drawing stays under a region bar.
  {
    const limited = page.getByRole('button', { name: 'Limited depth' });
    if ((await limited.getAttribute('aria-pressed')) !== 'true') {
      await limited.click();
      await sleep(2500);
    }
    const depth = page.getByRole('spinbutton', { name: 'Section depth in millimetres' });
    await depth.fill('3000');
    await depth.press('Enter');
    await sleep(2500);
    await depth.fill('2000');
    await page.evaluate(() => window.__probe.reset(true, 'Section'));
    await sleep(50);
    await depth.press('Enter');
    await page.waitForFunction(() => !window.__probe.last.status || window.__probe.last.status === 'ready', null, {
      timeout: 30000,
    });
    await sleep(1500);
    const data = await read(page);
    const staleAt = markAt(data, 'status', (value) => value === 'stale');
    const doneAt = staleAt === null ? null : markAt(data, 'status', (value) => value === 'ready', staleAt);
    const end = doneAt ?? data.frames.at(-1);
    const blanked = data.events.some((entry) => entry.key === 'drawn' && entry.t >= data.input && entry.value === 0);
    const placeholderShown = data.events.some(
      (entry) => entry.key === 'placeholder' && entry.t >= data.input && entry.value === true,
    );
    const barAt = markAt(data, 'bar', (value) => value === true);
    const pillWords = data.events.find((entry) => entry.key === 'pill' && entry.value)?.value || '';
    const recomputeMs = staleAt === null ? 0 : Math.round(end - staleAt);
    record('V3', 'Depth 3000 → 2000 in section view', data, {
      gap: maxGap(data.frames, data.input, end),
      limits: { gap: 150, links: 0 },
      checks: [
        [
          'old drawing stays on screen (never blank, no placeholder)',
          !blanked && !placeholderShown,
          blanked ? 'blanked' : placeholderShown ? 'placeholder' : 'kept',
        ],
        [
          'stale drawing sits under a region bar',
          staleAt === null || recomputeMs < 50 || barAt !== null,
          staleAt === null ? 'no recompute seen' : `recompute ${recomputeMs} ms · bar ${rel(data, barAt)} ms`,
        ],
        [
          'pill says "Recomputing…" if it outlasts 300 ms',
          recomputeMs < 350 || /Recomputing/.test(pillWords),
          pillWords || 'none',
        ],
      ],
      extra: { recompute: recomputeMs, bar: rel(data, barAt) },
    });
  }

  await plan();
  await sleep(1500);
  // V2: re-entry with the project unchanged (it changed in V3 — so enter, leave, and re-enter).
  await page
    .locator('button', { hasText: /^Section$/ })
    .first()
    .click();
  await page.waitForFunction(() => window.__probe && document.querySelector('g.section-view g.section'), null, {
    timeout: 30000,
  });
  await sleep(2500);
  await plan();
  await sleep(1500);
  await enterView(page, {
    key: 'V2',
    label: 'Section again, project unchanged (warm)',
    button: 'Section',
    kind: 'section',
    cold: false,
    limits: { gap: 50, complete: 150, noWords: true },
  });
  await plan();
  await sleep(1200);

  // Second floor, first cut.
  const floorTwo = page.locator('button', { hasText: /2ndflvor/ });
  if (await floorTwo.count()) {
    await floorTwo.first().click();
    await sleep(1500);
    const row = await enterView(page, {
      key: 'V-floor-2',
      label: 'Section, floor 2 first cut (cold)',
      button: 'Section',
      kind: 'section',
      cold: true,
      limits: { first: 100, gap: 150, complete: 1500, contract: true },
    });
    counts['V-floor-2'] = row.drawn;
    await plan();
    await sleep(1000);
    const floorOne = page.locator('button', { hasText: /first floor/i });
    if (await floorOne.count()) {
      await floorOne.first().click();
      await sleep(1500);
    }
  } else {
    assert('V-floor-2: second floor button found', false, '2ndflvor not in the floor list');
  }

  for (const [key, button] of [
    ['E-front', 'Front'],
    ['E-left', 'Left'],
  ]) {
    const row = await enterView(page, {
      key,
      label: `${button} elevation (cold)`,
      button,
      kind: 'elevation',
      cold: true,
      limits: { first: 100, gap: 150, complete: 400, contract: true },
    });
    counts[key] = row.drawn;
    await plan();
    await sleep(1000);
  }
  await enterView(page, {
    key: 'E-warm',
    label: 'Front elevation again (warm)',
    button: 'Front',
    kind: 'elevation',
    cold: false,
    limits: { gap: 50, complete: 50, noWords: true },
  });
  await plan();
  await sleep(500);
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

  console.log(`Night crossing and section view — ${BASE}`);
  if (RUN_SUN) await sunSession(page);
  if (RUN_SECTION) await sectionSession(page);

  // ── Pixel check for §4.1 ──
  if (RUN_SUN) {
    const sunsetVsNoon = await meanDiff(page, pixels.noon, pixels.sunset);
    assert(
      'Pixels: at 12:00 the pane differs from 17:40 (the day picture, shadow included, is still there)',
      !sunsetVsNoon.error && sunsetVsNoon.mean > 2,
      sunsetVsNoon.error || `mean |Δ| ${sunsetVsNoon.mean.toFixed(2)}/255`,
    );
    for (const [name, label] of [
      ['sunset', 'sun-down frame (17:40)'],
      ['noon', 'noon frame (12:00, shadow cast)'],
    ]) {
      if (!baseline?.pixels?.[name]) {
        console.log(`   SKIP pixel check, ${label}: no --baseline pixels`);
        continue;
      }
      const diff = await meanDiff(page, baseline.pixels[name], pixels[name]);
      assert(
        `Pixels: ${label} unchanged from the baseline (mean |Δ| ≤ 1/255)`,
        !diff.error && diff.mean <= 1,
        diff.error || `mean |Δ| ${diff.mean.toFixed(3)}/255`,
      );
    }
  }
  if (RUN_SECTION) {
    for (const [key, count] of Object.entries(counts)) {
      const reference = baseline?.counts?.[key];
      if (reference === undefined) {
        console.log(`   ${key}: ${count} drawables drawn (no baseline count to compare)`);
        continue;
      }
      assert(`${key}: drawn count equals the synchronous count`, count === reference, `${count} vs ${reference}`);
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
  await writeFile(JSON_OUT, JSON.stringify({ base: BASE, rows, assertions, counts, pixels, errors }, null, 2));
process.exit(failed ? 1 : 0);
