/**
 * The building keeps its identity through the store (docs/perf-pass-3.md D1.2).
 *
 * `syncCanonicalBuilding` runs on every commit, drag frames included. It used to
 * hand back a new `building` — and a new `building.systems`, which is in every
 * floor's 3D preview key — every time, so every floor of the preview was
 * rebuilt for a fixture nudged on one of them, and the lifecycle panel's forms
 * were remounted on every frame. Run through the real reducer on the playground
 * project (three storeys, two built on, a truss and a roof).
 */
import { describe, expect, it } from 'vitest';
import demoData from '@/pages/playground-demo.json';
import { deserializeProject } from '@/persistence/deserialize';
import { serializeProject } from '@/persistence/serialize';
import { BUILDING_COMMANDS } from '@/domain/buildingCommands';
import { buildPreviewScene } from '@/three/scene/buildPreviewScene';
import floorplanReducer, { initializeFloorplanState } from './floorplanReducer';

function loadState() {
  return initializeFloorplanState(deserializeProject(JSON.parse(JSON.stringify(demoData))).project);
}

function fixtureFloor(project) {
  return project.floors.find((floor) => (floor.fixtures || []).length);
}

function columnFloor(project) {
  return project.floors.find((floor) => (floor.columns || []).length);
}

/** Drags with `frame(state, i)` for `frames` frames and reports what each commit changed. */
function drag(state, frame, frames = 12) {
  const memo = {};
  let scene = buildPreviewScene(state.project, { memo });
  let current = floorplanReducer(state, { type: 'BEGIN_DRAG_GESTURE' });
  const commits = [];
  for (let index = 1; index <= frames; index += 1) {
    const next = floorplanReducer(current, frame(current, index));
    expect(next.project).not.toBe(current.project);
    const nextScene = buildPreviewScene(next.project, { memo });
    commits.push({
      building: next.project.building !== current.project.building,
      systems: next.project.building.systems !== current.project.building.systems,
      // A floor the descriptor memo handed back keeps its `objects` array.
      rebuiltFloors: nextScene.floors
        .filter(
          (descriptor) =>
            descriptor.objects !== scene.floors.find((entry) => entry.floorId === descriptor.floorId)?.objects,
        )
        .map((descriptor) => descriptor.floorId),
    });
    scene = nextScene;
    current = next;
  }
  return { state: floorplanReducer(current, { type: 'END_DRAG_GESTURE' }), commits };
}

const shaftCommand = (project) => ({
  type: 'EXECUTE_BUILDING_COMMAND',
  command: {
    type: BUILDING_COMMANDS.CONFIGURE_PLUMBING_SHAFT,
    shaftId: 'shaft_identity',
    name: 'Shaft',
    origin: { x: 0, y: 0 },
    width: 600,
    depth: 800,
    servedFloorIds: project.floors.map((floor) => floor.id),
    maxFixtureDistance: 2500,
  },
});

describe('the building through a plan drag', () => {
  it('a fixture drag keeps the building, and rebuilds only the dragged floor in the preview', () => {
    const state = loadState();
    const floor = fixtureFloor(state.project);
    const fixture = floor.fixtures[0];
    const { state: settled, commits } = drag(state, (current, index) => ({
      type: 'FIXTURE_UPDATE',
      floorId: floor.id,
      fixture: { id: fixture.id, x: fixture.x + index * 10 },
    }));

    expect(commits.every((commit) => !commit.building && !commit.systems)).toBe(true);
    // From the second commit on. The first one also rebuilds the roof's floor
    // and the roof: the truss sync is not yet settled on a freshly loaded
    // project (its end closures' `colour.solarAbsorptance` goes null -> 0 on
    // the second pass), which is the truss system's own key, not the building.
    expect(
      commits.slice(1).every((commit) => commit.rebuiltFloors.length === 1 && commit.rebuiltFloors[0] === floor.id),
    ).toBe(true);
    expect(settled.project.building).toBe(state.project.building);
  });

  it('a column drag (a building command per frame) keeps the building too', () => {
    const state = loadState();
    const floor = columnFloor(state.project);
    const column = floor.columns[0];
    const { state: settled, commits } = drag(state, (current, index) => ({
      type: 'COLUMN_UPDATE',
      floorId: floor.id,
      column: { id: column.id, x: column.x + index * 5 },
    }));

    expect(commits.every((commit) => !commit.systems)).toBe(true);
    expect(settled.project.building.systems).toBe(state.project.building.systems);
    expect(settled.project.floors.find((entry) => entry.id === floor.id).columns[0].x).toBe(column.x + 60);
  });

  it('saves the dragged project exactly as a project synced from scratch', () => {
    const state = loadState();
    const floor = fixtureFloor(state.project);
    const fixture = floor.fixtures[0];
    const { state: settled } = drag(state, (current, index) => ({
      type: 'FIXTURE_UPDATE',
      floorId: floor.id,
      fixture: { id: fixture.id, x: fixture.x + index * 10 },
    }));
    // The same project loaded afresh: nothing of the old building to reuse.
    const reloaded = initializeFloorplanState(
      deserializeProject(JSON.parse(JSON.stringify(serializeProject(settled.project)))).project,
    );
    expect(JSON.stringify(serializeProject(settled.project).data.building)).toBe(
      JSON.stringify(serializeProject(reloaded.project).data.building),
    );
  });
});

describe('the building through undo, redo and load', () => {
  it('a command that changes the systems swaps them, and undo and redo swap them back', () => {
    const state = loadState();
    const before = state.project.building;
    const changed = floorplanReducer(state, shaftCommand(state.project));
    expect(changed.derived.lastCommand.ok).toBe(true);
    const after = changed.project.building;

    expect(after.systems).not.toBe(before.systems);
    expect(after.systems.plumbing).not.toBe(before.systems.plumbing);
    // Only what the command touched is new.
    expect(after.systems.structural).toBe(before.systems.structural);
    expect(after.systems.electrical).toBe(before.systems.electrical);
    expect(after.site).toBe(before.site);
    expect(after.spaceProgram).toBe(before.spaceProgram);

    const undone = floorplanReducer(changed, { type: 'UNDO' });
    expect(undone.project.building.systems).toBe(before.systems);
    const redone = floorplanReducer(undone, { type: 'REDO' });
    expect(redone.project.building.systems).toBe(after.systems);
  });

  it('an edit that does not touch the building leaves undo with the same building', () => {
    const state = loadState();
    const floor = fixtureFloor(state.project);
    const fixture = floor.fixtures[0];
    const moved = floorplanReducer(state, {
      type: 'FIXTURE_UPDATE',
      floorId: floor.id,
      fixture: { id: fixture.id, x: fixture.x + 100 },
    });
    expect(moved.project.building).toBe(state.project.building);
    expect(floorplanReducer(moved, { type: 'UNDO' }).project.building).toBe(state.project.building);
  });

  it('a loaded project brings its own building', () => {
    const state = loadState();
    const loaded = floorplanReducer(state, {
      type: 'PROJECT_LOAD',
      project: deserializeProject(JSON.parse(JSON.stringify(demoData))).project,
    });
    expect(loaded.project.building).not.toBe(state.project.building);
    expect(loaded.project.building.systems).not.toBe(state.project.building.systems);
    expect(loaded.project.building.site).not.toBe(state.project.building.site);
  });
});
