/* global localStorage, process, console, document, requestAnimationFrame */
// Sketch Studio 3D workstation: part groups (docs/sketch-studio-part-groups.md §8).
// The cabinet starter (10 instances):
//   1. build it, 2. click the left Side, Shift+click the right Side and the Top,
//   3. Ctrl+G, 4. click the Top (the group is selected) and drag the gizmo's X
//   arrow, typing 200 + Enter mid-drag; one Undo reverts all three, 5. the
//   members move rigidly during the drag and nothing jumps back after release
//   (a part fixed to the Top rides the pending pose), 6. ] turns the group 15°
//   about its centre, 7. double-click opens the group, Esc closes it (the
//   toolbar keeps one row at 1600 px), 8. Hide / show and Isolate, 9. Duplicate
//   and Ctrl+Shift+G on the copy, 10. anchoring, 11. Mate faces on a group,
//   12. reload: groups survive, a dangling groupId is repaired, 13. no page
//   errors.
//   CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-cad-groups.mjs
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { cadSteps } from './sketch-cad-steps.mjs';
import { numeric, resolveParameters } from '../src/features/sketchstudio/cad/model.js';

const directory = 'artifacts/sketch-cad/groups';
await mkdir(directory, { recursive: true });
const URL = process.env.CAD_VERIFY_URL || 'http://localhost:5180/sketch';
const RECOVERY = 'apartment-planner-sketch-recovery';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [],
  checks = [],
  metrics = {},
  cadErrors = [];
page.on('pageerror', (e) => errors.push(e.message));
const { properties, current, saved, savedWhen, project, view } = cadSteps(page);
const ribbon = page.locator('.cad-ribbon');
const toolbar = page.locator('.cad-view-toolbar');
const tree = page.locator('.cad-tree');
const cadError = page.locator('.cad-error');
// The open-group banner, over the view (§10: in the toolbar it wrapped it).
const chip = page.locator('.cad-model-view > .cad-group-chip');
const viewCube = page.locator('.cad-view-cube');
const gizmo = () => page.evaluate(() => document.querySelector('.cad-viewport').cadGizmo());
// Displayed world boxes: { id → { visible, bounds } }.
const bodies = () =>
  page.evaluate(() =>
    Object.fromEntries(
      document
        .querySelector('.cad-viewport')
        .cadViewMode()
        .bodies.map((b) => [b.id, { visible: b.visible, bounds: b.bounds }]),
    ),
  );
const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const centre = ([min, max]) => min.map((v, i) => (v + max[i]) / 2);
const dist = (a, b) => Math.hypot(...sub(a, b));
const near = (a, b, tolerance) => a.every((v, i) => Math.abs(v - b[i]) <= tolerance);
const round = (a, digits = 3) => a.map((v) => Math.round(v * 10 ** digits) / 10 ** digits);
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
const blur = () => page.evaluate(() => document.activeElement?.blur?.());
const pressKey = async (key) => {
  await blur();
  await page.keyboard.press(key);
  await page.waitForTimeout(200);
};
const noteCadError = async (expected) => {
  if (await cadError.count()) cadErrors.push({ text: await cadError.innerText(), expected });
};
// World positions of instances, evaluated with the model's parameters.
const worldPositions = (model) => {
  const values = resolveParameters(model.parameters);
  return Object.fromEntries(
    model.instances.map((i) => [i.id, (i.position || [0, 0, 0]).map((v) => numeric(v, values))]),
  );
};
const treeItems = () =>
  tree.locator('.cad-tree-item').evaluateAll((items) =>
    items.map((b) => ({
      name: b.querySelector('span')?.firstChild?.data,
      group: b.classList.contains('cad-tree-group'),
      selected: b.classList.contains('is-selected'),
    })),
  );
const heading = () => properties.locator('h3').first().innerText();
// A point on the face of a displayed part: `axis` (0 X, 1 Y, 2 Z) at its min
// or max side, the other two at fractions `u`, `v` of the box.
const facePoint = (box, axis, side, u = 0.5, v = 0.5) => {
  const [min, max] = box;
  const [a, b] = [0, 1, 2].filter((k) => k !== axis);
  const point = [0, 0, 0];
  point[axis] = side === 'max' ? max[axis] : min[axis];
  point[a] = min[a] + u * (max[a] - min[a]);
  point[b] = min[b] + v * (max[b] - min[b]);
  return point;
};
const clickAt = async (world, modifiers = []) => {
  const [x, y] = await project(world);
  for (const key of modifiers) await page.keyboard.down(key);
  await page.mouse.click(x, y);
  for (const key of modifiers) await page.keyboard.up(key);
  await page.waitForTimeout(200);
};
const setView = async (name) => {
  await view(name);
  await page.waitForTimeout(400);
};
const gizmoOff = async () => {
  const button = toolbar.getByRole('button', { name: 'Move part', exact: true });
  if ((await button.getAttribute('aria-pressed')) === 'true') await button.click();
  await page.waitForTimeout(150);
};
const gizmoOn = async () => {
  const button = toolbar.getByRole('button', { name: 'Move part', exact: true });
  if ((await button.getAttribute('aria-pressed')) !== 'true') await button.click();
  await page.waitForTimeout(150);
};
const assemble = () => page.locator('.cad-tabs').getByRole('button', { name: 'Assemble', exact: true }).click();
const undo = async () => {
  await page.locator('.cad-file-actions').getByRole('button', { name: 'Undo', exact: true }).click();
  await page.waitForTimeout(300);
};
// Replace the model's connections through Connections / welds → JSON.
const setConnections = async (connections) => {
  await assemble();
  await ribbon.getByRole('button', { name: 'Connections / welds', exact: true }).click();
  const field = properties.getByLabel('Connections and welds', { exact: true });
  await field.fill(JSON.stringify(connections, null, 2));
  await properties.getByRole('button', { name: 'Apply changes', exact: true }).click();
  await current();
};
// The tree row of the (only) group.
const selectGroupRow = async () => {
  await tree.locator('.cad-tree-group').first().click();
  await page.waitForTimeout(200);
};

try {
  // 1. The cabinet starter.
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '3D Model & workshop', exact: true }).click();
  await current();
  await page.locator('.cad-start').getByRole('button', { name: 'Design parameters', exact: true }).click();
  await properties.getByLabel('Preset', { exact: true }).selectOption('cabinet');
  await properties.getByRole('button', { name: 'Apply & build', exact: true }).click();
  await current();
  const built = await savedWhen((m) => m.instances.length === 10, 'the cabinet (10 instances)');
  const startPositions = worldPositions(built);
  let shown = await bodies();
  check(
    '§8.1 cabinet built: 10 instances, poses read from the saved model',
    Object.keys(shown).length === 10 && ['side-left', 'side-right', 'top'].every((id) => startPositions[id]),
    `left ${round(startPositions['side-left'])}, right ${round(startPositions['side-right'])}, top ${round(startPositions.top)}`,
  );
  const members = ['side-left', 'side-right', 'top'];

  // 2. Click the left Side, Shift+click the right Side and the Top (gizmo off so
  // it never covers the click).
  await gizmoOff();
  await setView('left');
  await clickAt(facePoint(shown['side-left'].bounds, 0, 'min', 0.3, 0.3));
  await setView('right');
  await clickAt(facePoint(shown['side-right'].bounds, 0, 'max', 0.3, 0.3), ['Shift']);
  await setView('top');
  await clickAt(facePoint(shown.top.bounds, 2, 'max', 0.3, 0.3), ['Shift']);
  let items = await treeItems();
  const selectedNames = items.filter((i) => i.selected).map((i) => i.name);
  check(
    '§8.2 three rows selected in the tree; Properties reads "3 parts selected"',
    selectedNames.length === 3 && (await heading()) === '3 parts selected',
    `selected rows ${selectedNames.join(', ')}; heading "${await heading()}"`,
  );

  // 3. Ctrl+G.
  await pressKey('Control+g');
  let model = await savedWhen((m) => m.groups?.length === 1, 'one group');
  const group1 = model.groups[0];
  items = await treeItems();
  const grouped = model.instances.filter((i) => i.groupId === group1.id).map((i) => i.id);
  await page.waitForTimeout(300);
  await shot('01-grouped');
  check(
    '§8.3 Ctrl+G: the tree shows Group 1 with 3 members; the saved model has one group and three groupIds',
    group1.name === 'Group 1' &&
      items[0]?.group &&
      items[0].name === 'Group 1' &&
      (await tree.getByRole('group', { name: 'Group 1 members' }).locator('.cad-tree-item').count()) === 3 &&
      grouped.length === 3 &&
      members.every((id) => grouped.includes(id)),
    `group ${JSON.stringify(group1)}; members ${grouped.join(', ')}; tree ${items.map((i) => i.name).join(' / ')}`,
  );

  // 5 (setup). A part fixed to the Top (the cabinet has none): the stiffener,
  // with an offset that keeps it where it is (top at (t, 0, height - t)).
  const stiffenerBefore = (await bodies()).stiffener.bounds;
  const riding = { id: 'verify-ride', type: 'fixed', from: 'stiffener', to: 'top', offset: ['=0-t', 0, '=t-height'] };
  await setConnections([riding]);
  shown = await bodies();
  check(
    '§8.5 setup: the stiffener is fixed to the Top through Connections, where it was',
    near(shown.stiffener.bounds.flat(), stiffenerBefore.flat(), 0.01),
    `stiffener box ${JSON.stringify(shown.stiffener.bounds.map((p) => round(p)))}`,
  );

  // 4. Click the Top: the group is selected.
  await setView('top');
  shown = await bodies();
  await clickAt(facePoint(shown.top.bounds, 2, 'max', 0.3, 0.3));
  check('§8.4 a click on the Top selects the group', (await heading()) === 'Group', `heading "${await heading()}"`);
  await gizmoOn();
  model = await saved();
  const beforeModel = model;
  const before = await bodies();
  // The X arrow: walk out from the pivot along the projected +X direction.
  const pivot = (await gizmo()).pivot;
  const p0 = await project(pivot),
    p1 = await project(add(pivot, [100, 0, 0]));
  const length = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  const dir = [(p1[0] - p0[0]) / length, (p1[1] - p0[1]) / length];
  let grab = null;
  for (let r = 20; r < 300 && !grab; r += 3) {
    const at = [p0[0] + dir[0] * r, p0[1] + dir[1] * r];
    await page.mouse.move(at[0], at[1]);
    if ((await gizmo()).axis === 'X') grab = at;
  }
  if (!grab) throw new Error('Could not find the gizmo X arrow.');
  metrics.gizmo = { pivot: round(pivot), moving: (await gizmo()).moving, movingIds: (await gizmo()).movingIds };
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(grab[0] + dir[0] * i * 10, grab[1] + dir[1] * i * 10);
    await page.waitForTimeout(80);
  }
  // 5. Mid-drag: every member moved by one delta; the rest stayed.
  const during = await bodies();
  const deltas = members.map((id) => sub(during[id].bounds[0], before[id].bounds[0]));
  const others = Object.keys(before).filter((id) => !members.includes(id));
  const othersStill = others.every((id) => near(during[id].bounds.flat(), before[id].bounds.flat(), 1e-6));
  check(
    '§8.5 mid-drag the three members moved by the same delta on screen; the other parts did not',
    deltas[0][0] > 1 &&
      deltas.every((d) => near(d, deltas[0], 1e-6)) &&
      deltas.every((d) => near(d, [deltas[0][0], 0, 0], 1e-6)) &&
      othersStill,
    `deltas ${deltas.map((d) => round(d).join(',')).join(' | ')}; others still ${othersStill}`,
  );
  metrics.midDragDelta = round(deltas[0]);
  await page.keyboard.type('200');
  await page.keyboard.press('Enter');
  // Before the rebuild: the members and the stiffener riding the Top.
  const released = await page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const element = document.querySelector('.cad-viewport');
    return {
      status: document.querySelectorAll('.cad-status > span')[1]?.textContent,
      bodies: Object.fromEntries(element.cadViewMode().bodies.map((b) => [b.id, b.bounds])),
    };
  });
  await page.mouse.up();
  await current();
  model = await savedWhen(
    (m) =>
      m.instances.find((i) => i.id === 'top').position !== beforeModel.instances.find((i) => i.id === 'top').position,
    'the moved group',
  );
  const after = await bodies();
  const expectedShift = (p, q) => {
    const shifted = (value) =>
      typeof value === 'number' ? Math.round((value + 200) * 1e6) / 1e6 : `=(${String(value).replace(/^=/, '')})+(200)`;
    return JSON.stringify([shifted(p[0]), p[1], p[2]]) === JSON.stringify(q);
  };
  const positionsOk = members.every((id) =>
    expectedShift(
      beforeModel.instances.find((i) => i.id === id).position,
      model.instances.find((i) => i.id === id).position,
    ),
  );
  const othersSaved = model.instances
    .filter((i) => !members.includes(i.id))
    .every(
      (i) => JSON.stringify(i.position) === JSON.stringify(beforeModel.instances.find((b) => b.id === i.id).position),
    );
  const rebuiltOk = [...members, 'stiffener'].every((id) =>
    near(
      after[id].bounds.flat(),
      before[id].bounds.flat().map((v, k) => (k % 3 === 0 ? v + 200 : v)),
      0.01,
    ),
  );
  check(
    '§8.4 typed 200 + Enter: the three saved X positions grew by exactly 200, the others unchanged; the rebuild agrees',
    positionsOk && othersSaved && rebuiltOk,
    `top ${JSON.stringify(model.instances.find((i) => i.id === 'top').position)}, right ${JSON.stringify(model.instances.find((i) => i.id === 'side-right').position)}; others unchanged ${othersSaved}; rebuilt +200 ${rebuiltOk}`,
  );
  const jumps = [...members, 'stiffener'].map((id) =>
    Math.max(...sub(after[id].bounds.flat(), released.bodies[id].flat()).map(Math.abs)),
  );
  metrics.release = { statusAtSample: released.status, maxJumpMm: round([Math.max(...jumps)], 4)[0] };
  if (released.status === 'Model current')
    skip('§8.5 no member jumps back after release', 'the rebuild finished before the sample; not discriminating');
  else
    check(
      '§8.5 after release, before the rebuild, nothing jumps back: members and the part fixed to the Top already sit at +200',
      jumps.every((j) => j <= 0.01),
      `status "${released.status}" at the sample; largest displayed change at the rebuild ${metrics.release.maxJumpMm} mm (stiffener included)`,
    );
  await undo();
  await current();
  model = await savedWhen(
    (m) =>
      members.every(
        (id) =>
          JSON.stringify(m.instances.find((i) => i.id === id).position) ===
          JSON.stringify(beforeModel.instances.find((i) => i.id === id).position),
      ),
    'the move undone',
  );
  check(
    '§8.4 one Undo reverts all three; the group stays',
    model.groups.length === 1 && model.instances.filter((i) => i.groupId === group1.id).length === 3,
    `positions back; groups ${model.groups.length}`,
  );

  // 6. ] turns the group 15° about Z through its centre.
  const unionOf = (boxes, ids) => {
    const list = ids.map((id) => boxes[id].bounds);
    return [
      [0, 1, 2].map((k) => Math.min(...list.map((b) => b[0][k]))),
      [0, 1, 2].map((k) => Math.max(...list.map((b) => b[1][k]))),
    ];
  };
  shown = await bodies();
  const union0 = unionOf(shown, members);
  await pressKey(']');
  await current();
  model = await savedWhen(
    (m) =>
      m.instances.find((i) => i.id === 'top').rotation?.[2] !==
      beforeModel.instances.find((i) => i.id === 'top').rotation?.[2],
    'the turned group',
  );
  const union1 = unionOf(await bodies(), members);
  const [w, d] = [union0[1][0] - union0[0][0], union0[1][1] - union0[0][1]];
  const turnRad = (15 * Math.PI) / 180;
  const expectedSize = [w * Math.cos(turnRad) + d * Math.sin(turnRad), w * Math.sin(turnRad) + d * Math.cos(turnRad)];
  const size1 = [union1[1][0] - union1[0][0], union1[1][1] - union1[0][1]];
  const rotations = members.map((id) => model.instances.find((i) => i.id === id).rotation);
  const turnedBy15 = members.every((id, k) => {
    const old = beforeModel.instances.find((i) => i.id === id).rotation || [0, 0, 0];
    return (((rotations[k][2] - old[2] - 15) % 360) + 360) % 360 < 1e-6;
  });
  metrics.turn = {
    centreBefore: round(centre(union0)),
    centreAfter: round(centre(union1)),
    size: round(size1),
    expectedSize: round(expectedSize),
  };
  check(
    '§8.6 ] turns the group 15° about Z about its centre (union centre ±0.5 mm, extent of the turned footprint)',
    near(centre(union0), centre(union1), 0.5) && near(size1, expectedSize, 0.5) && turnedBy15,
    `centre ${metrics.turn.centreBefore} → ${metrics.turn.centreAfter}; XY extent ${metrics.turn.size} (expected ${metrics.turn.expectedSize}); rotations ${JSON.stringify(rotations)}`,
  );
  await undo();
  await current();
  await savedWhen(
    (m) =>
      JSON.stringify(m.instances.find((i) => i.id === 'top').rotation) ===
      JSON.stringify(beforeModel.instances.find((i) => i.id === 'top').rotation),
    'the turn undone',
  );

  // 7. Double-click the Top: inside Group 1, the Top selected; Esc closes.
  await gizmoOff();
  const rowHeight = (await toolbar.boundingBox()).height;
  shown = await bodies();
  const topAt = await project(facePoint(shown.top.bounds, 2, 'max', 0.3, 0.3));
  await page.mouse.dblclick(topAt[0], topAt[1]);
  await page.waitForTimeout(300);
  const chipText = (await chip.count()) ? await chip.innerText() : '';
  const insideHeading = await heading();
  const featureList = await tree.locator('.cad-feature-list').count();
  const chipRowHeight = (await toolbar.boundingBox()).height;
  await shot('02-inside-group');
  check(
    '§8.7 double-click: banner "Inside Group 1 · Close (Esc)"; the Top selected as a single part (feature list shown)',
    chipText.replace(/\s+/g, ' ').trim() === 'Inside Group 1 · Close (Esc)' &&
      insideHeading === 'Top' &&
      featureList === 1,
    `banner "${chipText}"; heading "${insideHeading}"; feature lists ${featureList}`,
  );
  const chipBox = await chip.boundingBox(),
    cubeBox = await viewCube.boundingBox(),
    barBox = await toolbar.boundingBox();
  const clear = (a, b) =>
    a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
  metrics.toolbar = { withoutChip: rowHeight, withChip: chipRowHeight, chip: chipBox };
  check(
    '§4.8 the open-group chip never adds a view toolbar row at 1600 px (it sits over the view, clear of the cube)',
    Math.abs(chipRowHeight - rowHeight) < 1 && clear(chipBox, cubeBox) && chipBox.y >= barBox.y + barBox.height,
    `toolbar height ${rowHeight} px without the chip, ${chipRowHeight} px with it; chip at ${Math.round(chipBox.x)}, ${Math.round(chipBox.y)} (${Math.round(chipBox.width)} × ${Math.round(chipBox.height)} px)`,
  );
  await pressKey('Escape');
  check(
    '§8.7 Esc: banner gone, the group selected',
    (await chip.count()) === 0 && (await heading()) === 'Group',
    `chips ${await chip.count()}; heading "${await heading()}"`,
  );

  // 8. Hide / show and Isolate.
  await properties.getByRole('button', { name: 'Hide', exact: true }).click();
  model = await savedWhen(
    (m) => members.every((id) => m.instances.find((i) => i.id === id).visible === false),
    'hidden members',
  );
  shown = await bodies();
  const hiddenOk = members.every((id) => !shown[id].visible) && others.every((id) => shown[id].visible);
  await properties.getByRole('button', { name: 'Show', exact: true }).click();
  model = await savedWhen(
    (m) => members.every((id) => m.instances.find((i) => i.id === id).visible !== false),
    'shown members',
  );
  await properties.getByRole('button', { name: 'Isolate', exact: true }).click();
  await page.waitForTimeout(200);
  shown = await bodies();
  const isolatedOk = members.every((id) => shown[id].visible) && others.every((id) => !shown[id].visible);
  await shot('03-isolated');
  await properties.getByRole('button', { name: 'Isolate', exact: true }).click();
  await page.waitForTimeout(200);
  check(
    '§8.8 Hide / show on the group writes visible: false on each member; Isolate shows only them',
    hiddenOk && isolatedOk,
    `hidden ${hiddenOk}; isolated ${isolatedOk}`,
  );

  // 9. Duplicate, then Ctrl+Shift+G on the copy.
  await assemble();
  await ribbon.getByRole('button', { name: 'Duplicate instance', exact: true }).click();
  await current();
  model = await savedWhen((m) => m.groups.length === 2 && m.instances.length === 13, 'the duplicated group');
  const copyGroup = model.groups.find((g) => g.id !== group1.id);
  const copies = model.instances.filter((i) => i.groupId === copyGroup.id);
  const positions = worldPositions(model);
  const originalOf = (copy) =>
    model.instances.find(
      (i) =>
        members.includes(i.id) &&
        i.partId === copy.partId &&
        JSON.stringify(i.rotation) === JSON.stringify(copy.rotation),
    );
  const copiesOk = copies.every((c) => near(positions[c.id], add(positions[originalOf(c).id], [100, 0, 0]), 1e-6));
  check(
    '§8.9 Duplicate: 6 grouped instances in 2 groups; the copies sit +100 mm in X; the copy is selected',
    model.instances.filter((i) => i.groupId).length === 6 &&
      copies.length === 3 &&
      copiesOk &&
      copyGroup.name === 'Group 1 copy' &&
      (await heading()) === 'Group',
    `copy group "${copyGroup.name}"; copies ${copies.map((c) => round(positions[c.id]).join(',')).join(' | ')}`,
  );
  await pressKey('Control+Shift+g');
  model = await savedWhen((m) => m.groups.length === 1, 'the copy ungrouped');
  items = await treeItems();
  const copyIds = copies.map((c) => c.id);
  check(
    '§8.9 Ctrl+Shift+G on the copy: its three parts are top level and still selected',
    copyIds.every((id) => !model.instances.find((i) => i.id === id).groupId) &&
      (await heading()) === '3 parts selected' &&
      items.filter((i) => i.selected).length === 3,
    `heading "${await heading()}"; selected rows ${items.filter((i) => i.selected).length}`,
  );
  await undo();
  await undo();
  model = await savedWhen((m) => m.instances.length === 10 && m.groups.length === 1, 'the copies undone');

  // 10. Anchoring: a member attached (fixed) to a part outside the group.
  const anchoredConnections = [
    riding,
    { id: 'verify-anchor', type: 'fixed', from: 'side-left', to: 'plinth', offset: ['=0-t', -50, 0] },
  ];
  await setConnections(anchoredConnections);
  await selectGroupRow();
  const hint = 'Side is attached to Plinth outside this group. Group them together or edit Connections / welds.';
  const moveButton = properties.getByRole('button', { name: 'Move', exact: true });
  const flip = toolbar.getByRole('button', { name: 'Flip Horizontal', exact: true });
  await gizmoOn();
  const anchoredGizmo = await gizmo();
  const hintShown = await properties.getByText(hint, { exact: true }).count();
  await shot('04-anchored');
  check(
    '§8.10 an anchored group cannot move: Move and Flip disabled, no gizmo, the hint names both parts',
    (await moveButton.isDisabled()) && (await flip.isDisabled()) && !anchoredGizmo.moving && hintShown === 1,
    `Move disabled ${await moveButton.isDisabled()}; Flip disabled ${await flip.isDisabled()}; gizmo ${anchoredGizmo.moving}; hint shown ${hintShown}`,
  );
  await setConnections([riding]);
  await selectGroupRow();

  // 11. Mate: a face of a grouped part to a face on an outside part.
  await gizmoOff();
  model = await saved();
  const mateBefore = worldPositions(model);
  await setView('front');
  shown = await bodies();
  await assemble();
  await ribbon.getByRole('button', { name: 'Mate faces', exact: true }).click();
  await clickAt(facePoint(shown.top.bounds, 1, 'min', 0.5, 0.5));
  // A face of another member is refused.
  await clickAt(facePoint(shown['side-left'].bounds, 1, 'min', 0.5, 0.5));
  const refusal = (await cadError.count()) ? await cadError.innerText() : '';
  await noteCadError(true);
  await clickAt(facePoint(shown.plinth.bounds, 1, 'min', 0.5, 0.5));
  await current();
  model = await savedWhen(
    (m) => JSON.stringify(worldPositions(m).top) !== JSON.stringify(mateBefore.top),
    'the mated group',
  );
  const mated = worldPositions(model);
  const pairs = [
    ['side-left', 'side-right'],
    ['side-left', 'top'],
    ['side-right', 'top'],
  ];
  const pairChange = Math.max(
    ...pairs.map(([a, b]) => Math.abs(dist(mated[a], mated[b]) - dist(mateBefore[a], mateBefore[b]))),
  );
  const outsiders = others.filter((id) => id !== 'stiffener').every((id) => near(mated[id], mateBefore[id], 1e-9));
  await shot('05-mated');
  check(
    '§8.11 Mate faces moves every member rigidly (pairwise distances ±0.01 mm); another member is refused as the target',
    pairChange <= 0.01 && outsiders && refusal.includes('Pick a face on a part outside this group.'),
    `largest pairwise change ${round([pairChange], 6)[0]} mm; outsiders unmoved ${outsiders}; refusal "${refusal}"; top ${round(mateBefore.top)} → ${round(mated.top)}`,
  );
  metrics.mate = { pairChange, topBefore: round(mateBefore.top), topAfter: round(mated.top) };
  await properties.getByRole('button', { name: 'Done', exact: true }).click();
  await page.waitForTimeout(300);

  // 12. Reload: groups survive; a dangling groupId opens repaired.
  await page.waitForTimeout(1500);
  const keptGroups = (await saved()).groups;
  await page.reload();
  const workshop = page.getByRole('button', { name: '3D Model & workshop', exact: true });
  if (await workshop.isVisible().catch(() => false)) await workshop.click();
  await current();
  items = await treeItems();
  model = await saved();
  check(
    '§8.12 after a reload the group survives in the saved model and the tree',
    model.groups.length === 1 &&
      model.groups[0].id === keptGroups[0].id &&
      items.some((i) => i.group && i.name === 'Group 1'),
    `groups ${JSON.stringify(model.groups)}`,
  );
  await page.evaluate((key) => {
    const recovery = JSON.parse(localStorage.getItem(key));
    const plinth = recovery.document.model.instances.find((i) => i.id === 'plinth');
    plinth.groupId = 'group-deleted-by-hand';
    localStorage.setItem(key, JSON.stringify(recovery));
  }, RECOVERY);
  await page.reload();
  if (await workshop.isVisible().catch(() => false)) await workshop.click();
  await current();
  await page.waitForTimeout(1500);
  model = await saved();
  const plinth = model.instances.find((i) => i.id === 'plinth');
  await noteCadError(false);
  check(
    '§8.12 a hand-edited save with a dangling groupId opens and is repaired on load',
    model.instances.length === 10 && plinth && plinth.groupId == null && (await cadError.count()) === 0,
    `plinth groupId ${plinth?.groupId}; groups ${model.groups.length}; .cad-error ${await cadError.count()}`,
  );

  // 13. Page errors and unexpected .cad-error.
  const unexpected = cadErrors.filter((e) => !e.expected);
  check(
    '§8.13 no pageerror; no .cad-error except the expected mate refusal',
    errors.length === 0 && unexpected.length === 0,
    `page errors ${errors.length}; .cad-error seen ${JSON.stringify(cadErrors)}`,
  );
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ status: 'passed', errors, checks, metrics }, null, 2),
  );
  console.log('Sketch Studio part groups verification passed.');
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
