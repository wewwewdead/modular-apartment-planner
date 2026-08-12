// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BUILDING_COMMANDS } from '@/domain/buildingCommands';
import StructuralGridProperties from './StructuralGridProperties';

const u = {
  unit: 'mm',
  suffix: 'mm',
  step: (value) => value,
  toDisplay: (value) => value,
  fromDisplay: (value) => value,
};

let container = null;

afterEach(() => {
  container?.remove();
  container = null;
});

function type(input, text) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, text);
  act(() => input.dispatchEvent(new Event('input', { bubbles: true })));
}

/** Mirrors the store: an accepted transform comes back as the grid the panel reads. */
function mountPanel(commands) {
  function Harness() {
    const [grid, setGrid] = useState({ id: 'grid_1', name: 'Primary Grid', origin: { x: 0, y: 0 }, rotation: 0 });
    return (
      <StructuralGridProperties
        grid={grid}
        site={null}
        u={u}
        dispatch={(action) => {
          commands.push(action.command);
          setGrid((current) => ({ ...current, origin: action.command.origin, rotation: action.command.rotation }));
        }}
      />
    );
  }

  container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<Harness />));
  const [originX, originY, rotation] = container.querySelectorAll('input');
  return { originX, originY, rotation };
}

/** A grid with real axes, deliberately out of offset order in the array. */
function gridWithBays() {
  return {
    id: 'grid_1',
    name: 'Primary Grid',
    origin: { x: 0, y: 0 },
    rotation: 0,
    axes: [
      { id: 'x1', label: '1', orientation: 'vertical', offset: 0 },
      { id: 'x3', label: '3', orientation: 'vertical', offset: 10000 },
      { id: 'x2', label: '2', orientation: 'vertical', offset: 4000 },
      { id: 'y2', label: 'B', orientation: 'horizontal', offset: 5000 },
      { id: 'y1', label: 'A', orientation: 'horizontal', offset: 0 },
    ],
  };
}

function mountGrid(grid, commands) {
  container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() =>
    root.render(
      <StructuralGridProperties grid={grid} site={null} u={u} dispatch={(action) => commands.push(action.command)} />,
    ),
  );
  const labels = [...container.querySelectorAll('label')].map((node) => node.textContent);
  const inputs = [...container.querySelectorAll('input')];
  return { labels, input: (label) => inputs[labels.indexOf(label)] };
}

describe('StructuralGridProperties', () => {
  it('lands a typed rotation on the grid, negative angles included', () => {
    const commands = [];
    const { rotation } = mountPanel(commands);

    type(rotation, '');
    type(rotation, '-3');
    type(rotation, '-30');

    expect(commands).toHaveLength(2);
    expect(commands[1]).toMatchObject({
      type: BUILDING_COMMANDS.TRANSFORM_STRUCTURAL_GRID,
      gridId: 'grid_1',
      rotation: -30,
    });
    expect(rotation.value).toBe('-30');
  });

  it('moves the origin on the edited axis only', () => {
    const commands = [];
    const { originX, originY } = mountPanel(commands);

    type(originX, '2400');
    type(originY, '-800');

    expect(commands[1]).toMatchObject({
      type: BUILDING_COMMANDS.TRANSFORM_STRUCTURAL_GRID,
      origin: { x: 2400, y: -800 },
      rotation: 0,
    });
  });

  it('commands nothing while the field is empty, and keeps it empty to type into', () => {
    const commands = [];
    const { originX } = mountPanel(commands);

    type(originX, '');

    expect(commands).toHaveLength(0);
    expect(originX.value).toBe('');
  });

  it('offers a field per bay, named and measured between the axes it spans', () => {
    const { labels, input } = mountGrid(gridWithBays(), []);

    expect(labels).toEqual(['Origin X', 'Origin Y', 'Rotation', '1 → 2', '2 → 3', 'A → B']);
    // Axis order comes from the offsets, not from the order they were stored.
    expect(input('1 → 2').value).toBe('4000');
    expect(input('2 → 3').value).toBe('6000');
    expect(input('A → B').value).toBe('5000');
    expect(container.textContent).toContain('Numbered axis bays');
    expect(container.textContent).toContain('Lettered axis bays');
  });

  it('sends the edited bay by index and orientation, not by axis', () => {
    const commands = [];
    const { input } = mountGrid(gridWithBays(), commands);

    type(input('2 → 3'), '7500');
    type(input('A → B'), '2500');

    expect(commands).toHaveLength(2);
    expect(commands[0]).toMatchObject({
      type: BUILDING_COMMANDS.SET_STRUCTURAL_GRID_BAY_SPACING,
      gridId: 'grid_1',
      orientation: 'vertical',
      bayIndex: 1,
      spacing: 7500,
    });
    expect(commands[1]).toMatchObject({
      type: BUILDING_COMMANDS.SET_STRUCTURAL_GRID_BAY_SPACING,
      orientation: 'horizontal',
      bayIndex: 0,
      spacing: 2500,
    });
  });

  it('holds back a bay distance that is not one yet', () => {
    const commands = [];
    const { input } = mountGrid(gridWithBays(), commands);
    const bay = input('1 → 2');

    // An emptied field does not parse, so nothing is committed — and it stays
    // empty, because it is the start of a number still being typed.
    type(bay, '');
    expect(bay.value).toBe('');

    // These parse, but a bay cannot be zero or negative wide, so the guard
    // holds them back and the field returns to the distance the bay really has.
    type(bay, '0');
    type(bay, '-500');

    expect(commands).toHaveLength(0);
    expect(bay.value).toBe('4000');
  });

  it('leaves out the bay fields for a direction that has no bay', () => {
    const grid = gridWithBays();
    const { labels } = mountGrid({ ...grid, axes: grid.axes.filter((axis) => axis.id !== 'y2') }, []);

    expect(labels).toEqual(['Origin X', 'Origin Y', 'Rotation', '1 → 2', '2 → 3']);
    expect(container.textContent).not.toContain('Lettered axis bays');
  });
});
