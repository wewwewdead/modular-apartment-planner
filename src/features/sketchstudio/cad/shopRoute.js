// The shop floor's route (docs/sketch-studio-shop-floor.md §4.1, §4.3): the
// stations in shop order, where a product and each of its parts stand on it
// (the job sheet's rules, jobSheet.js, so the route bar and the job sheet
// never disagree), and what a station opens on. Pure: model in, plain data out.
import { crossingText, foldSheet, polygonBounds, profilePolygon, sheetMetalFeature } from './sheetMetal.js';
import { jobProducts, stepStatus, strokeHits } from './jobSheet.js';
import { nodeName } from './groups.js';
import { blankBaseName, numeric } from './model.js';
import { isClosedProfile } from './operations.js';
import { sketchConsumer } from './sketchPlane.js';
import { sketchEditProblem } from './sketchOperations.js';
import { entityPolyline, profileToEntities } from './sketchProfile.js';
import { stockOf } from './shopCatalog.js';
import { isFabricated } from './shopParts.js';
import { shopOrderBlock } from './brakeStation.js';
import { lotInstances } from './laserStation.js';

// key, the name on the route bar, the ribbon icon, the panel region it opens.
// Putting parts together is not a station (docs/sketch-studio-shop-trim.md
// §4.3): Move part, Rotate part, Mate faces and Group do it.
export const ROUTE = Object.freeze(
  [
    ['draw', 'Draw', 'ShopCut', 'Draw'],
    ['cut', 'Cut', 'ShopLaser', 'Laser station'],
    ['bend', 'Bend', 'ShopBrake', 'Press brake'],
    ['paint', 'Paint', 'ShopPaint', 'Paint booth'],
    ['print', 'Print', 'ShopPrint', 'Print station'],
  ].map(([key, name, icon, region], index) => Object.freeze({ key, name, icon, region, number: index + 1 })),
);
export const routeStation = (key) => ROUTE.find((s) => s.key === key) || null;
/** The station before / after `key` on the route, or null at either end. */
export const routeNeighbour = (key, step) => ROUTE[ROUTE.findIndex((s) => s.key === key) + step] || null;
// Print is optional, so never the next step.
const NEXT_KEYS = ['draw', 'cut', 'bend', 'paint'];
const nextOf = (steps, keys) =>
  keys.find((key) => steps[key].status !== 'done' && steps[key].status !== 'none') || null;

const fmt = (value) => (Number.isFinite(value) ? Number(value.toFixed(1)).toString() : '—');
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const mark = (status, text = '—') => ({ status, text });
// "RAL 7035 Light grey" reads "RAL 7035" on a chip; a custom finish its name or colour.
const finishText = (finish) => {
  const name = String(finish?.name || '');
  return name.match(/^RAL \d{4}/)?.[0] || name || finish?.colour || 'painted';
};

/** An instance's sheet-metal feature and blank sketch, or null when it is not sheet metal. */
export function sheetPartOf(model, instanceId) {
  const instance = model.instances.find((i) => i.id === instanceId);
  const part = model.parts.find((p) => p.id === instance?.partId);
  const feature = sheetMetalFeature(part);
  if (!feature) return null;
  return { instance, part, feature, sketch: model.sketches.find((s) => s.id === feature.sketchId) || null };
}
/**
 * The lot of an instance's blank (docs/sketch-studio-own-bends.md §3, §4.1):
 * every instance, in model order, whose part's sheet-metal blank is cut from
 * the same outline in the same stock and thickness (laserStation.js sameLot)
 * — the blanks the laser's Quantity counts. [] when the instance is not sheet
 * metal. A part with several instances (a model that breaks the rule) is one
 * lot with them all.
 */
export function lotOf(model, instanceId, params = {}) {
  const own = sheetPartOf(model, instanceId);
  return own ? lotInstances(model, own.feature, params) : [];
}

/** The instance's folded blank (foldSheet), or null: not sheet metal, or the blank does not fold. */
export function foldOf(model, instanceId, params = {}) {
  const sheet = sheetPartOf(model, instanceId);
  if (!sheet) return null;
  try {
    return foldSheet(sheet.feature, sheet.sketch?.profile, params);
  } catch {
    return null;
  }
}

// An outline of the shop (docs/sketch-studio-outline-edit-sheet-nest.md
// §3.1): a sketch on the XY plane that no part is made from yet.
const isShopOutline = (model, s) => (s.plane || 'XY') === 'XY' && !s.normal && !sketchConsumer(model, s.id);
export const NOT_CLOSED = 'Not closed: connect the ends so the outline is one loop.';
// Whether the outline makes a blank, its size when it does, why not when not.
function outlineRow(s, params) {
  const row = { id: s.id, name: s.name, ready: false, width: null, height: null, problem: '' };
  if (!isClosedProfile(s)) return { ...row, problem: NOT_CLOSED };
  try {
    const [[x0, y0], [x1, y1]] = polygonBounds(profilePolygon(s.profile, params).outer);
    return { ...row, ready: true, width: x1 - x0, height: y1 - y0 };
  } catch (e) {
    return { ...row, problem: e.message || String(e) };
  }
}

/**
 * Every outline of the model, in model order (Draw lists them all, §3.2):
 * [{ id, name, ready, width, height, problem, editProblem }]. `ready`: closed
 * and it makes a blank (then `width` × `height` are its bounds); else
 * `problem` says why in shop words. `editProblem`: why the sketcher cannot
 * reopen it ('' when it can).
 */
export function shopOutlines(model, params = {}) {
  return model.sketches
    .filter((s) => isShopOutline(model, s))
    .map((s) => ({ ...outlineRow(s, params), editProblem: sketchEditProblem(s) }));
}

/**
 * The outlines ready to cut (Draw → "Outlines ready to cut", the route's
 * Draw mark, Cut's entry): [{ id, name, width, height }].
 */
export function readyOutlines(model, params = {}) {
  return model.sketches
    .filter((s) => isShopOutline(model, s))
    .map((s) => outlineRow(s, params))
    .filter((row) => row.ready)
    .map(({ id, name, width, height }) => ({ id, name, width, height }));
}

/**
 * What the 3D view draws of the outlines while Draw or Cut's picker is open
 * (§3.5; docs/sketch-studio-cut-pick.md §4.2): [{ id, ready, chosen, rings:
 * [{ points, closed }] }] on the XY plane, in model millimetres. A ready
 * outline is its blank's outline and cut-outs (the outer ring first); one
 * that is not, the lines it was drawn with (or its profile's, when it was
 * made by data). `chosen`: Draw's one sketch id, or the picker's selected ids.
 */
export function shopOutlineView(model, params = {}, chosen = null) {
  const picked = new Set(Array.isArray(chosen) ? chosen : chosen ? [chosen] : []);
  return model.sketches
    .filter((s) => isShopOutline(model, s))
    .map((s) => {
      const [ox, oy] = [0, 1].map((i) => Number(s.origin?.[i]) || 0);
      const shift = (points) => points.map(([x, y]) => [x + ox, y + oy]);
      const { ready } = outlineRow(s, params);
      let rings = [];
      if (ready) {
        const { outer, holes } = profilePolygon(s.profile, params);
        rings = [outer, ...holes].map((ring) => ({ points: shift(ring), closed: true }));
      } else {
        const drawn = s.entities?.length ? s.entities : profileToEntities(s.profile) || [];
        rings = drawn
          .filter((e) => !e.construction)
          .map((e) => ({ points: shift(entityPolyline(e, 48)), closed: false }))
          .filter((r) => r.points.length > 1);
      }
      return { id: s.id, ready, chosen: picked.has(s.id), rings };
    })
    .filter((row) => row.rings.length);
}

/**
 * Finishing an edit of an outline that sheet-metal parts are cut from
 * (§3.6, the guard): '' when every one of them still folds on the new
 * profile, else why not — nothing is committed then. A crossing at a corner
 * carries the relief hint (docs/sketch-studio-corner-gaps.md §4.2).
 */
export function outlineEditRefusal(model, sketchId, profile, params = {}) {
  for (const part of model.parts)
    for (const feature of part.features) {
      if (feature.type !== 'sheetmetal' || feature.suppressed || feature.sketchId !== sketchId) continue;
      if (!isClosedProfile({ profile })) return `${part.name} is cut from this outline: close it before finishing.`;
      try {
        foldSheet(feature, profile, params);
      } catch (e) {
        // Two bends crossing at a corner say how far the relief must reach (corner gaps §4.2).
        return `This outline no longer takes the bends of ${part.name}: ${crossingText(e)} Fix the outline, or remove that bend first.`;
      }
    }
  return '';
}

/**
 * Where a product stands on the route: { draw, cut, bend, paint, print: {
 * status ('done' | 'partial' | 'todo' | 'none'), text }, next }. Cut to Print
 * follow the job sheet (docs/sheet-metal-shop-guide.md): Cut — every
 * fabricated part a cut blank; Bend — a hit; Paint — every fabricated part a
 * finish; Print — a print (`none`, not needed, without one). Draw is done
 * once the product has a blank outline. No product (an empty workspace, or
 * several products and none chosen): Draw counts the outlines ready to cut,
 * the rest are to do. `next` is the first of Draw, Cut, Bend and Paint not
 * done (Print is optional), or null.
 */
export function routeProgress(model, productId, { params = {} } = {}) {
  const product = productId ? jobProducts(model).find((p) => p.id === productId) : null;
  if (!product) {
    const outlines = readyOutlines(model, params).length;
    const steps = {
      draw: outlines ? mark('done', plural(outlines, 'outline')) : mark('todo'),
      cut: mark('todo'),
      bend: mark('todo'),
      paint: mark('todo'),
      print: mark('todo'),
    };
    return { ...steps, next: nextOf(steps, NEXT_KEYS) };
  }
  const ids = new Set(product.instanceIds);
  // Cut and Paint count fabricated parts only (§5.4), as the job sheet does.
  const made = product.instanceIds.filter((id) =>
    isFabricated(model.parts.find((p) => p.id === model.instances.find((i) => i.id === id)?.partId)),
  );
  const n = made.length;
  const folds = made.map((id) => foldOf(model, id, params)).filter(Boolean);
  const outlines = new Set(product.instanceIds.map((id) => sheetPartOf(model, id)?.feature.sketchId).filter(Boolean));
  // A hit is a stroke of the brake (§6.1), which may bend several tabs; a round bend counts each of its hits.
  const hits = folds.reduce((sum, fold) => sum + strokeHits(fold), 0);
  const finishes = (model.finishes || []).filter((f) => made.includes(f.instanceId));
  const painted = new Set(finishes.map((f) => f.instanceId)).size;
  const prints = (model.prints || []).filter((p) => ids.has(p.instanceId)).length;
  const cut = stepStatus(folds.length, n);
  const paint = stepStatus(painted, n);
  const steps = {
    draw: outlines.size ? mark('done', plural(outlines.size, 'outline')) : mark('todo'),
    cut: mark(
      cut,
      cut === 'done' ? plural(folds.length, 'blank') : cut === 'partial' ? `${folds.length} of ${n}` : '—',
    ),
    bend: mark(stepStatus(hits, 1, true), hits ? plural(hits, 'hit') : folds.length ? 'flat' : '—'),
    paint: mark(
      paint,
      paint === 'done'
        ? [...new Set(finishes.map(finishText))].join(', ')
        : paint === 'partial'
          ? `${painted} of ${n}`
          : '—',
    ),
    // Print is optional: not needed without a print (the job sheet agrees).
    print: prints ? mark('done', plural(prints, 'print')) : mark('none', 'not needed'),
  };
  return { ...steps, next: nextOf(steps, NEXT_KEYS) };
}

/**
 * Where one part stands: the same marks for the part alone, its blank line
 * ("t 1.5 SPCC · 205.7 × 145.7") and `next` — the first station in route
 * order not done that applies to a single part (Draw, Cut and Bend only to
 * sheet metal; Print never), or null.
 */
export function partProgress(model, instanceId, { params = {} } = {}) {
  const fold = foldOf(model, instanceId, params);
  const sheet = sheetPartOf(model, instanceId);
  const finish = (model.finishes || []).find((f) => f.instanceId === instanceId);
  const prints = (model.prints || []).filter((p) => p.instanceId === instanceId).length;
  const bends = fold?.bends.length || 0;
  const steps = {
    draw: sheet ? mark('done', 'outline') : mark('todo'),
    cut: fold ? mark('done', 'cut') : mark('todo'),
    bend: bends ? mark('done', plural(bends, 'bend')) : mark('todo', fold ? 'flat' : '—'),
    paint: finish ? mark('done', finishText(finish)) : mark('todo'),
    print: prints ? mark('done', plural(prints, 'print')) : mark('none'),
  };
  const applies = sheet ? NEXT_KEYS : ['paint'];
  return {
    ...steps,
    name: nodeName(model, instanceId),
    blank: fold
      ? `t ${fmt(fold.thickness)} ${stockOf(fold.stock).key.toUpperCase()} · ${fmt(fold.flat.width)} × ${fmt(fold.flat.height)}`
      : sheet
        ? 'The blank does not fold: open the part'
        : '',
    // What a station's pick list says of the part.
    state: !fold ? 'not a cut blank' : bends ? plural(bends, 'bend') : 'flat · no bends yet',
    next: applies.find((key) => steps[key].status !== 'done') || null,
  };
}

/**
 * The press brake's queue (docs/sketch-studio-outline-edit-sheet-nest.md
 * §7.1): one row per sheet-metal part that has an instance, in job-board
 * order (the products, then each product's instances). One piece of metal is
 * one part (docs/sketch-studio-own-bends.md §3, §4.5), so a row is a blank,
 * bent by itself: five blanks of one outline are five rows. A model that
 * still has several instances of one part (tests build them) gets one row at
 * its first instance, "× copies": [{ partId, instanceId (that first
 * instance), name, copies (the part's instances in the model), state, text,
 * bends, profile }]. `state`: 'flat' (it folds, no bend yet), 'bent',
 * 'finished' (shopOrderBlock holds it: painted or printed) or 'problem' (the
 * blank does not fold). One foldSheet per part.
 */
export function bendQueue(model, { params = {} } = {}) {
  const rows = new Map();
  for (const product of jobProducts(model))
    for (const instanceId of product.instanceIds) {
      const sheet = sheetPartOf(model, instanceId);
      if (!sheet || rows.has(sheet.part.id)) continue;
      rows.set(sheet.part.id, { sheet, instanceId });
    }
  return [...rows.values()].map(({ sheet, instanceId }) => {
    const partId = sheet.part.id;
    let fold = null;
    try {
      fold = foldSheet(sheet.feature, sheet.sketch?.profile, params);
    } catch {
      fold = null;
    }
    const bends = fold?.bends.length || 0;
    const held = fold ? shopOrderBlock(model, partId) : null;
    // What came after the brake (the shop order's own rule: this blank's).
    const after = held
      ? [held.finishes.length && 'painted', held.prints.length && 'printed'].filter(Boolean).join(' and ')
      : '';
    const state = !fold ? 'problem' : held ? 'finished' : bends ? 'bent' : 'flat';
    return {
      partId,
      instanceId,
      name: nodeName(model, instanceId),
      copies: model.instances.filter((i) => i.partId === partId).length,
      state,
      text:
        state === 'problem'
          ? 'the blank does not fold'
          : state === 'flat'
            ? 'flat · no bends yet'
            : `${bends ? plural(bends, 'bend') : 'flat'}${after ? ` · ${after}` : ''}`,
      bends,
      profile: sheet.sketch?.profile || null,
    };
  });
}

/**
 * Cut's picker, Already cut (docs/sketch-studio-cut-pick.md §4.2): one row
 * per LOT (docs/sketch-studio-own-bends.md §4.4: the blanks of one outline in
 * one stock and thickness, lotOf), in the model order of their parts:
 * [{ partId, instanceId (the lot's first blank), name (its base name: "Tray",
 * not "Tray #2"), copies (the lot), sheet ("t 1.5 SPCC"), profile }].
 */
export function cutParts(model, params = {}) {
  const seen = new Set();
  return model.parts.flatMap((part) => {
    const feature = sheetMetalFeature(part);
    const first = feature ? model.instances.find((i) => i.partId === part.id) : null;
    if (!first || seen.has(first.id)) return [];
    const blanks = lotOf(model, first.id, params);
    for (const blank of blanks) seen.add(blank.id);
    const lead = blanks[0];
    const own = sheetPartOf(model, lead.id).feature;
    let thickness = null;
    try {
      thickness = numeric(own.thickness, params, 'Sheet thickness');
    } catch {
      thickness = null;
    }
    return [
      {
        partId: lead.partId,
        instanceId: lead.id,
        name: blankBaseName(nodeName(model, lead.id)),
        copies: blanks.length,
        sheet: `t ${fmt(thickness)} ${stockOf(own.stock).key.toUpperCase()}`,
        profile: model.sketches.find((s) => s.id === own.sketchId)?.profile || null,
      },
    ];
  });
}

const VERBS = { paint: 'paint', print: 'print on' };
/**
 * What a station opens on (§4.3) for `subject` ({ productId, instanceId } or
 * null): { open: { instanceId } } (Cut / Bend on a part; Paint, Print with
 * the subject's part when it has one), { open: { outline } } (Cut: the
 * picker, `{ kind: 'pick', selected: [] }`, or the one outline ready to cut
 * with no part yet, docs/sketch-studio-cut-pick.md §4.1), { open: {} }
 * (Draw), { pick: [instanceId…] } (Cut / Bend with several sheet-metal parts
 * and none chosen), or { blocked: { message, go } } (nothing to work on: `go`
 * is the earliest station that makes it, in one hop — Cut whenever an
 * outline is ready to cut, else Draw). `fromSelection`: the subject's part is
 * only the selection (the route bar), not a part the route was sent to (a
 * job board row, a gate, Back / Next, Open on the laser): at Cut the picker
 * then comes first while outlines wait, the part is under its Already cut.
 */
export function stationEntry(model, { station, subject = null, params = {}, fromSelection = false }) {
  if (station === 'draw') return { open: {} };
  const product = subject?.productId ? jobProducts(model).find((p) => p.id === subject.productId) : null;
  const scope = product ? product.instanceIds : model.instances.map((i) => i.id);
  const chosen =
    subject?.instanceId && model.instances.some((i) => i.id === subject.instanceId) ? subject.instanceId : null;
  // With no part, the earliest station that makes one, in one hop: Cut opens
  // on the outlines ready to cut (one, or the picker, cut-pick §4.1); with
  // none it would only send the user on to Draw, so the card points at Draw.
  const outlines = readyOutlines(model, params);
  const maker = outlines.length ? 'cut' : 'draw';
  if (station === 'cut' || station === 'bend') {
    const sheetChosen = chosen && sheetPartOf(model, chosen);
    // Cut, cut-pick §4.1: a part the route was sent to; else the picker when
    // an outline waits beside another or beside a cut part; else as before.
    if (sheetChosen && !(station === 'cut' && fromSelection)) return { open: { instanceId: chosen } };
    if (
      station === 'cut' &&
      outlines.length &&
      (outlines.length > 1 || model.instances.some((i) => sheetPartOf(model, i.id)))
    )
      return { open: { outline: { kind: 'pick', selected: [] } } };
    if (sheetChosen) return { open: { instanceId: chosen } };
    const candidates = scope.filter((id) => sheetPartOf(model, id));
    if (candidates.length === 1) return { open: { instanceId: candidates[0] } };
    if (candidates.length > 1) return { pick: candidates };
    if (station === 'bend')
      return {
        blocked:
          maker === 'cut'
            ? { message: 'Nothing to bend yet: cut a blank first.', go: 'cut' }
            : { message: 'Nothing to bend yet: draw the outline first.', go: 'draw' },
      };
    if (outlines.length === 1) return { open: { outline: { kind: 'sketch', sketchId: outlines[0].id } } };
    return { blocked: { message: 'Nothing to cut yet: draw the outline first.', go: 'draw' } };
  }
  if (!model.instances.length) {
    const verb = VERBS[station] || station;
    return {
      blocked:
        maker === 'cut'
          ? { message: `Nothing to ${verb} yet: cut a blank first.`, go: 'cut' }
          : { message: `Nothing to ${verb} yet: draw a part first.`, go: 'draw' },
    };
  }
  return { open: { instanceId: chosen } };
}
