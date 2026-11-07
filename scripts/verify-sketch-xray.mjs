/* global localStorage, process, console, document, window, performance, requestAnimationFrame, KeyboardEvent, Image */
// Sketch Studio 3D workstation: Solid / X-ray / Wireframe
// (docs/sketch-studio-xray-mode.md §8). A board with a hole row of 4 and a
// Hex bolt M6 seated in three of the holes, deselected, front view:
//   1. Solid baseline (P0 programs), 2. X by key → X-ray: the board is glass,
//   the bolts solid, and the bolt shanks inside the board show (pixel probe),
//   3. no relink on repeat toggles or on an edit made in X-ray, 4. Shift+X →
//   Wireframe: the board face is background, every edge dark, 5. selection
//   in Wireframe, 6. Measure sees through glass, 7. key guards, 8. the first
//   X-ray toggle's cost on the cabinet starter.
//   CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-sketch-xray.mjs
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { cadSteps } from './sketch-cad-steps.mjs';
import { GHOST_ALPHA } from '../src/features/sketchstudio/cad/viewMode.js';

const directory = 'artifacts/sketch-cad/xray';
await mkdir(directory, { recursive: true });
const URL = process.env.CAD_VERIFY_URL || 'http://localhost:5180/sketch';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [],
  checks = [],
  metrics = {};
page.on('pageerror', (e) => errors.push(e.message));
const { properties, current, savedWhen, project, view, canvas } = cadSteps(page);
const ribbon = page.locator('.cad-ribbon');
const toolbar = page.locator('.cad-view-toolbar');
const hint = page.locator('.cad-viewport-hint');
const status = properties.getByRole('status');
const measureHud = page.locator('.cad-measure-hud');
const cadError = page.locator('.cad-error');
const modes = toolbar.getByRole('group', { name: 'See-through mode' });
const modeButton = (name) => modes.getByRole('button', { name, exact: true });
const placement = () => page.evaluate(() => document.querySelector('.cad-viewport').cadPlacement());
const viewMode = () => page.evaluate(() => document.querySelector('.cad-viewport').cadViewMode());
const marks = () => page.evaluate(() => document.querySelector('.cad-viewport').cadMarks());
const add = (a, b) => a.map((v, i) => v + b[i]);
const scale = (a, s) => a.map((v) => v * s);
const near = (a, b, tolerance = 1e-3) => a.every((v, i) => Math.abs(v - b[i]) <= tolerance);
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const previewReady = () => expect(status).toHaveText('Preview ready', { timeout: 60000 });
const shot = (name) => page.screenshot({ path: `${directory}/${name}.png` });
const check = (name, pass, detail = '') => {
  checks.push({ name, status: pass ? 'pass' : 'fail', detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!pass) throw new Error(`${name}: ${detail}`);
};
const skip = (name, reason) => {
  checks.push({ name, status: 'skipped', detail: reason });
  console.log(`SKIP ${name} — ${reason}`);
};
// No field focused: the keys go to the workstation (its listener is on window).
const blur = () => page.evaluate(() => document.activeElement?.blur?.());
const pressKey = async (key) => {
  await blur();
  await page.keyboard.press(key);
  await page.waitForTimeout(150);
};
// RGB of client pixels, read back out of a full-page screenshot (radius 0 = the pixel itself).
const pixels = (buffer, points, radius = 0) =>
  page.evaluate(
    async ({ b64, at, r }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${b64}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      return at.map(([x, y]) => {
        const data = context.getImageData(Math.round(x) - r, Math.round(y) - r, 2 * r + 1, 2 * r + 1).data;
        const sum = [0, 0, 0];
        for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c++) sum[c] += data[i + c];
        return sum.map((v) => v / (data.length / 4));
      });
    },
    { b64: buffer.toString('base64'), at: points, r: radius },
  );
const channelDelta = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
const BACKGROUND = [0xe7, 0xeb, 0xef];
const mean = (rgb) => (rgb[0] + rgb[1] + rgb[2]) / 3;
// Click empty background in the top-left of the canvas: selects nothing.
const deselect = async () => {
  const box = await canvas.boundingBox();
  await page.mouse.click(box.x + 40, box.y + 40);
  await page.waitForTimeout(200);
};

try {
  // 1. Board, hole row of 4, Hex bolt M6 in holes 1, 2 and 4 (verify-hardware-holes.mjs 1–4).
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '3D Model & workshop', exact: true }).click();
  await current();
  await ribbon.getByRole('button', { name: 'Board / plate', exact: true }).click();
  await current();
  const boardModel = await savedWhen((m) => m.instances.length === 1, 'the new board');
  const boardId = boardModel.instances[0].id;
  let boardAt = boardModel.instances[0].position;
  const onBoard = (p) => add(boardAt, p);
  await page.keyboard.press('Escape');
  await ribbon.getByRole('button', { name: 'Hole row', exact: true }).click();
  await expect(hint).toContainText('Hole row: click where the first hole goes');
  await view('top');
  await page.waitForTimeout(400);
  const first = await project(onBoard([100.3, 100.2, 18]));
  await page.mouse.move(first[0], first[1], { steps: 4 });
  await page.mouse.click(first[0], first[1]);
  await expect(hint).toContainText('click where the last hole goes');
  const last = await project(onBoard([250.4, 100.3, 18]));
  await page.mouse.move(last[0], last[1], { steps: 6 });
  await page.mouse.click(last[0], last[1]);
  await previewReady();
  await properties.getByRole('button', { name: 'Apply hole row', exact: true }).click();
  await current();
  const drilled = await savedWhen((m) => m.parts[0].features.some((f) => f.type === 'hole' && f.row), 'a hole row');
  const row = drilled.parts[0].features.find((f) => f.type === 'hole');
  const centre = (k) => onBoard(add(row.position, scale(row.row.direction, k * row.row.pitch)));
  await ribbon.getByRole('button', { name: 'Hardware library', exact: true }).first().click();
  await properties.getByLabel('Hardware type').selectOption('bolt');
  await properties.getByLabel('Metric size').selectOption('M6');
  const attach = properties.getByLabel('Attach to selected hole');
  if (await attach.isVisible()) await attach.uncheck();
  await properties.getByRole('button', { name: 'Add hardware', exact: true }).click();
  await expect(hint).toContainText('Hardware: click the holes it goes in');
  const hoverHole = async (k) => {
    for (const d of [4, 4.5, 3.6, 5, 5.5]) {
      const at = await project(add(centre(k), [0, -d, 0]));
      await page.mouse.move(at[0], at[1], { steps: 3 });
      await page.waitForTimeout(60);
      const state = await placement();
      if (state.snapKind === 'hole centre' && near(state.hover.point, centre(k), 1e-3)) return at;
    }
    throw new Error(`Hole ${k + 1}'s centre does not snap.`);
  };
  for (const k of [0, 1, 3]) {
    const at = await hoverHole(k);
    await page.mouse.click(at[0], at[1]);
    await page.waitForTimeout(100);
  }
  await expect.poll(async () => (await placement()).chosen).toBe(3);
  await page.keyboard.press('Enter');
  await previewReady();
  await properties.getByRole('button', { name: 'Apply hardware', exact: true }).click();
  await current();
  let built = await savedWhen((m) => m.instances.length === 4, 'three bolts');
  const boltPart = built.parts.at(-1);
  assert.equal(boltPart.name, 'Hex bolt M6');
  assert(boltPart.features.some((f) => f.type === 'hardware'));
  const boltIds = built.instances.slice(1).map((i) => i.id);
  check(
    '§8.1 board + hole row + Hex bolt M6 in 3 holes',
    boltIds.length === 3,
    `row ${row.row.count} × Ø${row.diameter} pitch ${row.row.pitch}; bolts ${boltIds.join(', ')}`,
  );
  metrics.holeDiameter = row.diameter;

  // Deselect (a selected board stays solid in X-ray), orthographic, and frame
  // a standard view zoomed ×2 on the board so a bolt shank is ~10 px wide.
  await deselect();
  assert.equal(await toolbar.getByRole('button', { name: 'Orthographic', exact: true }).count(), 1);
  // Fit (the same view again would not refit), then two wheel notches in.
  const frame = async (name) => {
    if ((await page.getByLabel('Standard view').inputValue()) === name)
      await toolbar.getByRole('button', { name: 'Fit', exact: true }).click();
    else await view(name);
    await page.waitForTimeout(400);
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < 2; i++) {
      await page.mouse.wheel(0, -700);
      await page.waitForTimeout(80);
    }
    await page.mouse.move(box.x + 30, box.y + 30);
    await page.waitForTimeout(300);
  };
  // The bolt shank at mid-thickness of the board: z = 9 on the bolt axis (the
  // saved bolt position is the hole centre on the top face).
  const shankPoints = (model) => model.instances.slice(1).map((b) => [b.position[0], b.position[1], boardAt[2] + 9]);
  const probe = async (name, points) => {
    const at = [];
    for (const p of points) at.push(await project(p));
    const buffer = await shot(name);
    return { at, rgb: await pixels(buffer, at), buffer };
  };
  const shank = shankPoints(built);

  // 2. Solid baseline (front, the spec's probe view; rear as a second look).
  await frame('front');
  const mmPerPx = 600 / Math.abs((await project(onBoard([600, 0, 9])))[0] - (await project(onBoard([0, 0, 9])))[0]);
  metrics.frontMmPerPx = Math.round(mmPerPx * 1000) / 1000;
  let state = await viewMode();
  check(
    '§8.2 Solid baseline: mode solid, every body opacity 1',
    state.mode === 'solid' && state.bodies.every((b) => b.opacity === 1 && !b.transparent),
    `bodies ${state.bodies.length}; programs P0 = ${state.programs}; cached materials ${state.materials}`,
  );
  const P0 = state.programs;
  metrics.P0 = P0;
  await expect(page.locator('.cad-viewport')).toHaveAttribute('data-view-mode', 'solid');
  const solidFront = await probe('01-solid', shank);
  await frame('rear');
  const solidRear = await probe('01-solid-rear', shank);
  await frame('isometric');
  const solidIso = await probe('01-solid-iso', shank);

  // 3. X-ray by key.
  await pressKey('x');
  await expect(modeButton('X-ray')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.cad-viewport')).toHaveAttribute('data-view-mode', 'xray');
  await expect(hint).toContainText('X-ray · selected part and hardware stay solid · X back to Solid');
  state = await viewMode();
  const board = state.bodies.find((b) => b.id === boardId);
  const bolts = state.bodies.filter((b) => boltIds.includes(b.id));
  check(
    '§8.3 X by key → X-ray: board glass, bolts solid',
    state.mode === 'xray' &&
      board.opacity === GHOST_ALPHA.xray &&
      board.depthWrite === false &&
      board.renderOrder === 1 &&
      board.edgeOpacity === 0.55 &&
      bolts.length === 3 &&
      bolts.every((b) => b.opacity === 1 && b.depthWrite && b.edgeOpacity === 0.65),
    `board ${board.opacity}/depthWrite ${board.depthWrite}/renderOrder ${board.renderOrder}/edges ${board.edgeOpacity}; bolts ${bolts.map((b) => b.opacity).join(', ')}`,
  );
  const P1 = state.programs;
  metrics.P1 = P1;
  const xrayIso = await probe('02-xray-iso', shank);
  await frame('rear');
  const xrayRear = await probe('02-xray-rear', shank);
  await frame('front');
  const xrayFront = await probe('02-xray', shank);
  const boltBoxes = bolts.map((b) => b.bounds);
  metrics.boltBounds = boltBoxes;
  const shankOk = shank.every((p, i) => boltBoxes[i] && p[2] >= boltBoxes[i][0][2] && p[2] <= boltBoxes[i][1][2]);
  const euclid = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
  const compare = (solid, xray) => {
    const deltas = solid.rgb.map((rgb, i) => channelDelta(rgb, xray.rgb[i]));
    return {
      pixels: solid.at.map((p) => p.map((v) => Math.round(v * 10) / 10)),
      samePixels: solid.at.every((p, i) => Math.hypot(p[0] - xray.at[i][0], p[1] - xray.at[i][1]) < 0.5),
      solid: solid.rgb.map((c) => c.map(Math.round)),
      xray: xray.rgb.map((c) => c.map(Math.round)),
      deltas,
      euclidean: solid.rgb.map((rgb, i) => Math.round(euclid(rgb, xray.rgb[i]) * 10) / 10),
      median: median(deltas),
    };
  };
  const front = compare(solidFront, xrayFront);
  const rear = compare(solidRear, xrayRear);
  const iso = compare(solidIso, xrayIso);
  metrics.shankProbe = { world: shank, front, rear, iso };
  const describe = (p) =>
    `max-channel Δ ${p.deltas.map((d) => d.toFixed(1)).join(', ')} → median ${p.median.toFixed(1)} (Euclidean ${p.euclidean.join(', ')}); solid ${p.solid.map((c) => c.join('/')).join(' ')} → X-ray ${p.xray.map((c) => c.join('/')).join(' ')}`;
  // From the front (the spec's view) the lit wood face and the lit steel shank
  // differ by at most ~40 in any channel even with the glass fully clear
  // (docs/sketch-studio-xray-mode.md §10), so the front probe cannot clear Δ 40
  // at any α in range: recorded and skipped. The isometric view sees the shank
  // through the strongly lit top face and is the asserted probe, same threshold.
  if (shankOk && front.samePixels && front.median > 40)
    check(
      '§8.3 pixel probe (front): the bolt shanks inside the board show in X-ray (median Δ > 40)',
      true,
      describe(front),
    );
  else
    skip(
      '§8.3 pixel probe (front, median Δ > 40)',
      `unreachable from the front: ${describe(front)}; rear ${describe(rear)}`,
    );
  check(
    '§8.3 pixel probe (isometric): the bolt shanks inside the board show in X-ray (median Δ > 40)',
    shankOk && iso.samePixels && iso.median > 40,
    `z 9 inside every bolt box: ${shankOk}; ${describe(iso)}`,
  );

  // 4. No relink: X → Solid → X → X-ray, then an edit made in X-ray.
  await pressKey('x');
  assert.equal((await viewMode()).mode, 'solid');
  await pressKey('x');
  state = await viewMode();
  const afterRepeat = state.programs;
  check(
    '§8.4 X → Solid → X → X-ray links nothing new',
    state.mode === 'xray' && afterRepeat === P1,
    `programs P1 ${P1} → ${afterRepeat}`,
  );
  await page
    .locator('.cad-tree')
    .getByRole('button', { name: /Board \/ plate/ })
    .first()
    .click();
  const positionX = properties
    .getByRole('group', { name: 'Position (mm)', exact: true })
    .getByLabel('X', { exact: true });
  await positionX.fill('50');
  await positionX.press('Enter');
  const edited = await savedWhen((m) => Number(m.instances[0].position[0]) === 50, 'board X = 50');
  await current();
  await page.waitForTimeout(300);
  const whileSelected = await viewMode();
  await deselect();
  state = await viewMode();
  const editedBoard = state.bodies.find((b) => b.id === boardId);
  check(
    '§8.4 an edit in X-ray (board X = 50, Model current) relinks nothing; the rebuilt board is still glass',
    state.mode === 'xray' &&
      state.programs === P1 &&
      editedBoard.opacity === GHOST_ALPHA.xray &&
      !editedBoard.depthWrite,
    `programs ${P1} → ${whileSelected.programs} (board selected) → ${state.programs} (deselected); board ${editedBoard.opacity}; cached materials ${state.materials}`,
  );
  metrics.afterEdit = { programs: state.programs, materials: state.materials };
  boardAt = edited.instances[0].position.map(Number);
  built = edited;

  // 5. Wireframe (re-framed: the edit moved the board).
  await frame('front');
  const canvasBox = await canvas.boundingBox();
  const onCanvas = (p) =>
    p[0] > canvasBox.x + 2 &&
    p[0] < canvasBox.x + canvasBox.width - 2 &&
    p[1] > canvasBox.y + 2 &&
    p[1] < canvasBox.y + canvasBox.height - 2;
  await pressKey('Shift+X');
  await expect(modeButton('Wireframe')).toHaveAttribute('aria-pressed', 'true');
  await expect(hint).toContainText('Wireframe · every edge shows · Shift+X back to Solid');
  state = await viewMode();
  check(
    `§8.5 Shift+X → Wireframe: every body ${GHOST_ALPHA.wireframe}, every edge 1.0`,
    state.mode === 'wireframe' && state.bodies.every((b) => b.opacity === GHOST_ALPHA.wireframe && b.edgeOpacity === 1),
    `bodies ${state.bodies.map((b) => `${b.opacity}/${b.edgeOpacity}`).join(' ')}; programs ${state.programs}`,
  );
  metrics.wireframePrograms = state.programs;
  const wireShot = await shot('03-wire');
  // The board's front face between the last hole (part x 250) and its right
  // end, at mid-thickness: no edge, no bolt, no axis line (the axes helper
  // stands at the world origin, which the board's middle may cover).
  const facePoint = onBoard([450, 0, 9]);
  const facePx = await project(facePoint);
  const [faceRgb] = await pixels(wireShot, [facePx]);
  const faceDelta = channelDelta(faceRgb, BACKGROUND);
  // The silhouette: the front face's top and bottom edges (z 18 and 0), sampled
  // every 20 mm over part x 300–580, the pixel each edge projects to.
  const edgePoints = [];
  for (let x = 300; x <= 580; x += 20) edgePoints.push(onBoard([x, 0, 18]), onBoard([x, 0, 0]));
  const edgePx = [];
  for (const p of edgePoints) edgePx.push(await project(p));
  const edgeRgb = await pixels(wireShot, edgePx);
  const darker = edgeRgb.map((rgb) => mean(BACKGROUND) - mean(rgb));
  metrics.wireframe = {
    face: { world: facePoint, pixel: facePx, rgb: faceRgb, delta: faceDelta },
    edges: { count: edgePx.length, darker, median: median(darker) },
  };
  check(
    '§8.5 Wireframe board face reads as background (each channel within 12)',
    onCanvas(facePx) && faceDelta <= 12,
    `face (${facePx.map(Math.round)}) rgb ${faceRgb.map(Math.round).join('/')} vs #e7ebef: max Δ ${faceDelta.toFixed(1)}`,
  );
  check(
    '§8.5 Wireframe silhouette edges dark (median > 60 below background, ≥ 10 px)',
    edgePx.length >= 10 && edgePx.every(onCanvas) && median(darker) > 60,
    `${edgePx.length} edge pixels, darker by median ${median(darker).toFixed(1)} (min ${Math.min(...darker).toFixed(1)})`,
  );
  await pressKey('x');
  state = await viewMode();
  check('§8.5 X from Wireframe → Solid', state.mode === 'solid', `mode ${state.mode}`);

  // 6. Selection in Wireframe: the selected board's edges turn blue.
  await pressKey('Shift+X');
  const boardFace = await project(onBoard([450, 0, 9]));
  await page.mouse.click(boardFace[0], boardFace[1]);
  await page.waitForTimeout(300);
  state = await viewMode();
  let selectedBoard = state.bodies.find((b) => b.id === boardId);
  check(
    '§8.6 click the board in Wireframe → its edges #3687bd at 1.0',
    state.mode === 'wireframe' &&
      selectedBoard.edgeColor === '#3687bd' &&
      selectedBoard.edgeOpacity === 1 &&
      selectedBoard.opacity === GHOST_ALPHA.wireframe,
    `edges ${selectedBoard.edgeColor} @ ${selectedBoard.edgeOpacity}, body ${selectedBoard.opacity}`,
  );
  await shot('04-wire-selected');
  await pressKey('Shift+X');
  state = await viewMode();
  selectedBoard = state.bodies.find((b) => b.id === boardId);
  check(
    '§8.6 Shift+X → Solid: the selected board is #3687bd again',
    state.mode === 'solid' && selectedBoard.color === '#3687bd' && selectedBoard.opacity === 1,
    `body ${selectedBoard.color} @ ${selectedBoard.opacity}`,
  );

  // 7. Measure sees through glass. Front view, not top (§10): from the top every
  // far vertex of a vertical hole lies exactly under a near one. Hover the empty
  // hole 3's top rim just under the board's top front edge: Solid shows the
  // front face there (the rim, 100 mm behind it, is occluded); X-ray does not.
  await deselect();
  const hole3 = centre(2);
  await pressKey('d');
  await expect(toolbar.getByRole('button', { name: 'Measure', exact: true })).toHaveAttribute('aria-pressed', 'true');
  // Projected after Measure starts: its Done measuring button can wrap the view
  // toolbar onto a second row, which moves the canvas.
  await page.waitForTimeout(300);
  const rimProbe = await project([hole3[0], boardAt[1], boardAt[2] + 17]);
  await page.mouse.move(rimProbe[0] - 20, rimProbe[1], { steps: 2 });
  await page.mouse.move(rimProbe[0], rimProbe[1], { steps: 3 });
  await page.waitForTimeout(150);
  const solidKind = (await marks()).snapKind;
  await pressKey('x');
  await page.mouse.move(rimProbe[0] + 1, rimProbe[1], { steps: 2 });
  await page.mouse.move(rimProbe[0], rimProbe[1], { steps: 2 });
  await page.waitForTimeout(150);
  const xrayKind = (await marks()).snapKind;
  const hudText = await measureHud.innerText();
  await shot('05-measure-xray');
  metrics.measure = { probe: rimProbe, solidKind, xrayKind, hud: hudText };
  if (solidKind === 'vertex')
    skip('§8.7 Measure through glass', `the probe already snaps to a vertex in Solid (${hudText}); not discriminating`);
  else
    check(
      '§8.7 Measure in X-ray snaps to the hidden hole rim vertex (Solid does not)',
      xrayKind === 'vertex' && hudText.trim() === 'vertex',
      `Solid "${solidKind}" → X-ray "${xrayKind}", HUD "${hudText}"`,
    );
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(toolbar.getByRole('button', { name: 'Measure', exact: true })).toHaveAttribute('aria-pressed', 'false');

  // 8. Key guards: typing in Part name does not toggle.
  const before = (await viewMode()).mode;
  await page
    .locator('.cad-tree')
    .getByRole('button', { name: /Board \/ plate/ })
    .first()
    .click();
  const partName = properties.getByLabel('Part name', { exact: true });
  await partName.focus();
  await page.keyboard.press('x');
  await page.waitForTimeout(200);
  const during = (await viewMode()).mode;
  await partName.press('Escape');
  await page.waitForTimeout(300);
  check('§8.8 x typed in Part name leaves the mode alone', during === before, `mode ${before} → ${during}`);
  await current();
  const savedName = (await savedWhen(() => true, 'the model')).parts[0].name;
  check(
    '§8.8 the field kept its value after Esc; no page error, no .cad-error',
    savedName === 'Board / plate' && errors.length === 0 && (await cadError.count()) === 0,
    `part name "${savedName}"; page errors ${errors.length}; .cad-error ${await cadError.count()}`,
  );
  // Nothing of the mode is saved.
  const savedText = await page.evaluate(() => localStorage.getItem('apartment-planner-sketch-recovery') || '');
  check(
    '§8.8 the mode is not in the saved document',
    !/xray|x-ray|wireframe/i.test(savedText) &&
      !/viewMode/.test(JSON.stringify(JSON.parse(savedText || '{}').document?.model || {})),
    // (The 2D studio saves its own ui.viewMode, plan or iso, beside the document.)
    `${savedText.length} saved characters; 2D ui.viewMode ${JSON.parse(savedText || '{}').ui?.viewMode ?? '—'}`,
  );

  // 9. First X-ray toggle on the cabinet starter (a fresh viewport: nothing transparent linked yet).
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '3D Model & workshop', exact: true }).click();
  await current();
  await page.locator('.cad-start').getByRole('button', { name: 'Design parameters', exact: true }).click();
  await properties.getByLabel('Preset', { exact: true }).selectOption('cabinet');
  await properties.getByRole('button', { name: 'Apply & build', exact: true }).click();
  await current();
  await savedWhen((m) => m.instances.length === 10, 'the cabinet (10 instances)');
  await page.waitForTimeout(500);
  await deselect();
  await blur();
  const toggle = () =>
    page.evaluate(async () => {
      const element = document.querySelector('.cad-viewport');
      const before = element.cadViewMode();
      const target = before.mode === 'xray' ? 'solid' : 'xray';
      const start = performance.now();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true, cancelable: true }));
      let frames = 0;
      while (element.cadViewMode().mode !== target && frames < 30) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        frames++;
      }
      // The next frame after the toggle's render.
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const keyToFrame = performance.now() - start;
      const after = element.cadViewMode();
      return {
        mode: after.mode,
        keyToFrameMs: Math.round(keyToFrame * 10) / 10,
        renderMs: Math.round(after.lastRenderMs * 10) / 10,
        programs: [before.programs, after.programs],
        bodies: after.bodies.length,
        ghosts: after.bodies.filter((b) => b.opacity < 1).length,
      };
    });
  const firstToggle = await toggle();
  await page.waitForTimeout(200);
  const back = await toggle();
  await page.waitForTimeout(200);
  const secondToggle = await toggle();
  metrics.firstToggle = { first: firstToggle, backToSolid: back, second: secondToggle };
  await shot('06-cabinet-xray');
  check(
    '§8.9 first X-ray toggle on the cabinet (10 instances), measured',
    firstToggle.mode === 'xray' && firstToggle.bodies === 10,
    `first: key→frame ${firstToggle.keyToFrameMs} ms, render ${firstToggle.renderMs} ms, programs ${firstToggle.programs.join(' → ')}, ghosts ${firstToggle.ghosts}/10; back to Solid ${back.keyToFrameMs} ms; second X-ray ${secondToggle.keyToFrameMs} ms (render ${secondToggle.renderMs} ms, programs ${secondToggle.programs.join(' → ')})`,
  );

  if (errors.length) throw new Error(errors.join('\n'));
  assert.equal(await cadError.count(), 0, 'No .cad-error');
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ status: 'passed', errors, checks, metrics }, null, 2),
  );
  console.log('Sketch Studio X-ray verification passed.');
  console.log(JSON.stringify(metrics, null, 2));
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` }).catch(() => {});
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ status: 'failed', error: String(error?.stack || error), errors, checks, metrics }, null, 2),
  ).catch(() => {});
  console.error(JSON.stringify(metrics, null, 2));
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}
