// Shop → Example: kiosk (docs/sketch-studio-shop-floor.md §7, SF-4) in the
// real kernel: it builds, its parts do not interfere (the kernel's inspect,
// the one Check fit runs, fasteners included — and the same check does find a
// cover pushed 0.5 mm into its face frame, and a corner piece pushed 0.5 mm
// into its round corner), every fastener sits on its
// laser-cut hole and fastens two parts, and the stations' own checks pass on
// it (laser, paint, print).
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { setOC } from 'replicad';
import { normalizeModel } from './model.js';
import { createKernelSession } from './kernel.js';
import { foldSheet, sheetMetalFeature } from './sheetMetal.js';
import { sheetMetalKiosk } from './shopExamples.js';
import { laserStation } from './laserStation.js';
import { fillingHoles, meshArea, paintNumbers } from './paintStation.js';
import { localMesh, printWarnings } from './printStation.js';
import { isHardware } from './shopParts.js';
import { hardwareDimensions } from './hardware.js';
import { holeCentres } from './placementCuts.js';
import { mapPlacement } from './placement.js';
import { jobSheet } from './jobSheet.js';

const require = createRequire(import.meta.url);
beforeAll(
  async () =>
    setOC(await initOpenCascade({ wasmBinary: readFileSync(require.resolve('replicad-opencascadejs/wasm')) })),
  60000,
);

describe('Example: kiosk in the kernel', () => {
  const model = normalizeModel(sheetMetalKiosk());
  let session, snapshot;
  const partOf = (instanceId) =>
    model.parts.find((p) => p.id === model.instances.find((i) => i.id === instanceId)?.partId);

  it('builds: thirteen parts, 24 fasteners, every one placed', () => {
    const started = performance.now();
    session = createKernelSession(model);
    snapshot = session.snapshot();
    // Build + snapshot (5 sheet-metal parts, the display, 2 fasteners; 37 instances): 1.5 s measured in node.
    expect(performance.now() - started).toBeLessThan(30000);
    // RB-3 (round-bend spec §13.4): 33 + the four corner pieces.
    expect(snapshot.instances).toHaveLength(37);
    expect(model.instances.filter((i) => isHardware(partOf(i.id)))).toHaveLength(24);
    // The face frame: 640 wide, its outside height up the face 1 667 mm (the crease leans the lower face out).
    const face = snapshot.parts.find((p) => p.id === 'shop-kiosk-face').bounds;
    expect(face[1][1] - face[0][1]).toBeCloseTo(640, 1);
    // The kiosk stands on the floor, 1 700 mm to the top of the face frames.
    const all = snapshot.instances.map((i) => i.bounds);
    expect(Math.min(...all.map((b) => b[0][2]))).toBeCloseTo(0, 3);
    expect(Math.max(...all.map((b) => b[1][2]))).toBeCloseTo(1700, 0);
  }, 120000);

  // The parts with a hole centre on a fastener's axis (within 0.2 mm of it, between the seat and the tip).
  const clamped = (axis, holes, self) => {
    const found = new Set();
    for (const hole of holes) {
      if (hole.instanceId === self) continue;
      const d = hole.point.map((v, k) => v - axis.origin[k]);
      const along = d.reduce((sum, v, k) => sum + v * axis.shank[k], 0);
      if (along < -0.2 || along > axis.length + 0.2) continue;
      if (Math.hypot(...d.map((v, k) => v - axis.shank[k] * along)) <= 0.2) found.add(hole.instanceId);
    }
    return [...found];
  };

  it('seats every fastener on its hole: each fastens two parts', () => {
    const holes = holeCentres({ model, snapshot, parameters: snapshot.parameters });
    for (const c of model.connections) {
      const placed = snapshot.instances.find((i) => i.id === c.from);
      const feature = partOf(c.from).features.find((f) => f.type === 'hardware');
      const axis = {
        origin: mapPlacement([0, 0, 0], placed.placement),
        shank: mapPlacement([0, 0, -1], placed.placement, true),
        length: hardwareDimensions(feature, {}).length || 0,
      };
      // On the opening its connection names, within 0.01 mm.
      const opening = holes.find(
        (h) =>
          h.instanceId === c.to &&
          h.featureId === c.toFeatureId &&
          h.index === (c.holeIndex ?? 0) &&
          h.side === (c.side || 'entry'),
      );
      expect(Math.hypot(...axis.origin.map((v, k) => v - opening.point[k]))).toBeLessThan(0.01);
      expect(clamped(axis, holes, c.from)).toHaveLength(2);
    }
  });

  it('has no interference between its parts, fasteners included', () => {
    const started = performance.now();
    const clashes = session.inspect();
    const ms = performance.now() - started;
    expect(clashes).toEqual([]);
    // 37 instances, 666 pairs: 4.0 s measured in node (3.5 s with 33 before the corner pieces).
    expect(ms).toBeLessThan(120000);
  }, 300000);

  it('passes the laser, paint and print checks', () => {
    for (const part of model.parts) {
      const feature = sheetMetalFeature(part);
      if (!feature) continue;
      const instance = model.instances.find((i) => i.partId === part.id);
      const laser = laserStation({ model, session: { instanceId: instance.id, quantity: 1 } });
      expect(laser.checks.refusals).toEqual([]);
      expect(laser.checks.warnings).toEqual([]);
      expect(fillingHoles(part, model)).toEqual([]);
    }
    for (const finish of model.finishes) {
      const mesh = snapshot.instances.find((i) => i.id === finish.instanceId).mesh;
      expect(paintNumbers({ area: meshArea(mesh), kind: finish.kind, thickness: finish.thickness }).warnings).toEqual(
        [],
      );
    }
    const coverPart = model.parts.find((p) => p.id === 'shop-kiosk-cover');
    const coverFold = foldSheet(
      coverPart.features[0],
      model.sketches.find((s) => s.id === coverPart.features[0].sketchId).profile,
    );
    for (const print of model.prints) {
      const item = snapshot.instances.find((i) => i.id === print.instanceId);
      expect(printWarnings({ print, mesh: localMesh(item), fold: coverFold }).warnings).toEqual([]);
    }
    // The job sheet with the built model's painted areas: every step done.
    const [product] = jobSheet(model, snapshot).products;
    expect(product.done).toBe(true);
    expect(product.steps.every((s) => s.time > 0)).toBe(true);
    session.dispose();
  });

  // The pair's records and groups dropped, only `keep` left, `moved` shifted by `by` (world).
  const trialOf = (keep, moved, by) => ({
    ...model,
    instances: model.instances
      .filter((i) => keep.has(i.id))
      .map(({ groupId: _group, ...i }) =>
        i.id === moved ? { ...i, position: i.position.map((v, k) => v + by[k]) } : i,
      ),
    connections: [],
    finishes: [],
    prints: [],
    groups: [],
  });

  it('the same check finds a corner piece pushed 0.5 mm into its round corner (and none where it stands)', () => {
    // The front left piece's outside is on the frame's side (X = 0) and top: pushed 0.5 mm along +X it
    // runs its leg end into the top flange's end and its inside into the face plate's cut-back.
    const keep = new Set(['shop-kiosk-front', 'shop-kiosk-corner-front-left']);
    for (const [by, clashes] of [
      [[0, 0, 0], []],
      [[0.5, 0, 0], [['shop-kiosk-corner-front-left', 'shop-kiosk-front']]],
    ]) {
      const trial = createKernelSession(trialOf(keep, 'shop-kiosk-corner-front-left', by));
      try {
        expect(trial.inspect().map((c) => [c.first, c.second].sort())).toEqual(clashes);
      } finally {
        trial.dispose();
      }
    }
  }, 120000);

  it('the same check finds a cover pushed 0.5 mm into its face frame', () => {
    const keep = new Set(['shop-kiosk-front', 'shop-kiosk-cover-front']);
    const cover = model.instances.find((i) => i.id === 'shop-kiosk-cover-front');
    const placed = snapshot.instances.find((i) => i.id === 'shop-kiosk-cover-front');
    // The cover's underside normal in the world: out of its far openings, toward the frame.
    const toward = mapPlacement([0, 0, -1], placed.placement, true);
    const trial = createKernelSession(
      trialOf(
        keep,
        cover.id,
        toward.map((v) => v * 0.5),
      ),
    );
    try {
      expect(trial.inspect().map((c) => [c.first, c.second].sort())).toEqual([
        ['shop-kiosk-cover-front', 'shop-kiosk-front'],
      ]);
    } finally {
      trial.dispose();
    }
  }, 120000);
});
