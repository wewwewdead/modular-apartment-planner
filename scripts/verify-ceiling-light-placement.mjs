/* global process, console, window, document, performance, PerformanceObserver, getComputedStyle, URL */
// Placing ceiling lights in the RCP editor (docs/ceiling-light-placement.md §7).
//
// Loads scripts/fixtures/bench-ceiling-project.json — the playground demo's
// first floor with a 12 × 10 m, ~2,400-screw ceiling and one named room under
// it — opens it in the ceiling editor and checks, in a real browser:
//   - the Light tool's cursor is a crosshair, its ghost follows the pointer,
//     and the plan underlay is drawn with the room's name and goes with its toggle;
//   - six placements: each click shows its symbol within 150 ms, the long tasks
//     in the 3 s after it total ≤ 150 ms, the three.js program count holds over
//     the first four and grows at most once over all six, with no page errors;
//   - dragging a placed light costs ≤ 60 ms of long tasks, and the coordination
//     pass the editor defers until it has been idle 1.5 s (one per run of edits,
//     not one per click) stays within a single click's 150 ms budget;
//   - the pane's Lights switch does not change the program count;
//   - §5 (P2): a Light-tool drag with one ↑ mid-drag places a row of three in
//     one commit (symbols within 150 ms, long tasks ≤ 150 ms) that one Undo
//     removes; with the tool armed, a click on a board in the Live 3D pane
//     places a light (a 5 × 3 grid of pane points is tried after Reset View).
// Thresholds are for a dev build. Writes artifacts/floorplan/perf/ceiling-light-placement.json.
//
//   npx vite --port 5199 --strictPort          (if no dev server is up)
//   MSYS_NO_PATHCONV=1 node scripts/verify-ceiling-light-placement.mjs
//   CEILING_VERIFY_URL=http://localhost:5199/floorplan overrides the page.
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const url = process.env.CEILING_VERIFY_URL || 'http://localhost:5199/floorplan';
const directory = 'artifacts/floorplan/perf';
await mkdir(directory, { recursive: true });
const envelope = JSON.parse(await readFile(new URL('./fixtures/bench-ceiling-project.json', import.meta.url), 'utf8'));
const project = envelope.data;
const ROOM_NAME = project.floors[0].rooms.find((room) => room.name)?.name;

const LIMITS = { commitMs: 150, longTasksPerClickMs: 150, dragLongTasksMs: 60, settleLongTasksMs: 150 };
const SPOTS = [
  [0.22, 0.3],
  [0.5, 0.3],
  [0.78, 0.3],
  [0.22, 0.7],
  [0.5, 0.7],
  [0.78, 0.7],
];

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const pageErrors = [];
const consoleErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(name);
};

// The project goes in through storage, exactly as a saved draft would.
await page.addInitScript(
  ({ id, name, env }) => {
    window.localStorage.setItem('apartment-planner-projects', JSON.stringify([{ id, name, savedAt: env.savedAt }]));
    window.localStorage.setItem(`apartment-planner-project-${id}`, JSON.stringify(env));
    window.localStorage.removeItem('previewLightPool');
    window.__longTasks = [];
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) window.__longTasks.push({ start: entry.startTime, ms: entry.duration });
      }).observe({ entryTypes: ['longtask'] });
    } catch {
      // No long-task timing in this browser: the totals read as zero.
    }
  },
  { id: project.id, name: project.name, env: envelope },
);

const svg = page.locator('svg[data-tool]');
const fixtureCount = () => page.evaluate(() => document.querySelectorAll('g[data-fixture-id]').length);
const programs = () => page.evaluate(() => (window.__previewPerf?.programs?.() || []).length);
const nowInPage = () => page.evaluate(() => performance.now());
const longTasksSince = (since) =>
  page.evaluate(
    (t) => window.__longTasks.filter((entry) => entry.start >= t).map((entry) => Math.round(entry.ms)),
    since,
  );
const sum = (values) => values.reduce((total, value) => total + value, 0);

const summary = {
  url,
  limits: LIMITS,
  clicks: [],
  drag: null,
  lightsToggle: null,
  row: null,
  pane: null,
  pageErrors,
  consoleErrors,
};

try {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Load Project' }).click();
  await page.getByText(project.name).first().waitFor();
  // The draft card's first button opens it; the second deletes it.
  await page
    .locator('[class*="modalCard"]')
    .filter({ hasText: project.name })
    .first()
    .locator('button')
    .first()
    .click();
  await page.waitForTimeout(600);
  // Sidebar → Ceilings (collapsed by default) → Edit.
  await page.locator('button[aria-expanded]').filter({ hasText: 'Ceilings' }).first().click();
  await page.locator('button[title^="Edit"]').first().click();
  await svg.waitFor();
  // The pane's first build and its shader warm-up.
  await page.waitForTimeout(3500);
  const box = await svg.boundingBox();
  const at = (fx, fy) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });

  // ── Plan underlay ──
  const underlayText = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-plan-underlay]'))
      .map((node) => node.textContent)
      .join(' '),
  );
  check('plan underlay drawn with the room name', underlayText.includes(ROOM_NAME), `room "${ROOM_NAME}"`);
  const planToggle = page
    .locator('label')
    .filter({ hasText: /^Plan$/ })
    .locator('input[type="checkbox"]');
  await planToggle.click();
  const hiddenCount = await page.evaluate(() => document.querySelectorAll('[data-plan-underlay]').length);
  check('Plan toggle removes the underlay', hiddenCount === 0, `${hiddenCount} left`);
  await planToggle.click();
  // A press on the plan prevents default, so focus would stay on the checkbox
  // and the tool shortcuts below would be typed into it.
  await page.evaluate(() => document.activeElement?.blur());

  // The 3D selection overlay compiles its own (unlit) program the first time
  // anything is selected; select a board once so that program is not counted
  // against the first light, whose placement selects it.
  await page.mouse.click(at(0.35, 0.5).x, at(0.35, 0.5).y);
  await page.waitForTimeout(1500);
  await page.keyboard.press('Escape');

  // ── Light tool: cursor, ghost ──
  await page.keyboard.press('l');
  await page.waitForTimeout(200);
  const cursor = await svg.evaluate((node) => getComputedStyle(node).cursor);
  check('Light tool cursor is a crosshair', cursor === 'crosshair', cursor);
  await page.mouse.move(at(0.4, 0.45).x, at(0.4, 0.45).y);
  await page.mouse.move(at(0.41, 0.46).x, at(0.41, 0.46).y);
  await page.waitForTimeout(150);
  const ghost = await page.evaluate(() =>
    document.querySelector('[data-light-ghost]')?.getAttribute('data-light-ghost'),
  );
  check('hover shows the ghost of the chosen light', Boolean(ghost), ghost || 'none');
  await page.screenshot({ path: `${directory}/ceiling-light-ghost.png` });

  // ── Six placements ──
  const programsAtStart = await programs();
  for (const [fx, fy] of SPOTS) {
    const point = at(fx, fy);
    await page.mouse.move(point.x, point.y);
    await page.waitForTimeout(120);
    const before = await fixtureCount();
    const programsBefore = await programs();
    const since = await nowInPage();
    const t0 = performance.now();
    await page.mouse.click(point.x, point.y);
    await page.waitForFunction((n) => document.querySelectorAll('g[data-fixture-id]').length > n, before, {
      timeout: 10000,
    });
    const commitMs = Math.round(performance.now() - t0);
    await page.waitForTimeout(3000);
    const longTasks = await longTasksSince(since);
    summary.clicks.push({
      light: before + 1,
      commitMs,
      longTasks,
      longTaskTotalMs: sum(longTasks),
      programsBefore,
      programsAfter: await programs(),
    });
  }
  console.table(summary.clicks.map((entry) => ({ ...entry, longTasks: entry.longTasks.join(' + ') || '—' })));
  for (const entry of summary.clicks) {
    check(
      `light ${entry.light}: symbol within ${LIMITS.commitMs} ms`,
      entry.commitMs <= LIMITS.commitMs,
      `${entry.commitMs} ms`,
    );
    check(
      `light ${entry.light}: long tasks ≤ ${LIMITS.longTasksPerClickMs} ms in the 3 s after`,
      entry.longTaskTotalMs <= LIMITS.longTasksPerClickMs,
      `${entry.longTaskTotalMs} ms`,
    );
  }
  const afterFour = summary.clicks[3].programsAfter;
  check(
    'program count unchanged over the first four lights',
    afterFour === programsAtStart,
    `${programsAtStart} → ${afterFour}`,
  );
  const growths = summary.clicks.filter((entry) => entry.programsAfter > entry.programsBefore).length;
  check('program count grows at most once over six lights', growths <= 1, `${growths} growth(s)`);

  // ── Drag a placed light (Select tool, commit on release) ──
  await page.keyboard.press('Escape');
  await page.keyboard.press('v');
  await page.waitForTimeout(200);
  const first = await page.locator('g[data-fixture-id]').first().boundingBox();
  const since = await nowInPage();
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
  await page.mouse.down();
  for (let step = 1; step <= 5; step += 1) {
    await page.mouse.move(first.x + first.width / 2 + step * 30, first.y + first.height / 2 + step * 10);
    await page.waitForTimeout(120);
  }
  const dragGhost = await page.evaluate(() => Boolean(document.querySelector('[data-light-ghost]')));
  await page.mouse.up();
  // The drag's own cost is everything up to the release commit. The coordination
  // models catch up 1.5 s after the last edit (useDeferredCoordination): one
  // pass per run of edits rather than one per click, counted on its own below.
  await page.waitForTimeout(1200);
  const released = await nowInPage();
  const dragTasks = await longTasksSince(since);
  await page.waitForTimeout(1800);
  const settleTasks = await longTasksSince(released);
  summary.drag = { longTasks: dragTasks, longTaskTotalMs: sum(dragTasks), ghost: dragGhost };
  summary.settle = { longTasks: settleTasks, longTaskTotalMs: sum(settleTasks) };
  check('a dragged light shows its ghost', dragGhost);
  check(
    `dragging a light: long tasks ≤ ${LIMITS.dragLongTasksMs} ms`,
    summary.drag.longTaskTotalMs <= LIMITS.dragLongTasksMs,
    `${dragTasks.join(' + ') || 0} ms`,
  );
  check(
    `the deferred coordination pass after the run: long tasks ≤ ${LIMITS.settleLongTasksMs} ms`,
    summary.settle.longTaskTotalMs <= LIMITS.settleLongTasksMs,
    `${settleTasks.join(' + ') || 0} ms`,
  );

  // ── The pane's Lights switch ──
  const pane = page.locator('[aria-label="Live ceiling assembly 3D preview"]');
  const lightsButton = pane.getByRole('button', { name: 'Lights', exact: true });
  const programsBeforeToggle = await programs();
  await lightsButton.click();
  await page.waitForTimeout(1500);
  const programsLightsOff = await programs();
  await lightsButton.click();
  await page.waitForTimeout(1500);
  const programsLightsOn = await programs();
  summary.lightsToggle = { before: programsBeforeToggle, off: programsLightsOff, on: programsLightsOn };
  check(
    'Lights switch leaves the program count alone',
    programsLightsOff === programsBeforeToggle && programsLightsOn === programsBeforeToggle,
    `${programsBeforeToggle} → ${programsLightsOff} → ${programsLightsOn}`,
  );

  // ── P2: a row by dragging with the Light tool, ↑ once mid-drag (§5.1) ──
  // After the checks above so their numbers stay comparable with earlier runs.
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('l');
  await page.waitForTimeout(200);
  const rowFrom = at(0.3, 0.5);
  const rowTo = at(0.7, 0.5);
  await page.mouse.move(rowFrom.x, rowFrom.y);
  await page.waitForTimeout(120);
  await page.mouse.down();
  for (let step = 1; step <= 6; step += 1) {
    await page.mouse.move(rowFrom.x + ((rowTo.x - rowFrom.x) * step) / 6, rowFrom.y);
    await page.waitForTimeout(60);
  }
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(150);
  const rowGhosts = await page.evaluate(() => ({
    run: document.querySelector('[data-light-run]')?.getAttribute('data-light-run') || null,
    count: document.querySelectorAll('[data-light-run] [data-light-ghost]').length,
  }));
  const rowBefore = await fixtureCount();
  const rowProgramsBefore = await programs();
  const rowSince = await nowInPage();
  const rowT0 = performance.now();
  await page.mouse.up();
  let rowCommitMs = null;
  try {
    await page.waitForFunction((n) => document.querySelectorAll('g[data-fixture-id]').length >= n + 3, rowBefore, {
      timeout: 10000,
    });
    rowCommitMs = Math.round(performance.now() - rowT0);
  } catch {
    // Reported below as a failed check.
  }
  await page.waitForTimeout(3000);
  const rowTasks = await longTasksSince(rowSince);
  const rowAfter = await fixtureCount();
  const rowProgramsAfter = await programs();
  await page.locator('button[title^="Undo"]').first().click();
  await page.waitForTimeout(1500);
  const rowUndone = await fixtureCount();
  summary.row = {
    ghosts: rowGhosts,
    fixturesBefore: rowBefore,
    fixturesAfter: rowAfter,
    added: rowAfter - rowBefore,
    commitMs: rowCommitMs,
    longTasks: rowTasks,
    longTaskTotalMs: sum(rowTasks),
    afterUndo: rowUndone,
    programsBefore: rowProgramsBefore,
    programsAfter: rowProgramsAfter,
  };
  check(
    'row drag: three ghosts in a row while dragging after ↑',
    rowGhosts.run === 'row' && rowGhosts.count === 3,
    `${rowGhosts.run} × ${rowGhosts.count}`,
  );
  check('row drag adds three lights', rowAfter - rowBefore === 3, `${rowBefore} → ${rowAfter}`);
  check(
    `row drag: symbols within ${LIMITS.commitMs} ms`,
    rowCommitMs !== null && rowCommitMs <= LIMITS.commitMs,
    `${rowCommitMs ?? 'never'} ms`,
  );
  check(
    `row drag: long tasks ≤ ${LIMITS.longTasksPerClickMs} ms in the 3 s after`,
    summary.row.longTaskTotalMs <= LIMITS.longTasksPerClickMs,
    `${rowTasks.join(' + ') || 0} ms`,
  );
  check('one Undo removes the whole row', rowUndone === rowBefore, `${rowAfter} → ${rowUndone}`);

  // ── P2: placing from the Live 3D pane, Light tool armed (§5.2) ──
  await pane.getByRole('button', { name: 'Reset View', exact: true }).click();
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.activeElement?.blur());
  const armed = await pane.getAttribute('data-light-armed');
  const paneCanvas = pane.locator('canvas').first();
  const paneCursor = await paneCanvas.evaluate((node) => getComputedStyle(node).cursor);
  check('3D pane says the Light tool is armed', armed === 'true', `data-light-armed=${armed}`);
  check('3D pane cursor is a crosshair while armed', paneCursor === 'crosshair', paneCursor);
  const paneBox = await paneCanvas.boundingBox();
  const paneBefore = await fixtureCount();
  const paneIds = await page.evaluate(() =>
    Array.from(document.querySelectorAll('g[data-fixture-id]'), (node) => node.getAttribute('data-fixture-id')),
  );
  summary.pane = {
    fixturesBefore: paneBefore,
    fixturesAfter: paneBefore,
    hit: null,
    tried: 0,
    commitMs: null,
    longTasks: [],
    landedAt: null,
  };
  search: for (const fy of [0.35, 0.5, 0.65]) {
    for (const fx of [0.2, 0.35, 0.5, 0.65, 0.8]) {
      summary.pane.tried += 1;
      const before = await fixtureCount();
      const clickSince = await nowInPage();
      const t0 = performance.now();
      await page.mouse.click(paneBox.x + paneBox.width * fx, paneBox.y + paneBox.height * fy);
      try {
        await page.waitForFunction((n) => document.querySelectorAll('g[data-fixture-id]').length > n, before, {
          timeout: 1500,
        });
        summary.pane.commitMs = Math.round(performance.now() - t0);
        summary.pane.hit = { fx, fy };
        await page.waitForTimeout(3000);
        summary.pane.longTasks = await longTasksSince(clickSince);
        break search;
      } catch {
        // Not a board of this ceiling (a hanger, a beam, a light or the sky): the next point.
      }
    }
  }
  summary.pane.fixturesAfter = await fixtureCount();
  // Where on the plan the new light landed, as fractions of the RCP (0, 0 top left).
  summary.pane.landedAt = await page.evaluate((known) => {
    const node = Array.from(document.querySelectorAll('g[data-fixture-id]')).find(
      (entry) => !known.includes(entry.getAttribute('data-fixture-id')),
    );
    const plan = document.querySelector('svg[data-tool]').getBoundingClientRect();
    const light = node?.getBoundingClientRect();
    if (!light) return null;
    const fraction = (value) => Number(value.toFixed(3));
    return {
      x: fraction((light.x + light.width / 2 - plan.x) / plan.width),
      y: fraction((light.y + light.height / 2 - plan.y) / plan.height),
    };
  }, paneIds);
  const paneHit = summary.pane.hit;
  const landed = summary.pane.landedAt;
  check(
    'a click on a board in the 3D pane places one light',
    paneHit !== null && summary.pane.fixturesAfter === paneBefore + 1,
    paneHit
      ? `pane point (${paneHit.fx}, ${paneHit.fy}), try ${summary.pane.tried} · ${paneBefore} → ${summary.pane.fixturesAfter} · ${summary.pane.commitMs} ms · on the plan at (${landed?.x}, ${landed?.y})`
      : `none of ${summary.pane.tried} points placed a light`,
  );
  check(
    `3D pane click: long tasks ≤ ${LIMITS.longTasksPerClickMs} ms in the 3 s after`,
    sum(summary.pane.longTasks) <= LIMITS.longTasksPerClickMs,
    `${summary.pane.longTasks.join(' + ') || 0} ms`,
  );
  // The light went where the click was. With the Select tool the same pane
  // pixel picks what the ray meets there — the new light's housing, or the
  // board it was placed on — and that board, drawn on the plan, must hold the
  // light (to within the 150 mm snap reach).
  if (paneHit) {
    const placedId = await page.evaluate(
      (known) =>
        Array.from(document.querySelectorAll('g[data-fixture-id]'), (node) =>
          node.getAttribute('data-fixture-id'),
        ).find((id) => !known.includes(id)) || null,
      paneIds,
    );
    await page.keyboard.press('v');
    await page.mouse.click(paneBox.x + paneBox.width * paneHit.fx, paneBox.y + paneBox.height * paneHit.fy);
    await page.waitForTimeout(800);
    const picked = await page.evaluate((id) => {
      const plan = document.querySelector('svg[data-tool]').getBoundingClientRect();
      const light = document.querySelector(`g[data-fixture-id="${id}"]`)?.getBoundingClientRect();
      const boards = Array.from(document.querySelectorAll('path[fill-rule="evenodd"][data-selected="true"]'));
      const centre = light ? { x: light.x + light.width / 2, y: light.y + light.height / 2 } : null;
      // 150 mm of the ceiling's length, in screen pixels.
      const reach = (plan.width / Number(document.querySelector('svg[data-tool]').viewBox.baseVal.width)) * 150;
      const holds = (rect) =>
        centre &&
        centre.x >= rect.x - reach &&
        centre.x <= rect.x + rect.width + reach &&
        centre.y >= rect.y - reach &&
        centre.y <= rect.y + rect.height + reach;
      return {
        fixture:
          document.querySelector('g[data-fixture-id][data-selected="true"]')?.getAttribute('data-fixture-id') || null,
        board: boards[0]?.querySelector('title')?.textContent || null,
        boardHoldsLight: boards.some((node) => holds(node.getBoundingClientRect())),
      };
    }, placedId);
    summary.pane.reselected = { placedId, ...picked };
    check(
      'the same pane pixel (Select tool) picks the new light or the board under it',
      placedId !== null && (picked.fixture === placedId || picked.boardHoldsLight),
      picked.fixture
        ? `picked light ${picked.fixture} (placed ${placedId})`
        : `picked board ${picked.board ?? 'none'} · holds the light: ${picked.boardHoldsLight}`,
    );
  }
  console.table([
    {
      check: 'row drag (↑ once)',
      fixtures: `${summary.row.fixturesBefore} → ${summary.row.fixturesAfter} → undo ${summary.row.afterUndo}`,
      commitMs: summary.row.commitMs,
      longTasks: summary.row.longTasks.join(' + ') || '—',
      programs: `${summary.row.programsBefore} → ${summary.row.programsAfter}`,
      point: '—',
    },
    {
      check: '3D pane click',
      fixtures: `${summary.pane.fixturesBefore} → ${summary.pane.fixturesAfter}`,
      commitMs: summary.pane.commitMs,
      longTasks: summary.pane.longTasks.join(' + ') || '—',
      programs: '—',
      point: paneHit ? `(${paneHit.fx}, ${paneHit.fy}), try ${summary.pane.tried}` : 'no hit',
    },
  ]);
  await page.screenshot({ path: `${directory}/ceiling-light-placement-p2.png` });

  check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  summary.previewSnapshot = await page.evaluate(() => window.__previewPerf?.snapshot?.() || null);
  await page.screenshot({ path: `${directory}/ceiling-light-placement.png` });
} catch (error) {
  failures.push(`script: ${error.message}`);
  console.log(`FAIL script — ${error.stack || error.message}`);
} finally {
  summary.failures = failures;
  await writeFile(`${directory}/ceiling-light-placement.json`, `${JSON.stringify(summary, null, 2)}\n`);
  await browser.close();
}

console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);
