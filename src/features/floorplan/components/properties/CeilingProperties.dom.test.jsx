// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createCeiling } from '@/domain/ceilingModels';
import { createFloor } from '@/domain/models';
import CeilingProperties from './CeilingProperties';

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
  window.localStorage.clear();
});

function type(input, text) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, text);
  act(() => input.dispatchEvent(new Event('input', { bubbles: true })));
}

function click(node) {
  act(() => node.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}

function findByText(selector, text) {
  return [...container.querySelectorAll(selector)].find((node) => node.textContent.trim() === text) || null;
}

// A closed section renders no body at all, so the control inside one has to be
// unfolded before it can be clicked.
function openSection(title) {
  const head = [...container.querySelectorAll('button')].find((node) => node.textContent.includes(title));
  click(head);
  return head;
}

function mount(ceilingOptions = {}, props = {}) {
  const floor = createFloor('Ground Floor', 0);
  const ceiling = createCeiling('Kitchen Ceiling', {
    floorId: floor.id,
    boundaryPolygon: [
      { x: 0, y: 0 },
      { x: 6000, y: 0 },
      { x: 6000, y: 4000 },
      { x: 0, y: 4000 },
    ],
    baseElevation: 2700,
    ...ceilingOptions,
  });
  const project = { floors: [floor], ceilings: [ceiling] };
  const actions = [];
  const editorActions = [];

  container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() =>
    root.render(
      <CeilingProperties
        ceiling={ceiling}
        project={project}
        floor={floor}
        dispatch={(action) => actions.push(action)}
        editorDispatch={(action) => editorActions.push(action)}
        u={u}
        {...props}
      />,
    ),
  );

  return { ceiling, floor, actions, editorActions };
}

describe('CeilingProperties', () => {
  it('reads the ceiling off the model — extent, datum and assembly', () => {
    mount();

    expect(container.textContent).toContain('Ground Floor');
    expect(container.textContent).toContain('6000');
    expect(container.textContent).toContain('4000');
    expect(container.textContent).toContain('24.00');
    expect(container.textContent).toContain('Board underside');
    expect(container.textContent).toContain('Manual datum');
    expect(container.textContent).toContain('Boarded');
    expect(container.textContent).toContain('Generic Fiber-cement ceiling board');
    expect(container.textContent).toContain('Light fixtures');
  });

  it('keeps every derived value out of an input box', () => {
    mount();

    // The name is the only thing on this ceiling the panel can change.
    expect(container.querySelectorAll('input')).toHaveLength(1);
    expect(container.querySelector('input').type).toBe('text');
  });

  it('sends the plan through to the assembly editor for this ceiling', () => {
    const { ceiling, editorActions } = mount();

    click(findByText('button', 'Open assembly editor'));

    expect(editorActions).toContainEqual({ type: 'OPEN_CEILING_DETAIL_EDITOR', ceilingId: ceiling.id });
  });

  it('commits a renamed ceiling by id alone, so the shallow merge keeps the rest', () => {
    const { ceiling, actions } = mount();

    type(container.querySelector('input'), 'Lobby ceiling');

    expect(actions).toEqual([{ type: 'CEILING_UPDATE', ceiling: { id: ceiling.id, name: 'Lobby ceiling' } }]);
  });

  it('hides the boards in the 3D preview without touching the ceiling', () => {
    const { ceiling, actions, editorActions } = mount();

    openSection('3D view');
    click(findByText('button', 'Hidden'));

    expect(editorActions).toContainEqual({
      type: 'SET_CEILING_BOARD_VISIBILITY',
      ceilingId: ceiling.id,
      hidden: true,
    });
    // A viewing state: nothing about the ceiling itself has changed.
    expect(actions).toEqual([]);
  });

  it('puts the boards back', () => {
    const { ceiling, editorActions } = mount({ id: 'ceiling_shown' }, { hiddenCeilingBoards: { ceiling_shown: true } });

    openSection('3D view');
    click(findByText('button', 'Shown'));

    expect(editorActions).toContainEqual({
      type: 'SET_CEILING_BOARD_VISIBILITY',
      ceilingId: ceiling.id,
      hidden: false,
    });
  });

  it('says which way round it is while the section is folded', () => {
    mount({ id: 'ceiling_shown' }, { hiddenCeilingBoards: { ceiling_shown: true } });

    expect(container.textContent).toContain('Boards hidden');
  });

  it('renders nothing when the selection outlived its ceiling', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() =>
      root.render(
        <CeilingProperties
          ceiling={null}
          project={{ floors: [], ceilings: [] }}
          floor={null}
          dispatch={() => {}}
          editorDispatch={() => {}}
          u={u}
        />,
      ),
    );

    expect(container.innerHTML).toBe('');
  });
});
