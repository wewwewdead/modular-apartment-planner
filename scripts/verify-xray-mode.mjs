/* global process, console, document, window, performance, requestAnimationFrame, PerformanceObserver, HTMLAnchorElement, HTMLSelectElement, Event, Image, DOMPoint */
// The see-through modes guard (docs/preview-xray-mode.md §7): Solid / X-ray /
// Wireframe in the floor-plan 3D preview. The control and its keys, what the
// first toggle costs (programs linked, longest task), that later toggles link
// nothing, that draw calls and the batch refill path survive X-ray, that the
// walk is unaffected, what the pixels do, that a click picks the column behind
// a ghost wall, the saved file name, that the refine comes back, and (§7.11)
// that a framed HardieFlex wall shows its studs through its ghosted boards.
//   MSYS_NO_PATHCONV=1 FLOORPLAN_VERIFY_URL=http://localhost:5199/playground node scripts/verify-xray-mode.mjs
// WebGL runs on the GPU through ANGLE by default; FLOORPLAN_VERIFY_GL=swiftshader
// forces the software rasteriser (slow).
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const directory = 'artifacts/floorplan/xray-mode';
await mkdir(directory, { recursive: true });
const baseUrl = process.env.FLOORPLAN_VERIFY_URL || 'http://localhost:5199/playground';
const url = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}renderProfile=1`;
const software = process.env.FLOORPLAN_VERIFY_GL === 'swiftshader';
const CANVAS = 'svg[class*="_svg"]';
const PANE = 'section[data-preview-pane="model"]';
const GROUP = '[aria-label="Preview see-through mode"]';
// Accessible names; the Wireframe button's face reads 'Wire' (§4.6).
const LABELS = { solid: 'Solid', xray: 'X-ray', wireframe: 'Wireframe' };

// §7 thresholds, as written in the spec.
const FIRST_TOGGLE_PROGRAMS_MAX = 4;
const FIRST_TOGGLE_LONG_TASK_MAX_MS = 150;
const LATER_TOGGLE_LONG_TASK_MAX_MS = 50;
const DRAW_CALL_RATIO_MAX = 1.15;
const WALK_GAP_MAX_MS = 100;
const XRAY_REVEAL_DELTA_MIN = 40;
const BACKGROUND_DELTA_MAX = 6;
// §7.7(c) is a median over every member that meets the probe rule.
const WIREFRAME_FADES_MEDIAN_MIN = 20;
const REFINE_RESUME_MAX_MS = 3000;

// §7.11 (docs/preview-xray-mode.md §13): a framed (HardieFlex) wall draws its
// real frame, and X-ray shows it. The twins' opacities — GHOST_OPACITY in
// viewMode.js, pinned by viewMode.test.js: the boards ghost at the skin's α,
// the steel studs stay solid in X-ray and drop to the fill in Wireframe.
const FRAMED_SKIN_ALPHA = 0.14;
const FRAMED_WIREFRAME_ALPHA = 0.05;
// A plain 6 m wall alone has 19 members; the re-clad wall must show at least
// this many framing entries (studs, tracks, noggins, kings, trimmers, headers).
const FRAMED_MEMBERS_MIN = 10;
// Half the default 400 mm stud spacing: P_off sits between two studs.
const FRAMED_PAIR_OFFSET_MM = 200;
// The pixel pairs (P_on on a stud, P_off between studs), as a median over
// every pair that meets the rule — 22 of them on the playground. Measured
// 2026-11-07 (§13.6): Solid median 0.1 (both pixels are the same opaque board;
// §13.4.5 asks < 8); X-ray median 63.2 (pairs 35.9–98.1), the steel stud
// showing dark through the board ghosted at 0.14. Two regressions it has to
// tell apart: with the old core slab there are no members to pair at all (0
// pairs; §7.11(a) fails on the framing count too); with the members built but
// ghosted in X-ray (emulated by moving wallFramingSteel to the `core` tier)
// the median fell to 33.7 — not to zero, because a 0.07 ghost still carries
// its 0.5 outlines. The bar sits between the two, 18 under the fix and 11 over
// the ghosted studs. Between the studs the wall still reads like the CHB wall
// it was: median 9.8 against §12's < 20.
const FRAMED_PAIRS_MIN = 10;
const FRAMED_SOLID_PAIR_MAX = 8;
const FRAMED_STUD_CONTRAST_MIN = 45;
const FRAMED_PARITY_MEDIAN_MAX = 20;
// The framing material entering a scene that had none may link through the
// existing compile gate; the X-ray toggle after it must link nothing.
const FRAMED_RECLAD_PROGRAMS_MAX = 2;

/*
 * Frames are paced by vsync here, unlike verify-presentation-visuals. Uncapped
 * (`--disable-frame-rate-limit --disable-gpu-vsync`), any run of interactive
 * frames — a 220 ms crossfade, or just as much a plain orbit drag in Solid —
 * queues GPU work faster than it drains, and the refine's first sample then
 * blocks in a draw call for 50–150 ms waiting for the backlog. No display
 * produces that, and it would charge a long task to whatever ran last.
 * FLOORPLAN_VERIFY_UNPACED=1 puts the two flags back (docs/preview-xray-mode.md §9).
 */
const unpaced = process.env.FLOORPLAN_VERIFY_UNPACED === '1';
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: [
    ...(software
      ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
      : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']),
    ...(unpaced ? ['--disable-frame-rate-limit', '--disable-gpu-vsync'] : []),
  ],
});
const errors = [],
  checks = [],
  failures = [],
  metrics = {};
let page = null;

const check = (line, ok, failure = line) => {
  checks.push(`${ok ? 'ok' : 'FAIL'} — ${line}`);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`);
  if (!ok) failures.push(failure);
};

try {
  page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('previewPerf', '1');
    } catch {
      // A locked-down origin: the dev server turns the handle on anyway.
    }
    window.__longTasks = [];
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          window.__longTasks.push({ start: entry.startTime, duration: entry.duration });
      }).observe({ type: 'longtask', buffered: true });
    } catch {
      // No long-task timing in this browser: the checks below will say so.
    }
    // Downloads are anchors with a data URL: record them instead of saving.
    window.__savedImages = [];
    const original = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function click() {
      if (this.download) {
        window.__savedImages.push({ name: this.download, length: this.href.length });
        return;
      }
      original.call(this);
    };
  });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector(CANVAS, { timeout: 30000 });
  await page.waitForTimeout(1200);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const perf = (expression, arg) =>
    page.evaluate(
      ([source, value]) => {
        const handle = window.__previewPerf;
        if (!handle) return null;
        return new Function('perf', 'arg', `return (${source});`)(handle, value);
      },
      [expression, arg],
    );
  const programs = async () => (await perf('perf.programs().length')) ?? -1;
  const drawables = () => perf('perf.drawables()');
  const lastInteractiveCalls = () =>
    perf("perf.frames().filter((f) => f.action === 'interactive').map((f) => f.calls).pop() ?? null");
  const paneMode = () => page.evaluate((s) => document.querySelector(s)?.getAttribute('data-view-mode'), PANE);
  const pressedModes = () =>
    page.evaluate((g) => {
      const group = document.querySelector(g);
      if (!group) return null;
      return [...group.querySelectorAll('button')].map((b) => ({
        label: b.textContent.trim(),
        name: b.getAttribute('aria-label'),
        pressed: b.getAttribute('aria-pressed'),
        title: b.getAttribute('title'),
      }));
    }, GROUP);
  const now = () => page.evaluate(() => performance.now());
  const frames = (n = 2) =>
    page.evaluate(
      (count) =>
        new Promise((resolve) => {
          let left = count;
          const step = () => (left-- <= 0 ? resolve() : requestAnimationFrame(step));
          requestAnimationFrame(step);
        }),
      n,
    );
  const saveEnabled = () =>
    page.evaluate(() => {
      const button = document.querySelector('[aria-label="Save image"]');
      return Boolean(button && !button.disabled);
    });
  /** Wait for the viewport itself (not just the button) to have landed `mode`, fade included. */
  const settleMode = async (mode) => {
    const start = Date.now();
    while (Date.now() - start < 8000) {
      const [dom, viewport] = await Promise.all([paneMode(), perf('perf.viewMode()')]);
      if (dom === mode && viewport === mode) break;
      await page.waitForTimeout(16);
    }
    await page.waitForTimeout(300); // the 220 ms crossfade
    await frames(2);
  };
  /** Frames since t0 that took a while or came late, as [ms after t0, action, frame ms, gap ms]. */
  const heavyFramesSince = (t0) =>
    perf(
      'perf.frames().filter((f) => f.t >= arg && (f.ms > 15 || f.gapMs > 40)).map((f) => [Math.round(f.t - arg), f.action, f.ms, f.gapMs])',
      t0,
    );
  const longTasksSince = (t0, windowMs = 1000) =>
    page.evaluate(
      ([start, span]) =>
        (window.__longTasks || [])
          .filter((t) => t.start >= start - 5 && t.start <= start + span)
          .map((t) => [Math.round(t.start - start), Math.round(t.duration)]),
      [t0, windowMs],
    );
  const longestTaskSince = (t0, windowMs = 1000) =>
    page.evaluate(
      ([start, span]) => {
        const tasks = (window.__longTasks || []).filter((t) => t.start >= start - 5 && t.start <= start + span);
        return tasks.length ? Math.max(...tasks.map((t) => t.duration)) : 0;
      },
      [t0, windowMs],
    );
  /** Click a mode button the way a person does; returns the page time just before. */
  const clickMode = async (mode) => {
    const t0 = await now();
    await page.click(`${GROUP} button[aria-label="${LABELS[mode]}"]`);
    return t0;
  };
  /** Time until Save image is enabled again (the refine converged), from page time t0. */
  const refinedSince = async (t0) => {
    const limit = software ? 600000 : 20000;
    const start = Date.now();
    while (Date.now() - start < limit) {
      if (await saveEnabled()) return (await now()) - t0;
      await page.waitForTimeout(50);
    }
    return null;
  };
  const converge = async () => {
    const start = Date.now();
    await page.waitForTimeout(300);
    while (Date.now() - start < (software ? 600000 : 90000)) {
      const stats = await perf('perf.snapshot().progressive');
      if (stats && stats.samples > 0 && stats.samples >= stats.targetSamples && (await saveEnabled())) return stats;
      await page.waitForTimeout(200);
    }
    return null;
  };
  const setSelect = (selector, value) =>
    page.evaluate(
      ([s, v]) => {
        const select = document.querySelector(s);
        if (!select) return false;
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
        setter.call(select, v);
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      },
      [selector, value],
    );
  const clickLabel = async (label) => {
    const found = await page.evaluate((l) => {
      const node = document.querySelector(`[aria-label="${l}"]`);
      node?.click();
      return Boolean(node);
    }, label);
    assert(found, `control "${label}" exists`);
    await page.waitForTimeout(450);
  };
  const previewClip = () =>
    page.evaluate((s) => {
      const c = document.querySelector(`${s} canvas`);
      const r = c.getBoundingClientRect();
      return {
        x: Math.max(0, r.x),
        y: Math.max(0, r.y),
        width: Math.min(r.width, window.innerWidth - Math.max(0, r.x)),
        height: Math.min(r.height, window.innerHeight - Math.max(0, r.y)),
      };
    }, PANE);
  /** Mean RGB of a (2r+1)² block at client points, read back out of a screenshot of `clip`. */
  const pixels = async (buffer, clip, points, radius = 2) =>
    page.evaluate(
      async ({ b64, area, at, r }) => {
        const image = new Image();
        image.src = `data:image/png;base64,${b64}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0);
        return at.map(([x, y]) => {
          const data = context.getImageData(
            Math.round(x - area.x) - r,
            Math.round(y - area.y) - r,
            2 * r + 1,
            2 * r + 1,
          ).data;
          const sum = [0, 0, 0];
          for (let i = 0; i < data.length; i += 4) {
            sum[0] += data[i];
            sum[1] += data[i + 1];
            sum[2] += data[i + 2];
          }
          const n = data.length / 4;
          return sum.map((value) => Math.round((value / n) * 10) / 10);
        });
      },
      { b64: buffer.toString('base64'), area: clip, at: points, r: radius },
    );
  const channelDelta = (a, b) => Math.max(...a.map((value, index) => Math.abs(value - b[index])));
  const inspectMeta = () =>
    page.evaluate(() => document.querySelector('[class*="inspectMeta"]')?.textContent?.trim() || null);
  const ensureMode = async (mode) => {
    if ((await paneMode()) !== mode) await clickMode(mode);
    await settleMode(mode);
  };

  // ── Into the pane: focused, iso north-east, settled in Solid ───────────────
  await clickLabel('Focus preview');
  await page.waitForSelector(`${PANE}[data-loading-state="ready"]`, { timeout: software ? 300000 : 60000 });
  await setSelect('[aria-label="Preview view preset"]', 'iso_northeast');
  const clip = await previewClip();
  const solidStats = await converge();
  assert(solidStats, 'the Solid picture converges');
  const solidShot = await page.screenshot({ path: `${directory}/01-solid.png`, clip });
  metrics.clip = clip;

  // Aim the pixel probes (§7.7) and the pick-through (§7.8) while Solid is up.
  // A pixel of backdrop that is really on screen: the focused pane runs under
  // the floating side panels, so the canvas's own corner is not one.
  const visibleOnCanvas = (x, y) =>
    page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.tagName === 'CANVAS', [x, y]);
  let background = null;
  for (const fx of [0.5, 0.4, 0.6, 0.3, 0.7]) {
    const candidate = [Math.round(clip.x + clip.width * fx), Math.round(clip.y + 30)];
    if ((await visibleOnCanvas(...candidate)) && (await perf('perf.probe(arg[0], arg[1]).length', candidate)) === 0) {
      background = candidate;
      break;
    }
  }
  const backgroundHits = background ? await perf('perf.probe(arg[0], arg[1])', background) : null;
  // §7.7's probe: a truss member hidden under the roof — something X-ray
  // reveals. A member mesh (a chord/web/purlin palette key — never the end
  // closures, which are gableInfill) whose centre projects
  // onto a roof face as the nearest hit, with that very mesh further down the
  // same ray and no other member on it. Chords first (the deepest section),
  // then purlins, then webs, each
  // in scene order: a rule, not a search for the best-looking pixel.
  const trussPixel = await perf(
    `(() => {
      const c = arg;
      const rank = (key) => (/^trussChord/.test(key) ? 0 : /^trussPurlin/.test(key) ? 1 : 2);
      const members = perf
        // Members are 'trussInstance' descriptors; the end closures are
        // 'trussSystem' ones. Both kinds are read and the palette key decides.
        .centers('trussInstance')
        .concat(perf.centers('trussSystem'))
        .filter((m) => /^truss(Chord|Web|Purlin)/.test(m.paletteKey || ''))
        .sort((a, b) => rank(a.paletteKey) - rank(b.paletteKey));
      for (const member of members) {
        const p = perf.project(member.center);
        if (p.z >= 1 || p.x < c.x + 30 || p.y < c.y + 30 || p.x > c.x + c.width - 30 || p.y > c.y + c.height - 30) continue;
        if (document.elementFromPoint(p.x, p.y)?.tagName !== 'CANVAS') continue;
        const hits = perf.probe(p.x, p.y);
        const behind = hits.findIndex((h) => h.mesh === member.mesh);
        // The only truss member on its ray: identical trusses seen from a
        // corner stack along the same screen lines, and a pixel where several
        // members (and so several outlines) coincide measures the stack, not
        // the member.
        const onRay = hits.filter((h) => /^truss(Chord|Web|Purlin)/.test(h.paletteKey || ''));
        const alone = onRay.length > 0 && onRay.every((h) => h.mesh === member.mesh);
        if (hits[0] && /^roof/.test(hits[0].paletteKey || '') && behind > 0 && alone) {
          return {
            x: p.x,
            y: p.y,
            world: member.center.map((v) => Math.round(v)),
            member: member.paletteKey,
            sourceId: member.sourceId,
            candidates: members.length,
            hits: hits.slice(0, behind + 1).map((h) => ({ kind: h.kind, paletteKey: h.paletteKey, distance: h.distance })),
          };
        }
      }
      return { candidates: members.length, found: false };
    })()`,
    clip,
  );
  // Every member that meets the same rule, for the record: the checks use the
  // first, the spread says how much that choice matters.
  const trussPixels = await perf(
    `(() => {
      const c = arg;
      const out = [];
      const members = perf
        .centers('trussInstance')
        .concat(perf.centers('trussSystem'))
        .filter((m) => /^truss(Chord|Web|Purlin)/.test(m.paletteKey || ''));
      for (const member of members) {
        const p = perf.project(member.center);
        if (p.z >= 1 || p.x < c.x + 30 || p.y < c.y + 30 || p.x > c.x + c.width - 30 || p.y > c.y + c.height - 30) continue;
        if (document.elementFromPoint(p.x, p.y)?.tagName !== 'CANVAS') continue;
        const hits = perf.probe(p.x, p.y);
        const onRay = hits.filter((h) => /^truss(Chord|Web|Purlin)/.test(h.paletteKey || ''));
        if (!hits[0] || !/^roof/.test(hits[0].paletteKey || '')) continue;
        if (!onRay.length || !onRay.every((h) => h.mesh === member.mesh)) continue;
        out.push([p.x, p.y]);
      }
      return out;
    })()`,
    clip,
  );
  metrics.probes = {
    background,
    backgroundHits: backgroundHits?.length ?? null,
    trussPixel,
    trussPixels: trussPixels?.length ?? 0,
  };
  // A pixel on a plain (CHB) wall face with a column behind it — §7.8's
  // pick-through, and §7.11's choice of which wall to re-clad.
  const COLUMN_BEHIND_WALL = `(() => {
      const c = arg;
      for (const column of perf.centers('column')) {
        for (const lift of [0, 0.2, -0.2, 0.35, -0.35]) {
          const p = perf.project([column.center[0], column.center[1] + column.size[1] * lift, column.center[2]]);
          if (p.z >= 1 || p.x < c.x + 30 || p.y < c.y + 30 || p.x > c.x + c.width - 30 || p.y > c.y + c.height - 30) continue;
          const hits = perf.probe(p.x, p.y);
          if (document.elementFromPoint(p.x, p.y)?.tagName !== 'CANVAS') continue;
          const behind = hits.findIndex((h) => h.kind === 'column' && h.sourceId === column.sourceId);
          if (hits[0] && hits[0].kind === 'wall' && hits[0].paletteKey === 'wall' && behind > 0 &&
              hits.slice(0, behind).every((h) => h.kind === 'wall' || h.kind === 'window' || h.kind === 'slab')) {
            return { x: p.x, y: p.y, column: column.sourceId, hits: hits.slice(0, behind + 1) };
          }
        }
      }
      return null;
    })()`;
  const pickPixel = await perf(COLUMN_BEHIND_WALL, clip);
  metrics.probes.pickPixel = pickPixel;

  // ── §7.2 First toggle cost ─────────────────────────────────────────────────
  const programsBefore = await programs();
  const t0First = await clickMode('xray');
  await settleMode('xray');
  const xrayCalls = await lastInteractiveCalls();
  const programsAfterFirst = await programs();
  await page.waitForTimeout(Math.max(0, 1000 - ((await now()) - t0First)));
  const firstLongTask = await longestTaskSince(t0First);
  metrics.longTasks = [
    { to: 'xray', tasks: await longTasksSince(t0First), heavyFrames: await heavyFramesSince(t0First) },
  ];
  const longTaskSupported = await page.evaluate(() => typeof PerformanceObserver !== 'undefined');
  metrics.firstToggle = { programsBefore, programsAfter: programsAfterFirst, longestTaskMs: firstLongTask };
  check(
    `§7.2 first toggle to X-ray: programs ${programsBefore} → ${programsAfterFirst} (Δ ${programsAfterFirst - programsBefore} ≤ ${FIRST_TOGGLE_PROGRAMS_MAX}); longest long task in the 1 s after the click ${firstLongTask.toFixed(0)} ms (≤ ${FIRST_TOGGLE_LONG_TASK_MAX_MS})`,
    programsBefore > 0 &&
      programsAfterFirst - programsBefore <= FIRST_TOGGLE_PROGRAMS_MAX &&
      longTaskSupported &&
      firstLongTask <= FIRST_TOGGLE_LONG_TASK_MAX_MS,
  );
  const firstRefine = await refinedSince(t0First);
  metrics.refineResume = [{ to: 'xray', ms: firstRefine }];
  await converge();
  const xrayShot = await page.screenshot({ path: `${directory}/02-xray.png`, clip });
  // A 1:1 crop of the middle, for reading the ghosts and the structure up close.
  const detail = {
    x: Math.round(clip.x + clip.width * 0.3),
    y: Math.round(clip.y + clip.height * 0.25),
    width: Math.round(clip.width * 0.4),
    height: Math.round(clip.height * 0.6),
  };
  await page.screenshot({ path: `${directory}/02-xray-detail.png`, clip: detail });
  const xrayDrawables = await drawables();

  // ── §7.9 Save image in X-ray ───────────────────────────────────────────────
  await page.click('[aria-label="Save image"]');
  await page.waitForTimeout(400);
  const saved = await page.evaluate(() => (window.__savedImages || []).map((entry) => entry.name).pop() || null);
  metrics.savedImage = saved;
  check(`§7.9 Save image in X-ray → "${saved}"`, Boolean(saved) && saved.endsWith('-xray.png'));

  // ── Wireframe, first time ──────────────────────────────────────────────────
  const t0Wire = await clickMode('wireframe');
  await settleMode('wireframe');
  const wireCalls = await lastInteractiveCalls();
  const programsAfterWire = await programs();
  await page.waitForTimeout(Math.max(0, 1000 - ((await now()) - t0Wire)));
  const wireLongTask = await longestTaskSince(t0Wire);
  metrics.longTasks.push({ to: 'wireframe', tasks: await longTasksSince(t0Wire) });
  metrics.refineResume.push({ to: 'wireframe', ms: await refinedSince(t0Wire) });
  await converge();
  const wireShot = await page.screenshot({ path: `${directory}/03-wireframe.png`, clip });
  const wireDrawables = await drawables();

  // ── Back to Solid, for the draw-call baseline ──────────────────────────────
  const t0Solid = await clickMode('solid');
  await settleMode('solid');
  const solidCalls = await lastInteractiveCalls();
  await page.waitForTimeout(Math.max(0, 1000 - ((await now()) - t0Solid)));
  const solidLongTask = await longestTaskSince(t0Solid);
  metrics.longTasks.push({ to: 'solid', tasks: await longTasksSince(t0Solid) });
  metrics.refineResume.push({ to: 'solid', ms: await refinedSince(t0Solid) });
  await converge();
  const solidDrawables = await drawables();

  // ── §7.3 Later toggles are free ────────────────────────────────────────────
  const later = [
    { to: 'wireframe', ms: wireLongTask, programs: programsAfterWire },
    { to: 'solid', ms: solidLongTask, programs: await programs() },
  ];
  for (const mode of ['xray', 'wireframe', 'solid', 'xray']) {
    const t0 = await clickMode(mode);
    await settleMode(mode);
    const resumed = await refinedSince(t0);
    metrics.refineResume.push({ to: mode, ms: resumed });
    await page.waitForTimeout(Math.max(0, 1000 - ((await now()) - t0)));
    later.push({ to: mode, ms: await longestTaskSince(t0), programs: await programs() });
    metrics.longTasks.push({ to: mode, tasks: await longTasksSince(t0), heavyFrames: await heavyFramesSince(t0) });
    await converge();
  }
  // The control: the same wait after a camera nudge, which restarts the refine
  // exactly as a toggle does but changes no material. Whatever long tasks this
  // shows are the refine restart's, not the mode's.
  const nudges = [];
  for (let i = 0; i < 3; i += 1) {
    const t0 = await now();
    await page.mouse.move(clip.x + clip.width / 2, clip.y + clip.height / 2);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(clip.x + clip.width / 2 + 3, clip.y + clip.height / 2 + 1);
    await page.mouse.move(clip.x + clip.width / 2 + 6, clip.y + clip.height / 2 + 2);
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(1000);
    nudges.push({
      ms: await longestTaskSince(t0),
      tasks: await longTasksSince(t0),
      heavyFrames: await heavyFramesSince(t0),
    });
    await converge();
  }
  metrics.nudgeControl = nudges;
  metrics.laterToggles = later;
  check(
    `§7.3 later toggles (→ ${later.map((row) => row.to).join(' → ')}): programs ${later.map((row) => row.programs).join(', ')} (all ${programsAfterFirst}); longest tasks ${later.map((row) => row.ms.toFixed(0)).join(', ')} ms (each ≤ ${LATER_TOGGLE_LONG_TASK_MAX_MS})`,
    later.every((row) => row.programs === programsAfterFirst && row.ms <= LATER_TOGGLE_LONG_TASK_MAX_MS),
  );

  // ── §7.10 Refine resumes ───────────────────────────────────────────────────
  check(
    `§7.10 refine back (Save image enabled) after each toggle: ${metrics.refineResume.map((row) => `${row.to} ${row.ms === null ? 'never' : `${Math.round(row.ms)} ms`}`).join(', ')} (each ≤ ${REFINE_RESUME_MAX_MS})`,
    metrics.refineResume.every((row) => row.ms !== null && row.ms <= REFINE_RESUME_MAX_MS),
  );

  // ── §7.4 Draw calls ────────────────────────────────────────────────────────
  metrics.drawCalls = {
    drawables: { solid: solidDrawables, xray: xrayDrawables, wireframe: wireDrawables },
    lastInteractiveFrameCalls: { solid: solidCalls, xray: xrayCalls, wireframe: wireCalls },
  };
  check(
    `§7.4 scene draw list: Solid ${solidDrawables}, X-ray ${xrayDrawables} (${(xrayDrawables / solidDrawables).toFixed(3)}×), Wireframe ${wireDrawables} (${(wireDrawables / solidDrawables).toFixed(3)}×); last interactive frame calls ${solidCalls} / ${xrayCalls} / ${wireCalls} (${(xrayCalls / solidCalls).toFixed(3)}× / ${(wireCalls / solidCalls).toFixed(3)}×)`,
    xrayDrawables / solidDrawables <= DRAW_CALL_RATIO_MAX &&
      wireDrawables / solidDrawables <= DRAW_CALL_RATIO_MAX &&
      xrayCalls / solidCalls <= DRAW_CALL_RATIO_MAX &&
      wireCalls / solidCalls <= DRAW_CALL_RATIO_MAX,
  );

  // ── §7.7 Pixels ────────────────────────────────────────────────────────────
  if (trussPixel?.x !== undefined && background && backgroundHits?.length === 0) {
    // A member is about four pixels wide at this distance, and in Wireframe
    // its two edges are drawn at 0.9 — so a 3×3 block is mostly its outline,
    // which is as dark as the metal it stands for. The fill (c) is about lives
    // at the member's centre pixel; that one pixel is the sample. The backdrop,
    // a flat field, is averaged 5×5.
    const at = [[trussPixel.x, trussPixel.y]];
    const [[solidMember], [xrayMember], [wireMember]] = await Promise.all(
      [solidShot, xrayShot, wireShot].map((shot) => pixels(shot, clip, at, 0)),
    );
    const [[solidBg], [xrayBg], [wireBg]] = await Promise.all(
      [solidShot, xrayShot, wireShot].map((shot) => pixels(shot, clip, [background])),
    );
    const revealDelta = channelDelta(solidMember, xrayMember);
    const bgDelta = Math.max(channelDelta(solidBg, xrayBg), channelDelta(solidBg, wireBg));
    const fadeDelta = channelDelta(xrayMember, wireMember);
    metrics.pixels = {
      probe: {
        pixel: [Math.round(trussPixel.x), Math.round(trussPixel.y)],
        world: trussPixel.world,
        member: trussPixel.member,
      },
      solidMember,
      xrayMember,
      wireMember,
      solidBg,
      xrayBg,
      wireBg,
      revealDelta,
      bgDelta,
      fadeDelta,
    };
    // (c) is judged on the population, not the one probe: a member is ~4 px
    // wide here, and in Wireframe its centre pixel is as likely to land on one
    // of its two 0.9-opacity edges as on the faint fill between them.
    const median = (values) => {
      if (!values.length) return null;
      const sorted = values.slice().sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    };
    let population = { count: 0, revealMedian: null, fadeMedian: null };
    if (trussPixels?.length) {
      const [s, x, w] = await Promise.all(
        [solidShot, xrayShot, wireShot].map((shot) => pixels(shot, clip, trussPixels, 0)),
      );
      const revealDeltas = s.map((value, i) => channelDelta(value, x[i]));
      const fadeDeltas = x.map((value, i) => channelDelta(value, w[i]));
      const rounded = (values) =>
        values
          .slice()
          .sort((a, b) => a - b)
          .map((v) => Math.round(v * 10) / 10);
      population = {
        count: trussPixels.length,
        revealMedian: median(revealDeltas),
        fadeMedian: median(fadeDeltas),
        revealDeltas: rounded(revealDeltas),
        fadeDeltas: rounded(fadeDeltas),
      };
    }
    metrics.pixels.population = population;
    check(
      `§7.7(a) truss member ${trussPixel.member} under the roof at (${Math.round(trussPixel.x)}, ${Math.round(trussPixel.y)}), world ${JSON.stringify(trussPixel.world)}: Solid ${JSON.stringify(solidMember)} vs X-ray ${JSON.stringify(xrayMember)}, Δ ${revealDelta.toFixed(1)} (> ${XRAY_REVEAL_DELTA_MIN}); population median ${population.revealMedian} over ${population.count} members`,
      revealDelta > XRAY_REVEAL_DELTA_MIN,
    );
    check(
      `§7.7(b) background pixel (${background.join(', ')}) unchanged across modes: Δ ${bgDelta.toFixed(1)} (< ${BACKGROUND_DELTA_MAX})`,
      bgDelta < BACKGROUND_DELTA_MAX,
    );
    check(
      `§7.7(c) Wireframe vs X-ray over ${population.count} members: median Δ ${population.fadeMedian} (> ${WIREFRAME_FADES_MEDIAN_MIN}); the probe's own Δ ${fadeDelta.toFixed(1)} (recorded, not asserted)`,
      population.count > 0 && population.fadeMedian > WIREFRAME_FADES_MEDIAN_MIN,
    );
  } else {
    check(
      `§7.7 found a truss member under a roof face (${trussPixel?.candidates ?? 0} members) and an empty background pixel`,
      false,
    );
  }
  await setSelect('[aria-label="Preview view preset"]', 'elevation_front');
  await converge();
  await page.screenshot({ path: `${directory}/04-xray-elevation_front.png`, clip });
  await setSelect('[aria-label="Preview view preset"]', 'iso_northeast');
  await converge();

  // ── §7.8 Pick-through ──────────────────────────────────────────────────────
  if (pickPixel) {
    await ensureMode('xray');
    await page.mouse.click(pickPixel.x, pickPixel.y);
    await page.waitForTimeout(600);
    const xrayPick = await inspectMeta();
    await ensureMode('solid');
    await page.mouse.click(pickPixel.x, pickPixel.y);
    await page.waitForTimeout(600);
    const solidPick = await inspectMeta();
    metrics.pick = { pixel: pickPixel, xray: xrayPick, solid: solidPick };
    check(
      `§7.8 click at (${Math.round(pickPixel.x)}, ${Math.round(pickPixel.y)}): X-ray picks "${xrayPick}", Solid picks "${solidPick}"`,
      /Column$/.test(xrayPick || '') && /Wall$/.test(solidPick || ''),
    );
    // No Escape to deselect: in focus mode Escape also leaves focus mode.
  } else {
    check('§7.8 found a pixel on a ghost wall with a column behind it', false);
  }

  // ── §7.6 Walk is unaffected ────────────────────────────────────────────────
  await ensureMode('xray');
  await page.click(`${PANE} button:text-is("Walk")`);
  await page.waitForTimeout(500);
  const walkBox = await previewClip();
  await page.mouse.click(walkBox.x + walkBox.width / 2, walkBox.y + walkBox.height * 0.6);
  let locked = false;
  for (let i = 0; i < 20 && !locked; i += 1) {
    await page.waitForTimeout(50);
    locked = await page.evaluate(() => Boolean(document.pointerLockElement));
  }
  await perf('perf.reset()');
  const walkFrom = await perf('perf.camera().position');
  await page.keyboard.down('w');
  await page.waitForTimeout(600);
  await page.keyboard.up('w');
  await page.waitForTimeout(100);
  const walk = await perf(
    '(() => { const f = perf.frames(); return { frames: f.length, maxGap: Math.max(0, ...f.slice(1).map((r) => r.gapMs)), mode: perf.snapshot().navigationMode, view: perf.viewMode() }; })()',
  );
  const walkTo = await perf('perf.camera().position');
  const distance = (a, b) => (a && b ? Math.round(Math.hypot(...b.map((v, i) => v - a[i]))) : 0);
  const walked = distance(walkFrom, walkTo);
  // The playground's physical spawn does not move under W in Solid either (the
  // body steps and stays put), so movement is proved in no-clip: C, W, C.
  await page.keyboard.press('c');
  await page.waitForTimeout(150);
  const flyFrom = await perf('perf.camera().position');
  await page.keyboard.down('w');
  await page.waitForTimeout(600);
  await page.keyboard.up('w');
  await page.waitForTimeout(100);
  const flew = distance(flyFrom, await perf('perf.camera().position'));
  const flyGap = await perf('Math.max(0, ...perf.frames().slice(-60).map((r) => r.gapMs))');
  await page.keyboard.press('c');
  await page.waitForTimeout(150);
  metrics.walk = { locked, physicalWalkedMm: walked, noClipFlewMm: flew, noClipWorstGapMs: flyGap, ...walk };
  check(
    `§7.6 walk in X-ray (pointer lock ${locked}): physical walk ${walk?.frames} frames over W held 600 ms, worst gap ${walk?.maxGap?.toFixed(1)} ms (≤ ${WALK_GAP_MAX_MS}), moved ${walked} mm; no-clip W moved ${flew} mm, worst gap ${flyGap?.toFixed?.(1)} ms; still "${walk?.view}"`,
    locked &&
      flew > 100 &&
      flyGap <= WALK_GAP_MAX_MS &&
      walk?.mode === 'walk' &&
      walk.frames > 10 &&
      walk.maxGap <= WALK_GAP_MAX_MS &&
      walk.view === 'xray',
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.click(`${PANE} button:text-is("Inspect")`);
  await page.waitForTimeout(500);

  // ── §7.5 Batching survives a rebuild in X-ray ──────────────────────────────
  // Out of focus mode, so the plan and the properties panel are on screen.
  if (await page.evaluate(() => Boolean(document.querySelector('[aria-label="Exit focus mode"]')))) {
    await clickLabel('Exit focus mode');
  }
  await page.waitForTimeout(800);
  // The wall is selected first, so its overlay is in every measurement below.
  // Plan picking is the canvas's own hit test, where doors, windows and the
  // columns at a wall's ends win — so walk points along each wall's outline
  // until the properties panel shows a wall's own fields (its Assembly).
  const wallCandidates = await page.evaluate((canvas) => {
    const svg = document.querySelector(canvas);
    const view = svg.getBoundingClientRect();
    const out = [];
    for (const polygon of svg.querySelectorAll('polygon[data-type="wall"]')) {
      const matrix = polygon.getScreenCTM();
      const points = [...polygon.points].map((p) => new DOMPoint(p.x, p.y).matrixTransform(matrix));
      if (points.length < 4) continue;
      // The outline's two long sides: the first half and the second half reversed.
      const half = Math.floor(points.length / 2);
      const a = points[0];
      const b = points[half - 1];
      const c = points[half];
      const d = points[points.length - 1];
      for (const t of [0.3, 0.7, 0.45, 0.55, 0.2, 0.8]) {
        const x = (a.x + (b.x - a.x) * t + d.x + (c.x - d.x) * t) / 2;
        const y = (a.y + (b.y - a.y) * t + d.y + (c.y - d.y) * t) / 2;
        if (x > view.left + 4 && x < view.right - 4 && y > view.top + 4 && y < view.bottom - 4) out.push({ x, y });
      }
    }
    return out;
  }, CANVAS);
  const wallSelected = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('label')].some(
        (label) => label.textContent.trim().startsWith('Assembly') && label.querySelector('select'),
      ),
    );
  let wall = null;
  for (const candidate of wallCandidates.slice(0, 40)) {
    await page.mouse.click(candidate.x, candidate.y);
    await page.waitForTimeout(250);
    if (await wallSelected()) {
      wall = candidate;
      break;
    }
  }
  await page.waitForTimeout(300);
  /** The calls of the newest interactive frame seen while polling for `ms`. */
  const watchInteractiveCalls = async (ms) => {
    let seen = null;
    const start = Date.now();
    while (Date.now() - start < ms) {
      seen = (await lastInteractiveCalls()) ?? seen;
      await page.waitForTimeout(25);
    }
    return seen;
  };
  await ensureMode('solid');
  const splitSolidCalls = await lastInteractiveCalls();
  await converge();
  const splitSolidDrawables = await drawables();
  await ensureMode('xray');
  await converge();
  const programsBeforeEdit = await programs();
  const drawablesBefore = await drawables();
  const batchIdsBefore = await perf('perf.batches()');
  let edited = null;
  let editCalls = null;
  const field = page
    .locator('label', { has: page.locator('span', { hasText: /^Height$/ }) })
    .locator('input')
    .first();
  if (wall && (await field.count())) {
    const before = await field.inputValue();
    const next = String(Math.round(Number(before) * 0.9));
    await field.click();
    await field.fill(next);
    await field.press('Enter');
    editCalls = await watchInteractiveCalls(500);
    edited = { before, after: await field.inputValue() };
  }
  await converge();
  const editDrawables = await drawables();
  const programsAfterEdit = await programs();
  const batchIdsAfter = await perf('perf.batches()');
  const refilled =
    Array.isArray(batchIdsBefore) &&
    batchIdsBefore.length > 0 &&
    batchIdsAfter?.length === batchIdsBefore.length &&
    batchIdsAfter.every((id, index) => id === batchIdsBefore[index]);
  metrics.rebuild = {
    wall,
    edited,
    splitSolid: { calls: splitSolidCalls, drawables: splitSolidDrawables },
    xrayAfterEdit: { calls: editCalls, drawables: editDrawables, drawablesBefore },
    batches: { before: batchIdsBefore?.length, after: batchIdsAfter?.length, refilled },
    programsBeforeEdit,
    programsAfterEdit,
  };
  check(
    `§7.5 wall height ${edited ? `${edited.before} → ${edited.after}` : 'NOT EDITED'} in X-ray: rebuild frame calls ${editCalls} vs Solid ${splitSolidCalls} (${(editCalls / splitSolidCalls).toFixed(3)}×), draw list ${drawablesBefore} → ${editDrawables} (Solid ${splitSolidDrawables}), ${batchIdsAfter?.length} batches ${refilled ? 'refilled in place' : 'REBUILT'}, programs ${programsBeforeEdit} → ${programsAfterEdit}`,
    Boolean(edited) &&
      edited.after !== edited.before &&
      editCalls / splitSolidCalls <= DRAW_CALL_RATIO_MAX &&
      editDrawables === drawablesBefore &&
      refilled &&
      programsAfterEdit === programsBeforeEdit,
  );

  // ── §7.1 The control, its keys, and the typing guard ───────────────────────
  const buttons = await pressedModes();
  const clicked = [];
  for (const mode of ['xray', 'wireframe', 'solid']) {
    await clickMode(mode);
    await page.waitForTimeout(80);
    clicked.push({
      mode: await paneMode(),
      pressed: (await pressedModes()).filter((b) => b.pressed === 'true').map((b) => b.name),
    });
  }
  const paneBox = await previewClip();
  await page.mouse.move(paneBox.x + paneBox.width / 2, paneBox.y + paneBox.height / 2);
  const keys = [];
  for (const [combo, expected] of [
    ['x', 'xray'],
    ['x', 'solid'],
    ['Shift+X', 'wireframe'],
    ['x', 'solid'],
    ['Shift+X', 'wireframe'],
    ['Shift+X', 'solid'],
  ]) {
    await page.keyboard.press(combo);
    await page.waitForTimeout(80);
    keys.push({ combo, expected, got: await paneMode() });
  }
  // Typing: focus a text field, keep the pointer over the pane, type x.
  const typed = await page.evaluate(() => {
    const editable = [...document.querySelectorAll('input')].filter(
      (node) => (!node.type || node.type === 'text') && node.offsetParent !== null && !node.readOnly && !node.disabled,
    );
    // The project name field (Project Summary → Name) when it is on screen.
    const input =
      editable.find((node) => node.closest('label, div')?.textContent.trim().startsWith('Name')) || editable[0];
    if (!input) return null;
    input.focus();
    return {
      label: input.getAttribute('aria-label') || input.name || input.placeholder || 'text input',
      value: input.value,
    };
  });
  await page.mouse.move(paneBox.x + paneBox.width / 2, paneBox.y + paneBox.height / 2);
  if (typed) {
    await page.keyboard.type('x');
    await page.waitForTimeout(120);
    await page.keyboard.press('Backspace');
  }
  const afterTyping = await paneMode();
  metrics.control = { buttons, clicked, keys, typed, afterTyping };
  check(
    `§7.1 control: ${buttons?.map((b) => b.label).join(' | ')}; clicks → ${clicked.map((row) => `${row.mode}[${row.pressed}]`).join(', ')}; keys ${keys.map((row) => `${row.combo}→${row.got}`).join(', ')}; typing x in "${typed?.label}" left "${afterTyping}"`,
    buttons?.length === 3 &&
      buttons.map((b) => b.name).join() === 'Solid,X-ray,Wireframe' &&
      buttons.map((b) => b.label).join() === 'Solid,X-ray,Wire' &&
      clicked.every(
        (row, index) =>
          row.mode === ['xray', 'wireframe', 'solid'][index] &&
          row.pressed.length === 1 &&
          row.pressed[0] === LABELS[row.mode],
      ) &&
      keys.every((row) => row.got === row.expected) &&
      Boolean(typed) &&
      afterTyping === 'solid',
  );

  // ── §7.11 A framed (HardieFlex) wall goes see-through ─────────────────────
  // docs/preview-xray-mode.md §12–§13. The playground has no framed wall, so
  // one is made the way a person makes one: click the wall §7.8 clicks (a
  // plain wall face with a column behind it) in the 3D pane, and set its
  // Assembly to HardieFlex in the properties panel. Undetailed, it draws its
  // real steel frame between two 6 mm boards — before §13 it drew a stand-in
  // core slab, and X-ray had no studs to show. Last of all, because it changes
  // the model every check above measured.
  await page.evaluate(() => document.activeElement?.blur?.());
  if (!(await page.evaluate(() => Boolean(document.querySelector('[aria-label="Exit focus mode"]'))))) {
    await clickLabel('Focus preview');
  }
  await page.waitForSelector(`${PANE}[data-loading-state="ready"]`, { timeout: software ? 300000 : 60000 });
  await setSelect('[aria-label="Preview view preset"]', 'iso_northeast');
  await ensureMode('solid');
  await converge();
  const framedClip = await previewClip();
  /** Click empty backdrop: a selected wall is drawn by its opaque overlay in every mode (§9.2.7). */
  const clickBackdrop = async () => {
    for (const fx of [0.5, 0.4, 0.6, 0.3, 0.7]) {
      const at = [Math.round(framedClip.x + framedClip.width * fx), Math.round(framedClip.y + 30)];
      if ((await visibleOnCanvas(...at)) && (await perf('perf.probe(arg[0], arg[1]).length', at)) === 0) {
        await page.mouse.click(...at);
        await page.waitForTimeout(500);
        return (await inspectMeta()) === null;
      }
    }
    return false;
  };
  const medianOf = (values) => {
    if (!values.length) return null;
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };
  const framed = { deselectedBefore: await clickBackdrop() };
  await converge();
  const target = await perf(COLUMN_BEHIND_WALL, framedClip);
  framed.target = target ? { x: target.x, y: target.y, wall: target.hits[0].sourceId, column: target.column } : null;

  // The reference: the same view with the wall still CHB, in both modes (the
  // Solid one is for the eye; (c) reads the X-ray one).
  await ensureMode('xray');
  await converge();
  const xrayChbShot = await page.screenshot({ path: `${directory}/05-xray-chb.png`, clip: framedClip });
  await ensureMode('solid');
  await converge();
  await page.screenshot({ path: `${directory}/06-solid-chb.png`, clip: framedClip });
  const programsBeforeFraming = await programs();

  const assemblySelect = page
    .locator('label', { has: page.locator('span', { hasText: /^Assembly$/ }) })
    .locator('select')
    .first();
  if (target) {
    await page.mouse.click(target.x, target.y);
    await page.waitForTimeout(600);
    framed.selected = await inspectMeta();
    if ((await assemblySelect.count()) && /Wall$/.test(framed.selected || '')) {
      framed.assemblyBefore = await assemblySelect.inputValue();
      await assemblySelect.selectOption('fiber_cement');
      await page.waitForTimeout(600);
      framed.assemblyAfter = await assemblySelect.inputValue();
    }
    framed.deselectedAfter = await clickBackdrop();
  }
  await converge();
  const programsFramedSolid = await programs();
  const solidFramedShot = await page.screenshot({ path: `${directory}/07-solid-framed.png`, clip: framedClip });

  // The pairs (§13.4.5b). For every vertical member of the wall — studs,
  // kings, trimmers: taller than it is wide or deep, the kind tag is not
  // exposed — P_on is its centre (and ±0.2·height lifts) and P_off the same
  // point half a stud spacing along the wall. A pair is kept only if, in
  // Solid, both rays enter through a fibre-cement board of this wall, P_on's
  // ray then meets that very member, and P_off's ray meets no framing of this
  // wall before it leaves the wall. The wall's plan axis is read off its own
  // members (the two vertical members furthest apart) rather than a bounding
  // box, which is world-aligned and says nothing about a wall at an angle.
  const framedRule = await perf(
    `(() => {
      const { c, wall, offset } = arg;
      const entries = (perf.centers('wall') || []).filter((m) => m.sourceId === wall);
      const framing = entries.filter((m) => /^wallFraming/.test(m.paletteKey || ''));
      const vertical = framing.filter((m) => m.size[1] > m.size[0] && m.size[1] > m.size[2]);
      let axis = null;
      let far = -1;
      for (const a of vertical) for (const b of vertical) {
        const dx = b.center[0] - a.center[0], dz = b.center[2] - a.center[2];
        const d = Math.hypot(dx, dz);
        if (d > far) { far = d; axis = d > 0 ? [dx / d, dz / d] : null; }
      }
      const onScreen = (p) => p.z < 1 && p.x >= c.x + 30 && p.y >= c.y + 30 && p.x <= c.x + c.width - 30 &&
        p.y <= c.y + c.height - 30 && document.elementFromPoint(p.x, p.y)?.tagName === 'CANVAS';
      // The run of hits that are this wall, from the camera inwards.
      const wallRun = (hits) => {
        const run = [];
        for (const h of hits) { if (h.sourceId !== wall) break; run.push(h); }
        return run;
      };
      const pairs = [];
      if (axis) {
        for (const m of vertical) {
          for (const lift of [0, 0.2, -0.2]) {
            const y = m.center[1] + m.size[1] * lift;
            const on = perf.project([m.center[0], y, m.center[2]]);
            if (!onScreen(on)) continue;
            const onHits = perf.probe(on.x, on.y);
            if (!onHits[0] || onHits[0].sourceId !== wall || onHits[0].paletteKey !== 'wallFiberCement') continue;
            if (!wallRun(onHits).some((h) => h.mesh === m.mesh)) continue;
            for (const sign of [1, -1]) {
              const off = perf.project([m.center[0] + sign * offset * axis[0], y, m.center[2] + sign * offset * axis[1]]);
              if (!onScreen(off)) continue;
              const offHits = perf.probe(off.x, off.y);
              if (!offHits[0] || offHits[0].sourceId !== wall || offHits[0].paletteKey !== 'wallFiberCement') continue;
              if (wallRun(offHits).some((h) => /^wallFraming/.test(h.baseKey || h.paletteKey || ''))) continue;
              pairs.push({ member: m.mesh, lift, on: [on.x, on.y], off: [off.x, off.y] });
              break;
            }
          }
        }
      }
      return {
        axis,
        entries: entries.length,
        framing: framing.length,
        framingKeys: [...new Set(framing.map((m) => m.paletteKey))],
        coreEntries: entries.filter((m) => /^wallCore/.test(m.paletteKey || '')).length,
        vertical: vertical.length,
        pairs,
      };
    })()`,
    { c: framedClip, wall: framed.target?.wall, offset: FRAMED_PAIR_OFFSET_MM },
  );
  framed.rule = framedRule ? { ...framedRule, pairs: framedRule.pairs.length } : null;
  const pairs = framedRule?.pairs || [];
  const batchRowsSolid = (await perf('perf.batchMaterials()')) || [];
  // Solid is the built state: what each batch casts here is what X-ray must
  // leave a solid batch casting.
  const builtCasts = new Map(batchRowsSolid.map((row) => [row.batch, row.castShadow]));

  await ensureMode('xray');
  await converge();
  const programsFramedXray = await programs();
  const xrayFramedShot = await page.screenshot({ path: `${directory}/08-xray-framed.png`, clip: framedClip });
  const batchRowsXray = (await perf('perf.batchMaterials()')) || [];

  await ensureMode('wireframe');
  await converge();
  const programsFramedWireframe = await programs();
  await page.screenshot({ path: `${directory}/09-wireframe-framed.png`, clip: framedClip });
  const batchRowsWireframe = (await perf('perf.batchMaterials()')) || [];
  framed.programs = {
    beforeFraming: programsBeforeFraming,
    solid: programsFramedSolid,
    xray: programsFramedXray,
    wireframe: programsFramedWireframe,
  };

  // (a) Structure: the wall is framed in real members, with no stand-in core
  // anywhere (it is the only framed wall in the model, so any core batch would
  // be its own); X-ray ghosts the boards and keeps the studs solid and
  // casting; Wireframe takes the studs down to the faint fill.
  const rowsOf = (rows, key) => rows.filter((row) => row.baseKey === key);
  const isCore = (row) => /^wallCore/.test(row.baseKey || '');
  const coreRows = [...batchRowsSolid, ...batchRowsXray, ...batchRowsWireframe].filter(isCore);
  const studXray = rowsOf(batchRowsXray, 'wallFramingSteel');
  const boardXray = rowsOf(batchRowsXray, 'wallFiberCement');
  const studWire = rowsOf(batchRowsWireframe, 'wallFramingSteel');
  framed.batches = {
    solid: batchRowsSolid.filter((row) => /^wall(Framing|Core|FiberCement)/.test(row.baseKey || '')),
    xray: [...studXray, ...boardXray, ...batchRowsXray.filter(isCore)],
    wireframe: [...studWire, ...batchRowsWireframe.filter(isCore)],
  };
  const near = (value, expected) => Math.abs(value - expected) < 1e-6;
  const structureOk =
    (framedRule?.framing ?? 0) >= FRAMED_MEMBERS_MIN &&
    framedRule.framingKeys.length === 1 &&
    framedRule.framingKeys[0] === 'wallFramingSteel' &&
    framedRule.coreEntries === 0 &&
    coreRows.length === 0 &&
    boardXray.length > 0 &&
    boardXray.every(
      (row) => row.ghost && near(row.opacity, FRAMED_SKIN_ALPHA) && row.depthWrite === false && !row.castShadow,
    ) &&
    studXray.length > 0 &&
    studXray.every((row) => row.ghost === false && row.castShadow === builtCasts.get(row.batch)) &&
    studWire.length > 0 &&
    studWire.every((row) => row.ghost && near(row.opacity, FRAMED_WIREFRAME_ALPHA) && !row.castShadow) &&
    programsFramedXray === programsFramedSolid &&
    programsFramedSolid - programsBeforeFraming <= FRAMED_RECLAD_PROGRAMS_MAX;

  // (b) The studs are revealed, and (c) between them the wall still reads
  // like a wall. Pixels are 3×3 means.
  const sortedDeltas = (a, b) =>
    a.map((value, i) => Math.round(channelDelta(value, b[i]) * 10) / 10).sort((x, y) => x - y);
  let pixelsOk = false;
  if (pairs.length) {
    const on = pairs.map((pair) => pair.on);
    const off = pairs.map((pair) => pair.off);
    const [solidOn, solidOff, xrayOn, xrayOff, chbOff] = await Promise.all([
      pixels(solidFramedShot, framedClip, on, 1),
      pixels(solidFramedShot, framedClip, off, 1),
      pixels(xrayFramedShot, framedClip, on, 1),
      pixels(xrayFramedShot, framedClip, off, 1),
      pixels(xrayChbShot, framedClip, off, 1),
    ]);
    const solidDeltas = sortedDeltas(solidOn, solidOff);
    const xrayDeltas = sortedDeltas(xrayOn, xrayOff);
    const parityDeltas = sortedDeltas(xrayOff, chbOff);
    framed.pixels = {
      pairs: pairs.length,
      solidMedian: medianOf(solidDeltas),
      xrayMedian: medianOf(xrayDeltas),
      parityMedian: medianOf(parityDeltas),
      solidDeltas,
      xrayDeltas,
      parityDeltas,
      first: { on: pairs[0].on, off: pairs[0].off, solid: [solidOn[0], solidOff[0]], xray: [xrayOn[0], xrayOff[0]] },
    };
    pixelsOk =
      pairs.length >= FRAMED_PAIRS_MIN &&
      framed.pixels.solidMedian < FRAMED_SOLID_PAIR_MAX &&
      framed.pixels.xrayMedian > FRAMED_STUD_CONTRAST_MIN &&
      framed.pixels.parityMedian < FRAMED_PARITY_MEDIAN_MAX;
  }

  // §13.4.4(b): the batch refill path with a framed wall in the model. Select
  // the re-clad wall in Solid (in X-ray a click there picks what is behind the
  // ghost board), then edit its Height in X-ray: every batch, the
  // wallFramingSteel one included, must be refilled in place.
  await ensureMode('solid');
  await converge();
  const refill = {};
  if (framed.target) {
    await page.mouse.click(framed.target.x, framed.target.y);
    await page.waitForTimeout(600);
    refill.selected = await inspectMeta();
  }
  await ensureMode('xray');
  await converge();
  const heightField = page
    .locator('label', { has: page.locator('span', { hasText: /^Height$/ }) })
    .locator('input')
    .first();
  const studRowBefore = rowsOf((await perf('perf.batchMaterials()')) || [], 'wallFramingSteel');
  const idsBefore = await perf('perf.batches()');
  const programsBeforeRefill = await programs();
  if (/Wall$/.test(refill.selected || '') && (await heightField.count())) {
    const before = await heightField.inputValue();
    await heightField.click();
    await heightField.fill(String(Math.round(Number(before) * 0.9)));
    await heightField.press('Enter');
    await page.waitForTimeout(500);
    refill.height = { before, after: await heightField.inputValue() };
  }
  await converge();
  const idsAfter = await perf('perf.batches()');
  const studRowAfter = rowsOf((await perf('perf.batchMaterials()')) || [], 'wallFramingSteel');
  const programsAfterRefill = await programs();
  refill.batches = { before: idsBefore?.length ?? 0, after: idsAfter?.length ?? 0 };
  refill.stud = { before: studRowBefore, after: studRowAfter };
  refill.programs = { before: programsBeforeRefill, after: programsAfterRefill };
  refill.inPlace =
    Array.isArray(idsBefore) &&
    idsBefore.length > 0 &&
    idsAfter?.length === idsBefore.length &&
    idsAfter.every((id, index) => id === idsBefore[index]);
  framed.refill = refill;
  const refillOk =
    Boolean(refill.height) &&
    refill.height.after !== refill.height.before &&
    refill.inPlace &&
    studRowBefore.length > 0 &&
    studRowAfter.length === studRowBefore.length &&
    studRowAfter.every((row, i) => row.batch === studRowBefore[i].batch && row.count === studRowBefore[i].count) &&
    programsAfterRefill === programsBeforeRefill;

  metrics.framedWall = framed;
  check(
    `§7.11(a) framed wall ${framed.target?.wall ?? '—'} ${framed.assemblyBefore ?? '?'} → ${framed.assemblyAfter ?? 'NOT SET'}: ${framedRule?.framing ?? 0} framing entries (${framedRule?.framingKeys?.join(', ') || '—'}; ≥ ${FRAMED_MEMBERS_MIN}), ${framedRule?.vertical ?? 0} vertical, ${framedRule?.coreEntries ?? '?'} core entries, ${coreRows.length} core batch rows; X-ray boards ${boardXray.map((row) => `${row.ghost ? 'ghost' : 'SOLID'} α${row.opacity}${row.depthWrite ? ' depthWrite' : ''}${row.castShadow ? ' casts' : ''}`).join(', ')}; X-ray studs ${studXray.map((row) => `${row.ghost ? 'GHOST' : 'base'}${row.castShadow ? ' casts' : ' no shadow'} (built ${builtCasts.get(row.batch) ? 'casts' : 'no shadow'}) ×${row.count}`).join(', ')}; Wireframe studs ${studWire.map((row) => `${row.ghost ? 'ghost' : 'SOLID'} α${row.opacity}`).join(', ')}; programs ${programsBeforeFraming} → ${programsFramedSolid} (Solid, re-clad Δ ≤ ${FRAMED_RECLAD_PROGRAMS_MAX}) → ${programsFramedXray} (X-ray) → ${programsFramedWireframe} (Wireframe)`,
    framed.assemblyAfter === 'fiber_cement' && framed.deselectedAfter === true && structureOk,
  );
  check(
    `§7.11(b, c) framed wall pixels: ${framed.pixels?.pairs ?? 0} stud/between pairs (≥ ${FRAMED_PAIRS_MIN}); Solid median |on − off| ${framed.pixels?.solidMedian} (< ${FRAMED_SOLID_PAIR_MAX}); X-ray median ${framed.pixels?.xrayMedian} (> ${FRAMED_STUD_CONTRAST_MIN}); between the studs, X-ray against the same pixels as CHB: median ${framed.pixels?.parityMedian} (< ${FRAMED_PARITY_MEDIAN_MAX})`,
    framed.deselectedAfter === true && pixelsOk,
  );
  check(
    `§7.11 refill (§13.4.4b): selected "${refill.selected}", height ${refill.height ? `${refill.height.before} → ${refill.height.after}` : 'NOT EDITED'} in X-ray; ${refill.batches.after} batches ${refill.inPlace ? 'refilled in place' : 'REBUILT'}; wallFramingSteel batch ${studRowBefore.map((row) => `${row.batch.slice(0, 8)}×${row.count}`).join(',') || '—'} → ${studRowAfter.map((row) => `${row.batch.slice(0, 8)}×${row.count}`).join(',') || '—'}; programs ${programsBeforeRefill} → ${programsAfterRefill}`,
    refillOk,
  );

  if (errors.length) throw new Error(`Page errors:\n${errors.join('\n')}`);
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ status: failures.length ? 'failed' : 'passed', errors, checks, failures, metrics }, null, 2),
  );
  console.log('Metrics: ' + JSON.stringify(metrics, null, 2));
  if (failures.length) {
    process.exitCode = 1;
    console.error(`X-ray mode failures:\n- ${failures.join('\n- ')}`);
  } else {
    console.log('X-ray mode verification passed.');
  }
} catch (error) {
  if (page) await page.screenshot({ path: `${directory}/failure.png` }).catch(() => {});
  console.error('Checks so far:\n- ' + checks.join('\n- '));
  console.error(errors);
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ status: 'failed', error: error.message, errors, checks, failures, metrics }, null, 2),
  );
  process.exitCode = 1;
  console.error(error.stack || error.message);
} finally {
  await browser.close();
}
