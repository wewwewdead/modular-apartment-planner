// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, useReducer } from 'react';
import { createRoot } from 'react-dom/client';
import { createProject } from '@/domain/models';
import floorplanReducer, { initializeFloorplanState } from '../store/floorplanReducer';
import ProjectSummary from './properties/ProjectSummary';
import { ProjectNameInput } from './Sidebar';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container = null;
let root = null;

function mount(element) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(element));
  return container;
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;

function typeText(input, text) {
  for (const character of text) {
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: character, bubbles: true })));
    nativeSetter.call(input, input.value + character);
    act(() =>
      input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: character })),
    );
  }
}

function press(input, key) {
  act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
}

/** The live store, with every dispatch recorded on its way in. */
function StoreHarness({ actions, render }) {
  const [state, dispatch] = useReducer(floorplanReducer, createProject('Plan'), initializeFloorplanState);
  const recordingDispatch = (action) => {
    actions.push(action);
    dispatch(action);
  };
  return render(state, recordingDispatch);
}

function mountSummary(actions, states) {
  return mount(
    <StoreHarness
      actions={actions}
      render={(state, dispatch) => {
        states.push(state);
        return <ProjectSummary project={state.project} floor={null} dispatch={dispatch} />;
      }}
    />,
  );
}

function fieldInput(node, label) {
  const field = [...node.querySelectorAll('label')].find((entry) => entry.textContent === label).parentElement;
  return field.querySelector('input');
}

describe('project text fields', () => {
  it('commits a typed project name once, on blur, as one undo step', () => {
    const actions = [];
    const states = [];
    const node = mountSummary(actions, states);
    const input = fieldInput(node, 'Name');

    act(() => input.focus());
    typeText(input, ' Tower B21'); // ten characters
    // The box shows every character while nothing has been dispatched.
    expect(input.value).toBe('Plan Tower B21');
    expect(actions).toEqual([]);

    act(() => input.blur());
    expect(actions).toEqual([{ type: 'PROJECT_SET_NAME', name: 'Plan Tower B21' }]);
    const settled = states[states.length - 1];
    expect(settled.project.name).toBe('Plan Tower B21');
    expect(settled.history).toHaveLength(1);
  });

  it('commits the address and Drawn By on Enter, and reverts on Escape', () => {
    const actions = [];
    const node = mountSummary(actions, []);
    const address = fieldInput(node, 'Address');
    const drawnBy = fieldInput(node, 'Drawn By');

    act(() => address.focus());
    typeText(address, '12 Lot');
    press(address, 'Enter');
    expect(actions).toEqual([{ type: 'PROJECT_UPDATE', updates: { address: '12 Lot' } }]);

    act(() => drawnBy.focus());
    typeText(drawnBy, 'JM');
    press(drawnBy, 'Escape');
    expect(drawnBy.value).toBe('');
    act(() => drawnBy.blur());
    expect(actions).toHaveLength(1);
  });

  it('commits nothing when the field is left untouched', () => {
    const actions = [];
    const node = mountSummary(actions, []);
    const input = fieldInput(node, 'Name');

    act(() => input.focus());
    press(input, 'Enter');
    act(() => input.blur());
    expect(actions).toEqual([]);
  });

  it('commits the sidebar project name once', () => {
    const actions = [];
    const node = mount(
      <StoreHarness
        actions={actions}
        render={(state, dispatch) => <ProjectNameInput name={state.project.name} dispatch={dispatch} />}
      />,
    );
    const input = node.querySelector('input');

    act(() => input.focus());
    typeText(input, ' 1234567');
    expect(input.value).toBe('Plan 1234567');
    expect(actions).toEqual([]);
    act(() => input.blur());
    expect(actions).toEqual([{ type: 'PROJECT_SET_NAME', name: 'Plan 1234567' }]);
    expect(input.value).toBe('Plan 1234567');
  });
});
