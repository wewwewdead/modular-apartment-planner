import { describe, expect, it } from 'vitest';
import { BUILDING_COMMANDS } from '@/domain/buildingCommands';
import { createColumn, createProject } from '@/domain/models';
import floorplanReducer, { initializeFloorplanState } from './floorplanReducer';

function stateWithSupports() {
  let state = initializeFloorplanState(createProject('Reducer Commands'));
  const floorId = state.project.floors[0].id;
  const first = { ...createColumn(0, 0), id: 'c1' };
  const second = { ...createColumn(4000, 0), id: 'c2' };
  state = floorplanReducer(state, { type: 'COLUMN_ADD', floorId, column: first });
  state = floorplanReducer(state, { type: 'COLUMN_ADD', floorId, column: second });
  return { state, floorId };
}

describe('EXECUTE_BUILDING_COMMAND reducer seam', () => {
  it('commits a complete rectangular site workflow as one undoable change', () => {
    const { state } = stateWithSupports();
    const next = floorplanReducer(state, {
      type: 'EXECUTE_BUILDING_COMMAND',
      command: {
        type: BUILDING_COMMANDS.CONFIGURE_RECTANGULAR_SITE,
        width: 12000,
        depth: 20000,
        frontEdgeIndex: 0,
        roadName: 'Access Road',
        setbacks: { front: 3000, rear: 2000, left: 1000, right: 1000 },
      },
    });

    expect(next.history).toHaveLength(state.history.length + 1);
    expect(next.derived.siteFeasibility.areaLedger).toMatchObject({
      lotArea: { value: 240000000 },
      buildableArea: { value: 150000000 },
    });
    expect(next.derived.lastCommand).toMatchObject({
      ok: true,
      commandType: BUILDING_COMMANDS.CONFIGURE_RECTANGULAR_SITE,
      undoAvailable: true,
    });

    const undone = floorplanReducer(next, { type: 'UNDO' });
    expect(undone.project.building.site.boundary).toEqual([]);
    expect(undone.derived.siteFeasibility.areaLedger.lotArea.value).toBeNull();
  });

  it('keeps the site feasibility model derived and outside persisted project data', () => {
    const { state } = stateWithSupports();
    const next = floorplanReducer(state, {
      type: 'EXECUTE_BUILDING_COMMAND',
      command: {
        type: BUILDING_COMMANDS.DEFINE_PROPERTY_BOUNDARY,
        boundaryId: 'property_1',
        boundary: [
          { x: 0, y: 0 },
          { x: 10000, y: 0 },
          { x: 10000, y: 20000 },
          { x: 0, y: 20000 },
        ],
      },
    });

    expect(next.derived.siteFeasibility.areaLedger.lotArea.value).toBe(200000000);
    expect(next.derived.validationIssues).toContainEqual(
      expect.objectContaining({ ruleId: 'SITE.SETBACKS_INCOMPLETE' }),
    );
    expect(next.project.areaLedger).toBeUndefined();
    expect(next.project.building.site.buildableEnvelope).toEqual([]);
  });

  it('commits one command as one undoable history entry with transient consequences', () => {
    const { state, floorId } = stateWithSupports();
    const next = floorplanReducer(state, {
      type: 'EXECUTE_BUILDING_COMMAND',
      command: {
        type: BUILDING_COMMANDS.CREATE_BEAM_BETWEEN_SUPPORTS,
        beamId: 'beam_1',
        floorId,
        startColumnId: 'c1',
        endColumnId: 'c2',
      },
    });

    expect(next.project.floors[0].beams).toHaveLength(1);
    expect(next.history).toHaveLength(state.history.length + 1);
    expect(next.derived.validationIssues).toEqual([]);
    expect(next.derived.lastCommand).toMatchObject({
      ok: true,
      commandType: BUILDING_COMMANDS.CREATE_BEAM_BETWEEN_SUPPORTS,
      undoAvailable: true,
    });

    const undone = floorplanReducer(next, { type: 'UNDO' });
    expect(undone.project.floors[0].beams).toEqual([]);
    expect(undone.derived.validationIssues).toEqual([]);
  });

  it('keeps a rejected command as a true project no-op', () => {
    const { state, floorId } = stateWithSupports();
    const next = floorplanReducer(state, {
      type: 'EXECUTE_BUILDING_COMMAND',
      command: {
        type: BUILDING_COMMANDS.CREATE_BEAM_BETWEEN_SUPPORTS,
        beamId: 'beam_bad',
        floorId,
        startColumnId: 'c1',
        endColumnId: 'missing',
      },
    });

    expect(next.project).toBe(state.project);
    expect(next.history).toBe(state.history);
    expect(next.changeVersion).toBe(state.changeVersion);
    expect(next.derived.lastCommand).toMatchObject({
      ok: false,
      error: { code: 'beam-support-not-found' },
    });
  });

  it('routes the existing beam and column editor actions through commands', () => {
    const { state, floorId } = stateWithSupports();
    const moved = floorplanReducer(state, {
      type: 'COLUMN_UPDATE',
      floorId,
      column: { id: 'c1', x: 100, y: 0 },
    });
    expect(moved.derived.lastCommand).toMatchObject({ ok: true, commandType: BUILDING_COMMANDS.MOVE_COLUMN });
    expect(moved.derived.validationIssues).toContainEqual(
      expect.objectContaining({ ruleId: 'STRUCT.COLUMN_STACK_MISALIGNED' }),
    );

    const withBeam = floorplanReducer(moved, {
      type: 'BEAM_ADD',
      floorId,
      beam: {
        id: 'beam_routed',
        startRef: { kind: 'column', id: 'c1' },
        endRef: { kind: 'column', id: 'c2' },
        width: 250,
        depth: 450,
        floorLevel: 3000,
        placementRole: 'roof_ring',
      },
    });
    expect(withBeam.project.floors[0].beams).toHaveLength(1);
    expect(withBeam.project.floors[0].beams[0]).toMatchObject({
      floorLevel: 3000,
      placementRole: 'roof_ring',
    });
    expect(withBeam.derived.lastCommand).toMatchObject({
      ok: true,
      commandType: BUILDING_COMMANDS.CREATE_BEAM_BETWEEN_SUPPORTS,
    });
  });
});
