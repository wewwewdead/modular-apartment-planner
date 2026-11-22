// Perf pass 3, phase C: browser measurement of the drafting canvas on heavy documents.
const { chromium } = require('playwright-core');

const BASE = 'http://localhost:5185/sketch';

function createRandom(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
}

function buildDocument(variant) {
  const random = createRandom(7);
  const entities = [];
  const lineCount = variant === 'mixed' ? 4000 : 5000;
  for (let index = 0; index < lineCount; index += 1) {
    const x = random() * 20000;
    const y = random() * 20000;
    const angle = random() * Math.PI;
    const length = 200 + random() * 1800;
    entities.push({
      id: `line-${index}`,
      type: 'line',
      x1: x,
      y1: y,
      x2: x + Math.cos(angle) * length,
      y2: y + Math.sin(angle) * length,
      layerId: 'default',
      visible: true,
      locked: false,
      meta: {},
    });
  }
  if (variant === 'mixed') {
    for (let index = 0; index < 800; index += 1) {
      const x = random() * 20000;
      const y = random() * 20000;
      entities.push({
        id: `arc-${index}`,
        type: 'arc',
        start: { x, y },
        control: { x: x + 300, y: y + 500 },
        end: { x: x + 600, y },
        layerId: 'default',
        visible: true,
        locked: false,
        meta: {},
      });
    }
    for (let index = 0; index < 200; index += 1) {
      const line = entities[index];
      entities.push({
        id: `dimension-${index}`,
        type: 'dimension',
        subtype: 'aligned',
        p1: { x: line.x1, y: line.y1 },
        p2: { x: line.x2, y: line.y2 },
        offset: 120,
        units: 'mm',
        layerId: 'default',
        visible: true,
        locked: false,
        meta: {
          sourceRefs: [
            { entityId: line.id, sourceType: 'endpoint', sourceKey: 'start' },
            { entityId: line.id, sourceType: 'endpoint', sourceKey: 'end' },
          ],
        },
      });
    }
  }
  return {
    kind: 'sketchstudio-workspace',
    version: 2,
    document: {
      version: 4,
      id: `perf-${variant}`,
      name: `Perf ${variant}`,
      units: 'mm',
      layers: [{ id: 'default', name: 'Default', visible: true, locked: false }],
      entities,
    },
    viewport: { zoom: 0.045, panX: 20, panY: 20 },
    ui: { activeLayerId: 'default', snapEnabled: true, orthoEnabled: false, viewMode: 'plan' },
  };
}

async function measureMoves(page, label, points, options = {}) {
  return page.evaluate(
    async ({ label, points, options }) => {
      const svg = document.querySelector('svg.sketchStudioCanvas');
      const rect = svg.getBoundingClientRect();
      const macrotask = () =>
        new Promise((resolve) => {
          const channel = new MessageChannel();
          channel.port1.onmessage = () => resolve();
          channel.port2.postMessage(null);
        });
      const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
      const commitsBefore = window.__commits;
      const js = [];
      const framed = [];
      const sync = [];
      const target = options.calibrate ? document.body : svg;
      for (const [x, y] of points) {
        const t0 = performance.now();
        target.dispatchEvent(
          new PointerEvent('pointermove', {
            clientX: rect.left + x,
            clientY: rect.top + y,
            buttons: options.buttons ?? 0,
            pointerId: 1,
            pointerType: 'mouse',
            bubbles: true,
            cancelable: true,
          }),
        );
        sync.push(performance.now() - t0);
        await macrotask();
        const t1 = performance.now();
        await frame();
        await frame();
        const t2 = performance.now();
        js.push(t1 - t0);
        framed.push(t2 - t0);
      }
      const commits = window.__commits;
      const stats = (values) => {
        const sorted = [...values].sort((a, b) => a - b);
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        return {
          mean: +mean.toFixed(2),
          p50: +sorted[Math.floor(sorted.length / 2)].toFixed(2),
          max: +sorted.at(-1).toFixed(2),
        };
      };
      return {
        label,
        moves: points.length,
        commitsPerMove: +((commits - commitsBefore) / points.length).toFixed(2),
        syncHandlerMs: stats(sync.slice(2)),
        jsMs: stats(js.slice(2)),
        toSecondFrameMs: stats(framed.slice(2)),
        status: document.querySelector('.sketchStudioStatusBar')?.textContent.slice(0, 120),
      };
    },
    { label, points, options },
  );
}

async function frameStatsDuring(page, run) {
  await page.evaluate(() => {
    window.__frames = [];
    window.__recording = true;
    let last = performance.now();
    const loop = (now) => {
      window.__frames.push(now - last);
      last = now;
      if (window.__recording) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  const start = Date.now();
  await run();
  const wall = Date.now() - start;
  return page.evaluate((wall) => {
    window.__recording = false;
    const frames = window.__frames.slice(2);
    const sorted = [...frames].sort((a, b) => a - b);
    const mean = frames.reduce((a, b) => a + b, 0) / frames.length;
    return {
      wallMs: wall,
      frames: frames.length,
      meanFrameMs: +mean.toFixed(2),
      p95FrameMs: +sorted[Math.floor(sorted.length * 0.95)].toFixed(2),
      maxFrameMs: +sorted.at(-1).toFixed(2),
    };
  }, wall);
}

async function run(variant) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const workspace = buildDocument(variant);
  await page.addInitScript(() => {
    window.__commits = 0;
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true,
      renderers: new Map(),
      inject() {
        return 1;
      },
      onScheduleFiberRoot() {},
      onCommitFiberRoot(_id, root) {
        window.__commits += 1;
        if (!window.__trackWork) return;
        const counts = window.__work || (window.__work = {});
        const previous = window.__seenFibers || new WeakSet();
        const seen = new WeakSet();
        const visit = (fiber) => {
          for (let node = fiber; node; node = node.sibling) {
            seen.add(node);
            // A fiber object not in the last commit was worked on in this one;
            // PerformedWork (1) says its function ran (a memo bail-out clears it).
            if (!previous.has(node) && (node.flags & 1) && typeof node.type !== 'string') {
              const type = node.elementType?.type ?? node.elementType ?? node.type;
              const name = type?.displayName || type?.name || String(node.tag);
              counts[name] = (counts[name] || 0) + 1;
            }
            if (node.child) visit(node.child);
          }
        };
        visit(root.current.child);
        window.__seenFibers = seen;
      },
      onCommitFiberUnmount() {},
      onPostCommitFiberRoot() {},
      checkDCE() {},
    };
  });
  await page.addInitScript((json) => {
    if (!sessionStorage.getItem('perf-seeded')) {
      localStorage.setItem('apartment-planner-sketch-recovery', json);
      sessionStorage.setItem('perf-seeded', '1');
    }
  }, JSON.stringify(workspace));
  await page.goto(BASE);
  await page.waitForSelector('svg.sketchStudioCanvas');
  await page.waitForFunction(
    (count) => document.querySelectorAll('.sketchStudioEntities > *').length >= count,
    variant === 'mixed' ? 4800 : 5000,
    { timeout: 60000 },
  );
  const results = { variant, entityNodes: await page.evaluate(() => document.querySelectorAll('.sketchStudioEntities > *').length) };

  const zoom = 0.045;
  const pan = 20;
  const toScreen = (x, y) => [x * zoom + pan, y * zoom + pan];
  const line = workspace.document.entities[10];
  const other = workspace.document.entities[20];
  const mid = (l) => toScreen((l.x1 + l.x2) / 2, (l.y1 + l.y2) / 2);
  const svgBox = await page.locator('svg.sketchStudioCanvas').boundingBox();
  results.canvas = { width: Math.round(svgBox.width), height: Math.round(svgBox.height) };
  // Empty space: right of the drawing (20000 mm * 0.045 + 20 = 920 px).
  const empty = Array.from({ length: 42 }, (_, index) => [960 + (index % 20), 300 + index]);
  // Let the load settle (the recovery autosave fires 400 ms after it).
  await page.waitForTimeout(1500);
  await measureMoves(page, 'warm-up', empty);
  results.calibration = await measureMoves(page, 'calibration: an event nobody handles', empty, { calibrate: true });
  if (process.env.PROFILE) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.start');
    await measureMoves(page, 'profiled', empty);
    const { profile } = await cdp.send('Profiler.stop');
    require('fs').writeFileSync(process.env.PROFILE, JSON.stringify(profile));
  }
  await page.evaluate(() => { window.__trackWork = true; });
  await measureMoves(page, 'prime the fiber set', empty.slice(0, 3));
  await page.evaluate(() => { window.__work = {}; });
  results.selectEmpty = await measureMoves(page, 'select: empty space', empty);
  results.selectEmptyWork = await page.evaluate(() => { window.__trackWork = false; return window.__work; });
  const hover = Array.from({ length: 42 }, (_, index) => (index % 2 ? mid(line) : mid(other)));
  await page.evaluate(() => { window.__work = {}; window.__trackWork = true; });
  results.selectHover = await measureMoves(page, 'select: hover change every move', hover);
  results.selectHoverWork = await page.evaluate(() => { window.__trackWork = false; return window.__work; });
  const along = Array.from({ length: 42 }, (_, index) => {
    const t = 0.2 + (index / 42) * 0.6;
    return toScreen(line.x1 + (line.x2 - line.x1) * t, line.y1 + (line.y2 - line.y1) * t);
  });
  results.selectAlongLine = await measureMoves(page, 'select: along one line (hover unchanged)', along);

  await page.keyboard.press('Escape');
  await page.mouse.move(960, 300);
  await page.keyboard.press('l');
  results.lineToolNear = await measureMoves(page, 'line tool: along a line (snap)', along);
  results.lineToolEmpty = await measureMoves(page, 'line tool: empty space', empty);
  await page.keyboard.press('v');

  // Pan: middle-button drag with the real mouse.
  await page.mouse.move(svgBox.x + 960, svgBox.y + 300);
  results.pan = await frameStatsDuring(page, async () => {
    await page.mouse.down({ button: 'middle' });
    for (let index = 1; index <= 40; index += 1) {
      await page.mouse.move(svgBox.x + 960 - index * 5, svgBox.y + 300 + index * 2);
    }
    await page.mouse.up({ button: 'middle' });
  });
  results.afterPanTransform = await page.evaluate(
    () => document.querySelector('svg.sketchStudioCanvas > g').getAttribute('transform'),
  );

  // Move one selected line with the real mouse (a transform drag).
  const panned = await page.evaluate(() => {
    const transform = document.querySelector('svg.sketchStudioCanvas > g').getAttribute('transform');
    const [, x, y, s] = transform.match(/translate\(([-\d.e]+) ([-\d.e]+)\) scale\(([-\d.e]+)\)/);
    return { x: Number(x), y: Number(y), s: Number(s) };
  });
  const lineMid = [((line.x1 + line.x2) / 2) * panned.s + panned.x, ((line.y1 + line.y2) / 2) * panned.s + panned.y];
  await page.mouse.move(svgBox.x + lineMid[0], svgBox.y + lineMid[1]);
  await page.mouse.down();
  await page.mouse.up();
  results.selected = await page.evaluate(() => document.querySelectorAll('.sketchStudioEntity.is-selected').length);
  results.drag = await frameStatsDuring(page, async () => {
    await page.mouse.move(svgBox.x + lineMid[0], svgBox.y + lineMid[1]);
    await page.mouse.down();
    for (let index = 1; index <= 30; index += 1) {
      await page.mouse.move(svgBox.x + lineMid[0] + index * 4, svgBox.y + lineMid[1] + index);
    }
    await page.mouse.up();
  });
  results.afterDragStatus = await page.evaluate(() =>
    document.querySelector('.sketchStudioStatusBar')?.textContent.match(/Sketch \w+/)?.[0],
  );

  // Wheel zoom: ten notches.
  results.wheel = await frameStatsDuring(page, async () => {
    await page.mouse.move(svgBox.x + 500, svgBox.y + 400);
    for (let index = 0; index < 10; index += 1) {
      await page.mouse.wheel(0, -100);
    }
  });
  results.zoomText = await page.evaluate(
    () => document.querySelector('.sketchStudioStatusBar')?.textContent.match(/Zoom \d+%/)?.[0],
  );
  results.errors = errors;
  await browser.close();
  return results;
}

(async () => {
  const out = [];
  for (const variant of process.argv.slice(2).length ? process.argv.slice(2) : ['lines', 'mixed']) {
    out.push(await run(variant));
  }
  console.log(JSON.stringify(out, null, 1));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
