// Shop → Example: kiosk (docs/sketch-studio-shop-floor.md §7, SF-4): it
// builds from its named sizes, every blank folds and passes the press
// brake's sequence checks on the default press, it carries the records the
// job sheet needs (every step done, the route bar done at every station), no
// record names a missing instance, the laser-cut hole patterns of mating
// parts line up, and it survives a save and a reload unchanged. Since the
// shop trim (docs/sketch-studio-shop-trim.md §4.7) it has no seam and no
// assembly step, and every part stands where the kiosk saved before it
// stood (fixtures/kiosk-before-shop-trim.json). The kernel side (no
// interference, fasteners seated) is kiosk.kernel.test.js.
import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import oldKiosk from './fixtures/kiosk-before-shop-trim.json';
import { normalizeModel } from './model.js';
import { blankHoles, bendStrokes, foldSheet, sheetMetalFeature, transformPoint } from './sheetMetal.js';
import { sequenceChecks } from './brakeStation.js';
import { machineOf } from './shopCatalog.js';
import { jobSheet } from './jobSheet.js';
import { routeProgress, partProgress } from './shopRoute.js';
import { isHardware, isPurchased } from './shopParts.js';
import { instanceMatrix } from './movement.js';
import { laserStation } from './laserStation.js';
import { KIOSK, kioskFaceFrame, sheetMetalControlBox, sheetMetalKiosk } from './shopExamples.js';

const model = normalizeModel(sheetMetalKiosk());
const profileOf = (feature) => model.sketches.find((s) => s.id === feature.sketchId).profile;
const fold = (partId) => {
  const feature = sheetMetalFeature(model.parts.find((p) => p.id === partId));
  return { feature, fold: foldSheet(feature, profileOf(feature)) };
};

describe('Example: kiosk', () => {
  it('is the product of the photo: thirteen parts in one Kiosk group around its frame group', () => {
    // RB-3 (round-bend spec §13.4): the four corner pieces in the face frames' round top corners.
    expect(model.instances.slice(0, 13).map((i) => i.name)).toEqual([
      'Front face frame',
      'Rear face frame',
      'Shelf tray',
      'Left base channel',
      'Right base channel',
      'Front display',
      'Rear display',
      'Front cover',
      'Rear cover',
      'Front left corner piece',
      'Front right corner piece',
      'Rear left corner piece',
      'Rear right corner piece',
    ]);
    // Built with groups.js under the names they always had: no weldment flag, no seam, no step.
    expect(model.groups).toEqual([
      { id: 'shop-kiosk-frame', name: 'Kiosk frame', parentId: 'shop-kiosk-group' },
      { id: 'shop-kiosk-group', name: 'Kiosk', parentId: null },
    ]);
    expect(model).not.toHaveProperty('welds');
    expect(model).not.toHaveProperty('assembly');
    const frame = model.instances.filter((i) => i.groupId === 'shop-kiosk-frame').map((i) => i.name);
    expect(frame).toEqual([
      'Front face frame',
      'Rear face frame',
      'Shelf tray',
      'Left base channel',
      'Right base channel',
      'Front left corner piece',
      'Front right corner piece',
      'Rear left corner piece',
      'Rear right corner piece',
    ]);
    // The rest (displays, covers, fasteners) are in the product group itself.
    expect(model.instances.filter((i) => !i.groupId)).toEqual([]);
    expect(model.parts.filter(isPurchased).map((p) => [p.name, p.purchased.colour])).toEqual([['Display', '#1b1e22']]);
  });

  it('folds every blank and passes the press brake’s sequence checks on the 50 t × 2 m press', () => {
    const machine = machineOf('brake-50-2000');
    const strokes = {};
    for (const part of model.parts) {
      const feature = sheetMetalFeature(part);
      if (!feature) continue;
      const f = foldSheet(feature, profileOf(feature));
      expect(f.warnings).toEqual([]);
      const checks = sequenceChecks({ fold: f, machine });
      expect(checks.filter((c) => c.refusals.length || c.collision)).toEqual([]);
      strokes[part.id] = checks.map((c) => c.label);
      // Every bend has its tooling and the etched lines are the panel maker's (one per stroke).
      expect(feature.bends.every((b) => b.punch === 'straight-88' && b.die)).toBe(true);
      expect(feature.marks).toHaveLength(bendStrokes(feature.bends).length);
      // The blank fits the model's stock sheet (the laser never turns a blank).
      const laser = laserStation({
        model,
        session: { instanceId: model.instances.find((i) => i.partId === part.id).id, quantity: 1 },
      });
      expect(laser.checks.refusals).toEqual([]);
    }
    expect(strokes).toEqual({
      'shop-kiosk-face': ['UP 90° R1.6 · 2 flanges', 'UP 90° R1.6 · 2 flanges', 'UP 90° R1.6', 'DOWN 15° R1.6'],
      'shop-kiosk-tray': ['DOWN 75° R1.6', 'DOWN 75° R1.6', 'DOWN 90° R1.6', 'DOWN 90° R1.6'],
      'shop-kiosk-channel': ['DOWN 90° R1.6', 'DOWN 90° R1.6'],
      'shop-kiosk-cover': ['UP 90° R1.28', 'UP 90° R1.28', 'UP 90° R1.28', 'UP 90° R1.28'],
      // RB-3: one round bend by bump hits (inside R28.5 for the R30 outside).
      'shop-kiosk-corner': ['UP 90° R28.5 · 10 hits'],
    });
  });

  it('comes out at its named sizes', () => {
    const { fold: face } = fold('shop-kiosk-face');
    const layout = kioskFaceFrame(KIOSK);
    expect(layout.panel.report.problems).toEqual([]);
    // Folded face frame: as wide as asked; its height and depth from the crease.
    const size = layout.panel.report.folded.size;
    expect(size[1]).toBeCloseTo(KIOSK.width, 6);
    // The upper and lower face, the four side tabs (notched at the crease) and the top flange.
    expect(face.pieces.length).toBe(7);
    // World: the frames' tops at the kiosk's height, the faces `depth` apart at the top.
    const front = model.instances.find((i) => i.id === 'shop-kiosk-front');
    const rear = model.instances.find((i) => i.id === 'shop-kiosk-rear');
    const top = (instance) =>
      Math.max(
        ...face.pieces.flatMap((p) =>
          p.outer.map(
            ([x, y]) => new Vector3(...transformPoint(p.matrix, [x, y, 0])).applyMatrix4(instanceMatrix(instance)).z,
          ),
        ),
      );
    expect(top(front)).toBeCloseTo(KIOSK.height, 0);
    expect(top(rear)).toBeCloseTo(KIOSK.height, 0);
    expect(rear.position[1] - front.position[1]).toBeCloseTo(KIOSK.depth, 6);
  });

  it('closes the round top corners with corner pieces set against two flange ends, in the frame group (round-bend spec §13.4)', () => {
    const { radius, leg } = KIOSK.corner;
    const { fold: corner } = fold('shop-kiosk-corner');
    const world = (instance) =>
      corner.pieces.flatMap((p) =>
        [0, KIOSK.thickness].flatMap((z) =>
          p.outer.map(([x, y]) =>
            new Vector3(...transformPoint(p.matrix, [x, y, z])).applyMatrix4(instanceMatrix(instance)).toArray(),
          ),
        ),
      );
    const bounds = (points) =>
      [0, 1, 2].map((k) => [Math.min(...points.map((p) => p[k])), Math.max(...points.map((p) => p[k]))]);
    const out = KIOSK.depth / 2;
    // Each piece in its corner: its outside on the frame's side (X 0 or W) and top (Z = height), the strip from
    // the face's outside (Y = ∓depth/2) in by the flange depth. To 1e-5: the blank's corners are kept to 1e-6 mm.
    const expected = {
      'front-left': [0, -out],
      'front-right': [KIOSK.width - radius - leg, -out],
      'rear-left': [KIOSK.width - radius - leg, out - KIOSK.flange],
      'rear-right': [0, out - KIOSK.flange],
    };
    for (const [id, [x0, y0]] of Object.entries(expected)) {
      const box = bounds(world(model.instances.find((i) => i.id === `shop-kiosk-corner-${id}`)));
      expect(box[0][0]).toBeCloseTo(x0, 5);
      expect(box[0][1] - box[0][0]).toBeCloseTo(radius + leg, 5);
      expect(box[1][0]).toBeCloseTo(y0, 5);
      expect(box[1][1] - box[1][0]).toBeCloseTo(KIOSK.flange, 6);
      expect(box[2][1]).toBeCloseTo(KIOSK.height, 5);
      expect(box[2][1] - box[2][0]).toBeCloseTo(radius + leg, 5);
    }
    // Each moves with its face frame: both in the frame group.
    for (const id of Object.keys(expected))
      expect(model.instances.find((i) => i.id === `shop-kiosk-corner-${id}`).groupId).toBe('shop-kiosk-frame');
  });

  it('stands where the kiosk with seams and steps stood: every part, pose, group, finish and print', () => {
    const state = (m) =>
      m.instances.map((i) => ({
        id: i.id,
        partId: i.partId,
        position: i.position,
        rotation: i.rotation,
        group: i.groupId ?? null,
        finish: m.finishes.find((f) => f.instanceId === i.id) || null,
        prints: m.prints.filter((p) => p.instanceId === i.id),
      }));
    expect(state(model)).toEqual(state(oldKiosk));
    for (const key of ['parts', 'sketches', 'connections', 'sheets', 'finishes', 'prints'])
      expect(model[key]).toEqual(oldKiosk[key]);
  });

  it('has the records the job sheet needs: every step done, the route bar done at every station', () => {
    expect(model.finishes.map((f) => [f.instanceId, f.name, f.gloss])).toEqual([
      ...[
        'front',
        'rear',
        'tray',
        'channel-left',
        'channel-right',
        'corner-front-left',
        'corner-front-right',
        'corner-rear-left',
        'corner-rear-right',
      ].map((id) => [`shop-kiosk-${id}`, 'RAL 9005 Jet black', 'texture']),
      ['shop-kiosk-cover-front', 'RAL 9003 Signal white', 'satin'],
      ['shop-kiosk-cover-rear', 'RAL 9003 Signal white', 'satin'],
    ]);
    expect(model.prints.map((p) => [p.instanceId, p.kind, p.text, p.method, p.width, p.height])).toEqual([
      ['shop-kiosk-cover-front', 'text', 'KIOSK', 'silk', 180, 40],
      ['shop-kiosk-cover-rear', 'text', 'KIOSK', 'silk', 180, 40],
    ]);
    const sheet = jobSheet(model);
    expect(sheet.products.map((p) => p.name)).toEqual(['Kiosk']);
    const [product] = sheet.products;
    expect(product.done).toBe(true);
    expect(product.steps.map((s) => [s.key, s.status, s.summary])).toEqual([
      ['cut', 'done', '11 blanks cut from sheet'],
      ['bend', 'done', '64 hits on the press brake'],
      ['paint', 'done', '11 of 11 parts painted · RAL 9005 Jet black'],
      ['print', 'done', '2 prints'],
    ]);
    // SF-5 (the SF-4 audit): Paint's count is the parts painted, beside "11 of 11"; the oven is one load, not a part.
    // RB-3: + 4 corner pieces (cut, painted); Bend's rows are strokes (24 + 4: a round bend is one row of 10 hits),
    // its summary counts the hits (24 + 40).
    expect(product.steps.map((s) => s.quantity)).toEqual([11, 28, 11, 2]);
    // What is in it but not made here, untimed.
    expect(product.notMade).toEqual([
      { label: 'Display (bought in)', count: 2 },
      { label: 'M4 × 12 pan head', count: 16 },
      { label: 'M4 hex nut', count: 8 },
    ]);
    const route = routeProgress(model, 'shop-kiosk-group');
    expect(
      Object.fromEntries(
        Object.entries(route)
          .filter(([k]) => k !== 'next')
          .map(([k, v]) => [k, v.status]),
      ),
    ).toEqual({
      draw: 'done',
      cut: 'done',
      bend: 'done',
      paint: 'done',
      print: 'done',
    });
    expect(route.next).toBe(null);
    // Every sheet-metal part's pips on the job board: nothing left for it at any station.
    for (const instance of model.instances.filter((i) => sheetMetalFeature(model.parts.find((p) => p.id === i.partId))))
      expect(partProgress(model, instance.id).next).toBe(null);
  });

  it('names no missing instance, part or feature in any record', () => {
    const instances = new Set(model.instances.map((i) => i.id));
    const features = (instanceId) =>
      new Set(
        model.parts
          .find((p) => p.id === model.instances.find((i) => i.id === instanceId)?.partId)
          ?.features.map((f) => f.id),
      );
    expect(model.instances.every((i) => model.parts.some((p) => p.id === i.partId))).toBe(true);
    expect(model.finishes.every((f) => instances.has(f.instanceId))).toBe(true);
    expect(model.prints.every((p) => instances.has(p.instanceId))).toBe(true);
    // Every fastener is in the product, held by one connection to its hole.
    const fastened = model.instances
      .filter((i) => isHardware(model.parts.find((p) => p.id === i.partId)))
      .map((i) => i.id);
    expect(fastened).toHaveLength(24);
    expect(model.instances.filter((i) => fastened.includes(i.id)).every((i) => i.groupId === 'shop-kiosk-group')).toBe(
      true,
    );
    expect(model.connections).toHaveLength(fastened.length);
    for (const c of model.connections) {
      expect(c.type).toBe('concentric');
      expect(fastened).toContain(c.from);
      expect(features(c.from).has(c.fromFeatureId)).toBe(true);
      expect(features(c.to).has(c.toFeatureId)).toBe(true);
    }
  });

  it('lines up the hole patterns of the mating parts (screws from outside, nuts on the covers)', () => {
    const world = (instanceId, partId, index) => {
      const { feature, fold: f } = fold(partId);
      const row = blankHoles(f, profileOf(feature)).find((h) => h.index === index);
      const m = instanceMatrix(model.instances.find((i) => i.id === instanceId));
      return {
        centre: new Vector3(...row.centre).applyMatrix4(m),
        axis: new Vector3(...row.direction).transformDirection(m),
      };
    };
    for (const side of ['front', 'rear']) {
      const face = side === 'front' ? 'shop-kiosk-front' : 'shop-kiosk-rear';
      // The cover's four holes on the face frame's four cover holes (cut-outs 7 – 10 after the two windows and the display's four).
      for (let k = 0; k < 4; k++) {
        const a = world(face, 'shop-kiosk-face', 6 + k),
          b = world(`shop-kiosk-cover-${side}`, 'shop-kiosk-cover', k);
        const off = b.centre.clone().sub(a.centre);
        // Same axis (the cover's underside against the frame's inside: the axes run the same way) …
        expect(a.axis.dot(b.axis)).toBeCloseTo(1, 9);
        // … the centres on it, the cover's top face 1.2 mm in from the frame's.
        expect(
          off
            .clone()
            .sub(a.axis.clone().multiplyScalar(off.dot(a.axis)))
            .length(),
        ).toBeLessThan(1e-6);
        expect(off.dot(a.axis)).toBeCloseTo(-KIOSK.cover.thickness, 5);
      }
    }
    // The connections name those holes: the screws the frame's far openings, the nuts the covers' entries.
    const frames = ['shop-kiosk-front', 'shop-kiosk-rear'];
    const held = model.connections.map((c) => [frames.includes(c.to) ? 'frame' : c.to, c.side || 'entry']);
    expect(held.filter(([to, side]) => to === 'frame' && side === 'far')).toHaveLength(16);
    expect(held.filter(([to, side]) => to.startsWith('shop-kiosk-cover-') && side === 'entry')).toHaveLength(8);
    expect(held).toHaveLength(24);
  });

  it('saves and reloads unchanged, and the control box is unchanged beside it', () => {
    const reloaded = normalizeModel(JSON.parse(JSON.stringify(model)));
    expect(reloaded).toEqual(model);
    expect(normalizeModel(sheetMetalKiosk())).toEqual(model);
    const box = normalizeModel(sheetMetalControlBox());
    expect(box.parts.map((p) => p.features[0].bends.length)).toEqual([4, 2]);
    expect(jobSheet(box).products[0].done).toBe(true);
  });
});
