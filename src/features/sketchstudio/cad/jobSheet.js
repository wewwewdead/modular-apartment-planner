// The job sheet (docs/sketch-studio-fab-shop.md §9 SM-4): per product — a
// top-level group or a lone part — the shop route Cut → Bend → Paint → Print
// (docs/sketch-studio-shop-trim.md §4.5), what was done at each step, the
// quantities and the estimated times, and which steps are done; under the
// steps, what is in the product but not made here (bought-in items and
// fasteners), untimed. Cut and Paint count fabricated parts only
// (docs/sketch-studio-shop-floor.md §5.4: not bought in, not hardware). Pure:
// every number comes from the stations' own readout functions
// (laserStation.js laserNumbers, pressBrake.js assessBend and strokeTimeline,
// shopRecords.js shopRecordRows for the finish and print rows, shopCatalog.js
// POWDER), nothing is derived again here. Times are estimates and say so.
import { bendNumber, foldSheet, hitSequence, sheetMetalFeature, stepFold } from './sheetMetal.js';
import { laserNumbers, sheetNest } from './laserStation.js';
import { assessBend, bumpTimeline, strokeTimeline, toolLengths } from './pressBrake.js';
import { shopRecordRows } from './shopRecords.js';
import { memberIds, nodeName, treeRows } from './groups.js';
import { isFabricated, notMadeHere } from './shopParts.js';
import { csv } from './fabrication.js';
import { DEFAULT_MACHINE, MACHINES, POWDER, dieOf, machineOf, punchOf, stockOf } from './shopCatalog.js';

// Not in the spec, so stated here and labelled estimates in the sheet:
// handling per press brake hit (pick the part up, set it to the backgauge,
// turn it over) on top of the stroke itself; and per print (load, register,
// print, unload; making the screen or plate is not counted).
export const BEND_HANDLING_S = 20;
export const PRINT_HANDLING_S = 60;
export const JOB_STEPS = Object.freeze([
  ['cut', 'Cut'],
  ['bend', 'Bend'],
  ['paint', 'Paint'],
  ['print', 'Print'],
]);
// `none`: a step the product does not need (Print with no print: it is optional).
export const JOB_STATUS_NAMES = Object.freeze({
  done: 'Done',
  partial: 'Part done',
  todo: 'Not yet done',
  none: 'Not needed',
});

const fmt = (value, digits = 2) => (Number.isFinite(value) ? Number(value.toFixed(digits)).toString() : '—');
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** "38 s", "2 min 05 s", "1 h 02 min"; '—' when unknown. */
export function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  if (seconds < 59.5) return `${fmt(seconds, seconds < 10 ? 1 : 0)} s`;
  const s = Math.round(seconds);
  if (s < 3600) return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
  return `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')} min`;
}

/**
 * The products of a model: its top-level nodes in tree order: { id, name,
 * instanceIds }. A node with nothing made here (a fastener or a bought-in
 * item not yet in a product's group) is not a product (§5.4).
 */
export const jobProducts = (model) =>
  treeRows(model)
    .map((row) => ({
      id: row.id,
      name: nodeName(model, row.id),
      instanceIds: memberIds(model, [row.id]),
    }))
    .filter((product) =>
      product.instanceIds.some((id) =>
        isFabricated(model.parts.find((p) => p.id === model.instances.find((i) => i.id === id)?.partId)),
      ),
    );

const sum = (items, key) => {
  const known = items.filter((item) => Number.isFinite(item[key]));
  return known.length ? known.reduce((total, item) => total + item[key], 0) : items.length ? null : 0;
};
const status = (count, of, any = false) => (count === 0 ? 'todo' : any || count >= of ? 'done' : 'partial');
/** A step's status from what was done: none → todo; `any`, or all `of` → done; else partial (shopRoute.js reads it too). */
export const stepStatus = status;
// A step's quantity counts what it was done to: an item that is one load of
// a machine (the oven cure, `load`) is timed but not counted (SF-4 audit: the
// kiosk's Paint read 8 beside "7 of 7 parts painted").
const step = (key, state, summary, items, extra = {}) => ({
  key,
  name: JOB_STEPS.find(([k]) => k === key)[1],
  status: state,
  summary,
  items,
  quantity: items.reduce((n, item) => n + (item.load ? 0 : item.quantity || 0), 0),
  time: sum(items, 'time'),
  ...extra,
});

// The estimated time of each thing done, seconds: one definition, read by the
// job sheet's rows and by the replay's scene lengths (shopFilm.js).
export const CURE_S = POWDER.cureMinutes * 60;
/** One blank on the laser (laserStation.js laserNumbers: pierces and cut length). */
export const cutSeconds = (fold) =>
  laserNumbers({
    cutLength: fold.flat.cutLength,
    pierces: fold.flat.pierces,
    stock: fold.stock,
    thickness: fold.thickness,
  }).perBlank;
/** One hit of the press brake (`stroke`: bendStrokes' entry): the stroke, plus handling; with the hit's assessBend. */
/**
 * The hits of the press brake a fold was made in: one per step, a round bend's each (round-bend spec §7); a
 * bend-on step is one hit (docs/sketch-studio-tight-bends.md §4.3).
 */
export const strokeHits = (fold) =>
  hitSequence(fold).reduce(
    (sum, step) => sum + (step.again ? 1 : fold.bends.find((b) => b.id === step.bendIds[0])?.steps || 1),
    0,
  );
// A round bend (docs/sketch-studio-round-bend.md §7): its N hits (short lifts),
// the handling once and this much per further hit (sliding the sheet on).
export const BUMP_HANDLING_S = 3;
export function strokeSeconds(fold, stroke, machine) {
  const ids = stroke.bendIds;
  // A step of hitSequence is timed at its own angle and tooling (tight bends §4.3).
  const hit = assessBend(stepFold(fold, stroke), ids.length === 1 ? ids[0] : ids, { machine });
  const hits = hit.readouts.hits || 1;
  const run =
    (hits > 1 ? bumpTimeline(machine, hit.readouts.ramDepth, hits) : strokeTimeline(machine, hit.readouts.ramDepth))
      .total / 1000;
  return { seconds: run + BEND_HANDLING_S + BUMP_HANDLING_S * (hits - 1), stroke: run, hit, hits };
}

/**
 * The route of one product. `parts`: the instances with their part and
 * folded blank (null for a part that is not sheet metal); `records`:
 * shopRecordRows(model, snapshot) (or null); `batch` multiplies the quantity
 * and the time of every step but the oven cure, which takes one load.
 */
function productRoute({ product, model, parts, records, machine, batch }) {
  const name = (instanceId) => nodeName(model, instanceId);
  const ids = new Set(product.instanceIds);
  // Cut and Paint count what the shop makes (§5.4): not bought-in items, not hardware.
  const fabricated = parts.filter((p) => isFabricated(p.part));
  const n = fabricated.length;
  const sheetParts = fabricated.filter((p) => p.fold);
  // Cut: one blank per sheet-metal part, timed by the laser's own readout.
  const cut = sheetParts.map(({ instance, fold }) => {
    const seconds = cutSeconds(fold);
    return {
      part: name(instance.id),
      label: `${name(instance.id)} blank`,
      detail: `${fmt(fold.flat.width)} × ${fmt(fold.flat.height)} mm · t ${fmt(fold.thickness)} ${stockOf(fold.stock).name} · cut ${fmt(fold.flat.cutLength, 1)} mm · ${plural(fold.flat.pierces, 'pierce')}`,
      quantity: batch,
      seconds,
      time: seconds * batch,
    };
  });
  const notCut = fabricated.filter((p) => !p.fold).map((p) => name(p.instance.id));
  // Bend: each hit (a stroke of the machine, which may bend several tabs:
  // shop floor §6.1) with the machine's own checks (tooling, force) and its stroke.
  const bends = sheetParts.flatMap(({ instance, fold }) =>
    hitSequence(fold).map((strokeBends, index) => {
      // The step's own angle and tooling (tight bends §4.3): a bend-on step is one hit of its own.
      const made = stepFold(fold, strokeBends);
      const bend = made.bends.find((b) => b.id === strokeBends.bendIds[0]);
      const ids = strokeBends.bendIds;
      const { seconds, stroke, hit, hits } = strokeSeconds(fold, strokeBends, machine);
      // A punch or die set to its own length names it (docs/sketch-studio-brake-tool-length.md §3.4).
      const lengths =
        bend.punchTrim || bend.dieTrim ? toolLengths(made, ids, { bed: machine.bed }) : { punch: null, die: null };
      const tooling = `${punchOf(bend.punch).name} punch${lengths.punch ? `, ${lengths.punch}` : ''}${lengths.punch || lengths.die ? ' ·' : ','} ${dieOf(bend.die).name} die${lengths.die ? `, ${lengths.die}` : ''}`;
      return {
        part: name(instance.id),
        label: `${name(instance.id)} · bend ${index + 1}`,
        detail: `${strokeBends.again ? `bend ${bendNumber(fold, ids[0])} on: ${fmt(strokeBends.from[ids[0]])}° → ${fmt(strokeBends.to[ids[0]])}°` : bend.label}${ids.length > 1 ? ` · ${ids.length} flanges` : ''} · ${tooling} · ${fmt(hit.readouts.tonnage, 1)} kN${hits > 1 ? ` per hit · ${hits} strokes ${fmt(stroke, 1)} s + ${BEND_HANDLING_S} s handling + ${BUMP_HANDLING_S} s per further hit` : ` · stroke ${fmt(stroke, 1)} s + ${BEND_HANDLING_S} s handling`}`,
        quantity: batch,
        seconds,
        time: seconds * batch,
      };
    }),
  );
  const flatParts = sheetParts.filter((p) => !p.fold.bends.length).map((p) => name(p.instance.id));
  // Hits made: a round bend counts each of its hits (round-bend spec §7).
  const hitCount = sheetParts.reduce((sum, { fold }) => sum + strokeHits(fold), 0);
  // Paint, print: the records' own rows (area and powder, artwork).
  const finishRows = (model.finishes || [])
    .filter((f) => ids.has(f.instanceId))
    .map((f) => ({ finish: f, row: records?.finishes.find((r) => r.id === f.id) }));
  const paint = finishRows.map(({ finish, row }) => ({
    part: name(finish.instanceId),
    label: `${name(finish.instanceId)} · ${finish.name}`,
    detail: `${row?.gloss || finish.gloss} · ${fmt(Number(finish.thickness), 0)} µm ${finish.kind} · ${row?.area != null ? `${fmt(row.area, 4)} m²` : 'area not shown'}${finish.kind === 'powder' && row?.mass != null ? ` · ${fmt(row.mass * 1000, 1)} g powder` : ''}`,
    quantity: batch,
    seconds: null,
    time: null,
  }));
  if (finishRows.some(({ finish }) => finish.kind === 'powder'))
    paint.push({
      part: '',
      label: 'Oven cure',
      detail: `${POWDER.cureTemperature} °C part temperature for ${POWDER.cureMinutes} min (one load; spraying and heat-up not estimated)`,
      quantity: 1,
      load: true,
      seconds: CURE_S,
      time: CURE_S,
    });
  const prints = (model.prints || [])
    .filter((p) => ids.has(p.instanceId))
    .map((p) => {
      const row = records?.prints.find((r) => r.id === p.id);
      return {
        part: name(p.instanceId),
        label: `${name(p.instanceId)} · ${row?.method || p.method}`,
        detail: `${p.kind === 'text' ? `text “${p.text}”` : 'image'} · ${fmt(p.width)} × ${fmt(p.height)} mm`,
        quantity: batch,
        seconds: PRINT_HANDLING_S,
        time: PRINT_HANDLING_S * batch,
      };
    });
  const made = new Set(fabricated.map((p) => p.instance.id));
  const painted = new Set(finishRows.map(({ finish }) => finish.instanceId).filter((id) => made.has(id))).size;
  const steps = [
    step(
      'cut',
      status(sheetParts.length, n),
      sheetParts.length
        ? `${plural(sheetParts.length, 'blank')} cut from sheet${notCut.length ? `; not a laser part: ${notCut.join(', ')}` : ''}`
        : 'No sheet-metal blank: nothing to cut on the laser',
      cut,
    ),
    step(
      'bend',
      status(bends.length, 1, true),
      bends.length
        ? `${plural(hitCount, 'hit')} on the press brake${flatParts.length ? `; flat: ${flatParts.join(', ')}` : ''}`
        : 'No bends made',
      bends,
    ),
    step(
      'paint',
      status(painted, n),
      painted
        ? `${painted} of ${plural(n, 'part')} painted${finishRows[0] ? ` · ${finishRows[0].finish.name}` : ''}`
        : 'Not painted',
      paint,
    ),
    // Print is optional: a product with no print does not need it.
    step(
      'print',
      prints.length ? 'done' : 'none',
      prints.length ? plural(prints.length, 'print') : 'No prints',
      prints,
    ),
  ];
  return {
    ...product,
    steps,
    // What is in it but not made here, by label and count (untimed, multiplied by the batch).
    notMade: notMadeHere(model, product.instanceIds).map((row) => ({ ...row, count: row.count * batch })),
    time: sum(steps, 'time'),
    // A step the product does not need (`none`) does not hold it back.
    done: steps.every((s) => s.status === 'done' || s.status === 'none'),
  };
}

/**
 * Sheets to buy (docs/sketch-studio-outline-edit-sheet-nest.md §7.5): one row
 * per stock and thickness of the model's sheet-metal blanks, in model order
 * of the parts, each nested as the laser nests it (laserStation.js
 * sheetNest: every blank of that stock and thickness on the model's stock
 * sheet). `batch` products make each instance `batch` times, so the nest is
 * of the batch's blanks. [{ stock, thickness, sheet (its name), blanks (the
 * blanks placed), sheets, use (0…1), oversize (blanks larger than the
 * sheet) }]. Batch 1 reads exactly as the laser station's Sheet use.
 */
export function stockSheets(model, { params = {}, batch = 1 } = {}) {
  const pairs = [];
  for (const part of model.parts) {
    const feature = sheetMetalFeature(part);
    if (!feature || !model.instances.some((i) => i.partId === part.id)) continue;
    let fold;
    try {
      fold = foldSheet(feature, model.sketches.find((s) => s.id === feature.sketchId)?.profile, params);
    } catch {
      continue;
    }
    if (!pairs.some((p) => p.stock === fold.stock && Math.abs(p.thickness - fold.thickness) <= 1e-6))
      pairs.push({ stock: fold.stock, thickness: fold.thickness });
  }
  // The batch's blanks: every instance made `batch` times (ids kept apart, nothing else changes).
  const many = batch > 1 ? { ...model, instances: batchInstances(model.instances, batch) } : model;
  // A fold cache per pair: sheetNest's cache holds null for a part of another stock or thickness.
  return pairs.map(({ stock, thickness }) => {
    const nest = sheetNest(many, { stock, thickness, params });
    return {
      stock,
      thickness,
      sheet: nest.sheet.name,
      blanks: nest.sheets.reduce((sum, s) => sum + s.blanks.length, 0),
      sheets: nest.sheets.length,
      use: nest.use,
      oversize: nest.oversize.length,
    };
  });
}
const batchInstances = (instances, batch) =>
  Array.from({ length: batch }, (_, k) => instances.map((i) => (k ? { ...i, id: `${i.id}#${k + 1}` } : i))).flat();

/**
 * The job sheet of `model` as built in `snapshot` (which gives painted
 * areas; without it those read as unknown). Returns { batch, machine,
 * products: [{ id, name, instanceIds, steps: [{ key, name, status ('done' |
 * 'partial' | 'todo' | 'none'), summary, items: [{ part, label, detail,
 * quantity, seconds (each, estimated), time }], quantity, time }], notMade:
 * [{ label, count }], time, done }], stockSheets (Sheets to buy: stockSheets
 * above) }. Times in seconds; null where a step has no estimate.
 */
export function jobSheet(model, snapshot = null, { params = {}, batch = 1 } = {}) {
  const count = Math.max(1, Math.round(Number(batch) || 1));
  const key = model.fabrication?.shop?.machine;
  const machine = machineOf(MACHINES[key] ? key : DEFAULT_MACHINE);
  let records = null;
  try {
    records = shopRecordRows(model, snapshot);
  } catch {
    records = null;
  }
  const products = jobProducts(model).map((product) => {
    const parts = product.instanceIds.map((id) => {
      const instance = model.instances.find((i) => i.id === id);
      const part = model.parts.find((p) => p.id === instance?.partId);
      const feature = sheetMetalFeature(part);
      let fold = null;
      if (feature)
        try {
          fold = foldSheet(feature, model.sketches.find((s) => s.id === feature.sketchId)?.profile, params);
        } catch {
          fold = null;
        }
      return { instance, part, fold };
    });
    return productRoute({ product, model, parts, records, machine, batch: count });
  });
  // Sheets to buy (BQ-1 §7.5): under the products, not part of any product's rows or totals.
  return { batch: count, machine: machine.name, products, stockSheets: stockSheets(model, { params, batch: count }) };
}

/** The job sheet as CSV: one row per item, a total per step and per product. */
export function jobSheetCsv(sheet) {
  const time = (v) => (Number.isFinite(v) ? Number(v.toFixed(1)) : '');
  const rows = [
    ['Product', 'Step', 'Status', 'Item', 'What was done', 'Quantity', 'Estimated time each s', 'Estimated time s'],
  ];
  for (const product of sheet.products) {
    for (const s of product.steps) {
      for (const item of s.items)
        rows.push([
          product.name,
          s.name,
          JOB_STATUS_NAMES[s.status],
          item.label,
          item.detail,
          item.quantity,
          time(item.seconds),
          time(item.time),
        ]);
      rows.push([
        product.name,
        s.name,
        JOB_STATUS_NAMES[s.status],
        `${s.name} total`,
        s.summary,
        s.quantity,
        '',
        time(s.time),
      ]);
    }
    for (const item of product.notMade)
      rows.push([
        product.name,
        'Not made here',
        '',
        item.label,
        'Bought in or fastener: not timed',
        item.count,
        '',
        '',
      ]);
    rows.push([
      product.name,
      'Route',
      product.done ? 'Done' : 'Not yet done',
      'Product total',
      `Batch of ${sheet.batch} · ${sheet.machine}`,
      '',
      '',
      time(product.time),
    ]);
  }
  // Sheets to buy (§7.5): after the products, Step "Sheet stock", the sheets as the quantity.
  for (const s of sheet.stockSheets || [])
    rows.push([
      'Sheets to buy',
      'Sheet stock',
      '',
      stockSheetLabel(s),
      `${plural(s.blanks, 'blank')} · ${fmt(s.use * 100, 1)}% sheet use${s.oversize ? ` · ${s.oversize} larger than the sheet` : ''}`,
      s.sheets,
      '',
      '',
    ]);
  return csv(rows);
}
/** "t 1.5 SPCC · 1219 × 2438 mm": what a Sheets to buy row names. */
export const stockSheetLabel = (s) => `t ${fmt(s.thickness)} ${stockOf(s.stock).key.toUpperCase()} · ${s.sheet}`;
