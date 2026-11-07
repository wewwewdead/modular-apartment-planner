// Loading states, measured in a real browser (docs/loading-states.md §8).
//
// Runs the transitions of §2.1 — A, B, C, J, H, E, D, K, G — on the bench
// fixture, prints the §2.1 table (first visible response, ready, freeze) with
// pass/fail against §5, and asserts the DOM contract the loading kit promises:
// the editor frame is up ≤ 150 ms after the click, the 3D pane goes
// loading → compiling → ready, its words appear at 300 ± 50 ms and stay at
// least 400 ms, and no frame gap exceeds 150 ms while anything on the page is
// aria-busy (exceptions listed below with their cap). A second, profiled
// session (C′) reports getProgramInfoLog self time during an editor open.
//
// "Freeze" is the longest gap between two animation frames inside the
// transition. Times are from the input event (its timeStamp), not from when
// the script asked Playwright to click.
//
// Usage (dev server already up: npx vite --port 5199 --strictPort):
//   MSYS_NO_PATHCONV=1 node scripts/verify-loading-states.mjs
//   … --base http://localhost:5198   another server (e.g. a baseline worktree)
//   … --timing-only                  timings only; skip the DOM assertions
//   … --json out.json                also write the raw results
//   … --no-profile                   skip the profiled C′ session
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
const TIMING_ONLY = args.includes('--timing-only');
const JSON_OUT = argValue('--json', null);
const PROFILE = !args.includes('--no-profile');

const envelope = JSON.parse(await readFile(path.join(PROJECT, 'scripts/fixtures/bench-ceiling-project.json'), 'utf8'));
const project = envelope.data;

/*
 * §5 thresholds. `freeze` is the cap on the longest frame gap inside the
 * transition; `firstMs` the first visible response; `readyMs` the ready mark.
 * The exceptions §3 rule 2 allows — one unavoidable block, ≤ 400 ms, only
 * after the placeholder has painted — are named in `exception`.
 */
const THRESHOLDS = {
  A: { firstMs: 250, freeze: 150, freezeFrom: 'toolbar', exception: 'route chunk evaluation before the toolbar paints' },
  B: { firstMs: 100, freeze: 400, exception: 'PROJECT_LOAD commit (reducer + first workspace render)' },
  C: { firstMs: 150, planMs: 500, readyMs: 1500, readyCapMs: 2770, freeze: 400, exception: 'editor body commit after the frame' },
  J: { firstMs: 150, planMs: 500, freeze: 400, exception: 'editor body commit after the frame' },
  H: { firstMs: 250, freeze: 150 },
  E: { firstMs: 150, planMs: 500, readyMs: 1500, freeze: 400, exception: 'editor body commit after the frame' },
  D: { firstMs: 250, freeze: 150 },
  K: { firstMs: 100, freeze: 400, exception: 'PDF render (jsPDF + svg2pdf, one task)' },
  G: { firstMs: 100, freeze: 150 },
};

const results = [];
const assertions = [];
const assert = (name, ok, detail = '') => {
  assertions.push({ name, ok: Boolean(ok), detail });
};

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const response = await fetch(BASE + '/');
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`No dev server at ${BASE}`);
}

/*
 * The in-page probe. Every animation frame it samples the loading markers and
 * records the moment any of them changes, so a mark's time is when it was
 * first on a frame — which, during a freeze, is when the user could see it.
 */
function installProbe({ id, name, env }) {
  window.localStorage.setItem('apartment-planner-projects', JSON.stringify([{ id, name, savedAt: env.savedAt }]));
  window.localStorage.setItem(`apartment-planner-project-${id}`, JSON.stringify(env));
  const probe = { frames: [], events: [], longTasks: [], watch: {}, last: {}, input: 0, running: false };
  window.__probe = probe;
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) probe.longTasks.push({ start: entry.startTime, ms: entry.duration });
    }).observe({ entryTypes: ['longtask'] });
  } catch {
    // no long task timing
  }
  // Timed from the click — the moment the action starts and the user waits.
  window.addEventListener(
    'click',
    (event) => {
      if (!probe.input) probe.input = event.timeStamp;
    },
    true,
  );
  const snapshot = () => {
    const dialog = document.querySelector('[role="dialog"][aria-label$="detail editor"]');
    const state = {
      editorFrame: Boolean(dialog),
      editorPhase: dialog ? dialog.getAttribute('data-editor-phase') || 'ready' : 'none',
      plan: Boolean(dialog?.querySelector('svg[data-tool]')),
      busy: Boolean(document.querySelector('[aria-busy="true"]')),
      bar: Boolean(document.querySelector('[data-loading-bar]')),
      pill: document.querySelector('[data-loading-pill][data-words="shown"]')?.textContent || '',
      busyButton: Boolean(document.querySelector('button[aria-busy="true"]')),
    };
    for (const kind of ['model', 'ceiling', 'wall']) {
      const pane = document.querySelector(`[data-preview-pane="${kind}"]`);
      state[`${kind}Pane`] = pane ? pane.getAttribute('data-loading-state') || 'present' : 'none';
      // Words are revealed by a CSS animation at their due time (the
      // compositor's clock, not this frame's), then marked shown by a timer.
      // A revealed-but-not-yet-marked word counts, at the time it was due.
      const words = pane?.querySelector('[data-words="shown"], [data-words="scheduled"]');
      let text = '';
      if (words?.dataset.words === 'shown') text = words.textContent;
      else if (words) {
        // Scheduled: the reveal's due time on the document timeline. The timer
        // that then marks it shown often wins the race to the next sampled
        // frame on a busy page, so the due time is kept to compare against.
        const reveal = words.getAnimations?.()[0];
        const delay = reveal?.effect?.getTiming?.().delay ?? Infinity;
        if (reveal && reveal.currentTime !== null) {
          state[`${kind}WordsDue`] = Math.round(document.timeline.currentTime - reveal.currentTime + delay);
          if (reveal.currentTime >= delay) text = words.textContent;
        }
      }
      state[`${kind}Words`] = text;
    }
    for (const [key, selector] of Object.entries(probe.watch)) {
      state[key] = Boolean(document.querySelector(selector));
    }
    return state;
  };
  const tick = () => {
    const now = performance.now();
    probe.frames.push(now);
    const state = snapshot();
    for (const [key, value] of Object.entries(state)) {
      if (probe.last[key] !== value) {
        probe.events.push({ t: now, key, value });
        probe.last[key] = value;
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  probe.reset = (watch = {}) => {
    probe.frames = [];
    probe.events = [];
    probe.input = 0;
    probe.watch = watch;
    probe.last = {};
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function launch() {
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
  });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
  await context.addInitScript(installProbe, { id: project.id, name: project.name, env: envelope });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return { browser, context, page, errors };
}

/** First time at/after `from` that `key` took a value matching `test`. */
function markAt(data, key, test, from) {
  const event = data.events.find((entry) => entry.t >= from && entry.key === key && test(entry.value));
  return event ? event.t : null;
}

/** Longest gap between consecutive frames that overlaps [from, to]. */
function maxGap(frames, from, to) {
  let max = 0;
  for (let i = 1; i < frames.length; i++) {
    if (frames[i] < from || frames[i - 1] > to) continue;
    max = Math.max(max, frames[i] - Math.max(frames[i - 1], from));
  }
  return Math.round(max);
}

/** Where the longest gap inside [from, to] began, for the diagnostics line. */
function maxGapStart(frames, from, to) {
  let max = 0;
  let at = null;
  for (let i = 1; i < frames.length; i++) {
    if (frames[i] < from || frames[i - 1] > to) continue;
    const gap = frames[i] - Math.max(frames[i - 1], from);
    if (gap > max) {
      max = gap;
      at = Math.max(frames[i - 1], from);
    }
  }
  return at;
}

/** The state of `key` at time t (the last change at or before it). */
function valueAt(data, key, t) {
  let value;
  for (const entry of data.events) {
    if (entry.t > t) break;
    if (entry.key === key) value = entry.value;
  }
  return value;
}

/** Longest frame gap that starts while the page is aria-busy, inside [from, to]. */
function busyGap(data, from, to) {
  let max = 0;
  for (let i = 1; i < data.frames.length; i++) {
    const a = data.frames[i - 1];
    if (a < from || a > to) continue;
    if (valueAt(data, 'busy', a)) max = Math.max(max, data.frames[i] - a);
  }
  return Math.round(max);
}

/*
 * A build without the loading markers (the baseline) cannot say when its 3D
 * pane drew its first frame. There, "ready" is when the canvas appeared or —
 * since that first frame is the long task that follows it — the end of the
 * last long task within the next few seconds, whichever is later.
 */
const CANVAS_WATCH = {
  editorCanvas: '[role="dialog"] [class*="wallPreviewPanel"] canvas',
  modelCanvas: '[class*="preview"] canvas',
};
function readyOrFallback(data, readyAt, canvasKey) {
  if (readyAt !== null) return readyAt;
  const canvasAt = markAt(data, canvasKey, (value) => value === true, data.input);
  if (canvasAt === null) return null;
  const ends = data.longTasks
    .filter((task) => task.start >= canvasAt - 5 && task.start <= canvasAt + 4000)
    .map((task) => task.start + task.ms);
  return Math.max(canvasAt, ...ends);
}
const SETTLE_MS = TIMING_ONLY ? 3000 : 700;

/** Runs `action`, waits for `done`, and hands back the probe's record from the input on. */
async function capture(page, watch, action, done, settleMs = 600) {
  await page.evaluate((w) => window.__probe.reset(w), watch);
  await sleep(50);
  await action();
  await done();
  await sleep(settleMs);
  const data = await page.evaluate(() => ({
    frames: window.__probe.frames,
    events: window.__probe.events,
    input: window.__probe.input,
    longTasks: window.__probe.longTasks.filter((task) => task.start >= window.__probe.input - 5),
  }));
  if (!data.input) data.input = data.frames[0] || 0;
  return data;
}

const rel = (data, t) => (t === null || t === undefined ? null : Math.round(t - data.input));

function record(key, label, data, { first, ready, freeze, extra = {} }) {
  const limits = THRESHOLDS[key];
  const checks = [];
  if (limits.firstMs !== undefined) checks.push(first !== null && first <= limits.firstMs);
  if (limits.freeze !== undefined) checks.push(freeze <= limits.freeze);
  if (limits.readyCapMs !== undefined) checks.push(ready !== null && ready <= limits.readyCapMs);
  const row = {
    key,
    label,
    first,
    ready,
    freeze,
    longTasksMs: Math.round(data.longTasks.reduce((sum, task) => sum + task.ms, 0)),
    pass: checks.every(Boolean),
    ...extra,
  };
  results.push(row);
  const tasks = data.longTasks.map((task) => `${Math.round(task.start - data.input)}+${Math.round(task.ms)}`).join(', ');
  console.log(
    `${key}. ${label}: first ${first ?? '—'} ms · ready ${ready ?? '—'} ms · freeze ${freeze} ms · ${
      row.pass ? 'PASS' : 'FAIL'
    }${tasks ? `  (long tasks at+ms: ${tasks})` : ''}`,
  );
  return row;
}

/** The 3D pane contract (§5.4): words timing and the loading → compiling → ready walk. */
function checkPane(key, data, kind) {
  const paneKey = `${kind}Pane`;
  const states = data.events.filter((entry) => entry.key === paneKey).map((entry) => entry.value);
  const walk = states.filter((value, index) => value !== states[index - 1]);
  const readyIndex = walk.indexOf('ready');
  const before = readyIndex >= 0 ? walk.slice(0, readyIndex) : walk;
  assert(`${key}: 3D pane reports data-loading-state up to "ready"`, readyIndex >= 0, walk.join(' → '));
  assert(
    `${key}: 3D pane goes loading → compiling → ready`,
    before.includes('loading') && before.includes('compiling') && readyIndex >= 0,
    walk.join(' → '),
  );
  // Visible at the reveal's due time when a still-scheduled element was seen
  // before that time and the words were up at the next look; else as sampled.
  const sampledOn = markAt(data, `${kind}Words`, (value) => value !== '', data.input);
  const due = data.events
    .filter((entry) => entry.key === `${kind}WordsDue` && entry.t >= data.input && entry.t <= entry.value + 5)
    .map((entry) => entry.value)
    .filter((value) => sampledOn !== null && value <= sampledOn + 5);
  const wordsOn = due.length ? Math.min(...due) : sampledOn;
  const readyAt = markAt(data, paneKey, (value) => value === 'ready', data.input);
  if (wordsOn === null) {
    assert(`${key}: 3D pane words (none: ready before 300 ms)`, readyAt !== null && rel(data, readyAt) < 350);
  } else {
    const at = rel(data, wordsOn);
    assert(`${key}: 3D pane words appear at 300 ± 50 ms`, at >= 250 && at <= 350, `${at} ms`);
    const wordsOff = markAt(data, `${kind}Words`, (value) => value === '', wordsOn);
    const held = wordsOff === null ? Infinity : Math.round(wordsOff - wordsOn);
    assert(`${key}: 3D pane words stay ≥ 400 ms`, held >= 390, `${held} ms`);
  }
  return { walk: walk.join(' → '), wordsAt: wordsOn === null ? null : rel(data, wordsOn) };
}

async function openDraft(page) {
  await page.getByRole('button', { name: 'Load Project' }).click();
  await page.getByText(project.name).first().waitFor();
  await page.locator('[class*="modalCard"]').filter({ hasText: project.name }).first().locator('button').first().click();
  await page.waitForFunction(() => document.querySelectorAll('[data-type="wall"]').length > 0, null, { timeout: 30000 });
}

const ceilingsExpanded = async (page) => {
  const header = page.locator('button[aria-expanded]').filter({ hasText: 'Ceilings' }).first();
  if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
  await sleep(300);
};

const paneReady = (page, kind) =>
  page.waitForFunction(
    (k) => {
      const pane = document.querySelector(`[data-preview-pane="${k}"]`);
      // A build without the loading markers (a baseline run) is ready when its canvas exists.
      if (pane && pane.hasAttribute('data-loading-state')) return pane.getAttribute('data-loading-state') === 'ready';
      return Boolean(document.querySelector('[role="dialog"] [class*="wallPreviewPanel"] canvas'));
    },
    kind,
    { timeout: 60000 },
  );

async function openCeilingEditor(page, key, label) {
  const data = await capture(
    page,
    CANVAS_WATCH,
    () => page.locator('button[title^="Edit"]').first().click(),
    () => paneReady(page, 'ceiling'),
    SETTLE_MS,
  );
  const frameAt = markAt(data, 'editorFrame', (value) => value === true, data.input);
  const planAt = markAt(data, 'plan', (value) => value === true, data.input);
  const readyAt = readyOrFallback(
    data,
    markAt(data, 'ceilingPane', (value) => value === 'ready', data.input),
    'editorCanvas',
  );
  const end = readyAt ?? data.frames[data.frames.length - 1];
  const freeze = maxGap(data.frames, data.input, end);
  // §5.4: after the frame has painted, nothing may block longer than the cap.
  const afterFrame = frameAt === null ? freeze : maxGap(data.frames, frameAt, end);
  const pane = TIMING_ONLY ? {} : checkPane(key, data, 'ceiling');
  const row = record(key, label, data, {
    first: rel(data, frameAt),
    ready: rel(data, readyAt) ?? Math.round(end - data.input),
    freeze,
    extra: { plan: rel(data, planAt), freezeAfterFrame: afterFrame, busyGap: busyGap(data, data.input, end), ...pane },
  });
  if (!TIMING_ONLY) {
    const limits = THRESHOLDS[key];
    assert(`${key}: editor frame ≤ ${limits.firstMs} ms`, row.first !== null && row.first <= limits.firstMs, `${row.first} ms`);
    assert(`${key}: 2D plan ≤ ${limits.planMs} ms`, row.plan !== null && row.plan <= limits.planMs, `${row.plan} ms`);
    assert(
      `${key}: frame paint → 3D first frame, no gap > ${limits.freeze} ms (cap for: ${limits.exception})`,
      afterFrame <= limits.freeze,
      `${afterFrame} ms`,
    );
    assert(
      `${key}: the shell painted before the body (data-editor-phase="opening" seen)`,
      data.events.some((entry) => entry.key === 'editorPhase' && entry.value === 'opening'),
    );
  }
  return row;
}

async function profileSession() {
  const { browser, context, page } = await launch();
  try {
    await page.goto(BASE + '/floorplan', { waitUntil: 'networkidle' });
    await sleep(800);
    await openDraft(page);
    await sleep(2500);
    await ceilingsExpanded(page);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
    await cdp.send('Profiler.start');
    const row = await openCeilingEditor(page, 'C', "C′. Ceilings → Edit (CPU-profiled)");
    results.pop();
    row.key = "C′";
    results.push(row);
    const { profile } = await cdp.send('Profiler.stop');
    const self = new Map();
    const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
    profile.samples.forEach((id, index) => self.set(id, (self.get(id) || 0) + (profile.timeDeltas[index] || 0)));
    const byName = new Map();
    for (const [id, us] of self) {
      const name = nodes.get(id).callFrame.functionName || '(anonymous)';
      byName.set(name, (byName.get(name) || 0) + us);
    }
    const infoLogMs = Math.round((byName.get('getProgramInfoLog') || 0) / 1000);
    row.getProgramInfoLogMs = infoLogMs;
    console.log(`   getProgramInfoLog self time during the open: ${infoLogMs} ms`);
    const top = [...byName]
      .filter(([name]) => !['(idle)', '(program)', '(root)'].includes(name))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, us]) => `${name} ${Math.round(us / 1000)} ms`);
    console.log(`   top self time: ${top.join(' · ')}`);
    if (!TIMING_ONLY) assert('C′: getProgramInfoLog self time ≤ 50 ms', infoLogMs <= 50, `${infoLogMs} ms`);
  } finally {
    await browser.close();
  }
}

async function mainSession() {
  const { browser, page, errors } = await launch();
  try {
    // A. Home → Floorplan: cold route chunk, then the main preview's first build.
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await sleep(500);
    {
      const data = await capture(
        page,
        { toolbar: 'button[aria-label="Load Project"]', ...CANVAS_WATCH },
        () => page.getByRole('link', { name: /floorplan/i }).first().click(),
        () =>
          TIMING_ONLY
            ? page.locator('canvas').first().waitFor({ timeout: 60000 })
            : paneReady(page, 'model'),
        TIMING_ONLY ? 3000 : 800,
      );
      const barAt = markAt(data, 'bar', (value) => value === true, data.input);
      const toolbarAt = markAt(data, 'toolbar', (value) => value === true, data.input);
      const readyAt = readyOrFallback(
        data,
        markAt(data, 'modelPane', (value) => value === 'ready', data.input),
        'modelCanvas',
      );
      const end = readyAt ?? data.frames[data.frames.length - 1];
      const afterToolbar = toolbarAt === null ? null : maxGap(data.frames, toolbarAt, end);
      const row = record('A', 'Home → Floorplan (cold route)', data, {
        first: rel(data, toolbarAt),
        ready: rel(data, readyAt),
        freeze: afterToolbar ?? maxGap(data.frames, data.input, end),
        extra: {
          bar: rel(data, barAt),
          freezeWhole: maxGap(data.frames, data.input, end),
          freezeAt: rel(data, maxGapStart(data.frames, toolbarAt ?? data.input, end)),
        },
      });
      console.log(`   longest gap after the toolbar began at ${row.freezeAt} ms`);
      if (!TIMING_ONLY) {
        assert('A: route bar visible ≤ 100 ms', row.bar !== null && row.bar <= 100, `${row.bar} ms`);
        assert('A: toolbar ≤ 250 ms', row.first !== null && row.first <= 250, `${row.first} ms`);
        assert('A: after the toolbar paints, no frame gap > 150 ms', afterToolbar !== null && afterToolbar <= 150, `${afterToolbar} ms`);
        const walk = data.events.filter((entry) => entry.key === 'modelPane').map((entry) => entry.value);
        assert('A: main pane data-loading-state "loading" … "ready"', walk.includes('loading') && walk.at(-1) === 'ready', walk.join(' → '));
      }
    }

    // B. Load Project → a browser draft.
    await sleep(1500);
    await page.getByRole('button', { name: 'Load Project' }).click();
    await page.getByText(project.name).first().waitFor();
    {
      const data = await capture(
        page,
        { modal: '[class*="modalCard"]' },
        () => page.locator('[class*="modalCard"]').filter({ hasText: project.name }).first().locator('button').first().click(),
        () => page.waitForFunction(() => !document.querySelector('[class*="modalCard"]') && document.querySelectorAll('[data-type="wall"]').length > 0, null, { timeout: 30000 }),
        2500,
      );
      const busyAt = markAt(data, 'busyButton', (value) => value === true, data.input);
      const barAt = markAt(data, 'bar', (value) => value === true, data.input);
      const closedAt = markAt(data, 'modal', (value) => value === false, data.input);
      const first = [busyAt, barAt].filter((t) => t !== null).sort((a, b) => a - b)[0] ?? closedAt;
      const row = record('B', 'Load Project → browser draft', data, {
        first: rel(data, first),
        ready: rel(data, closedAt),
        freeze: maxGap(data.frames, data.input, closedAt ?? data.input),
        extra: { busyGap: busyGap(data, data.input, closedAt ?? data.input) },
      });
      if (!TIMING_ONLY) {
        assert('B: busy state visible ≤ 100 ms', busyAt !== null && rel(data, busyAt) <= 100, `${rel(data, busyAt)} ms`);
        assert('B: no gap > 150 ms while busy (cap 400 for the load commit)', row.busyGap <= 400, `${row.busyGap} ms`);
      }
    }

    // C, H, J: the ceiling assembly editor, cold, closed, then reopened warm.
    await ceilingsExpanded(page);
    await openCeilingEditor(page, 'C', 'Ceilings → Edit (ceiling assembly editor)');
    await sleep(2000);
    {
      const data = await capture(
        page,
        {},
        () => page.locator('button[title^="Close the ceiling detail editor"]').first().click(),
        () => page.locator('[role="dialog"][aria-label$="detail editor"]').waitFor({ state: 'detached', timeout: 30000 }),
        1500,
      );
      const goneAt = markAt(data, 'editorFrame', (value) => value === false, data.input);
      const caughtUp = markAt(data, 'modelPane', (value) => value === 'ready', goneAt ?? data.input);
      record('H', 'Close the ceiling editor', data, {
        first: rel(data, goneAt),
        ready: rel(data, goneAt),
        freeze: maxGap(data.frames, data.input, data.frames[data.frames.length - 1]),
        extra: { catchUp: rel(data, caughtUp) },
      });
    }
    await sleep(1500);
    await openCeilingEditor(page, 'J', 'Reopen the same editor (warm)');
    await page.locator('button[title^="Close the ceiling detail editor"]').first().click();
    await sleep(1500);

    // E. A wall's inside face, through the sidebar's Walls list.
    {
      const wallsHeader = page.locator('button[aria-expanded]').filter({ hasText: /^Walls/ }).first();
      if ((await wallsHeader.getAttribute('aria-expanded')) !== 'true') await wallsHeader.click();
      await sleep(300);
      const row = page.getByText(/^Wall [A-Za-z0-9]+$/).first();
      await row.scrollIntoViewIfNeeded();
      await row.click();
      await sleep(700);
      const presetSelect = page
        .locator('label')
        .filter({ has: page.locator('span', { hasText: /^Assembly$/ }) })
        .locator('select')
        .first();
      const values = await presetSelect.evaluate((el) => [...el.options].map((option) => option.value));
      const framed = values.find((value) => !/chb|masonry|concrete/i.test(value));
      if (framed) {
        await presetSelect.selectOption(framed);
        await sleep(800);
      }
      const design = page.getByRole('button', { name: /Design Inside Face/ }).first();
      await design.scrollIntoViewIfNeeded();
      await sleep(1500);
      const data = await capture(page, CANVAS_WATCH, () => design.click(), () => paneReady(page, 'wall'), SETTLE_MS);
      const frameAt = markAt(data, 'editorFrame', (value) => value === true, data.input);
      const planAt = markAt(data, 'plan', (value) => value === true, data.input);
      const readyAt = readyOrFallback(
        data,
        markAt(data, 'wallPane', (value) => value === 'ready', data.input),
        'editorCanvas',
      );
      const end = readyAt ?? data.frames[data.frames.length - 1];
      const afterFrame = frameAt === null ? null : maxGap(data.frames, frameAt, end);
      const pane = TIMING_ONLY ? {} : checkPane('E', data, 'wall');
      const recorded = record('E', 'Wall → Design Inside Face (wall assembly editor)', data, {
        first: rel(data, frameAt),
        ready: rel(data, readyAt) ?? Math.round(end - data.input),
        freeze: maxGap(data.frames, data.input, end),
        extra: { plan: rel(data, planAt), freezeAfterFrame: afterFrame, ...pane },
      });
      if (!TIMING_ONLY) {
        assert('E: editor frame ≤ 150 ms', recorded.first !== null && recorded.first <= 150, `${recorded.first} ms`);
        assert('E: 2D elevation ≤ 500 ms', recorded.plan !== null && recorded.plan <= 500, `${recorded.plan} ms`);
        assert('E: frame paint → 3D first frame, no gap > 400 ms', afterFrame !== null && afterFrame <= 400, `${afterFrame} ms`);
      }
      await page.locator('button[title^="Close the wall detail editor"]').first().click();
      await sleep(1500);
    }

    // D. Model → Sheets.
    {
      const data = await capture(
        page,
        { sheet: '[data-sheet-export-root]' },
        () => page.getByRole('button', { name: /^sheets$/i }).first().click(),
        () =>
          page.waitForFunction(
            () =>
              document.querySelector('[data-sheet-export-root]') &&
              !document.querySelector('[data-sheet-export-root] [data-loading-state="loading"]') &&
              !/Rendering 3D preview/.test(document.body.textContent),
            null,
            { timeout: 60000 },
          ),
        500,
      );
      const sheetAt = markAt(data, 'sheet', (value) => value === true, data.input);
      record('D', 'Model → Sheets', data, {
        first: rel(data, sheetAt),
        ready: Math.round(data.frames[data.frames.length - 1] - data.input - 500),
        freeze: maxGap(data.frames, data.input, data.frames[data.frames.length - 1]),
      });
    }

    // K. Sheet → Export PDF, timed to the download.
    await sleep(1200);
    {
      await page.getByRole('button', { name: /^Export sheet/ }).first().click();
      await sleep(300);
      const pdfItem = page.getByRole('button', { name: /^PDF$/ }).first();
      let downloadAt = null;
      const data = await capture(
        page,
        {},
        () => pdfItem.click(),
        async () => {
          // A missing download fails the row, not the whole run.
          const download = await page.waitForEvent('download', { timeout: 30000 }).catch(() => null);
          if (download) downloadAt = await page.evaluate(() => performance.now());
        },
        400,
      );
      const visible = [
        markAt(data, 'bar', (value) => value === true, data.input),
        markAt(data, 'busyButton', (value) => value === true, data.input),
      ].filter((t) => t !== null);
      const first = visible.length ? Math.min(...visible) : null;
      const row = record('K', 'Sheet → Export PDF', data, {
        first: rel(data, first),
        ready: rel(data, downloadAt),
        freeze: maxGap(data.frames, data.input, downloadAt ?? data.input),
      });
      if (!TIMING_ONLY) assert('K: busy state (bar or button) ≤ 100 ms', row.first !== null && row.first <= 100, `${row.first} ms`);
    }

    // G. Sketch Studio → 3D Model & workshop: CAD chunk, then the kernel's first build.
    await page.goto(BASE + '/sketch', { waitUntil: 'networkidle' });
    await sleep(1000);
    {
      const workshop = page.getByRole('button', { name: '3D Model & workshop' });
      await workshop.waitFor({ timeout: 60000 });
      const data = await capture(
        page,
        { anyLoading: '[data-loading-state]', modelCurrent: '[data-cad-status="current"], [data-kernel-ready="true"]' },
        () => workshop.click(),
        () => page.getByText('Model current').first().waitFor({ timeout: 120000 }),
        500,
      );
      const placeholderAt = markAt(data, 'anyLoading', (value) => value === true, data.input);
      const end = data.frames[data.frames.length - 1] - 500;
      const row = record('G', 'Sketch Studio → 3D Model & workshop', data, {
        first: rel(data, placeholderAt),
        ready: Math.round(end - data.input),
        freeze: maxGap(data.frames, data.input, end),
      });
      if (!TIMING_ONLY) assert('G: a loading placeholder ≤ 100 ms', row.first !== null && row.first <= 100, `${row.first} ms`);
    }
  } finally {
    await browser.close();
  }
  if (errors.length) console.log('page errors:', errors.slice(0, 5));
  assert('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
}

await waitForServer();
console.log(`Loading states — ${BASE}${TIMING_ONLY ? ' (timings only)' : ''}\n`);
await mainSession();
if (PROFILE) await profileSession();

const ORDER = ['A', 'B', 'C', "C′", 'J', 'H', 'E', 'D', 'K', 'G'];
const fmt = (value) => (value === null || value === undefined ? '—' : `${value} ms`);
console.log('\n| Transition | First visible response | Ready | Freeze | Cap | Result |');
console.log('| --- | --- | --- | --- | --- | --- |');
for (const key of ORDER) {
  const row = results.find((entry) => entry.key === key);
  if (!row) continue;
  const limits = THRESHOLDS[key.replace('′', '')] || {};
  console.log(
    `| ${key}. ${row.label.replace(/^C′\. /, '')} | ${fmt(row.first)} | ${fmt(row.ready)} | ${fmt(row.freeze)}${
      row.freezeAfterFrame !== undefined && row.freezeAfterFrame !== null ? ` (after frame ${row.freezeAfterFrame} ms)` : ''
    } | ${limits.freeze ?? '—'} ms | ${row.pass ? 'pass' : 'FAIL'} |`,
  );
}

if (!TIMING_ONLY) {
  console.log('\nDOM assertions:');
  for (const entry of assertions) console.log(`  ${entry.ok ? 'ok  ' : 'FAIL'} ${entry.name}${entry.detail ? ` — ${entry.detail}` : ''}`);
  console.log(
    '\nExceptions allowed by §3 rule 2 (one block, ≤ 400 ms, after the placeholder has painted):\n' +
      Object.entries(THRESHOLDS)
        .filter(([, limits]) => limits.exception)
        .map(([key, limits]) => `  ${key}: ${limits.exception} (cap ${limits.freeze} ms)`)
        .join('\n'),
  );
}

if (JSON_OUT) await writeFile(JSON_OUT, JSON.stringify({ base: BASE, results, assertions }, null, 2));
const failed = assertions.filter((entry) => !entry.ok).length + results.filter((row) => !row.pass).length;
console.log(`\n${failed ? `${failed} failure(s)` : 'all passed'}`);
process.exitCode = failed && !TIMING_ONLY ? 1 : 0;
