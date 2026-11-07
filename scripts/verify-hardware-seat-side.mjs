/* global localStorage, process, console, document */
// Phase Q: hardware seat side (docs/sketch-studio-hardware-seat-side.md §6.5).
// Seeded: an Angle bar (L 50×50×5) lying on a Board / plate, one leg flat on
// the board, a through hole Ø6.6 in each on one axis (the bar's drilled from
// its top, the board's from its top). Hardware library → Socket head cap
// screw M6, Attach cleared:
//   1. top view, point at the hole → the bar's opening is picked (not the
//      board's coaxial one), Enter, Apply → the screw sits on the bar's top,
//      shank down, connection to the bar's hole with no side key → Undo;
//   2. the same pick, F (Flip side) → the Chosen holes list names the board's
//      hole, far side; Enter; the panel's Flip side button flips back to the
//      bar and again to the board; Apply → head on the board's underside,
//      shank up, connection to the board's hole with side: 'far' → Undo;
//   3. bottom view, point at the board's bottom opening → picked directly,
//      Enter, Apply → the same as the flip.
// Every check reads the saved model (instance pose, connection), not pixels;
// never a ".cad-error", always "Model current".
//   CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-hardware-seat-side.mjs
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createPart, emptyModel } from '../src/features/sketchstudio/cad/model.js';
import { mapPlacement, unmapPlacement } from '../src/features/sketchstudio/cad/placement.js';
import { cadSteps } from './sketch-cad-steps.mjs';

const directory = 'artifacts/sketch-cad/hardware-seat-side';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [],
  checks = [];
page.on('pageerror', (e) => errors.push(e.message));
const { properties, current, savedWhen, project, view } = cadSteps(page);
const ribbon = page.locator('.cad-ribbon');
const hud = page.locator('.cad-placement-hud');
const hint = page.locator('.cad-viewport-hint');
const status = properties.getByRole('status');
const cadError = page.locator('.cad-error');
const placement = () => page.evaluate(() => document.querySelector('.cad-viewport').cadPlacement());
const near = (a, b, tolerance = 1e-3) => a.every((v, i) => Math.abs(v - b[i]) <= tolerance);
const previewReady = () => expect(status).toHaveText('Preview ready', { timeout: 60000 });
const shot = (name) => page.screenshot({ path: `${directory}/${name}.png` });
// The kernel's instance pose: X, Y, Z turns, then the position.
const poseOps = (instance) => [
  ...instance.rotation
    .map((angle, i) => ({ angle, axis: [0, 1, 2].map((k) => (k === i ? 1 : 0)), origin: [0, 0, 0] }))
    .filter((op) => op.angle),
  { translation: instance.position },
];
const shankOf = (instance) => mapPlacement([0, 0, -1], poseOps(instance), true);

// ------------------------------------------------------------ the model
const AXIS = [200, 150];
const board = createPart('board'); // 600 × 400 × 18 at the origin
board.part.id = 'board';
board.part.features.push({
  id: 'board-hole',
  type: 'hole',
  diameter: 6.6,
  depth: 5,
  throughAll: true,
  position: [...AXIS, 18],
  direction: [0, 0, -1],
});
const bar = createPart('angle');
bar.part.id = 'bar';
bar.part.features[0].end = [0, 0, 500];
// Turned −90° about Y: the member runs along −X, the section's left leg
// (x −25 … −20) lies flat at z 18 … 23 on the board, the other leg stands up.
const barInstance = { id: 'bar-1', partId: 'bar', name: '', position: [550, 150, 43], rotation: [0, -90, 0] };
const barOps = poseOps(barInstance);
assert(near(mapPlacement([-25, 0, 250], barOps), [300, 150, 18], 1e-9), 'The flat leg lies on the board.');
// The bar's hole drilled down from the flat leg's top, on the board hole's axis.
bar.part.features.push({
  id: 'bar-hole',
  type: 'hole',
  diameter: 6.6,
  depth: 5,
  throughAll: true,
  position: unmapPlacement([...AXIS, 23], barOps).map((v) => Math.round(v * 1e6) / 1e6 || 0),
  direction: unmapPlacement([0, 0, -1], barOps, true).map((v) => Math.round(v * 1e9) / 1e9 || 0),
});
const model = {
  ...emptyModel(),
  parts: [board.part, bar.part],
  instances: [{ ...board.instance, id: 'board-1', partId: 'board' }, barInstance],
};

try {
  await page.goto(process.env.CAD_VERIFY_URL || 'http://localhost:5180/sketch');
  await page.evaluate(
    (model) =>
      localStorage.setItem(
        'apartment-planner-sketch-recovery',
        JSON.stringify({
          kind: 'sketchstudio-workspace',
          version: 2,
          document: {
            id: 'seat-side-test',
            name: 'Seat side test',
            version: 4,
            units: 'mm',
            layers: [{ id: 'default', name: 'Default', visible: true, locked: false }],
            entities: [],
            model,
          },
          ui: { workspaceMode: 'model' },
          viewport: { zoom: 1, panX: 0, panY: 0 },
        }),
      ),
    model,
  );
  await page.reload();
  await current();
  assert.equal(await cadError.count(), 0, `The seeded model builds: ${await cadError.allInnerTexts()}`);
  checks.push(
    `seeded: Board / plate 600 × 400 × 18 + Angle bar L50×50×5 × 500 lying on it, coaxial through holes Ø6.6 at (${AXIS})`,
  );

  const openHardware = async () => {
    await ribbon.getByRole('button', { name: 'Hardware library', exact: true }).first().click();
    await properties.getByLabel('Hardware type').selectOption('socket-cap');
    await properties.getByLabel('Metric size').selectOption('M6');
    const attach = properties.getByLabel('Attach to selected hole');
    if (await attach.isVisible()) await attach.uncheck();
    await properties.getByRole('button', { name: 'Add hardware', exact: true }).click();
    await expect(hint).toContainText('Hardware: click the holes it goes in');
  };
  // Point at the opening at `point` (the bore itself is open): the centre,
  // then a little off it, until the hole centre there snaps. Returns the
  // client point.
  const hoverOpening = async (point) => {
    for (const d of [0, 1, 2, 3, 4]) {
      const at = await project([point[0], point[1] - d, point[2]]);
      await page.mouse.move(at[0], at[1], { steps: 3 });
      await page.waitForTimeout(80);
      const state = await placement();
      if (state.snapKind === 'hole centre' && near(state.hover.point, point, 1e-3)) return at;
    }
    throw new Error(`The opening at (${point}) does not snap: ${JSON.stringify((await placement()).hover)}`);
  };
  const pickOpening = async (point) => {
    const at = await hoverOpening(point);
    const text = await hud.innerText();
    await page.mouse.click(at[0], at[1]);
    await expect.poll(async () => (await placement()).chosen).toBe(1);
    return text;
  };
  const list = properties.getByRole('list', { name: 'Chosen holes' });
  const applySeated = async (label) => {
    await previewReady();
    await properties.getByRole('button', { name: 'Apply hardware', exact: true }).click();
    await current();
    const saved = await savedWhen((m) => m.instances.length === 3, label);
    await page.waitForTimeout(500);
    await current();
    assert.equal(await cadError.count(), 0, `No error after ${label}: ${await cadError.allInnerTexts()}`);
    const screw = saved.instances[2];
    const connection = saved.connections.at(-1);
    assert.equal(saved.connections.length, 1, 'One connection.');
    assert.equal(connection.from, screw.id);
    assert.equal(saved.parts.at(-1).name, 'Socket head cap screw M6');
    return { saved, screw, connection };
  };
  const undo = async () => {
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await savedWhen((m) => m.instances.length === 2, 'Undo');
    await current();
  };

  // 1. From above: the bar's opening wins over the board's coaxial one.
  await openHardware();
  await view('top');
  await page.waitForTimeout(400);
  const fromAbove = await pickOpening([...AXIS, 23]);
  assert.match(fromAbove, /hole centre · Socket head cap screw M6 · Angle bar top · click to add/);
  await expect(list.getByRole('listitem')).toHaveText([/^Hole · Angle bar · Ø 6\.6Remove/]);
  await shot('01-picked-from-above');
  await page.keyboard.press('Enter');
  await previewReady();
  await expect(hint).toContainText('Hardware: seated in the hole you clicked (concentric)');
  await expect(hint).toContainText('F flips to the other side');
  const top = await applySeated('Apply from above');
  assert.deepEqual(
    Object.keys(top.connection),
    ['id', 'type', 'from', 'to', 'fromFeatureId', 'toFeatureId', 'offset'],
    'Drill side: the Phase M connection, no side key.',
  );
  assert.equal(top.connection.to, 'bar-1');
  assert.equal(top.connection.toFeatureId, 'bar-hole');
  assert(near(top.screw.position, [...AXIS, 23]), `Head on the bar's top: ${top.screw.position}`);
  assert(near(shankOf(top.screw), [0, 0, -1], 1e-9), `Shank down: ${shankOf(top.screw)}`);
  await shot('02-applied-on-the-bar');
  checks.push(
    `from above: HUD "${fromAbove.split('\n')[0]}", saved screw at (${top.screw.position}), shank (${shankOf(top.screw).map((v) => v.toFixed(3))}), connection → bar-1 / bar-hole, keys ${Object.keys(top.connection).join(',')}`,
  );
  await undo();

  // 2. The same pick, then F: the other side of the stack (the board's underside).
  await openHardware();
  await pickOpening([...AXIS, 23]);
  await page.keyboard.press('f');
  await expect(list.getByRole('listitem')).toHaveText([/^Hole · Board \/ plate · Ø 6\.6 · far sideRemove/]);
  await shot('03-flipped-in-place');
  await page.keyboard.press('Enter');
  await previewReady();
  const flip = properties.getByRole('button', { name: 'Flip side', exact: true });
  await expect(flip).toBeEnabled();
  await flip.click();
  await expect(list.getByRole('listitem')).toHaveText([/^Hole · Angle bar · Ø 6\.6Remove/]);
  await previewReady();
  await flip.click();
  await expect(list.getByRole('listitem')).toHaveText([/^Hole · Board \/ plate · Ø 6\.6 · far sideRemove/]);
  const flipped = await applySeated('Apply after Flip side');
  assert.equal(flipped.connection.to, 'board-1');
  assert.equal(flipped.connection.toFeatureId, 'board-hole');
  assert.equal(flipped.connection.side, 'far');
  assert(near(flipped.screw.position, [...AXIS, 0]), `Head on the board's underside: ${flipped.screw.position}`);
  assert(near(shankOf(flipped.screw), [0, 0, 1], 1e-9), `Shank up: ${shankOf(flipped.screw)}`);
  await shot('04-flipped-applied');
  checks.push(
    `flip (F in Place, the button twice in Shape): saved screw at (${flipped.screw.position}), shank (${shankOf(flipped.screw).map((v) => v.toFixed(3))}), connection → board-1 / board-hole side ${flipped.connection.side}`,
  );
  await undo();

  // 3. From below: the board's far opening, picked directly.
  await openHardware();
  await view('bottom');
  await page.waitForTimeout(400);
  const fromBelow = await pickOpening([...AXIS, 0]);
  assert.match(fromBelow, /hole centre · Socket head cap screw M6 · Board \/ plate bottom · far side · click to add/);
  await shot('05-picked-from-below');
  await page.keyboard.press('Enter');
  const below = await applySeated('Apply from below');
  assert.equal(below.connection.to, 'board-1');
  assert.equal(below.connection.toFeatureId, 'board-hole');
  assert.equal(below.connection.side, 'far');
  assert(near(below.screw.position, flipped.screw.position), 'The same seat as the flip.');
  assert(near(below.screw.rotation, flipped.screw.rotation, 1e-9), 'The same turn as the flip.');
  await shot('06-applied-from-below');
  // A close look from the front (X-ray: the screw inside the parts).
  await view('front');
  await page.getByRole('button', { name: 'X-ray', exact: true }).click();
  await page.waitForTimeout(400);
  const closeUp = await project([...AXIS, 10]);
  await page.mouse.move(closeUp[0], closeUp[1]);
  for (let i = 0; i < 12; i++) await page.mouse.wheel(0, -300);
  await page.waitForTimeout(600);
  await shot('07-front-close-up-xray');
  checks.push(
    `from below: HUD "${fromBelow.split('\n')[0]}", saved screw at (${below.screw.position}) rotation (${below.screw.rotation}) = the flip's, connection side ${below.connection.side}`,
  );

  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(`${directory}/verification.json`, JSON.stringify({ status: 'passed', errors, checks }, null, 2));
  console.log('Hardware seat side verification passed:\n- ' + checks.join('\n- '));
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` });
  console.error(
    await page
      .locator('.cad-properties')
      .innerText()
      .catch(() => ''),
  );
  console.error(JSON.stringify(await placement().catch(() => null)));
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}
