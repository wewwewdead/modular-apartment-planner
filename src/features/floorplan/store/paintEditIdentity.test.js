/**
 * A look-only edit must not rebuild the building's roof structure
 * (docs/paint-edit-performance.md §2.3): the truss geometry memo
 * (`buildTrussSystemGeometry`), the roof attachment memo
 * (`resolveRoofAttachmentContext`) and the structural sharing in the two syncs
 * that keeps their keys alive (`structuralSharing.js`).
 *
 * Run through the real reducer on the playground project, whose hip roof
 * follows a beam-supported truss system on the roof floor — so a moved support
 * beam is a real truss edit, a roof overhang is a real roof input, and a wall
 * painted on the storey below is neither.
 *
 * Every memo is checked three ways: a hit is deep-equal to the unmemoised
 * function on the same input; a real edit misses and gives the fresh answer; a
 * finish-only edit hits.
 */
import { describe, expect, it } from 'vitest';
import demoData from '@/pages/playground-demo.json';
import { deserializeProject } from '@/persistence/deserialize';
import { serializeProject } from '@/persistence/serialize';
import floorplanReducer, { initializeFloorplanState } from './floorplanReducer';
import { createWallAssembly } from '@/domain/wallAssemblies';
import { defaultWallFinish, wallFinishKindsFor } from '@/domain/wallFinishes';
import { getDefaultTrussTypes } from '@/domain/trussModels';
import { syncProjectStructures } from '@/domain/projectStateHelpers';
import {
  buildFloorTrussGeometry,
  buildTrussDetailScene,
  buildTrussPreviewObjects,
  buildTrussSystemGeometry,
  computeTrussSystemGeometry,
  getTrussSystemPurlinTotalLength,
} from '@/geometry/trussGeometry';
import { resolveRoofAttachmentContext } from '@/truss/roofAttachment';
import { buildEndClosureLayout, buildEndClosureObjects } from '@/truss/endClosures';
import { buildTrussSchedule } from '@/truss/trussSchedule';
import { resolveRoofBearingOutline } from '@/roof/roofEdgeKit';
import { buildPreviewScene } from '@/three/scene/buildPreviewScene';
import { buildProjectElevationScene } from '@/elevations/scene';

function loadState() {
  const { project } = deserializeProject(demoData);
  return initializeFloorplanState(project);
}

// The playground's walls carry no assembly yet; the tests give the first one a
// CHB build-up (as the panel's Assembly picker would), which takes paint.
function firstWall(project) {
  const floor = project.floors.find((entry) => (entry.walls || []).length);
  return { floor, wall: floor.walls[0] };
}

function firstPaintableWall(project) {
  const { floor, wall } = firstWall(project);
  const assembly = wall.assembly;
  if (!assembly || !wallFinishKindsFor(assembly.system, assembly.exterior?.material).includes('paint')) {
    throw new Error('the first wall has not been given a paintable assembly');
  }
  return { floor, wall };
}

function giveAssembly(state) {
  const { floor, wall } = firstWall(state.project);
  return floorplanReducer(state, {
    type: 'WALL_UPDATE',
    floorId: floor.id,
    wall: { id: wall.id, assembly: createWallAssembly('chb', {}, wall.thickness) },
  });
}

/** The finish-only `WALL_UPDATE` WallFinishesSection dispatches. */
function paintAction(project, hex) {
  const { floor, wall } = firstPaintableWall(project);
  const finish = { ...defaultWallFinish('paint'), colour: { hex, name: hex, catalogue: 'custom' } };
  const assembly = createWallAssembly(
    wall.assembly.preset,
    { ...wall.assembly, exterior: { ...wall.assembly.exterior, finish } },
    wall.thickness,
  );
  return { type: 'WALL_UPDATE', floorId: floor.id, wall: { id: wall.id, assembly } };
}

const roofTruss = (project) =>
  project.trussSystems.find((entry) => entry.id === project.roofSystems[0].trussAttachmentId);

/** The unmemoised attachment: a catalogue of its own always bypasses the memo. */
const freshAttachment = (project) =>
  resolveRoofAttachmentContext(project, project.roofSystems[0], getDefaultTrussTypes());

/**
 * The playground opens with one legacy field its normaliser fills on the
 * second pass (an end-closure colour's solar absorptance), so the very first
 * edit after load re-keys once. Settle that, then test from a steady state.
 */
function settledState() {
  const withAssembly = giveAssembly(loadState());
  return floorplanReducer(withAssembly, paintAction(withAssembly.project, '#101010'));
}

describe('a wall finish edit keeps the roof structure (PP-1 §2.3)', () => {
  it('hands the truss systems and the roof straight through the sync', () => {
    const before = settledState();
    const after = floorplanReducer(before, paintAction(before.project, '#336699'));

    expect(after.project).not.toBe(before.project);
    expect(firstPaintableWall(after.project).wall.assembly.exterior.finish.colour.hex).toBe('#336699');
    expect(after.project.trussSystems).toBe(before.project.trussSystems);
    expect(after.project.roofSystems[0]).toBe(before.project.roofSystems[0]);
    expect(after.project.roofSystems).toBe(before.project.roofSystems);
  });

  it('builds no truss geometry: the memo hands back the very same object, equal to a fresh build', () => {
    const before = settledState();
    const geometry = buildTrussSystemGeometry(roofTruss(before.project));
    const after = floorplanReducer(before, paintAction(before.project, '#336699'));

    expect(buildTrussSystemGeometry(roofTruss(after.project))).toBe(geometry);
    expect(geometry).toEqual(computeTrussSystemGeometry(roofTruss(after.project)));
  });

  it('re-derives no roof attachment, and the remembered one equals a fresh one', () => {
    const before = settledState();
    const context = resolveRoofAttachmentContext(before.project, before.project.roofSystems[0]);
    const after = floorplanReducer(before, paintAction(before.project, '#336699'));
    const again = resolveRoofAttachmentContext(after.project, after.project.roofSystems[0]);

    expect(again.derivedRoofState).toBe(context.derivedRoofState);
    expect(again.derivedBoundaryPolygon).toBe(context.derivedBoundaryPolygon);
    expect(again).toEqual(freshAttachment(after.project));
  });

  it('keeps the preview cache keys of the truss floor and the roof', () => {
    const before = settledState();
    const after = floorplanReducer(before, paintAction(before.project, '#336699'));
    const sceneBefore = buildPreviewScene(before.project);
    const sceneAfter = buildPreviewScene(after.project);
    const key = (scene, id) => scene.floors.find((entry) => entry.floorId === id).sourceKey;
    const trussFloorId = roofTruss(after.project).floorId;
    const roofId = after.project.roofSystems[0].id;

    expect(key(sceneAfter, trussFloorId).trussSystems).toEqual(key(sceneBefore, trussFloorId).trussSystems);
    key(sceneAfter, trussFloorId).trussSystems.forEach((system, index) =>
      expect(system).toBe(key(sceneBefore, trussFloorId).trussSystems[index]),
    );
    expect(key(sceneAfter, trussFloorId).roofSystem).toBe(key(sceneBefore, trussFloorId).roofSystem);
    expect(key(sceneAfter, roofId).roofSystem).toBe(key(sceneBefore, roofId).roofSystem);
    expect(key(sceneAfter, roofId).trussSystem).toBe(key(sceneBefore, roofId).trussSystem);
  });

  it('keeps them across a moved wall end too, which no truss or roof reads', () => {
    const before = settledState();
    const { floor, wall } = firstPaintableWall(before.project);
    const after = floorplanReducer(before, {
      type: 'WALL_UPDATE',
      floorId: floor.id,
      wall: { id: wall.id, end: { x: wall.end.x + 20, y: wall.end.y } },
    });
    const moved = after.project.floors.find((entry) => entry.id === floor.id).walls.find((w) => w.id === wall.id);

    expect(moved.end.x).toBeCloseTo(wall.end.x + 20, 6);
    expect(roofTruss(after.project)).toBe(roofTruss(before.project));
    expect(buildTrussSystemGeometry(roofTruss(after.project))).toEqual(
      computeTrussSystemGeometry(roofTruss(syncProjectStructures(after.project))),
    );
    expect(resolveRoofAttachmentContext(after.project, after.project.roofSystems[0])).toEqual(
      freshAttachment(after.project),
    );
  });
});

describe('a real roof-structure edit invalidates (PP-1 §2.3)', () => {
  it('a moved support beam re-syncs the trusses and rebuilds their geometry', () => {
    const before = settledState();
    const truss = roofTruss(before.project);
    const geometry = buildTrussSystemGeometry(truss);
    const beamId = truss.trussInstances[0].supportBeamIds.end;
    const floor = before.project.floors.find((entry) => entry.id === truss.floorId);
    const beam = floor.beams.find((entry) => entry.id === beamId);
    // The playground's support beams hang off plain point refs.
    expect(beam.startRef.kind).toBe('point');
    const after = floorplanReducer(before, {
      type: 'BEAM_UPDATE',
      floorId: floor.id,
      beam: {
        id: beam.id,
        startRef: { ...beam.startRef, y: beam.startRef.y + 300 },
        endRef: { ...beam.endRef, y: beam.endRef.y + 300 },
      },
    });
    const movedTruss = roofTruss(after.project);

    expect(movedTruss).not.toBe(truss);
    const rebuilt = buildTrussSystemGeometry(movedTruss);
    expect(rebuilt).not.toBe(geometry);
    expect(rebuilt).not.toEqual(geometry);
    expect(rebuilt).toEqual(computeTrussSystemGeometry(movedTruss));
    // And the roof that follows it is re-attached, not remembered.
    expect(after.project.roofSystems[0]).not.toBe(before.project.roofSystems[0]);
    expect(resolveRoofAttachmentContext(after.project, after.project.roofSystems[0])).toEqual(
      freshAttachment(after.project),
    );
  });

  it('a changed truss pitch rebuilds the geometry and the attachment', () => {
    const before = settledState();
    const truss = roofTruss(before.project);
    const instance = truss.trussInstances[0];
    const geometry = buildTrussSystemGeometry(truss);
    const context = resolveRoofAttachmentContext(before.project, before.project.roofSystems[0]);
    const after = floorplanReducer(before, {
      type: 'TRUSS_INSTANCE_UPDATE',
      trussSystemId: truss.id,
      trussInstance: { id: instance.id, rise: instance.rise + 300, pitch: undefined },
    });
    const steeper = roofTruss(after.project);

    expect(steeper).not.toBe(truss);
    expect(steeper.trussInstances[0].rise).toBeGreaterThan(instance.rise);
    const rebuilt = buildTrussSystemGeometry(steeper);
    expect(rebuilt).not.toEqual(geometry);
    expect(rebuilt).toEqual(computeTrussSystemGeometry(steeper));
    const reattached = resolveRoofAttachmentContext(after.project, after.project.roofSystems[0]);
    expect(reattached.derivedRoofState).not.toBe(context.derivedRoofState);
    expect(reattached.derivedRoofState.pitch.slope).toBeGreaterThan(context.derivedRoofState.pitch.slope);
    expect(reattached).toEqual(freshAttachment(after.project));
  });

  it('a changed roof overhang moves the hip datum it reads, through the same truss memo', () => {
    const before = settledState();
    const roof = before.project.roofSystems[0];
    const context = resolveRoofAttachmentContext(before.project, roof);
    const after = floorplanReducer(before, {
      type: 'ROOF_UPDATE',
      roofSystem: { id: roof.id, pitch: { ...roof.pitch, overhang: roof.pitch.overhang + 200 } },
    });
    const reattached = resolveRoofAttachmentContext(after.project, after.project.roofSystems[0]);

    expect(after.project.roofSystems[0]).not.toBe(roof);
    // The truss did not change, so its part is remembered…
    expect(roofTruss(after.project)).toBe(roofTruss(before.project));
    expect(reattached.derivedRoofState).toBe(context.derivedRoofState);
    // …and the roof's own input is applied fresh: a hip datum runs further down the tail.
    expect(reattached.attachmentElevation).toBeLessThan(context.attachmentElevation);
    expect(reattached).toEqual(freshAttachment(after.project));
    expect(after.project.roofSystems[0].baseElevation).toBeLessThan(roof.baseElevation);
  });
});

describe('history and persistence hand back correct structure (PP-1 §2.3)', () => {
  it('undo and redo restore projects whose memoised answers are still right', () => {
    const start = settledState();
    const painted = floorplanReducer(start, paintAction(start.project, '#336699'));
    const steeper = floorplanReducer(painted, {
      type: 'TRUSS_INSTANCE_UPDATE',
      trussSystemId: roofTruss(painted.project).id,
      trussInstance: { id: roofTruss(painted.project).trussInstances[0].id, rise: 2000, pitch: undefined },
    });
    const undone = floorplanReducer(steeper, { type: 'UNDO' });
    const redone = floorplanReducer(undone, { type: 'REDO' });

    for (const state of [undone, redone]) {
      const truss = roofTruss(state.project);
      expect(buildTrussSystemGeometry(truss)).toEqual(computeTrussSystemGeometry(truss));
      expect(resolveRoofAttachmentContext(state.project, state.project.roofSystems[0])).toEqual(
        freshAttachment(state.project),
      );
    }
    expect(roofTruss(undone.project)).toBe(roofTruss(painted.project));
    expect(roofTruss(redone.project)).toBe(roofTruss(steeper.project));
  });

  it('a saved and reloaded project builds the same structure from fresh objects', () => {
    const start = settledState();
    const painted = floorplanReducer(start, paintAction(start.project, '#336699'));
    const { project: reloaded } = deserializeProject(JSON.parse(JSON.stringify(serializeProject(painted.project))));
    const state = initializeFloorplanState(reloaded);

    expect(roofTruss(state.project)).not.toBe(roofTruss(painted.project));
    expect(buildTrussSystemGeometry(roofTruss(state.project))).toEqual(
      buildTrussSystemGeometry(roofTruss(painted.project)),
    );
    expect(state.project.roofSystems[0].baseElevation).toBeCloseTo(painted.project.roofSystems[0].baseElevation, 9);
  });
});

describe('the shared truss geometry is read-only to every consumer', () => {
  function deepFreeze(value, seen = new Set()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return value;
    seen.add(value);
    Object.values(value).forEach((child) => deepFreeze(child, seen));
    return Object.freeze(value);
  }

  it('every reader runs against a frozen geometry without writing into it', () => {
    // Fresh objects of their own, so the freeze cannot leak into other tests.
    const { project: loaded } = deserializeProject(demoData);
    const project = syncProjectStructures(syncProjectStructures(loaded));
    const truss = roofTruss(project);
    const geometry = deepFreeze(buildTrussSystemGeometry(truss));
    const roof = project.roofSystems[0];

    expect(() => {
      buildTrussPreviewObjects(truss, geometry);
      buildTrussPreviewObjects(truss);
      buildEndClosureObjects(truss, geometry, roof);
      buildEndClosureLayout(truss, null, roof);
      buildTrussSchedule(truss);
      buildTrussDetailScene(truss);
      getTrussSystemPurlinTotalLength(truss);
      buildFloorTrussGeometry([truss]);
      resolveRoofBearingOutline(roof, truss);
      resolveRoofAttachmentContext(project, roof);
      buildPreviewScene(project);
      buildProjectElevationScene(project, truss.floorId, 'elevation_front');
      syncProjectStructures(project);
    }).not.toThrow();
    expect(buildTrussSystemGeometry(truss)).toBe(geometry);
  });
});
