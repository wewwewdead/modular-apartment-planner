/* global localStorage, process, console, document, window, requestAnimationFrame, performance, Worker, DataTransfer, File, Event, KeyboardEvent */
// Fabrication shop SM-3 (docs/sketch-studio-fab-shop.md §9 SM-3, without the
// Weld station since docs/sketch-studio-shop-trim.md): a fresh model → (the
// Shop tab's route since docs/sketch-studio-shop-floor.md SF-1) Draw → Cut a
// 200 × 120 plate and a 100 × 60 blank of 1.5 SPCC, bend the blank into an L
// and lay it on the plate → Shop → More → Group: the two parts are one group,
// no kernel rebuild, and move together → Paint: the whole group RAL 9005,
// read the area and powder mass, no kernel rebuild → the press brake on the
// painted L says it is finished here → Print: "ACME" silk-screen on the plate,
// dragged off its edge, the overhang warning → an uploaded image print
// (fitted ≤ 1024 px, ≤ 512 KB) with the model size, commit and save costs,
// and what a rebuild sends the kernel worker → reload: finishes, prints and
// the group intact → no page errors.
//   CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-fab-shop-sm3.mjs
// Screenshots: artifacts/sketch-cad/fab-shop-sm3 (or SM3_SHOTS).
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { cadSteps } from './sketch-cad-steps.mjs';

const directory = process.env.SM3_SHOTS || 'artifacts/sketch-cad/fab-shop-sm3';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [],
  checks = [],
  measured = {};
page.on('pageerror', (e) => errors.push(e.message));
// Every message posted to a worker: its type and, for a build or a solve, the
// payload's JSON length (what the structured clone carries).
await page.addInitScript(() => {
  window.__workerPosts = [];
  const post = Worker.prototype.postMessage;
  Worker.prototype.postMessage = function (data, transfer) {
    try {
      if (data && typeof data === 'object' && data.type)
        window.__workerPosts.push({
          type: data.type,
          bytes: data.type === 'build' || data.type === 'solve' ? JSON.stringify(data.payload).length : 0,
          at: performance.now(),
        });
    } catch {
      // Counting only.
    }
    return post.call(this, data, transfer);
  };
});
const { properties, current, savedWhen, saved, project, setPosition, view, route, shopStation, shopMore } =
  cadSteps(page);
const toolbar = page.locator('.cad-view-toolbar');
const footer = page.locator('.cad-status');
const canvas = page.locator('.cad-viewport canvas');
const shot = (name) => page.screenshot({ path: `${directory}/${name}.png` });
const shop = () => page.evaluate(() => document.querySelector('.cad-viewport').cadShop());
const bodies = () => page.evaluate(() => document.querySelector('.cad-viewport').cadViewMode().bodies);
const builds = () => page.evaluate(() => window.__workerPosts.filter((p) => p.type === 'build'));
const fill = async (scope, label, value) => {
  const field = scope.getByLabel(label, { exact: true });
  await field.fill(String(value));
  await field.press('Enter');
};
const fit = async () => {
  await view('isometric');
  await toolbar.getByRole('button', { name: 'Fit', exact: true }).click();
  await page.waitForTimeout(300);
};
const click = async (point) => {
  const [x, y] = await project(point);
  await page.mouse.move(x, y, { steps: 3 });
  await page.waitForTimeout(60);
  await page.mouse.click(x, y);
  await page.waitForTimeout(120);
};
// Bring a world point to the middle of the view and zoom in (right-drag pans, the wheel zooms).
const closeUp = async (point, notches = 6) => {
  const box = await canvas.boundingBox();
  const centre = [box.x + box.width / 2, box.y + box.height / 2];
  const [x, y] = await project(point);
  await page.mouse.move(x, y);
  await page.mouse.down({ button: 'right' });
  for (let i = 1; i <= 10; i++) await page.mouse.move(x + ((centre[0] - x) * i) / 10, y + ((centre[1] - y) * i) / 10);
  await page.mouse.up({ button: 'right' });
  for (let i = 0; i < notches; i++) {
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(250);
};
const bodyOf = async (id) => (await bodies()).find((b) => b.id === id);
// A placed print's field commit to the frame that shows it: the time from Enter
// in its Rotation field to the decal turning (print `index` in cadShop order).
const commitToFrame = (index, degrees) =>
  page.evaluate(
    ({ index, degrees }) =>
      new Promise((resolve) => {
        const field = document.querySelector('[aria-label="Print station"] input[aria-label="Rotation (°)"]');
        const viewport = document.querySelector('.cad-viewport');
        const was = JSON.stringify(viewport.cadShop().records.prints[index].corners);
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        field.focus();
        setter.call(field, String(degrees));
        field.dispatchEvent(new Event('input', { bubbles: true }));
        const t0 = performance.now();
        field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        const check = () => {
          if (JSON.stringify(viewport.cadShop().records.prints[index].corners) !== was)
            resolve(Number((performance.now() - t0).toFixed(1)));
          else requestAnimationFrame(check);
        };
        check();
      }),
    { index, degrees },
  );
// The model's size and what it costs to serialise and to write the recovery copy.
const modelCosts = () =>
  page.evaluate(() => {
    const doc = JSON.parse(localStorage.getItem('apartment-planner-sketch-recovery'));
    const time = (run, n = 20) => {
      const t0 = performance.now();
      for (let i = 0; i < n; i++) run();
      return Number(((performance.now() - t0) / n).toFixed(2));
    };
    const result = {
      modelChars: JSON.stringify(doc.document.model).length,
      stringifyMs: time(() => JSON.stringify(doc.document.model)),
      recoverySaveMs: time(() => localStorage.setItem('verify-sm3-probe', JSON.stringify(doc)), 10),
    };
    localStorage.removeItem('verify-sm3-probe');
    return result;
  });
// An image drawn in the page and handed to the print panel's upload field:
// a gradient with circles (compresses well) or photographic noise (does not).
const uploadImage = (noisy) =>
  page.evaluate(async (noisy) => {
    const source = document.createElement('canvas');
    source.width = 1600;
    source.height = 1200;
    const g = source.getContext('2d');
    const sky = g.createLinearGradient(0, 0, 1600, 1200);
    sky.addColorStop(0, '#1c7ed6');
    sky.addColorStop(0.5, '#f8f9fa');
    sky.addColorStop(1, '#e8590c');
    g.fillStyle = sky;
    g.fillRect(0, 0, 1600, 1200);
    if (noisy) {
      const data = g.getImageData(0, 0, 1600, 1200);
      for (let i = 0; i < data.data.length; i += 4)
        for (let k = 0; k < 3; k++)
          data.data[i + k] = Math.max(0, Math.min(255, data.data[i + k] + (Math.random() - 0.5) * 120));
      g.putImageData(data, 0, 0);
    }
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `hsl(${i * 9}, 70%, 55%)`;
      g.beginPath();
      g.arc(80 + ((i * 397) % 1440), 80 + ((i * 251) % 1040), 30 + (i % 7) * 12, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#ffffff';
    g.fillRect(300, 400, 1000, 400);
    g.fillStyle = '#c2255c';
    g.font = 'bold 260px sans-serif';
    g.fillText('LOGO', 420, 700);
    const blob = await new Promise((resolve) => source.toBlob(resolve, 'image/png'));
    const input = document.querySelector('[aria-label="Upload image"]');
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], noisy ? 'photo.png' : 'logo.png', { type: 'image/png' }));
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return blob.size;
  }, noisy);
// Draw → Rectangle W × H → Cut: 1.5 SPCC → Cut on the laser; once it is cut, leave the laser.
const cut = async (width, height) => {
  await shopStation('Draw');
  const draw = properties.getByRole('region', { name: 'Draw' });
  await draw.getByRole('button', { name: /^Rectangle/ }).click();
  await fill(draw, 'Width W (mm)', width);
  await fill(draw, 'Height H (mm)', height);
  await draw.getByRole('button', { name: 'Cut this rectangle', exact: true }).click();
  const panel = properties.getByRole('region', { name: 'Cut from sheet' });
  await panel.getByLabel('Sheet stock', { exact: true }).selectOption('spcc');
  await fill(panel, 'Custom thickness (mm)', 1.5);
  await panel.getByRole('button', { name: 'Cut on the laser', exact: true }).click();
  await expect(page.getByRole('figure', { name: 'Laser bed' })).toHaveAttribute('data-state', 'cut', {
    timeout: 20000,
  });
  await properties
    .getByRole('region', { name: 'Laser station' })
    .getByRole('button', { name: 'Leave laser', exact: true })
    .click();
  await current();
};
// A station's Machine numbers, opened where a script reads one (shop floor §4.6).
const openNumbers = async (scope) => {
  const numbers = scope.locator('details.cad-shop-numbers');
  if (!(await numbers.evaluate((d) => d.open))) await numbers.locator('summary').click();
};

try {
  await page.goto(process.env.CAD_VERIFY_URL || 'http://localhost:5180/sketch');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '3D Model & workshop', exact: true }).click();
  await current();

  // 1. The parts: a 200 × 120 plate and a 100 × 60 blank bent into an L, laid on the plate.
  await page.getByRole('button', { name: 'Shop', exact: true }).click();
  await expect(route.getByRole('button')).toHaveText([
    /^1.*Draw/,
    /^2.*Cut/,
    /^3.*Bend/,
    /^4.*Paint/,
    /^5.*Print/,
    // SF-5: Replay, at the end of the route.
    /^Replay$/,
    /More/,
  ]);
  await cut(200, 120);
  await cut(100, 60);
  const form = properties.getByLabel('Sheet metal', { exact: true });
  await form.getByLabel('Blank edge', { exact: true }).selectOption('left');
  await fill(form, 'Distance D (mm)', 20);
  await form.getByRole('button', { name: 'Add bend', exact: true }).click();
  await current();
  let model = await savedWhen(
    (m) => m.instances.length === 2 && m.parts[1]?.features[0].bends?.length === 1,
    'a plate and an L',
  );
  const [plate, angle] = model.instances.map((i) => i.id);
  // BQ-1 (docs/sketch-studio-outline-edit-sheet-nest.md §7.7): a new cut no
  // longer lands on a part, so the L is set on the plate by hand, where the
  // old landing put it (both blanks centred on the same drop point).
  const plateAt = model.instances[0].position;
  await setPosition(plateAt[0] + (200 - 100) / 2, plateAt[1] + (120 - 60) / 2, 1.5);
  await current();
  model = await savedWhen((m) => m.instances[1].position[2] === 1.5, 'the L on the plate');
  await fit();
  const P = await bodyOf(plate),
    L = await bodyOf(angle);
  assert(Math.abs(L.bounds[0][2] - 1.5) < 0.01 && Math.abs(P.bounds[1][2] - 1.5) < 0.01, 'The L lies on the plate.');
  const top = 1.5;
  const yMid = (L.bounds[0][1] + L.bounds[1][1]) / 2;
  const endX = L.bounds[1][0];
  checks.push(
    `plate ${P.bounds[1].map((v, i) => (v - P.bounds[0][i]).toFixed(1)).join(' × ')} mm, L ${L.bounds[1].map((v, i) => (v - L.bounds[0][i]).toFixed(1)).join(' × ')} mm on it`,
  );

  // 2. Group them from Shop → More (docs/sketch-studio-shop-trim.md §4.3): both parts selected (Ctrl+A).
  let before = (await builds()).length;
  await page.mouse.move(5, 500);
  await page.keyboard.press('Control+a');
  await expect(properties.getByRole('list', { name: 'Selected parts' }).getByRole('button')).toHaveCount(2);
  await shopMore('Group');
  model = await savedWhen((m) => m.groups?.length === 1, 'the group');
  const group = model.groups[0];
  assert(
    model.instances.every((i) => i.groupId === group.id),
    'Both parts are in the group.',
  );
  assert.equal(group.weldment, undefined, 'An ordinary group.');
  await page.waitForTimeout(400);
  assert.equal((await builds()).length, before, 'Grouping sends no kernel build.');
  checks.push(`grouped from Shop → More: "${group.name}", both parts, no kernel build`);
  await page.mouse.move(5, 500);
  await page.waitForTimeout(150);
  await shot('01-grouped');

  // 3. They move as one: click the L → the group; Move by X 10.
  await click([L.bounds[1][0] - 20, yMid, L.bounds[1][2]]);
  // The click selects the group: both parts are in the selection.
  await expect(properties.getByRole('list', { name: 'Selected parts' }).getByRole('button')).toHaveCount(2);
  const moves = properties.getByRole('group', { name: 'Move by (mm)' });
  await fill(moves, 'Move by X (mm)', 10);
  await moves.getByRole('button', { name: 'Move', exact: true }).click();
  await current();
  const moved = await savedWhen(
    (m) => m.instances.every((i, k) => i.position[0] === model.instances[k].position[0] + 10),
    'the group moved',
  );
  checks.push(`group moved together: ${moved.instances.map((i) => `${i.position[0]}`).join(', ')} (x, mm, both +10)`);
  model = moved;
  const shift = 10;

  // 4. Paint the whole group RAL 9005 Jet black; area, powder, no rebuild.
  await properties.getByRole('list', { name: 'Selected parts' }).getByRole('button').nth(1).click();
  await shopStation('Paint');
  const paint = properties.getByRole('region', { name: 'Paint booth' });
  // The selection (the L) is the target; its whole group is offered.
  await paint.getByRole('button', { name: `Paint the whole ${group.name} (2 parts)`, exact: true }).click();
  await paint.getByRole('button', { name: 'RAL 9005 Jet black', exact: true }).click();
  const area = await paint.getByLabel('Painted area', { exact: true }).innerText();
  const powder = await paint.getByLabel('Powder', { exact: true }).innerText();
  await openNumbers(paint);
  const cure = await paint.getByLabel('Cure', { exact: true }).innerText();
  assert.equal(cure, '200 °C part temperature for 10 min');
  const m2 = Number(area.replace(' m²', ''));
  const grams = Number(powder.split(' g')[0]);
  const coverage = (1000 / (1.5 * 70)) * 0.6;
  assert(Math.abs(grams - (m2 / coverage) * 1000) < 0.2, `powder ${grams} g for ${m2} m² at ${coverage} m²/kg`);
  before = (await builds()).length;
  // From the click to the frame that shows the paint.
  const paintMs = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const button = [...document.querySelectorAll('[aria-label="Paint booth"] button')].find(
          (b) => b.textContent === 'Paint',
        );
        const viewport = document.querySelector('.cad-viewport');
        const t0 = performance.now();
        button.click();
        const check = () => {
          const shown = viewport.cadViewMode().bodies;
          if (shown.length && shown.every((b) => b.color === '#0e0e10')) resolve(performance.now() - t0);
          else requestAnimationFrame(check);
        };
        check();
      }),
  );
  measured.paintClickToFrameMs = Number(paintMs.toFixed(1));
  model = await savedWhen((m) => m.finishes?.length === 2, 'the finishes');
  assert(model.finishes.every((f) => f.name === 'RAL 9005 Jet black' && f.colour === '#0e0e10' && f.kind === 'powder'));
  await page.waitForTimeout(500);
  assert.equal((await builds()).length, before, 'Painting sends no kernel build.');
  await expect(footer).not.toContainText('Rebuilding solids');
  checks.push(
    `paint: area ${area}, powder ${powder}, cure ${cure}; click → painted frame ${measured.paintClickToFrameMs} ms; no kernel build`,
  );
  await paint.getByRole('button', { name: 'Leave paint booth', exact: true }).click();
  await fit();
  await shot('03-painted-group');

  // 5. The press brake on the painted L: its hit is made and it has gone on to
  //    the paint booth, so since SF-5 it is finished here — a neutral card,
  //    not a refusal — with the shop-order remedy kept as a second choice.
  await click([L.bounds[1][0] + shift - 20, yMid, L.bounds[1][2]]);
  await properties.getByRole('list', { name: 'Selected parts' }).getByRole('button').nth(1).click();
  await shopStation('Bend');
  const brake = properties.getByRole('region', { name: 'Press brake' });
  const finishedHere = await brake.getByRole('status', { name: 'Finished here' }).innerText();
  assert.match(
    finishedHere,
    /^Bending is done on this part: 1 hit made\. It has gone on down the route: powder-coated RAL 9005 Jet black\./,
  );
  assert.equal(await brake.getByRole('alert').count(), 0, 'the painted L is not refused: it is finished here');
  await expect(brake.getByRole('button', { name: 'Remove a paint finish and bend', exact: true })).toBeVisible();
  checks.push(`press brake on the painted L: ${finishedHere}`);
  await brake.getByRole('button', { name: 'Cancel', exact: true }).click();

  // 6. Print "ACME" (silk-screen) on the plate, then drag it off the edge.
  const plateNow = await bodyOf(plate);
  const freeX = (endX + shift + plateNow.bounds[1][0]) / 2;
  await shopStation('Print');
  const print = properties.getByRole('region', { name: 'Print station' });
  await fill(print, 'Text', 'ACME');
  await fill(print, 'Width (mm)', 30);
  await fill(print, 'Text height (mm)', 10);
  // White ink on the black powder.
  await print.getByLabel('Ink colour', { exact: true }).fill('#ffffff');
  before = (await builds()).length;
  await click([freeX, yMid, top]);
  model = await savedWhen((m) => m.prints?.length === 1, 'the print');
  const placed = model.prints[0];
  assert.equal(placed.instanceId, plate);
  assert.equal(placed.text, 'ACME');
  assert.equal(placed.method, 'silk');
  await expect(print.getByRole('alert')).toHaveCount(0);
  const state = await shop();
  const decal = state.records.prints[0];
  assert(decal.visible && decal.ready, 'The print shows on the face.');
  await page.waitForTimeout(200);
  await shot('04-print-on-face');
  // The drag: 25 mm along X on the face → over the plate's edge.
  const [sx, sy] = await project(decal.centre);
  const [ex, ey] = await project([decal.centre[0] + 25, decal.centre[1], decal.centre[2]]);
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(sx + ((ex - sx) * i) / 10, sy + ((ey - sy) * i) / 10);
  await page.mouse.up();
  model = await savedWhen((m) => Math.abs(m.prints[0].origin[0] - placed.origin[0] - 25) < 1.5, 'the dragged print');
  const overhang = print.getByRole('alert').first();
  await expect(overhang).toContainText('The artwork overhangs its face');
  await page.waitForTimeout(500);
  assert.equal((await builds()).length, before, 'Printing and dragging send no kernel build.');
  const overhangText = await overhang.innerText();
  checks.push(
    `print "ACME" placed at x ${placed.origin[0].toFixed(1)} (part frame), dragged to ${model.prints[0].origin[0].toFixed(1)} → ${overhangText}; no kernel build`,
  );
  await page.mouse.move(5, 500);
  await shot('05-print-overhangs');
  measured.textOnly = { ...(await modelCosts()), commitToFrameMs: await commitToFrame(0, 0.5) };
  await closeUp(state.records.prints[0].centre, 6);
  await shot('06-print-close-up');
  await fit();
  await print.getByRole('button', { name: 'Leave print station', exact: true }).click();

  // 7. An uploaded image (drawn here at 1600 × 1200: fitted to 1024 px), on the
  // plate's other end; then a photo-like one that only fits smaller. Model
  // size, serialise and recovery-save time, a field commit to its frame, and
  // what a rebuild sends the kernel worker.
  await shopStation('Print');
  await print.getByRole('group', { name: 'Artwork' }).getByRole('button', { name: 'Image', exact: true }).click();
  const pngBytes = await uploadImage(false);
  await expect(print.getByLabel('Image size', { exact: true })).toContainText('1024 × 768 px');
  await fill(print, 'Width (mm)', 40);
  const imageX = (P.bounds[0][0] + shift + (L.bounds[0][0] + shift)) / 2 - 8;
  await click([imageX, yMid, top]);
  model = await savedWhen((m) => m.prints?.length === 2, 'the image print');
  let image = model.prints[1];
  assert.equal(image.kind, 'image');
  assert(image.image.length <= 512 * 1024, `image ${image.image.length} chars`);
  await page.waitForFunction(
    () =>
      document
        .querySelector('.cad-viewport')
        .cadShop()
        .records.prints.every((p) => p.ready),
    null,
    { timeout: 5000 },
  );
  await page.waitForTimeout(600);
  measured.image1024 = {
    uploadedPngBytes: pngBytes,
    fitted: (await print.getByLabel('Image size', { exact: true }).innerText()).trim(),
    imageChars: image.image.length,
    ...(await modelCosts()),
    commitToFrameMs: await commitToFrame(1, 0.5),
  };
  // The photo-like image on the same print: too big at 1024 px, so it is fitted smaller.
  const photoBytes = await uploadImage(true);
  model = await savedWhen((m) => m.prints?.[1]?.image !== image.image, 'the photo image');
  image = model.prints[1];
  assert(image.image.length <= 512 * 1024, `photo ${image.image.length} chars`);
  await page.waitForFunction(
    () =>
      document
        .querySelector('.cad-viewport')
        .cadShop()
        .records.prints.every((p) => p.ready),
    null,
    { timeout: 5000 },
  );
  await page.waitForTimeout(600);
  measured.imageNearLimit = {
    uploadedPngBytes: photoBytes,
    fitted: (await print.getByLabel('Image size', { exact: true }).innerText()).trim(),
    imageChars: image.image.length,
    ...(await modelCosts()),
    commitToFrameMs: await commitToFrame(1, 1),
  };
  await page.mouse.move(5, 500);
  await page.waitForTimeout(200);
  await closeUp((await shop()).records.prints[1].centre, 5);
  await page.mouse.move(5, 500);
  await shot('08-image-print-close-up');
  await fit();
  // A rebuild (move the group) sends the kernel the model without the shop's records.
  await print.getByRole('button', { name: 'Leave print station', exact: true }).click();
  const posts = (await builds()).length;
  await click([L.bounds[1][0] + shift - 20, yMid, L.bounds[1][2]]);
  await fill(moves, 'Move by Y (mm)', 5);
  await moves.getByRole('button', { name: 'Move', exact: true }).click();
  await current();
  const sent = (await builds()).slice(posts);
  assert(sent.length >= 1, 'The move rebuilt the solids.');
  measured.buildPayloadChars = sent.at(-1).bytes;
  assert(sent.at(-1).bytes < 20000, 'The images do not go to the kernel worker.');
  await page.mouse.move(5, 500);
  await page.waitForTimeout(300);
  await shot('09-image-and-text-prints');
  checks.push(
    `image prints: ${measured.image1024.fitted} (${measured.image1024.imageChars} chars), photo ${measured.imageNearLimit.fitted} (${measured.imageNearLimit.imageChars} chars); model JSON ${measured.textOnly.modelChars} → ${measured.image1024.modelChars} → ${measured.imageNearLimit.modelChars} chars; field commit → frame ${measured.textOnly.commitToFrameMs} / ${measured.image1024.commitToFrameMs} / ${measured.imageNearLimit.commitToFrameMs} ms; rebuild payload ${measured.buildPayloadChars} chars (no image)`,
  );

  // 8. Reload: finishes, prints and the group intact.
  await page.waitForTimeout(1200);
  const kept = await saved();
  await page.reload();
  const workshop = page.getByRole('button', { name: '3D Model & workshop', exact: true });
  if (await workshop.isVisible().catch(() => false)) await workshop.click();
  await current();
  const after = await saved();
  for (const key of ['finishes', 'prints', 'groups'])
    assert.deepEqual(after[key], kept[key], `${key} survive the reload`);
  await page.waitForFunction(() => {
    const s = document.querySelector('.cad-viewport').cadShop();
    return s.records.prints.length === 2 && s.records.prints.every((p) => p.ready);
  });
  assert(
    (await bodies()).every((b) => b.color === '#0e0e10'),
    'The paint shows after the reload.',
  );
  await fit();
  await shot('10-after-reload');
  checks.push(
    `reload → ${after.finishes.length} finishes (${after.finishes[0].name}), ${after.prints.length} prints (${after.prints.map((p) => p.kind).join(', ')}), group "${after.groups[0].name}"`,
  );

  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ status: 'passed', errors, checks, measured }, null, 2),
  );
  console.log('Fab shop SM-3 verification passed:\n- ' + checks.join('\n- '));
  console.log('Measured:', JSON.stringify(measured, null, 2));
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` });
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}
