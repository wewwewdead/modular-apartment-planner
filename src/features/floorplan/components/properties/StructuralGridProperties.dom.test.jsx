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
});
