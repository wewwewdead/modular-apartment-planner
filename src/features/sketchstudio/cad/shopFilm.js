// Replay the build (docs/sketch-studio-shop-floor.md §8, SF-5): a product's
// whole route as a film of scenes, in the shop's order — every blank cut on
// the laser, every hit of the press brake, the powder coat, the prints, then
// the finished product — and what exists at any point of it. Pure and
// worker-safe (no three, no DOM): the model in, plain data out. The film
// stores nothing in the model; the workspace shows a scene through the
// stations' own display code (the laser bed's cut, the shop layer's press
// brake stroke, its records and the parts it hides).
//
// Shop order, as the stations enforce it: all blanks are cut, then bent, then
// painted, then printed (after the paint). The blanks of one lot (one outline,
// stock and thickness: docs/sketch-studio-own-bends.md §4.7) go through the
// laser together, one scene; on the brake, blanks of a lot go together only
// while their bends are the very same records (made together, never bent
// apart: the kiosk's two face frames), one scene per hit, said so in the
// scene — a blank bent by hand plays its own hits. What is not made here
// (bought-in items, fasteners) comes on in the finished scene.
import { bendLabel, bendNumber, hitSequence, sheetMetalFeature } from './sheetMetal.js';
import { foldOf } from './shopRoute.js';
import { CURE_S, PRINT_HANDLING_S, cutSeconds, jobProducts, strokeSeconds } from './jobSheet.js';
import { isFabricated } from './shopParts.js';
import { memberIds, nodeName } from './groups.js';
import { blankBaseName } from './model.js';
import { DEFAULT_MACHINE, MACHINES, POWDER, machineOf, stockOf } from './shopCatalog.js';

// How long a scene plays at normal speed, from the job sheet's estimate of the
// work it shows (seconds): the station's minimum (long enough to read the
// title and see the machine move) plus a log of the estimate, up to its
// maximum. A hit of the brake is quick on the machine (≈ 1.2 s, played at its
// own speed) and there are many; the oven cure is ten minutes and one scene.
// The kiosk plays in ≈ 1 min 7 s, the control box in ≈ 31 s.
export const FILM_PACE = Object.freeze({
  cut: { min: 2.6, max: 5, k: 0.35 },
  bend: { min: 1.9, max: 3.2, k: 0.2 },
  paint: { min: 3, max: 5, k: 0.3 },
  print: { min: 2.4, max: 4, k: 0.3 },
  finished: { min: 2.5, max: 2.5, k: 0 },
});
export const FILM_SPEEDS = Object.freeze([0.5, 1, 2, 4]);
const round1 = (v) => Math.round(v * 10) / 10;
/** A scene's length at normal speed, seconds (FILM_PACE), from its estimate (seconds, or null: unknown). */
export function filmSeconds(station, estimate) {
  const pace = FILM_PACE[station] || FILM_PACE.finished;
  const est = Number.isFinite(estimate) && estimate > 0 ? estimate : 0;
  return round1(Math.min(pace.max, pace.min + pace.k * Math.log(1 + est / 10)));
}
/** The still at a scene's end (seconds): its result held long enough to read before the next one. */
export const filmHold = (seconds) => Math.min(0.8, seconds * 0.3);
/** When a scene's own records appear, as fractions of the scene: the colour, a print. */
export function filmBeats(scene) {
  const n = scene?.recordIds?.length || 0;
  return n ? Array(n).fill(0.3) : [];
}

const fmt = (value, digits = 1) => (Number.isFinite(value) ? Number(value.toFixed(digits)).toString() : '—');
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const words = (n) => NUMBER_WORDS[n] || String(n);
// A name that is a label, not words — "Sketch 1 · 2", a part named after its
// outline (docs/sketch-studio-outline-edit-sheet-nest.md §7.7): figures or
// marks in it. The shared-noun wording cannot split one, so it is used whole.
const isLabel = (text) => /[^\p{L}\s'’-]/u.test(String(text || ''));
// "Front face frame" → "front face frame"; "KIOSK" and a label stay.
const lowerFirst = (text) =>
  /^[A-Z][a-z]/.test(text) && !isLabel(text) ? text[0].toLowerCase() + text.slice(1) : text;
const listed = (items) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : items[0] || '');
/**
 * Several parts named as a shop would: names sharing their last words read
 * "front and rear face frames"; others are listed. `plural` false keeps the
 * shared noun singular ("front and rear face frame · hit 1 of 4").
 */
export function partNames(names, { many = true } = {}) {
  if (names.length < 2) return lowerFirst(names[0] || 'part');
  // Copies under one name (Quantity's, a batch part's) are that one name.
  if (names.every((n) => n === names[0])) return lowerFirst(names[0] || 'part');
  const shared = sharedNoun(names);
  if (!shared) return listed(names.map(lowerFirst));
  return `${listed(shared.heads)} ${shared.noun}${many && !/s$/.test(shared.noun) ? 's' : ''}`;
}
// The last words several names share ("face frame" of "Front face frame",
// "Rear face frame") and what is left of each ("front", "rear"), or null —
// also when the names are labels (§7.7: "Sketch 1 · 2" has no noun to share)
// or what is left does not tell them apart.
function sharedNoun(names) {
  if (names.some(isLabel)) return null;
  const split = names.map((n) => String(n || 'part').split(/\s+/));
  let shared = 0;
  while (
    shared < Math.min(...split.map((w) => w.length)) - 1 &&
    split.every((w) => w.at(-1 - shared).toLowerCase() === split[0].at(-1 - shared).toLowerCase())
  )
    shared += 1;
  if (!shared) return null;
  const heads = split.map((w) => w.slice(0, -shared).join(' ').toLowerCase());
  if (new Set(heads).size < heads.length) return null;
  return { noun: split[0].slice(-shared).join(' ').toLowerCase(), heads };
}
// "Kiosk face frame — sheet metal" → "face frame" (when the instances have no names of their own);
// a blank's number goes ("Tray #2" → "tray", own bends §4.7).
const partWord = (part) =>
  lowerFirst(
    blankBaseName(String(part?.name || 'part'))
      .replace(/\s+—\s+sheet metal$/i, '')
      .trim(),
  );

// A hit named by what it bends: a crease (a shallow bend across the face), a
// flange (a narrow strip along an edge: the long side or an end of the
// blank), or a bend across the blank.
function strokeWhat(fold, stroke) {
  const bend = fold.bends.find((b) => b.id === stroke.bendIds[0]);
  const angle = stroke.to ? stroke.to[bend.id] : bend.angle;
  const area = fold.pieces.reduce((sum, p) => sum + p.area, 0) || 1;
  const moving = new Set(stroke.bendIds.flatMap((id) => fold.bends.find((b) => b.id === id)?.movingPieces || []));
  const share = fold.pieces.filter((p) => moving.has(p.id)).reduce((sum, p) => sum + p.area, 0) / area;
  const narrow = Math.min(share, 1 - share);
  if (Number(angle) < 45 && narrow > 0.2) return { kind: 'crease' };
  if (narrow > 0.35) return { kind: 'across' };
  // Along the blank's long side when the bend line runs with it.
  const { width, height } = fold.flat;
  const alongX = Math.abs(bend.u[0]) >= Math.abs(bend.u[1]);
  const long = Math.abs(width - height) < 1e-6 ? 'side' : (alongX ? width > height : height > width) ? 'long' : 'end';
  return { kind: 'flange', edge: long };
}
// A bend-on step (docs/sketch-studio-tight-bends.md §4.3) is titled "Bend {n} on to {a}°"; the
// steps that make a bend are named by what they bend, at the angle they make.
function strokeTitles(fold) {
  const strokes = hitSequence(fold);
  const kinds = strokes.map((stroke) => (stroke.again ? { kind: 'again' } : strokeWhat(fold, stroke)));
  const count = (k) => kinds.filter((x) => x.kind === 'flange' && x.edge === k).length;
  const seen = {};
  return strokes.map((stroke, index) => {
    const bend = fold.bends.find((b) => b.id === stroke.bendIds[0]);
    const what = kinds[index];
    if (what.kind === 'again') return `Bend ${bendNumber(fold, bend.id)} on to ${fmt(stroke.to[bend.id])}°`;
    const turn = `${bend.direction} ${fmt(Number(stroke.to[bend.id]))}°`;
    const tabs = stroke.bendIds.length > 1 ? `, ${words(stroke.bendIds.length)} tabs in one stroke` : '';
    if (what.kind === 'crease') return `Crease the face ${turn}${tabs}`;
    if (what.kind === 'across') return `Bend the blank ${turn} across its middle${tabs}`;
    const noun = what.edge === 'long' ? 'long-side flange' : what.edge === 'end' ? 'end flange' : 'flange';
    const n = count(what.edge);
    seen[what.edge] = (seen[what.edge] || 0) + 1;
    const k = seen[what.edge];
    const which = n === 1 ? `the ${noun}` : n === 2 ? (k === 1 ? `one ${noun}` : `the other ${noun}`) : `${noun} ${k}`;
    return `Bend ${which} ${turn}${tabs}`;
  });
}

const PRINT_VERBS = Object.freeze({ silk: 'Silk-screen', uv: 'UV-print', pad: 'Pad-print' });

/**
 * The film of a product (a jobProducts id): ordered scenes { key, station
 * ('cut' | 'bend' | 'paint' | 'print' | 'finished'), instanceId (the part
 * shown: the first copy), instanceIds (the copies, or the parts the scene
 * works on), recordId / recordIds (the finishes, prints it adds), title,
 * subject (what it is done to), detail, estimate (the job sheet's seconds for
 * the work shown, null when unknown), seconds (at normal speed) } and, per
 * station: cut — partId; bend — partId, bendIds (the stroke's), angles (bend
 * id → its angle), hit, hits. The last scene is the finished product (its
 * instanceIds: every member). [] when there is nothing to show (no product,
 * or nothing done).
 *
 * `instanceId` keeps only that part's hits, as itself (the press brake's
 * Watch the bends).
 */
export function filmScenes(model, productId, { params = {}, instanceId = null } = {}) {
  const product = productId ? jobProducts(model).find((p) => p.id === productId) : null;
  if (!product) return [];
  const members = product.instanceIds;
  const ids = new Set(members);
  const partOf = (id) => model.parts.find((p) => p.id === model.instances.find((i) => i.id === id)?.partId) || null;
  const name = (id) => nodeName(model, id);
  const key = model.fabrication?.shop?.machine;
  const machine = machineOf(MACHINES[key] ? key : DEFAULT_MACHINE);
  // The sheet-metal blanks in the product's order, by lot (own bends §4.7: one
  // outline, stock and thickness; several instances of one part are one lot),
  // and inside a lot by their bends (the same records, ids included, go
  // together on the brake).
  const lots = [];
  for (const id of instanceId ? [instanceId] : members) {
    const part = partOf(id);
    const feature = sheetMetalFeature(part);
    if (!isFabricated(part) || !feature) continue;
    const fold = foldOf(model, id, params);
    if (!fold) continue;
    const lotKey = JSON.stringify([feature.sketchId, fold.stock, fold.thickness]);
    const bendsKey = JSON.stringify(feature.bends || []);
    let lot = !instanceId && lots.find((l) => l.key === lotKey);
    if (!lot) lots.push((lot = { key: lotKey, partId: part.id, part, fold, ids: [], benders: [] }));
    lot.ids.push(id);
    const bender = lot.benders.find((b) => b.key === bendsKey);
    if (bender) bender.ids.push(id);
    else lot.benders.push({ key: bendsKey, partId: part.id, part, fold, ids: [id] });
  }
  const blanks = lots.flatMap((lot) => lot.benders);
  // The cut scenes read each blank's name without its number ("Tray #2" → "Tray"); a group of
  // blanks on the brake too, a blank alone there its own name.
  const cutName = (id) => blankBaseName(name(id));
  const groupWords = (blank, many = true, read = cutName) =>
    blank.ids.length > 1
      ? partNames(blank.ids.map(read), { many })
      : lowerFirst(read(blank.ids[0]) || partWord(blank.part));
  const scene = (station, fields, estimate) => ({
    station,
    ...fields,
    estimate: Number.isFinite(estimate) ? estimate : null,
    seconds: filmSeconds(station, estimate),
  });
  const scenes = [];
  // The laser: one lot per scene, every blank of it nested on the sheet.
  if (!instanceId)
    for (const blank of lots) {
      const { fold } = blank;
      const n = blank.ids.length;
      const names = blank.ids.map(cutName);
      const shared = n > 1 ? sharedNoun(names) : null;
      // The copies' one name (else the part's) when it is a label, not words.
      const whole = names.every((x) => x === names[0]) ? names[0] : blankBaseName(blank.part?.name) || 'the part';
      const label = n > 1 && !shared && (isLabel(whole) || isLabel(partWord(blank.part))) ? whole : '';
      scenes.push(
        scene(
          'cut',
          {
            key: `cut:${blank.partId}`,
            instanceId: blank.ids[0],
            instanceIds: [...blank.ids],
            partId: blank.partId,
            // A name the wording cannot split is used whole (§7.7): "Cut 2 blanks of Sketch 1 · 2".
            title:
              n === 1
                ? `Cut the ${groupWords(blank)} blank`
                : shared
                  ? `Cut ${words(n)} ${shared.noun} blanks: ${listed(shared.heads)}`
                  : label
                    ? `Cut ${n} blanks of ${label}`
                    : `Cut ${words(n)} ${partWord(blank.part)} blanks`,
            subject: n > 1 ? `${groupWords(blank)} · ${n} off` : groupWords(blank),
            detail: `${fmt(fold.flat.width)} × ${fmt(fold.flat.height)} mm · t ${fmt(fold.thickness, 2)} ${stockOf(fold.stock).name} · ${plural(fold.flat.pierces, 'pierce')}`,
          },
          cutSeconds(fold) * n,
        ),
      );
    }
  // The press brake: every hit of every blank, in its stored order.
  for (const blank of blanks) {
    const { fold } = blank;
    // Every step in the order made (tight bends §4.3): a bend-on step is a scene of its own.
    const strokes = hitSequence(fold);
    const titles = strokeTitles(fold);
    strokes.forEach((stroke, index) => {
      const bend = fold.bends.find((b) => b.id === stroke.bendIds[0]);
      let estimate = null;
      try {
        estimate = strokeSeconds(fold, stroke, machine).seconds * blank.ids.length;
      } catch {
        estimate = null;
      }
      const made = scene(
        'bend',
        {
          key: `bend:${blank.ids[0]}:${stroke.key}`,
          instanceId: blank.ids[0],
          instanceIds: [...blank.ids],
          partId: blank.partId,
          bendIds: [...stroke.bendIds],
          angles: Object.fromEntries(stroke.bendIds.map((id) => [id, Number(stroke.to[id]) || 0])),
          // A bend-on scene: its step's key (the press brake re-runs that step) and where it starts from.
          ...(stroke.again ? { again: true, stepKey: stroke.key, from: { ...stroke.from } } : {}),
          hit: index + 1,
          hits: strokes.length,
          title: titles[index],
          subject: `${groupWords(blank, false, blank.ids.length > 1 ? cutName : name)} · hit ${index + 1} of ${strokes.length}`,
          detail: `${stroke.again ? `bend ${bendNumber(fold, bend.id)} on: ${fmt(stroke.from[bend.id])}° → ${fmt(stroke.to[bend.id])}°` : Math.abs(stroke.to[bend.id] - bend.angle) > 1e-9 ? bendLabel({ ...bend, angle: stroke.to[bend.id] }) : bend.label}${stroke.bendIds.length > 1 ? ` · ${stroke.bendIds.length} flanges` : ''} · ${stroke.die}`,
        },
        estimate,
      );
      // A round bend's hits play inside its one scene, twice a bend scene's length at most (round-bend spec §7).
      if (bend.steps && !stroke.again) made.seconds = round1(Math.min(2 * FILM_PACE.bend.max, 2 * made.seconds));
      scenes.push(made);
    });
  }
  if (instanceId) return scenes;
  const order = (id) => members.indexOf(id);
  const groupOf = (id) => model.instances.find((i) => i.id === id)?.groupId ?? null;
  // The paint booth: one scene per powder (or paint), its parts together;
  // powder goes into the oven (one load, the job sheet's cure).
  const coats = [];
  for (const finish of model.finishes || []) {
    if (!ids.has(finish.instanceId)) continue;
    const coatKey = [finish.kind, finish.name, finish.colour, finish.gloss].join('|');
    let coat = coats.find((c) => c.key === coatKey);
    if (!coat) coats.push((coat = { key: coatKey, finish, finishes: [] }));
    coat.finishes.push(finish);
  }
  for (const coat of coats) {
    const parts = coat.finishes.map((f) => f.instanceId).sort((x, y) => order(x) - order(y));
    const powder = coat.finish.kind === 'powder';
    const colour = coat.finish.name || coat.finish.colour || 'its colour';
    // A whole group painted as one (every part made here in the first part's own group): named as the group.
    const groupId = parts.length > 1 ? groupOf(parts[0]) : null;
    const made = groupId ? memberIds(model, [groupId]).filter((id) => isFabricated(partOf(id))) : [];
    const group =
      made.length === parts.length && made.every((id) => parts.includes(id)) ? nodeName(model, groupId) : null;
    const what = group
      ? `the ${lowerFirst(group)} (${plural(parts.length, 'part')})`
      : parts.length <= 2
        ? `the ${partNames(parts.map(name))}`
        : plural(parts.length, 'part');
    scenes.push(
      scene(
        'paint',
        {
          key: `paint:${coat.key}`,
          instanceId: parts[0],
          instanceIds: parts,
          recordId: coat.finishes[0].id,
          recordIds: coat.finishes.map((f) => f.id),
          title: `${powder ? 'Powder-coat' : 'Paint'} ${what} ${colour}`,
          subject: listed(parts.map(name)),
          detail: powder
            ? `${coat.finish.gloss || 'satin'} · then the oven: ${POWDER.cureMinutes} min at ${POWDER.cureTemperature} °C`
            : coat.finish.gloss || '',
        },
        powder ? CURE_S : null,
      ),
    );
  }
  // The print station: each print after the paint it sits on.
  for (const print of (model.prints || []).filter((p) => ids.has(p.instanceId))) {
    const verb = PRINT_VERBS[print.method] || 'Print';
    const art = print.kind === 'text' ? `“${print.text}”` : 'the artwork';
    scenes.push(
      scene(
        'print',
        {
          key: `print:${print.id}`,
          instanceId: print.instanceId,
          instanceIds: [print.instanceId],
          recordId: print.id,
          recordIds: [print.id],
          title: `${verb} ${art} on the ${lowerFirst(name(print.instanceId))}`,
          subject: name(print.instanceId),
          detail: `${fmt(Number(print.width))} × ${fmt(Number(print.height))} mm`,
        },
        PRINT_HANDLING_S,
      ),
    );
  }
  if (!scenes.length) return [];
  // Bought-in items and fasteners are not made here: they come on in the finished scene.
  const notMade = members.filter((id) => !isFabricated(partOf(id)));
  const made = members.length - notMade.length;
  scenes.push(
    scene('finished', {
      key: 'finished',
      instanceId: null,
      instanceIds: [...members],
      notMade,
      title: `Finished: ${product.name}`,
      subject: `${plural(made, 'part')} made in the shop${notMade.length ? ` · ${plural(notMade.length, 'item')} bought in or fastened` : ''}`,
      detail: '',
    }),
  );
  return scenes;
}

/**
 * Whether a product has a film, cheaply (the route bar asks on every render
 * of the Shop tab): '' when it has a laser blank or a shop record to show,
 * else why not — the Replay button's title while it is off.
 */
export function filmReady(model, productId) {
  const product = productId ? jobProducts(model).find((p) => p.id === productId) : null;
  if (!product) return 'Choose a product first: click one of its parts, then Replay.';
  const ids = new Set(product.instanceIds);
  const partOf = (id) => model.parts.find((p) => p.id === model.instances.find((i) => i.id === id)?.partId) || null;
  const blank = product.instanceIds.some((id) => isFabricated(partOf(id)) && sheetMetalFeature(partOf(id)));
  const records =
    (model.finishes || []).some((f) => ids.has(f.instanceId)) ||
    (model.prints || []).some((p) => ids.has(p.instanceId));
  return blank || records
    ? ''
    : 'Nothing to replay yet: this product has no laser blank and nothing done to it in the shop.';
}

/** The film's length at normal speed, seconds. */
export const filmLength = (scenes) => round1(scenes.reduce((sum, s) => sum + s.seconds, 0));
/** Where scene `index` starts in the film, seconds at normal speed. */
export const filmStart = (scenes, index) => scenes.slice(0, index).reduce((sum, s) => sum + s.seconds, 0);

/**
 * What exists while scene `index` plays, `progress` (0 … 1) of the way
 * through it (index = scenes.length: the film is over, everything in):
 * { index, scene, cut (instance ids cut), angles (instance id → bend id →
 * angle: hits made at their angle, the rest flat), bending (the hit in the
 * die: { instanceId, instanceIds, bendIds, angles } or null), finishes,
 * prints (record ids in the model), shown / hidden (instance ids in the model
 * view: what has been made so far — a paint or print scene shows only the
 * parts in the booth, and bought-in items and fasteners come on in the
 * finished scene), targets (the parts the scene works on, outlined) }. A
 * scene's own result counts from progress 1; its records appear at their
 * beats (filmBeats).
 */
export function filmState(scenes, index, progress = 0) {
  const at = Math.max(0, Math.min(Number(index) || 0, scenes.length));
  const current = scenes[at] || null;
  const p = current ? Math.max(0, Math.min(1, Number(progress) || 0)) : 1;
  const finished = scenes.find((s) => s.station === 'finished');
  const members = finished ? finished.instanceIds : [...new Set(scenes.flatMap((s) => s.instanceIds || []))];
  const notMade = new Set(finished?.notMade || []);
  // What a scene adds, done once the film is past it (or at its end).
  const past = (i) => i < at || (i === at && p >= 1);
  const cut = new Set(),
    angles = {},
    finishes = [],
    prints = [];
  scenes.forEach((s, i) => {
    if (s.station === 'cut' && past(i)) s.instanceIds.forEach((id) => cut.add(id));
    if (s.station === 'bend')
      for (const id of s.instanceIds) {
        angles[id] ||= {};
        for (const [bendId, angle] of Object.entries(s.angles))
          // A bend-on scene (tight bends §4.3) not yet played leaves its bend as the scenes before left it.
          if (past(i)) angles[id][bendId] = angle;
          else if (!s.again) angles[id][bendId] = 0;
      }
    const beats = filmBeats(s);
    const list = { paint: finishes, print: prints }[s.station];
    if (list) s.recordIds.forEach((id, k) => (i < at || (i === at && p >= beats[k])) && list.push(id));
  });
  const sheet = new Set(scenes.filter((s) => s.station === 'cut').flatMap((s) => s.instanceIds));
  // A part made here is in the model view once it is made (a laser part once cut).
  const made = (id) => !notMade.has(id) && (!sheet.has(id) || cut.has(id));
  const station = current?.station || 'finished';
  const shown =
    station === 'paint' || station === 'print'
      ? members.filter((id) => current.instanceIds.includes(id))
      : station === 'finished'
        ? [...members]
        : members.filter(made);
  const inView = new Set(shown);
  return {
    index: at,
    scene: current,
    progress: p,
    cut: [...cut],
    angles,
    bending:
      current?.station === 'bend'
        ? {
            instanceId: current.instanceId,
            instanceIds: current.instanceIds,
            bendIds: current.bendIds,
            angles: current.angles,
          }
        : null,
    finishes,
    prints,
    shown,
    hidden: members.filter((id) => !inView.has(id)),
    targets: ['paint', 'print'].includes(current?.station) ? [...current.instanceIds] : [],
  };
}

/** The model as the film shows it: only the finishes and prints that exist (kernel-inert: no rebuild). */
export function filmModel(model, state) {
  const keep = (list, ids) => {
    const set = new Set(ids);
    const kept = (list || []).filter((r) => set.has(r.id));
    return kept.length === (list || []).length ? list : kept;
  };
  const finishes = keep(model.finishes, state.finishes),
    prints = keep(model.prints, state.prints);
  if (finishes === model.finishes && prints === model.prints) return model;
  return { ...model, finishes, prints };
}

/**
 * The film's clock: scene-local milliseconds at the chosen speed, frozen
 * while paused. `now` is injectable for tests (performance.now otherwise).
 */
export function createFilmClock(now = () => performance.now()) {
  let base = 0,
    since = now(),
    rate = 1,
    paused = false;
  const elapsed = () => (paused ? base : base + (now() - since) * rate);
  return {
    elapsed,
    get rate() {
      return rate;
    },
    get paused() {
      return paused;
    },
    reset(ms = 0) {
      base = ms;
      since = now();
    },
    pause() {
      base = elapsed();
      paused = true;
    },
    play() {
      since = now();
      paused = false;
    },
    setRate(next) {
      base = elapsed();
      since = now();
      rate = next;
    },
  };
}
