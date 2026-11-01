/* global localStorage, process, console, document */
// Phase H: direct placement for the guided solid operations. Add a board,
// Extrude on its top face near a corner (vertex snap), drag the arrow out
// 30 mm, Apply; Extrude again dragging into the board (a cut, typed depth);
// Sweep a path of three clicks on the front face with a bend, drag the radius
// grip, Apply; Subtract a tube and drag its tool gizmo.
//   CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-direct-placement.mjs
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { cadSteps } from './sketch-cad-steps.mjs';

const directory = 'artifacts/sketch-cad/direct-placement';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [],
  checks = [];
page.on('pageerror', (e) => errors.push(e.message));
const { properties, current, savedWhen, project, view, drag, typeHud, canvasCenter } = cadSteps(page);
const ribbon = page.locator('.cad-ribbon');
const hud = page.locator('.cad-placement-hud');
const status = properties.getByRole('status');
const placement = () => page.evaluate(() => document.querySelector('.cad-viewport').cadPlacement());
const handle = async (id) => {
  const found = (await placement()).handles.find((h) => h.id === id);
  assert(found, `The ${id} handle is shown.`);
  return found;
};
const add = (a, b) => a.map((v, i) => v + b[i]);

const near = (a, b, tolerance = 1e-3) => a.every((v, i) => Math.abs(v - b[i]) <= tolerance);
const previewReady = () => expect(status).toHaveText('Preview ready', { timeout: 60000 });

try {
  await page.goto(process.env.CAD_VERIFY_URL || 'http://localhost:5180/sketch');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '3D Model & workshop', exact: true }).click();
  await current();
  // The default board: 600 × 400 × 18, centred under the view centre (the
  // origin on this untouched view), and the camera does not move. Read where
  // it landed: world points below are part points plus its position.
  // An off-centre probe: a zoom or refit about the view centre moves it.
  const probe = [600, 400, 0];
  const cameraFresh = await project(probe);
  await ribbon.getByRole('button', { name: 'Board / plate', exact: true }).click();
  await current();
  await page.waitForTimeout(300);
  const firstAt = (await savedWhen((m) => m.instances.length === 1, 'the new board')).instances[0].position;
  assert.deepEqual(firstAt, [-300, -200, 0], 'A first board on an untouched view is centred on the origin.');
  const onFirst = (p) => add(firstAt, p);
  const cameraAdded = await project(probe);
  const addDelta = Math.hypot(cameraAdded[0] - cameraFresh[0], cameraAdded[1] - cameraFresh[1]);
  assert(addDelta <= 0.5, `Adding a board moved the camera: (${probe}) shifted ${addDelta} px.`);
  checks.push(
    `Board / plate on a fresh model: position (${firstAt}) — centred on the view centre; camera held (delta ${addDelta.toFixed(3)} px)`,
  );

  // 1. Extrude with nothing selected: hover the top face near a corner.
  await page
    .locator('.cad-tree')
    .getByRole('button', { name: /Board \/ plate/ })
    .click();
  await page.keyboard.press('Escape');
  await ribbon.getByRole('button', { name: 'Extrude', exact: true }).click();
  await expect(page.locator('.cad-viewport-hint')).toContainText('Extrude: click a flat face to place the profile');
  assert.equal((await placement()).stage, 'place');
  const corner = await project(onFirst([600, 400, 18]));
  const inward = await project(onFirst([590, 390, 18]));
  const at = [corner[0] + (inward[0] - corner[0]) * 0.25, corner[1] + (inward[1] - corner[1]) * 0.25];
  await page.mouse.move(at[0], at[1], { steps: 4 });
  await expect(hud).toContainText('vertex');
  const hovered = await placement();
  assert.equal(hovered.snapKind, 'vertex');
  assert(near(hovered.hover.point, onFirst([600, 400, 18])), `Hover snaps to the corner: ${hovered.hover.point}`);
  await page.screenshot({ path: `${directory}/01-extrude-hover-corner.png` });
  const hoverText = (await hud.innerText()).replace(/\s+/g, ' ');
  await page.mouse.click(at[0], at[1]);
  await expect(page.locator('.cad-viewport-hint')).toContainText('Extrude: drag the arrow');
  const placed = await placement();
  assert.equal(placed.stage, 'shape');
  assert.deepEqual(
    placed.handles.map((h) => h.id),
    ['distance', 'slide', 'corner'],
  );
  await previewReady();
  checks.push(
    `extrude place: hover readout "${hoverText}", snapped to the corner (600, 400, 18); handles ${placed.handles.map((h) => h.id)}`,
  );

  // Drag the arrow out 30 mm (paced): 18 → 48.
  const arrow = await handle('distance');
  const target = await project(add(arrow.at, [0, 0, 30]));
  await drag([arrow.x, arrow.y], target, 10);
  await expect(properties.getByLabel('Length (mm)', { exact: true })).toHaveValue('48');
  await previewReady();
  await page.screenshot({ path: `${directory}/02-extrude-dragged.png` });
  // Apply keeps the camera: zoom off the current framing first, then the
  // probe (off the view centre, which a centred zoom leaves in place) must
  // project to the same pixel once the model is current again.
  const fitted = await project(probe);
  const zoomAt = await canvasCenter();
  await page.mouse.move(zoomAt.x, zoomAt.y);
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(300);
  const cameraBefore = await project(probe);
  assert(Math.hypot(cameraBefore[0] - fitted[0], cameraBefore[1] - fitted[1]) > 2, 'The wheel moved the camera.');
  await properties.getByRole('button', { name: 'Apply extrude', exact: true }).click();
  await current();
  const extruded = await savedWhen(
    (m) => m.parts[0].features.some((f) => f.type === 'extrude'),
    'an extrude feature on the board',
  );
  await page.waitForTimeout(500);
  await current();
  const cameraAfter = await project(probe);
  const cameraDelta = Math.hypot(cameraAfter[0] - cameraBefore[0], cameraAfter[1] - cameraBefore[1]);
  assert(cameraDelta <= 0.5, `Apply extrude moved the camera: (${probe}) shifted ${cameraDelta} px.`);
  checks.push(
    `camera held on Apply extrude: zoomed in, world (${probe}) at (${cameraBefore.map((v) => v.toFixed(1))}) px before and after, delta ${cameraDelta.toFixed(3)} px`,
  );
  // Back to the fit framing the later steps were written against.
  await page.getByRole('button', { name: 'Fit', exact: true }).click();
  const extrude = extruded.parts[0].features.find((f) => f.type === 'extrude');
  const profile = extruded.sketches.find((s) => s.id === extrude.sketchId);
  assert.equal(extrude.operation, 'add');
  assert.equal(extrude.length, 48);
  assert.equal(profile.plane, 'XY');
  assert.deepEqual(profile.origin, [600, 400, 18]);
  checks.push(
    `extrude applied: length ${extrude.length}, sketch ${profile.plane} at (${profile.origin}) — the top face, part coordinates`,
  );

  // 2. Extrude again, into the board: a cut. Type 6 during the drag.
  await ribbon.getByRole('button', { name: 'Extrude', exact: true }).click();
  const middle = await project(onFirst([300, 200, 18]));
  await page.mouse.move(middle[0] + 2, middle[1] + 1, { steps: 4 });
  await expect(hud).toContainText('face centre');
  await page.mouse.click(middle[0] + 2, middle[1] + 1);
  await previewReady();
  const down = await handle('distance');
  const into = await project(add(down.at, [0, 0, -30]));
  await page.mouse.move(down.x, down.y);
  await page.waitForTimeout(100);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(down.x + ((into[0] - down.x) * i) / 10, down.y + ((into[1] - down.y) * i) / 10);
    await page.waitForTimeout(80);
  }
  assert.equal((await placement()).cut, true, 'Dragging into the board turns the preview into a cut.');
  await expect(hud).toContainText('Cut 12 mm');
  await page.keyboard.type('6');
  await expect(hud).toContainText('6 mm');
  await page.keyboard.press('Enter');
  await page.mouse.up();
  await expect(properties.getByLabel('Length (mm)', { exact: true })).toHaveValue('6');
  await expect(properties.getByLabel('Operation', { exact: true })).toHaveValue('cut');
  await expect(page.locator('.cad-preview-badge')).toHaveText('Cut preview — Apply to save', { timeout: 60000 });
  await previewReady();
  await page.screenshot({ path: `${directory}/03-cut-preview.png` });
  await properties.getByRole('button', { name: 'Apply extrude', exact: true }).click();
  await current();
  const cutModel = await savedWhen(
    (m) => m.parts[0].features.some((f) => f.type === 'extrude' && f.operation === 'cut'),
    'a cut extrude',
  );
  const cut = cutModel.parts[0].features.find((f) => f.type === 'extrude' && f.operation === 'cut');
  assert.equal(cut.reverse, true);
  assert.equal(cut.length, 6);
  checks.push(`drag into the board: operation ${cut.operation}, reverse ${cut.reverse}, length ${cut.length} (typed)`);

  // 3. Sweep: three clicks on the front face plane (seen square on), Finish
  // path, then the radius grip. The path starts at the front top edge's
  // midpoint and runs up 120 mm, then right 150 mm.
  await view('front');
  await page.waitForTimeout(300);
  await ribbon.getByRole('button', { name: 'Sweep', exact: true }).click();
  await expect(page.locator('.cad-viewport-hint')).toContainText('Sweep: click where the path starts');
  const p1 = await project(onFirst([300, 0, 18]));
  await page.mouse.move(p1[0], p1[1] + 2, { steps: 3 });
  await expect(hud).toContainText('midpoint');
  await page.mouse.click(p1[0], p1[1] + 2);
  await expect.poll(async () => (await placement()).points).toBe(1);
  // Shift locks each corner square to the previous one (the sketcher's ortho).
  await page.keyboard.down('Shift');
  const p2 = await project(onFirst([300, 0, 138]));
  await page.mouse.move(p2[0] + 2, p2[1], { steps: 4 });
  // One screen pixel is about 1.3 mm here; the 1 mm grid rounds the rest.
  await expect(hud).toContainText(/1(19|20|21) mm · ortho/);
  await page.mouse.click(p2[0] + 2, p2[1]);
  const p3 = await project(onFirst([450, 0, 138]));
  await page.mouse.move(p3[0], p3[1] + 2, { steps: 4 });
  await expect(hud).toContainText(/1(49|50|51) mm · ortho/);
  await page.mouse.click(p3[0], p3[1] + 2);
  await page.keyboard.up('Shift');
  await expect.poll(async () => (await placement()).points).toBe(3);
  await page.screenshot({ path: `${directory}/04-sweep-path.png` });
  await properties.getByRole('button', { name: 'Finish path', exact: true }).click();
  await expect(properties.getByText(/Path: 2 segments, 2(6[89]|7[0-2]) mm/)).toBeVisible();
  await previewReady();
  await view('isometric');
  await page.waitForTimeout(300);
  const grip = await handle('section');
  const gripTo = await project(add(grip.at, [0, -6, 0]));
  await drag([grip.x, grip.y], gripTo, 8);
  await expect(properties.getByLabel('Radius (mm)', { exact: true })).not.toHaveValue('5');
  const radius = Number(await properties.getByLabel('Radius (mm)', { exact: true }).inputValue());
  assert(radius > 5, `The grip drag grew the section radius (${radius}).`);
  await previewReady();
  await page.screenshot({ path: `${directory}/05-sweep-radius.png` });
  await properties.getByRole('button', { name: 'Apply sweep', exact: true }).click();
  await current();
  const swept = await savedWhen((m) => m.parts[0].features.some((f) => f.type === 'sweep'), 'a sweep on the board');
  const sweep = swept.parts[0].features.find((f) => f.type === 'sweep');
  const path = swept.sketches.find((s) => s.id === sweep.sketchId);
  const section = swept.sketches.find((s) => s.id === sweep.profileId);
  const arcs = path.profile.segments.filter((s) => s.type === 'arc');
  assert.equal(arcs.length, 1, 'One arc for the one corner.');
  assert.equal(section.profile.radius, radius);
  checks.push(
    `sweep: ${path.profile.segments.length} path segments (${arcs.length} arc), section Ø${2 * radius}, plane ${path.plane}${path.normal ? ` normal (${path.normal})` : ''}`,
  );

  // 4. Subtract: a tube as the tool; drag the tool gizmo's centre.
  await ribbon.getByRole('button', { name: 'Tube / member', exact: true }).click();
  await current();
  await page
    .locator('.cad-tree')
    .getByRole('button', { name: /Board \/ plate/ })
    .click();
  await ribbon.getByRole('button', { name: 'Subtract', exact: true }).click();
  await expect(page.locator('.cad-viewport-hint')).toContainText('Subtract: drag the tool ghost');
  // The tool starts at the board centre, inside the earlier through cut, so
  // the first preview removes nothing; the drag moves it into material.
  await expect.poll(async () => Boolean((await placement()).tool3d)).toBe(true);
  const before = (await placement()).tool3d.pivot;
  const start = (await properties.locator('input').evaluateAll((inputs) => inputs.map((i) => Number(i.value)))).slice(
    0,
    3,
  );
  // The default sits at the board's box centre, which the sweep raised above
  // the plate: drag the gizmo's Z arrow down 100 mm into the material. Find
  // the arrow by hovering along +Z from the gizmo centre.
  let grab = null;
  for (let d = 10; d <= 300 && !grab; d += 10) {
    const spot = await project(add(before, [0, 0, d]));
    await page.mouse.move(spot[0], spot[1]);
    await page.waitForTimeout(40);
    if ((await page.evaluate(() => document.querySelector('.cad-viewport').cadGizmo().axis)) === 'Z') grab = d;
  }
  assert(grab, 'The tool gizmo shows a Z arrow.');
  const from = await project(add(before, [0, 0, grab]));
  const to = await project(add(before, [0, 0, grab - 100]));
  await drag(from, to, 10);
  await expect.poll(async () => before[2] - (await placement()).tool3d.pivot[2]).toBeGreaterThan(50);
  const moved = (await placement()).tool3d.pivot;
  assert(near(moved.slice(0, 2), before.slice(0, 2)), 'A Z-arrow drag keeps X and Y.');
  await previewReady();
  await page.screenshot({ path: `${directory}/06-subtract-gizmo.png` });
  await properties.getByRole('button', { name: 'Apply subtract', exact: true }).click();
  await current();
  const subtracted = await savedWhen(
    (m) => m.parts[0].features.some((f) => f.type === 'subtract'),
    'a subtract feature',
  );
  const subtract = subtracted.parts[0].features.find((f) => f.type === 'subtract');
  assert.deepEqual(subtract.position.slice(0, 2), start.slice(0, 2));
  assert(start[2] - subtract.position[2] > 50, `The tool moved down from z ${start[2]}: ${subtract.position}`);
  checks.push(
    `subtract: tool position (${start}) → (${subtract.position}) after a Z-arrow gizmo drag (target coordinates)`,
  );

  await view('isometric');
  await page.screenshot({ path: `${directory}/07-result.png` });

  // 5. Edit extrude with preview: the arrow sits on the existing feature.
  await page
    .locator('.cad-tree')
    .getByRole('button', { name: /Board \/ plate/ })
    .click();
  await page.locator('.cad-feature-list').getByRole('button', { name: '2. extrude', exact: true }).click();
  await properties.getByRole('button', { name: 'Edit extrude with preview', exact: true }).click();
  await previewReady();
  const existing = await handle('distance');
  assert.equal(existing.value, 48);
  const longer = await project(add(existing.at, [0, 0, 20]));
  await drag([existing.x, existing.y], longer, 8);
  await expect(properties.getByLabel('Length (mm)', { exact: true })).toHaveValue('68');
  await previewReady();
  await properties.getByRole('button', { name: 'Apply extrude', exact: true }).click();
  await current();
  await savedWhen((m) => m.parts[0].features.some((f) => f.id === extrude.id && f.length === 68), 'length 68');
  checks.push('edit extrude with preview: arrow at the stored sketch (48) dragged +20 → saved length 68');

  // 6. New sketch on a face → Extrude shows the same arrow; dragging in makes it a cut.
  await view('top');
  await page.waitForTimeout(300);
  const sketchBar = page.getByRole('toolbar', { name: 'Sketch tools' });
  await page.getByRole('button', { name: 'Sketch', exact: true }).click();
  await page.locator('.cad-ribbon').getByRole('button', { name: 'New sketch', exact: true }).click();
  const onTop = await project(onFirst([150, 300, 18]));
  await page.mouse.click(onTop[0], onTop[1]);
  await sketchBar.waitFor();
  await sketchBar.getByRole('button', { name: 'Rectangle', exact: true }).click();
  await typeHud(100, 250);
  const c = await canvasCenter();
  await page.mouse.move(c.x + 60, c.y - 40, { steps: 4 });
  await typeHud(60, 40);
  await sketchBar.getByRole('button', { name: 'Finish sketch', exact: true }).click();
  await properties.getByRole('button', { name: 'Extrude', exact: true }).click();
  await previewReady();
  await view('isometric');
  await page.waitForTimeout(300);
  const flow = await handle('distance');
  assert.equal(flow.value, 18);
  await expect(properties.getByText('Operation (auto)')).toBeVisible();
  const flowInto = await project(add(flow.at, [0, 0, -26]));
  await drag([flow.x, flow.y], flowInto, 10);
  await expect(properties.getByLabel('Sketch operation', { exact: true })).toHaveValue('cut');
  await expect(properties.getByLabel('Depth (mm)', { exact: true })).toHaveValue('8');
  await previewReady();
  await page.screenshot({ path: `${directory}/08-sketch-flow-cut.png` });
  await properties.getByRole('button', { name: 'Apply cut', exact: true }).click();
  await current();
  const flowCut = await savedWhen(
    (m) => m.parts[0].features.filter((f) => f.type === 'extrude' && f.operation === 'cut').length === 2,
    'a second cut from the sketch flow',
  );
  checks.push(
    `sketch on face → Extrude: the arrow dragged into the board turns it into a cut (${JSON.stringify(
      flowCut.parts[0].features.at(-1),
      ['operation', 'length', 'reverse'],
    )})`,
  );

  // 7. A fresh model: Extrude on empty ground makes a new part at the click.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '3D Model & workshop', exact: true }).click();
  await current();
  await ribbon.getByRole('button', { name: 'Extrude', exact: true }).click();
  const ground = await project([-300, -200, 0]);
  await page.mouse.move(ground[0], ground[1], { steps: 3 });
  await expect(hud).toContainText('ground');
  await page.mouse.click(ground[0], ground[1]);
  await previewReady();
  await page.keyboard.press('Enter');
  await current();
  const grounded = await savedWhen((m) => m.instances.length === 1, 'a part on the ground');
  assert.deepEqual(grounded.instances[0].position, [-300, -200, 0]);
  assert.equal(grounded.parts[0].name, 'Part 1');
  checks.push(
    `empty model + Extrude on the ground: new "${grounded.parts[0].name}" at (${grounded.instances[0].position})`,
  );

  // 8. A board turned 37° about Z: the profile on its right face extrudes square to it.
  await ribbon.getByRole('button', { name: 'Board / plate', exact: true }).click();
  await current();
  const rotation = properties
    .getByRole('group', { name: 'Rotation (degrees)', exact: true })
    .getByLabel('Z', { exact: true });
  await rotation.fill('37');
  await rotation.press('Enter');
  await current();
  await view('isometric');
  await page.waitForTimeout(300);
  const r = (37 * Math.PI) / 180;
  const turned = ([x, y, z]) => [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r), z];
  // The new board lands under the centre of the view (read back, not assumed);
  // the 37° turn is about its own origin, so a part point is position + turned.
  const boardAt = (await savedWhen((m) => m.instances[1]?.rotation[2] === 37, 'the turned board')).instances[1]
    .position;
  assert.equal(boardAt[2], 0, 'The new board sits on the ground.');
  const onBoard = (p) => add(boardAt, turned(p));
  await page.keyboard.press('Escape');
  await ribbon.getByRole('button', { name: 'Extrude', exact: true }).click();
  const right = await project(onBoard([600, 200, 9]));
  await page.mouse.move(right[0] - 1, right[1], { steps: 3 });
  await page.mouse.click(right[0] - 1, right[1]);
  await previewReady();
  await expect(properties.getByText(/along \(0\.8, 0\.6, 0\)/)).toBeVisible();
  await page.keyboard.press('Enter');
  await current();
  const square = await savedWhen((m) => m.parts[1]?.features.length === 2, 'an extrude on the turned board');
  const squareSketch = square.sketches.find((s) => s.id === square.parts[1].features[1].sketchId);
  assert.equal(squareSketch.plane, 'YZ');
  assert.deepEqual(squareSketch.origin, [600, 200, 9]);
  checks.push(
    `37° board at (${boardAt}), right face: sketch ${squareSketch.plane} at (${squareSketch.origin}) in part coordinates`,
  );

  const board = () =>
    page
      .locator('.cad-tree')
      .getByRole('button', { name: /Board \/ plate/ })
      .click();
  // 9. Fillet (while the plate's top is still its highest face): a top-face click picks the Top (XY) reference.
  await board();
  await ribbon.getByRole('button', { name: 'Fillet', exact: true }).click();
  await expect(page.locator('.cad-viewport-hint')).toContainText('Fillet: click a flat face of the part');
  const filletTop = await project(onBoard([500, 100, 18]));
  await page.mouse.move(filletTop[0], filletTop[1], { steps: 3 });
  await page.mouse.click(filletTop[0], filletTop[1]);
  await expect(properties.getByText('Picked Top (XY) in the viewport')).toBeVisible();
  const reference = await properties
    .getByLabel('Geometry reference', { exact: true })
    .evaluate((s) => s.options[s.selectedIndex].text);
  assert.match(reference, /^Top \(XY\)/);
  await page.keyboard.press('Escape');
  checks.push(`fillet: top-face click → "${reference}"`);

  // 10. Trim: face click + plane arrow. Mirror: face click → a named plane.
  await board();
  await ribbon.getByRole('button', { name: 'Trim', exact: true }).click();
  const trimFace = await project(onBoard([600, 300, 9]));
  await page.mouse.move(trimFace[0] - 1, trimFace[1], { steps: 3 });
  await page.mouse.click(trimFace[0] - 1, trimFace[1]);
  await expect(properties.getByText(/^Plane on the face · offset -300 mm/)).toBeVisible();
  const plane = await handle('plane');
  const planeTo = await project(add(plane.at, turned([-100, 0, 0])));
  await drag([plane.x, plane.y], planeTo, 8);
  await expect(properties.getByText(/^Plane on the face · offset -400 mm/)).toBeVisible();
  await previewReady();
  await page.screenshot({ path: `${directory}/10-trim-plane.png` });
  await page.keyboard.press('Escape');
  await board();
  await ribbon.getByRole('button', { name: 'Mirror', exact: true }).click();
  await page.mouse.move(trimFace[0] - 1, trimFace[1], { steps: 3 });
  await page.mouse.click(trimFace[0] - 1, trimFace[1]);
  await expect(properties.getByLabel('Mirror plane', { exact: true })).toHaveValue('YZ');
  await page.keyboard.press('Escape');
  checks.push('trim: face click, plane arrow −100 mm (offset −300 → −400); mirror: face click → YZ plane');

  // 11. Perspective camera: the arrow drag reads the same distance.
  await page.getByRole('button', { name: 'Orthographic', exact: true }).click();
  await page.waitForTimeout(300);
  await board();
  await ribbon.getByRole('button', { name: 'Extrude', exact: true }).click();
  const persp = await project(onBoard([300, 200, 18]));
  await page.mouse.move(persp[0] + 1, persp[1], { steps: 3 });
  await page.mouse.click(persp[0] + 1, persp[1]);
  await previewReady();
  const perspArrow = await handle('distance');
  const perspTo = await project(add(perspArrow.at, [0, 0, 12]));
  await drag([perspArrow.x, perspArrow.y], perspTo, 8);
  await expect(properties.getByLabel('Length (mm)', { exact: true })).toHaveValue('30');
  await page.keyboard.press('Escape');
  assert.equal((await placement()).active, false);
  assert.equal((await placement()).orbit, true);
  checks.push('perspective camera: arrow dragged +12 mm → length 30; Esc cancels, orbit enabled');
  await page.getByRole('button', { name: 'Perspective', exact: true }).click();
  await page.waitForTimeout(300);

  // 12. Revolve: the default axis is the nearest face edge; an edge click changes it.
  await board();
  await page.keyboard.press('Escape');
  await ribbon.getByRole('button', { name: 'Revolve', exact: true }).click();
  const nearFront = await project(onBoard([300, 30, 18]));
  await page.mouse.move(nearFront[0], nearFront[1], { steps: 3 });
  await page.mouse.click(nearFront[0], nearFront[1]);
  await expect(properties.getByText(/axis along \(0\.8, 0\.6, 0\)/)).toBeVisible();
  await properties.getByRole('button', { name: 'Change axis', exact: true }).click();
  await expect(page.locator('.cad-viewport-hint')).toContainText('click an edge to change the axis');
  const leftEdge = await project(onBoard([0, 200, 18]));
  await page.mouse.move(leftEdge[0], leftEdge[1], { steps: 3 });
  await page.mouse.click(leftEdge[0], leftEdge[1]);
  await expect(properties.getByText(/axis along \(-?0\.6, -?0\.8, 0\)/)).toBeVisible();
  await previewReady();
  await page.screenshot({ path: `${directory}/09-revolve-axis.png` });
  await properties.getByRole('button', { name: 'Apply revolve', exact: true }).click();
  await current();
  const revolved = await savedWhen((m) => m.parts[1].features.some((f) => f.type === 'revolve'), 'a revolve');
  const revolve = revolved.parts[1].features.find((f) => f.type === 'revolve');
  assert.deepEqual(revolve.axis.map(Math.abs), [0, 1, 0]);
  assert.deepEqual(
    revolve.origin.map((v, i) => (i === 1 ? 0 : v)),
    [0, 0, 18],
  );
  checks.push(
    `revolve: default axis along the front edge, edge click → axis (${revolve.axis}) through (${revolve.origin})`,
  );

  // 13. Loft: two faces, Enter finishes the sections, Apply builds.
  await ribbon.getByRole('button', { name: 'Loft', exact: true }).click();
  const loftTop = await project(onBoard([150, 250, 18]));
  await page.mouse.move(loftTop[0], loftTop[1], { steps: 3 });
  await page.mouse.click(loftTop[0], loftTop[1]);
  const loftFront = await project(onBoard([450, 0, 9]));
  await page.mouse.move(loftFront[0], loftFront[1] - 1, { steps: 3 });
  await page.mouse.click(loftFront[0], loftFront[1] - 1);
  await expect(properties.getByText(/^2 sections · On Board \/ plate · top face/)).toBeVisible();
  await page.keyboard.press('Enter');
  await previewReady();
  await properties.getByRole('button', { name: 'Apply loft', exact: true }).click();
  await current();
  const lofted = await savedWhen((m) => m.parts[1].features.some((f) => f.type === 'loft'), 'a loft');
  const loft = lofted.parts[1].features.find((f) => f.type === 'loft');
  checks.push(`loft: two face clicks → sections ${[loft.sketchId, ...loft.sections].length}, built and applied`);

  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(`${directory}/verification.json`, JSON.stringify({ status: 'passed', errors, checks }, null, 2));
  console.log('Direct placement verification passed:\n- ' + checks.join('\n- '));
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` });
  console.error(
    await page
      .locator('.cad-properties')
      .innerText()
      .catch(() => ''),
  );
  console.error(
    await page
      .locator('.cad-properties input')
      .evaluateAll((inputs) => inputs.map((i) => `${i.getAttribute('aria-label')}=${i.value}`).join(' · '))
      .catch(() => ''),
  );
  console.error(JSON.stringify(await placement().catch(() => null)));
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}
