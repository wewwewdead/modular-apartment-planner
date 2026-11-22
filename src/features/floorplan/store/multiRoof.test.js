import { describe, expect, it } from 'vitest';
import floorplanReducer, { initializeFloorplanState } from './floorplanReducer';
import { createProject, createStair } from '@/domain/models';
import { createTrussSystemForProject } from '@/domain/trussModels';
import {
  createDrain,
  createRoofOpening,
  createRoofSystemForProject,
  getAttachableRoofTrussSystems,
  getRooflessRoofTrussSystems,
} from '@/domain/roofModels';
import { findRoofOwner, getProjectRoof, getProjectRoofs, getRoofForTrussSystem } from '@/domain/projectRoofs';
import { serializeProject } from '@/persistence/serialize';
import { deserializeProject } from '@/persistence/deserialize';
import { deriveQuantityTakeoff } from '@/domain/quantityTakeoff';
import { deriveRoofDrainageCoordination } from '@/domain/roofDrainageCoordination';
import { BUILDING_COMMANDS, executeBuildingCommand } from '@/domain/buildingCommands';
import { resolveSheetViewportSource } from '@/sheets/sources';
import { buildProjectElevationScene } from '@/elevations/scene';

/**
 * One roof per truss system (docs/multi-roof.md, MR-1), on the real reducer.
 *
 * The bug this pins: the project held ONE roof, so a second ROOF_CREATE replaced
 * the first and "Set as roof source" moved the one roof from truss A to truss B,
 * leaving A bare. The probe that reproduced it is the seed of the first case.
 */

function gableTrussSystem(floorId, name, y) {
  return createTrussSystemForProject(null, floorId, {
    name,
    baseElevation: 2700,
    trussInstances: [
      {
        trussTypeId: 'truss_type_gable',
        startPoint: { x: 0, y },
        endPoint: { x: 8000, y },
        span: 6000,
        rise: 1500,
        spacing: 1200,
        count: 5,
      },
    ],
  });
}

function twoTrussState() {
  const project = createProject('Two trusses');
  const floorId = project.floors[0].id;
  let state = initializeFloorplanState(project);
  state = floorplanReducer(state, { type: 'TRUSS_SYSTEM_ADD', trussSystem: gableTrussSystem(floorId, 'A', 0) });
  state = floorplanReducer(state, { type: 'TRUSS_SYSTEM_ADD', trussSystem: gableTrussSystem(floorId, 'B', 12000) });
  const [systemA, systemB] = state.project.trussSystems;
  return { state, floorId, systemA, systemB };
}

function addRoof(state, trussSystemId) {
  const roofSystem = createRoofSystemForProject(state.project, { trussAttachmentId: trussSystemId });
  return { state: floorplanReducer(state, { type: 'ROOF_CREATE', roofSystem }), roofSystem };
}

function twoRoofState() {
  const base = twoTrussState();
  const withA = addRoof(base.state, base.systemA.id);
  const withB = addRoof(withA.state, base.systemB.id);
  return { ...base, state: withB.state, roofA: withA.roofSystem, roofB: withB.roofSystem };
}

describe('one roof per truss system', () => {
  it('gives each of two truss systems its own roof', () => {
    const { state, systemA, systemB, roofA, roofB } = twoRoofState();

    expect(getAttachableRoofTrussSystems(state.project)).toHaveLength(2);
    const roofs = getProjectRoofs(state.project);
    expect(roofs.map((roof) => roof.id)).toEqual([roofA.id, roofB.id]);
    expect(getRoofForTrussSystem(state.project, systemA.id).id).toBe(roofA.id);
    expect(getRoofForTrussSystem(state.project, systemB.id).id).toBe(roofB.id);
    // Each system's truss runs name their own roof.
    const [syncedA, syncedB] = state.project.trussSystems;
    expect(syncedA.trussInstances.every((instance) => instance.roofAttachmentId === roofA.id)).toBe(true);
    expect(syncedB.trussInstances.every((instance) => instance.roofAttachmentId === roofB.id)).toBe(true);
    // The second roof is named after the first.
    expect(roofs.map((roof) => roof.name)).toEqual(['Roof', 'Roof 2']);
    expect(getRooflessRoofTrussSystems(state.project)).toEqual([]);
  });

  it('refuses a second roof for a roofed system, and a re-attach onto one, without touching history', () => {
    const { state, systemA, roofA, roofB } = twoRoofState();

    // The creation rule refuses outright rather than picking another system…
    expect(createRoofSystemForProject(state.project, { trussAttachmentId: systemA.id })).toBeNull();
    expect(createRoofSystemForProject(state.project)).toBeNull();

    // …and the reducer refuses a hand-built duplicate the same way.
    const duplicate = { ...roofA, id: 'roof_duplicate' };
    const afterCreate = floorplanReducer(state, { type: 'ROOF_CREATE', roofSystem: duplicate });
    expect(afterCreate.project).toBe(state.project);
    expect(afterCreate.history).toBe(state.history);
    const sameId = floorplanReducer(state, { type: 'ROOF_CREATE', roofSystem: { ...roofB, trussAttachmentId: null } });
    expect(sameId.project).toBe(state.project);

    // "Set as roof source" on a system that carries another roof no longer moves a roof.
    const afterMove = floorplanReducer(state, {
      type: 'ROOF_UPDATE',
      roofSystem: { id: roofB.id, trussAttachmentId: systemA.id },
    });
    expect(afterMove.project).toBe(state.project);
    expect(afterMove.history).toBe(state.history);
    expect(afterMove.isDirty).toBe(state.isDirty);
  });

  it('deletes one roof, leaves the other, and clears stair access only through the deleted roof', () => {
    const { state: roofed, floorId, roofA, roofB } = twoRoofState();
    const hatchA = createRoofOpening(
      [
        { x: 1000, y: 0 },
        { x: 1600, y: 0 },
        { x: 1600, y: 600 },
        { x: 1000, y: 600 },
      ],
      { type: 'hatch' },
    );
    const hatchB = createRoofOpening(
      [
        { x: 1000, y: 12000 },
        { x: 1600, y: 12000 },
        { x: 1600, y: 12600 },
        { x: 1000, y: 12600 },
      ],
      { type: 'hatch' },
    );
    let state = floorplanReducer(roofed, { type: 'ROOF_OPENING_ADD', roofId: roofA.id, roofOpening: hatchA });
    state = floorplanReducer(state, { type: 'ROOF_OPENING_ADD', roofId: roofB.id, roofOpening: hatchB });
    const stairA = { ...createStair({ x: 0, y: 0 }), roofAccess: { roofOpeningId: hatchA.id } };
    const stairB = { ...createStair({ x: 0, y: 12000 }), roofAccess: { roofOpeningId: hatchB.id } };
    state = floorplanReducer(state, { type: 'STAIR_ADD', floorId, stair: stairA });
    state = floorplanReducer(state, { type: 'STAIR_ADD', floorId, stair: stairB });

    const deleted = floorplanReducer(state, { type: 'ROOF_DELETE', roofId: roofA.id });

    expect(getProjectRoofs(deleted.project).map((roof) => roof.id)).toEqual([roofB.id]);
    expect(getProjectRoof(deleted.project, roofB.id)).toBe(getProjectRoof(state.project, roofB.id));
    const stairs = deleted.project.floors[0].stairs;
    expect(stairs.find((stair) => stair.id === stairA.id).roofAccess).toBeNull();
    expect(stairs.find((stair) => stair.id === stairB.id).roofAccess).toEqual({ roofOpeningId: hatchB.id });
  });

  it('undo and redo bring both roofs back', () => {
    const { state: roofed, roofA, roofB } = twoRoofState();
    const deleted = floorplanReducer(roofed, { type: 'ROOF_DELETE', roofId: roofB.id });
    expect(getProjectRoofs(deleted.project)).toHaveLength(1);

    const undone = floorplanReducer(deleted, { type: 'UNDO' });
    expect(getProjectRoofs(undone.project).map((roof) => roof.id)).toEqual([roofA.id, roofB.id]);
    const redone = floorplanReducer(undone, { type: 'REDO' });
    expect(getProjectRoofs(redone.project).map((roof) => roof.id)).toEqual([roofA.id]);

    // Undoing both creations empties the list; redoing restores both.
    let rewound = floorplanReducer(roofed, { type: 'UNDO' });
    rewound = floorplanReducer(rewound, { type: 'UNDO' });
    expect(getProjectRoofs(rewound.project)).toEqual([]);
    let replayed = floorplanReducer(rewound, { type: 'REDO' });
    replayed = floorplanReducer(replayed, { type: 'REDO' });
    expect(getProjectRoofs(replayed.project).map((roof) => roof.id)).toEqual([roofA.id, roofB.id]);
  });

  it('lands a drain on the roof it names, and finds a drain by owner when no roof is named', () => {
    const { state: roofed, roofA, roofB } = twoRoofState();
    const drain = createDrain({ x: 4000, y: 12000 });

    const added = floorplanReducer(roofed, { type: 'DRAIN_ADD', roofId: roofB.id, drain });
    expect(getProjectRoof(added.project, roofB.id).drains.map((entry) => entry.id)).toEqual([drain.id]);
    expect(getProjectRoof(added.project, roofA.id).drains).toEqual([]);
    expect(findRoofOwner(added.project, 'drain', drain.id).id).toBe(roofB.id);

    const moved = floorplanReducer(added, { type: 'DRAIN_UPDATE', drain: { id: drain.id, diameter: 150 } });
    expect(getProjectRoof(moved.project, roofB.id).drains[0].diameter).toBe(150);

    // With two roofs and nothing to tell them apart, an add does nothing.
    const ambiguous = floorplanReducer(roofed, { type: 'DRAIN_ADD', drain: createDrain({ x: 0, y: 0 }) });
    expect(ambiguous.project).toBe(roofed.project);
  });

  it('keeps roof B the very same object while roof A is edited', () => {
    const { state: roofed, roofA, roofB } = twoRoofState();
    const before = getProjectRoof(roofed.project, roofB.id);

    const renamed = floorplanReducer(roofed, {
      type: 'ROOF_UPDATE',
      roofSystem: { id: roofA.id, name: 'Garage roof' },
    });

    expect(getProjectRoof(renamed.project, roofA.id).name).toBe('Garage roof');
    expect(getProjectRoof(renamed.project, roofB.id)).toBe(before);
  });

  it('round-trips two roofs through save and load', () => {
    const { state, roofA, roofB } = twoRoofState();
    const { project } = deserializeProject(JSON.parse(JSON.stringify(serializeProject(state.project))));

    expect(getProjectRoofs(project).map((roof) => roof.id)).toEqual([roofA.id, roofB.id]);
    expect(project).not.toHaveProperty('roofSystem');
    const reloaded = initializeFloorplanState(project);
    const [systemA, systemB] = reloaded.project.trussSystems;
    expect(systemA.trussInstances[0].roofAttachmentId).toBe(roofA.id);
    expect(systemB.trussInstances[0].roofAttachmentId).toBe(roofB.id);
  });

  it('loads a schema-31 file with its one roof as a one-roof list', () => {
    const { state, systemA } = twoTrussState();
    const { state: roofed, roofSystem } = addRoof(state, systemA.id);
    const { roofSystems: _roofSystems, ...legacy } = roofed.project;
    const envelope = { schemaVersion: 31, version: 23, data: { ...legacy, roofSystem } };

    const { project } = deserializeProject(JSON.parse(JSON.stringify(envelope)));

    expect(getProjectRoofs(project).map((roof) => roof.id)).toEqual([roofSystem.id]);
    expect(project).not.toHaveProperty('roofSystem');
  });
});

describe('whole-building readers see every roof', () => {
  const roofingArea = (project) =>
    deriveQuantityTakeoff(project).items.find((entry) => entry.id === 'roofing').quantity;
  const withOnly = (project, roofId) => ({
    ...project,
    roofSystems: getProjectRoofs(project).filter((roof) => roof.id === roofId),
  });

  it('sums the roofing area of both roofs', () => {
    const { state, roofA, roofB } = twoRoofState();
    const both = roofingArea(state.project);
    expect(both).toBeGreaterThan(0);
    expect(both).toBeCloseTo(
      roofingArea(withOnly(state.project, roofA.id)) + roofingArea(withOnly(state.project, roofB.id)),
      6,
    );
  });

  it('counts drains over both roofs', () => {
    const { state: roofed, roofA, roofB } = twoRoofState();
    let state = floorplanReducer(roofed, {
      type: 'DRAIN_ADD',
      roofId: roofA.id,
      drain: createDrain({ x: 4000, y: 0 }),
    });
    state = floorplanReducer(state, { type: 'DRAIN_ADD', roofId: roofB.id, drain: createDrain({ x: 4000, y: 12000 }) });
    expect(deriveRoofDrainageCoordination(state.project).drainCount).toBe(2);
  });

  it('writes a drainage command onto the roof it names', () => {
    const { state, roofB } = twoRoofState();
    const result = executeBuildingCommand(state.project, {
      type: BUILDING_COMMANDS.CONFIGURE_ROOF_DRAINAGE_PATH,
      roofId: roofB.id,
      drainId: 'drain_cmd',
      position: { x: 4000, y: 12000 },
      diameter: 100,
      outletRef: { kind: 'site_discharge', point: { x: 4000, y: 16000 } },
      routePoints: [
        { x: 4000, y: 12000 },
        { x: 4000, y: 16000 },
      ],
    });
    expect(result.ok).toBe(true);
    expect(findRoofOwner(result.project, 'drain', 'drain_cmd').id).toBe(roofB.id);
    expect(getProjectRoofs(result.project)).toHaveLength(2);
  });

  it('draws both roofs on a roof plan sheet and lists both in the schedule, rows named by roof', () => {
    const { state: roofed, roofA, roofB } = twoRoofState();
    const opening = createRoofOpening(
      [
        { x: 1000, y: 0 },
        { x: 1600, y: 0 },
        { x: 1600, y: 600 },
        { x: 1000, y: 600 },
      ],
      { name: 'Hatch' },
    );
    const state = floorplanReducer(roofed, { type: 'ROOF_OPENING_ADD', roofId: roofA.id, roofOpening: opening });

    const plan = resolveSheetViewportSource(state.project, { sourceView: 'roof_plan' });
    expect(plan.roofSystems.map((roof) => roof.id)).toEqual([roofA.id, roofB.id]);
    expect(plan.title).toBe('Roof Plan');
    const schedule = resolveSheetViewportSource(state.project, { sourceView: 'roof_schedule' }).schedule;
    expect(schedule.openings.map((row) => row.name)).toEqual(['Roof · Hatch']);
    expect(schedule.drainCount).toBe(0);

    const empty = resolveSheetViewportSource({ ...state.project, roofSystems: [] }, { sourceView: 'roof_plan' });
    expect(empty).toMatchObject({ kind: 'empty', message: 'No roof system in this project.' });
  });

  it('keeps element ids unique when two roofs share one elevation', () => {
    const { state, floorId } = twoRoofState();
    const scene = buildProjectElevationScene(state.project, floorId, 'elevation_front');
    const ids = [...scene.elements, ...scene.polygonElements, ...scene.lineElements].map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('a roof action that names a roof that is gone', () => {
  it('does nothing, and never falls through to the one roof left', () => {
    const { state: roofed, roofA, roofB } = twoRoofState();
    const deletedB = floorplanReducer(roofed, { type: 'ROOF_DELETE', roofId: roofB.id });
    expect(getProjectRoofs(deletedB.project).map((roof) => roof.id)).toEqual([roofA.id]);

    // A second delete built for B (a stale panel, a key repeat) must not take A.
    const stale = floorplanReducer(deletedB, { type: 'ROOF_DELETE', roofId: roofB.id });
    expect(stale).toBe(deletedB);
    expect(getProjectRoofs(stale.project).map((roof) => roof.id)).toEqual([roofA.id]);

    // The same for every action that carries a roof id.
    const staleAdds = [
      { type: 'DRAIN_ADD', roofId: roofB.id, drain: createDrain({ x: 4000, y: 0 }) },
      { type: 'ROOF_EDGE_DELETE', roofId: roofB.id, roofEdgeId: 'edge_gone' },
    ];
    for (const action of staleAdds) {
      expect(floorplanReducer(deletedB, action)).toBe(deletedB);
    }

    // With NO roof id the sole-roof safety net still applies.
    const unnamed = floorplanReducer(deletedB, { type: 'DRAIN_ADD', drain: createDrain({ x: 4000, y: 0 }) });
    expect(getProjectRoof(unnamed.project, roofA.id).drains).toHaveLength(1);
  });
});

describe('the active roof (MR-2)', () => {
  it('starts unset and resolves to the first roof', () => {
    const { state, roofA } = twoRoofState();
    expect(state.editor.activeRoofId).toBeNull();
    expect(state.entities.roofSystem.id).toBe(roofA.id);
  });

  it('follows every selection of a roof, and the entity slices follow it', () => {
    const { state, roofB } = twoRoofState();
    const selected = floorplanReducer(state, { type: 'SELECT_OBJECT', id: roofB.id, objectType: 'roofSystem' });
    expect(selected.editor.activeRoofId).toBe(roofB.id);
    expect(selected.entities.roofSystem.id).toBe(roofB.id);
    expect(selected.entities.drains).toBe(getProjectRoof(selected.project, roofB.id).drains);

    // Selecting anything else, or nothing, leaves the active roof where it is.
    const deselected = floorplanReducer(selected, { type: 'DESELECT' });
    expect(deselected.editor.activeRoofId).toBe(roofB.id);
    const otherSelection = floorplanReducer(deselected, { type: 'SELECT_OBJECT', id: 'x', objectType: 'drain' });
    expect(otherSelection.editor.activeRoofId).toBe(roofB.id);
    // A tool or target switch clears the selection, not the active roof.
    const targeted = floorplanReducer(otherSelection, { type: 'SET_MODEL_TARGET', modelTarget: 'roof' });
    expect(targeted.editor.activeRoofId).toBe(roofB.id);
  });

  it('is set directly by SET_ACTIVE_ROOF, which is a no-op when unchanged', () => {
    const { state, roofA, roofB } = twoRoofState();
    const active = floorplanReducer(state, { type: 'SET_ACTIVE_ROOF', roofId: roofB.id });
    expect(active.entities.roofSystem.id).toBe(roofB.id);
    expect(floorplanReducer(active, { type: 'SET_ACTIVE_ROOF', roofId: roofB.id })).toBe(active);
    const back = floorplanReducer(active, { type: 'SET_ACTIVE_ROOF', roofId: roofA.id });
    expect(back.entities.roofSystem.id).toBe(roofA.id);
  });

  it('falls back to the first roof when the active one is deleted, with no cleanup', () => {
    const { state, roofA, roofB } = twoRoofState();
    const active = floorplanReducer(state, { type: 'SELECT_OBJECT', id: roofB.id, objectType: 'roofSystem' });
    const deleted = floorplanReducer(active, { type: 'ROOF_DELETE', roofId: roofB.id });
    expect(deleted.editor.activeRoofId).toBe(roofB.id);
    expect(deleted.entities.roofSystem.id).toBe(roofA.id);
    // Undo brings B back, and with it the roof the workspace was on.
    const undone = floorplanReducer(deleted, { type: 'UNDO' });
    expect(undone.entities.roofSystem.id).toBe(roofB.id);
  });

  it('keeps the entity slices when the active roof did not move', () => {
    const { state } = twoRoofState();
    const panned = floorplanReducer(state, { type: 'TOGGLE_SNAP' });
    expect(panned.entities).toBe(state.entities);
  });

  it('is forgotten when another project is opened', () => {
    const { state, roofB } = twoRoofState();
    const active = floorplanReducer(state, { type: 'SET_ACTIVE_ROOF', roofId: roofB.id });
    const loaded = floorplanReducer(active, { type: 'PROJECT_LOAD', project: createProject('Other') });
    expect(loaded.editor.activeRoofId).toBeNull();
  });
});
