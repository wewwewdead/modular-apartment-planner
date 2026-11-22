// @vitest-environment jsdom
/**
 * The lifecycle panel's stage forms against the store's building identity
 * (docs/perf-pass-3.md D1.2).
 *
 * Each stage form is keyed on identity tokens of the `building` slices it seeds
 * from, and remounts — re-taking its seed — when one of them is a new object.
 * While every commit rebuilt the whole building, every commit (every frame of a
 * plan drag) was such a remount: a half-typed field lost its text. Now the key
 * moves only when its slice does: an accepted command, its undo and redo, and a
 * project load still reseed; a fixture nudged on the plan does not.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import demoData from '@/pages/playground-demo.json';
import { deserializeProject } from '@/persistence/deserialize';
import { BUILDING_COMMANDS } from '@/domain/buildingCommands';
import ProjectLifecyclePanel from '@/features/floorplan/components/ProjectLifecyclePanel';
import floorplanReducer, { initializeFloorplanState } from './floorplanReducer';

const FIELD = 'Lambda electrical riser width';

let container = null;
let root = null;

afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
  container = null;
  root = null;
});

function loadProject() {
  return deserializeProject(JSON.parse(JSON.stringify(demoData))).project;
}

function render(state) {
  act(() =>
    root.render(
      <ProjectLifecyclePanel
        project={state.project}
        derived={state.derived}
        activeStage="systems"
        onStageChange={() => {}}
        onExecuteCommand={() => {}}
      />,
    ),
  );
  return container.querySelector(`[aria-label="${FIELD}"]`);
}

function mount(state) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  return render(state);
}

function type(input, text) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, text);
  act(() => input.dispatchEvent(new Event('input', { bubbles: true })));
}

function moveFixture(state, dx) {
  const floor = state.project.floors.find((entry) => (entry.fixtures || []).length);
  const fixture = floor.fixtures[0];
  return floorplanReducer(state, {
    type: 'FIXTURE_UPDATE',
    floorId: floor.id,
    fixture: { id: fixture.id, x: fixture.x + dx },
  });
}

const shaftCommand = (project) => ({
  type: 'EXECUTE_BUILDING_COMMAND',
  command: {
    type: BUILDING_COMMANDS.CONFIGURE_PLUMBING_SHAFT,
    shaftId: 'shaft_seed',
    name: 'Seed shaft',
    origin: { x: 0, y: 0 },
    width: 600,
    depth: 800,
    servedFloorIds: project.floors.map((floor) => floor.id),
    maxFixtureDistance: 2500,
  },
});

describe('lifecycle stage forms and the building identity', () => {
  it('keep a half-typed field through plan edits and a whole drag', () => {
    let state = initializeFloorplanState(loadProject());
    const field = mount(state);
    const seeded = field.value;
    type(field, '1.234');

    state = moveFixture(state, 100);
    expect(render(state)).toBe(field);
    state = floorplanReducer(state, { type: 'BEGIN_DRAG_GESTURE' });
    for (let frame = 1; frame <= 10; frame += 1) {
      state = moveFixture(state, 10);
      expect(render(state)).toBe(field);
    }
    state = floorplanReducer(state, { type: 'END_DRAG_GESTURE' });
    expect(render(state)).toBe(field);
    expect(field.value).toBe('1.234');
    expect(seeded).not.toBe('1.234');
  });

  it('reseed on an accepted systems command, its undo, its redo and a project load', () => {
    let state = initializeFloorplanState(loadProject());
    let field = mount(state);
    const seeded = field.value;
    type(field, '1.234');

    state = floorplanReducer(state, shaftCommand(state.project));
    expect(state.derived.lastCommand.ok).toBe(true);
    let next = render(state);
    expect(next).not.toBe(field);
    expect(next.value).toBe(seeded);

    field = next;
    type(field, '1.234');
    state = floorplanReducer(state, { type: 'UNDO' });
    next = render(state);
    expect(next).not.toBe(field);
    expect(next.value).toBe(seeded);

    field = next;
    type(field, '1.234');
    state = floorplanReducer(state, { type: 'REDO' });
    next = render(state);
    expect(next).not.toBe(field);
    expect(next.value).toBe(seeded);

    field = next;
    type(field, '1.234');
    state = floorplanReducer(state, { type: 'PROJECT_LOAD', project: loadProject() });
    next = render(state);
    expect(next).not.toBe(field);
    expect(next.value).toBe(seeded);
  });
});
