// Replay the build (docs/sketch-studio-shop-floor.md §8, SF-5): the film's
// scenes in the shop's order, their titles and lengths, and what exists at
// any point of it (filmState) — for the kiosk and the control box, and for
// the products that have little to show: no paint or prints, one flat blank,
// one part, an empty model. Since the shop trim (docs/sketch-studio-shop-
// trim.md §4.6) the scenes are cut, bend, paint, print and the finished
// product, where the bought-in items and fasteners come on. Pure: no DOM, no
// three (the module runs in a worker).
import { describe, expect, it } from 'vitest';
import { emptyModel, normalizeModel, sameKernelInput } from './model.js';
import { sheetMetalControlBox, sheetMetalKiosk, sheetMetalPumpBracket } from './shopExamples.js';
import { sheetMetalPart } from './ShopPanels.jsx';
import { jobProducts } from './jobSheet.js';
import { bendStrokes } from './sheetMetal.js';
import { foldOf } from './shopRoute.js';
import {
  FILM_PACE,
  createFilmClock,
  filmBeats,
  filmLength,
  filmModel,
  filmReady,
  filmScenes,
  filmSeconds,
  filmStart,
  filmState,
  partNames,
} from './shopFilm.js';

const kiosk = normalizeModel(sheetMetalKiosk());
const box = normalizeModel(sheetMetalControlBox());
const productOf = (model) => jobProducts(model)[0].id;
const kioskScenes = filmScenes(kiosk, productOf(kiosk));
const boxScenes = filmScenes(box, productOf(box));
const ORDER = ['cut', 'bend', 'paint', 'print', 'finished'];
const firstOf = (scenes, station) => scenes.findIndex((s) => s.station === station);
const lastOf = (scenes, station) => scenes.findLastIndex((s) => s.station === station);

// One flat blank, a plain rectangle: cut, and nothing more.
function flatBlank() {
  const part = sheetMetalPart({ sketchId: 'blank', stock: 'spcc', thickness: 1.5, name: 'Plate' });
  part.id = 'plate';
  return normalizeModel({
    ...emptyModel(),
    sketches: [
      {
        id: 'blank',
        name: 'Blank',
        plane: 'XY',
        profile: { type: 'rectangle', width: 120, height: 80, origin: [0, 0] },
        primitives: [],
        constrained: false,
      },
    ],
    parts: [part],
    instances: [
      { id: 'plate-1', partId: 'plate', name: 'Plate', position: [0, 0, 0], rotation: [0, 0, 0], visible: true },
    ],
  });
}

describe('filmScenes: the kiosk, in the shop order', () => {
  // RB-3 (round-bend spec §13.4): + the corner pieces' blank and their round bend (one scene, its ten hits inside).
  it('is 25 scenes: five blanks, fifteen hits, two coats, two prints, the finish', () => {
    expect(kioskScenes.map((s) => s.station)).toEqual([
      ...Array(5).fill('cut'),
      ...Array(15).fill('bend'),
      ...Array(2).fill('paint'),
      ...Array(2).fill('print'),
      'finished',
    ]);
    expect(kioskScenes.map((s) => s.title)).toEqual([
      'Cut two face frame blanks: front and rear',
      'Cut the shelf tray blank',
      'Cut two base channel blanks: left and right',
      'Cut two cover blanks: front and rear',
      'Cut four corner piece blanks: front left, front right, rear left and rear right',
      'Bend one long-side flange up 90°, two tabs in one stroke',
      'Bend the other long-side flange up 90°, two tabs in one stroke',
      'Bend the end flange up 90°',
      'Crease the face down 15°',
      'Bend one long-side flange down 75°',
      'Bend the other long-side flange down 75°',
      'Bend one end flange down 90°',
      'Bend the other end flange down 90°',
      'Bend one long-side flange down 90°',
      'Bend the other long-side flange down 90°',
      'Bend one long-side flange up 90°',
      'Bend the other long-side flange up 90°',
      'Bend one end flange up 90°',
      'Bend the other end flange up 90°',
      'Bend the blank up 90° across its middle',
      // The frame group painted in one pick is named as the group.
      'Powder-coat the kiosk frame (9 parts) RAL 9005 Jet black',
      'Powder-coat the front and rear covers RAL 9003 Signal white',
      'Silk-screen “KIOSK” on the front cover',
      'Silk-screen “KIOSK” on the rear cover',
      'Finished: Kiosk',
    ]);
    expect(kioskScenes.at(-1).subject).toBe('11 parts made in the shop · 26 items bought in or fastened');
    // Copies of one part go through together, said so.
    expect(kioskScenes[5].subject).toBe('front and rear face frame · hit 1 of 4');
    expect(kioskScenes[0].instanceIds).toHaveLength(2);
    // The corner pieces' round bend is one scene (its hits inside it), the four copies together.
    expect(kioskScenes[19].subject).toBe('front left, front right, rear left and rear right corner piece · hit 1 of 1');
    expect(kioskScenes[19].instanceIds).toHaveLength(4);
  });

  it('keeps the shop order: every blank cut and bent before the paint, prints after the paint, the finish last', () => {
    for (const scenes of [kioskScenes, boxScenes]) {
      const stations = scenes.map((s) => ORDER.indexOf(s.station));
      expect(stations.every((k) => k >= 0)).toBe(true);
      expect(stations).toEqual([...stations].sort((a, b) => a - b));
      expect(lastOf(scenes, 'bend')).toBeLessThan(firstOf(scenes, 'paint'));
    }
    // Each blank's hits in their stored order, one scene per stroke.
    const face = kiosk.instances.find((i) => i.name === 'Front face frame');
    const strokes = bendStrokes(foldOf(kiosk, face.id).bends);
    expect(kioskScenes.filter((s) => s.station === 'bend' && s.instanceId === face.id).map((s) => s.bendIds)).toEqual(
      strokes.map((s) => s.bendIds),
    );
    // Every record shows once.
    const shown = (station) => kioskScenes.filter((s) => s.station === station).flatMap((s) => s.recordIds);
    expect(shown('paint').sort()).toEqual(kiosk.finishes.map((f) => f.id).sort());
    expect(shown('print').sort()).toEqual(kiosk.prints.map((p) => p.id).sort());
  });

  it('compresses the job sheet times into a film of about a minute, every scene long enough to read', () => {
    // 66.9 s since the shop trim (97.7 s with the seven weld and four assembly scenes).
    expect(filmLength(kioskScenes)).toBeGreaterThan(55);
    expect(filmLength(kioskScenes)).toBeLessThan(75);
    for (const s of kioskScenes) {
      expect(s.seconds).toBeGreaterThanOrEqual(FILM_PACE[s.station].min);
      // A round bend's scene (the corner pieces': ten hits) runs up to twice a bend scene (round-bend spec §7).
      const round = s.station === 'bend' && s.subject.includes('corner piece');
      expect(s.seconds).toBeLessThanOrEqual(FILM_PACE[s.station].max * (round ? 2 : 1));
    }
    // Longer work plays longer: the face frames' cut against the tray's; the cure.
    expect(kioskScenes[0].seconds).toBeGreaterThan(kioskScenes[1].seconds);
    expect(filmSeconds('paint', 600)).toBeGreaterThan(FILM_PACE.paint.min);
    expect(filmSeconds('bend', null)).toBe(FILM_PACE.bend.min);
    expect(filmStart(kioskScenes, 4)).toBeCloseTo(
      kioskScenes.slice(0, 4).reduce((t, s) => t + s.seconds, 0),
      6,
    );
  });
});

describe('filmScenes: the control box', () => {
  it('cuts and bends body and lid, paints both, prints the lid, then the finished box', () => {
    expect(boxScenes.map((s) => `${s.station}: ${s.title}`)).toEqual([
      'cut: Cut the control box body blank',
      'cut: Cut the control box lid blank',
      'bend: Bend one end flange up 90°',
      'bend: Bend the other end flange up 90°',
      'bend: Bend one long-side flange up 90°',
      'bend: Bend the other long-side flange up 90°',
      'bend: Bend one long-side flange down 90°',
      'bend: Bend the other long-side flange down 90°',
      'paint: Powder-coat the control box (2 parts) RAL 7035 Light grey',
      'print: UV-print the artwork on the control box lid',
      'print: Silk-screen “CONTROL BOX” on the control box lid',
      'finished: Finished: Control box',
    ]);
    // 30.7 s since the shop trim (36.2 s with its weld and assembly scenes).
    expect(filmLength(boxScenes)).toBeGreaterThan(25);
    expect(filmLength(boxScenes)).toBeLessThan(35);
  });
});

describe('filmState: what exists at each point of the film', () => {
  const members = jobProducts(kiosk)[0].instanceIds;
  const front = kiosk.instances.find((i) => i.name === 'Front face frame').id;
  const frontHits = kioskScenes.filter((s) => s.station === 'bend' && s.instanceId === front);

  it('at the start: nothing cut, every bend flat, no record, nothing in the view', () => {
    const state = filmState(kioskScenes, 0);
    expect(state.scene.station).toBe('cut');
    expect(state.cut).toEqual([]);
    // Six bends in four hits (two strokes of two tabs).
    expect(Object.values(state.angles[front])).toEqual([0, 0, 0, 0, 0, 0]);
    expect([state.finishes, state.prints]).toEqual([[], []]);
    expect(state).not.toHaveProperty('welds');
    expect(state).not.toHaveProperty('steps');
    expect(state.hidden.sort()).toEqual([...members].sort());
    // Its own result counts at its end.
    expect(filmState(kioskScenes, 0, 1).cut.sort()).toEqual(kioskScenes[0].instanceIds.sort());
  });

  it('mid-bend: the earlier hits at their angle, this one in the die, the later ones flat', () => {
    const index = kioskScenes.indexOf(frontHits[1]);
    const state = filmState(kioskScenes, index, 0.5);
    expect(state.cut).toHaveLength(11);
    expect(state.bending).toMatchObject({ instanceId: front, bendIds: frontHits[1].bendIds });
    const angles = state.angles[front];
    for (const id of frontHits[0].bendIds) expect(angles[id]).toBe(90);
    for (const id of frontHits[1].bendIds) expect(angles[id]).toBe(0);
    for (const id of frontHits[3].bendIds) expect(angles[id]).toBe(0);
    // The copy is bent with it.
    const rear = kiosk.instances.find((i) => i.name === 'Rear face frame').id;
    expect(state.angles[rear]).toEqual(angles);
    expect(filmState(kioskScenes, index, 1).angles[front][frontHits[1].bendIds[0]]).toBe(90);
  });

  it('a paint or print scene shows only the parts in the booth, its records at their beat', () => {
    // The frame: its nine parts in the booth, outlined; its finishes appear at the beat.
    const frame = firstOf(kioskScenes, 'paint');
    expect(filmBeats(kioskScenes[frame])).toEqual(Array(9).fill(0.3));
    const atFrame = filmState(kioskScenes, frame, 0.5);
    expect(atFrame.shown.map((id) => kiosk.instances.find((i) => i.id === id).name).sort()).toEqual(
      [
        'Front face frame',
        'Left base channel',
        'Rear face frame',
        'Right base channel',
        'Shelf tray',
        'Front left corner piece',
        'Front right corner piece',
        'Rear left corner piece',
        'Rear right corner piece',
      ].sort(),
    );
    expect(atFrame.targets).toEqual(kioskScenes[frame].instanceIds);
    expect(filmState(kioskScenes, frame, 0.1).finishes).toEqual([]);
    expect(atFrame.finishes).toHaveLength(9);
    const covers = frame + 1;
    const atPaint = filmState(kioskScenes, covers, 0.5);
    expect(atPaint.shown.map((id) => kiosk.instances.find((i) => i.id === id).name)).toEqual([
      'Front cover',
      'Rear cover',
    ]);
    expect(atPaint.finishes).toHaveLength(11);
    expect(filmState(kioskScenes, covers, 0.1).finishes).toHaveLength(9);
  });

  it('what is not made here (the displays, the fasteners) comes on in the finished scene; the end has everything', () => {
    const notMade = kiosk.instances
      .filter((i) => ['shop-kiosk-display', 'shop-kiosk-screw', 'shop-kiosk-nut'].includes(i.partId))
      .map((i) => i.id);
    expect(notMade).toHaveLength(26);
    expect(kioskScenes.at(-1).notMade.sort()).toEqual([...notMade].sort());
    // Every part made here shows once bent, before the paint: the bought-in items and fasteners stay hidden.
    const lastBend = filmState(kioskScenes, lastOf(kioskScenes, 'bend'), 1);
    expect(lastBend.hidden.sort()).toEqual([...notMade].sort());
    const finished = filmState(kioskScenes, kioskScenes.length - 1);
    expect(finished.hidden).toEqual([]);
    expect(finished.shown).toHaveLength(members.length);
    const end = filmState(kioskScenes, kioskScenes.length);
    expect(end.hidden).toEqual([]);
    expect([end.finishes.length, end.prints.length]).toEqual([11, 2]);
    for (const hit of frontHits)
      for (const [id, angle] of Object.entries(hit.angles)) expect(end.angles[front][id]).toBe(angle);
  });

  it('filmModel keeps only the records that exist and stays kernel-inert (no rebuild)', () => {
    const state = filmState(kioskScenes, firstOf(kioskScenes, 'paint'));
    const shown = filmModel(kiosk, state);
    expect(shown.finishes).toEqual([]);
    expect(shown.prints).toEqual([]);
    expect(sameKernelInput(kiosk, shown)).toBe(true);
    expect(shown.parts).toBe(kiosk.parts);
    expect(shown.instances).toBe(kiosk.instances);
    // At the end the model itself.
    expect(filmModel(kiosk, filmState(kioskScenes, kioskScenes.length))).toBe(kiosk);
  });
});

describe('films with little to show', () => {
  it('a product with no paint or prints: cut, bend, finished (the pump bracket, one part)', () => {
    const pump = normalizeModel(sheetMetalPumpBracket());
    const scenes = filmScenes(pump, productOf(pump));
    expect(scenes.map((s) => s.station)).toEqual(['cut', 'bend', 'bend', 'finished']);
    const end = filmState(scenes, scenes.length - 1, 1);
    expect([end.finishes, end.prints, end.hidden]).toEqual([[], [], []]);
  });

  it('a single flat blank with no bends: its cut and the finished part', () => {
    const plate = flatBlank();
    const scenes = filmScenes(plate, productOf(plate));
    expect(scenes.map((s) => [s.station, s.title])).toEqual([
      ['cut', 'Cut the plate blank'],
      ['finished', 'Finished: Plate'],
    ]);
    expect(filmState(scenes, 0).hidden).toEqual(['plate-1']);
    expect(filmState(scenes, 1).shown).toEqual(['plate-1']);
    expect(filmReady(plate, productOf(plate))).toBe('');
  });

  it('an empty model, or nothing done in the shop: no film, and why', () => {
    expect(filmScenes(emptyModel(), null)).toEqual([]);
    expect(filmReady(emptyModel(), null)).toMatch(/^Choose a product first/);
    const plain = normalizeModel({
      ...emptyModel(),
      parts: [
        {
          id: 'p',
          name: 'Block',
          material: 'pine',
          features: [{ id: 'f', type: 'box', width: 10, depth: 10, height: 10 }],
        },
      ],
      instances: [{ id: 'i', partId: 'p', name: 'Block', position: [0, 0, 0], rotation: [0, 0, 0], visible: true }],
    });
    expect(filmScenes(plain, 'i')).toEqual([]);
    expect(filmReady(plain, 'i')).toMatch(/^Nothing to replay yet/);
    expect(filmState([], 0)).toMatchObject({ scene: null, cut: [], hidden: [], shown: [] });
  });

  it('Watch the bends: only that part’s hits, as itself', () => {
    const rear = kiosk.instances.find((i) => i.name === 'Rear face frame').id;
    const scenes = filmScenes(kiosk, productOf(kiosk), { instanceId: rear });
    expect(scenes.map((s) => s.station)).toEqual(['bend', 'bend', 'bend', 'bend']);
    expect(scenes.every((s) => s.instanceId === rear && s.instanceIds.length === 1)).toBe(true);
    expect(scenes[0].subject).toBe('rear face frame · hit 1 of 4');
  });
});

describe('the film’s clock and words', () => {
  it('runs at the chosen speed and stands still while paused', () => {
    let now = 1000;
    const clock = createFilmClock(() => now);
    now += 500;
    expect(clock.elapsed()).toBe(500);
    clock.setRate(2);
    now += 500;
    expect(clock.elapsed()).toBe(1500);
    clock.pause();
    now += 5000;
    expect(clock.elapsed()).toBe(1500);
    clock.play();
    now += 100;
    expect(clock.elapsed()).toBe(1700);
    clock.reset();
    expect(clock.elapsed()).toBe(0);
  });

  it('names parts as the shop does', () => {
    expect(partNames(['Front face frame', 'Rear face frame'])).toBe('front and rear face frames');
    expect(partNames(['Front cover', 'Rear cover'], { many: false })).toBe('front and rear cover');
    expect(partNames(['Shelf tray', 'Left base channel'])).toBe('shelf tray and left base channel');
    expect(partNames(['KIOSK'])).toBe('KIOSK');
  });

  it('is worker-safe: no DOM in this environment', () => {
    expect(globalThis.document).toBeUndefined();
    expect(globalThis.window).toBeUndefined();
  });
});
