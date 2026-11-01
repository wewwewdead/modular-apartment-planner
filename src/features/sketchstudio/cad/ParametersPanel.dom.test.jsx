// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import ExpressionInput, { ParameterContext } from './ExpressionInput.jsx';
import { ValueField } from './CadEditors.jsx';
import { DesignParametersForm, ParametersPanel } from './ParametersPanel.jsx';
import { emptyModel } from './model.js';

afterEach(cleanup);

function Field({ onKey }) {
  const [value, setValue] = useState('');
  return <ExpressionInput aria-label="Length" value={value} onChange={setValue} onKeyDown={onKey} />;
}
const context = { names: ['width', 'wall', 't', 'toe'], values: { width: 900, wall: 2, t: 18, toe: 100 } };
const type = (input, text) => {
  fireEvent.change(input, { target: { value: text, selectionStart: text.length } });
};

it('opens on "=", filters as you type, and inserts with arrows + Enter or Tab', () => {
  const onKey = vi.fn();
  render(
    <ParameterContext.Provider value={context}>
      <Field onKey={onKey} />
    </ParameterContext.Provider>,
  );
  const input = screen.getByLabelText('Length');
  type(input, '=');
  expect(screen.getAllByRole('option').map((o) => o.firstChild.textContent)).toEqual(['t', 'toe', 'wall', 'width']);
  type(input, '=w');
  expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['wall2', 'width900']);
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(input.value).toBe('=width');
  expect(onKey).not.toHaveBeenCalled();
  type(input, '=width-2*t');
  // "t" is already complete: Tab is not swallowed by the dropdown.
  fireEvent.keyDown(input, { key: 'Tab' });
  expect(input.value).toBe('=width-2*t');
  expect(onKey).toHaveBeenCalledTimes(1);
  type(input, '=width-2*to');
  fireEvent.keyDown(input, { key: 'Tab' });
  expect(input.value).toBe('=width-2*toe');
  type(input, '=w');
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(screen.queryByRole('listbox')).toBeNull();
  type(input, '120');
  expect(screen.queryByRole('listbox')).toBeNull();
});

it('gives ValueField the same autocomplete and keeps the expression it stores', () => {
  const onChange = vi.fn();
  render(
    <ParameterContext.Provider value={context}>
      <ValueField label="Distance (mm)" value={18} onChange={onChange} />
    </ParameterContext.Provider>,
  );
  const input = screen.getByLabelText('Distance (mm)');
  type(input, '=t');
  expect(screen.getByRole('listbox')).toBeTruthy();
  fireEvent.keyDown(input, { key: 'Enter' }); // "t" complete → Enter commits (blur)
  fireEvent.blur(input);
  // Phase L: the commit carries its meta ({ live: false, session }).
  expect(onChange).toHaveBeenCalledWith('=t', expect.objectContaining({ live: false }));
});

function Panel({ initial, onCommit = () => {} }) {
  const [model, setModel] = useState(initial);
  return (
    <ParametersPanel
      model={model}
      onCommit={(next) => {
        onCommit(next);
        setModel(next);
      }}
      onDesign={() => {}}
    />
  );
}

it('adds rows Name → Value → next Name with Enter, and Esc cancels', () => {
  const onCommit = vi.fn();
  render(
    <Panel initial={{ ...emptyModel(), parameters: [{ id: 'w', name: 'width', value: 800 }] }} onCommit={onCommit} />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Add parameter' }));
  let name = screen.getByLabelText('New parameter name');
  expect(document.activeElement).toBe(name);
  fireEvent.change(name, { target: { value: '2bad' } });
  fireEvent.keyDown(name, { key: 'Enter' });
  expect(screen.getByRole('alert').textContent).toMatch(/letters, digits/);
  fireEvent.change(name, { target: { value: 't' } });
  fireEvent.keyDown(name, { key: 'Enter' });
  const value = screen.getByLabelText('New parameter value');
  expect(document.activeElement).toBe(value);
  type(value, '18');
  fireEvent.keyDown(value, { key: 'Enter' });
  expect(onCommit).toHaveBeenCalledTimes(1);
  expect(onCommit.mock.calls[0][0].parameters.map((p) => [p.name, p.value])).toEqual([
    ['width', 800],
    ['t', 18],
  ]);
  // A fresh row is ready for the next name; Esc cancels it.
  name = screen.getByLabelText('New parameter name');
  expect(name.value).toBe('');
  expect(document.activeElement).toBe(name);
  fireEvent.keyDown(name, { key: 'Escape' });
  expect(screen.queryByLabelText('New parameter name')).toBeNull();
  expect(screen.getByLabelText('t resolved').textContent).toBe('18');
  // Existing rows: Enter on the value moves to the next row's name.
  const width = screen.getByLabelText('width');
  type(width, '=t*50');
  fireEvent.keyDown(width, { key: 'Enter' });
  expect(screen.getByLabelText('width resolved').textContent).toBe('900');
  expect(document.activeElement).toBe(screen.getByLabelText('Name of parameter 2'));
});

it('renames inline, refuses a used delete and replaces uses with the number', () => {
  render(
    <Panel
      initial={{
        ...emptyModel(),
        parameters: [
          { id: 't', name: 't', value: 18 },
          { id: 'g', name: 'shelfGap', value: '=t+2' },
        ],
      }}
    />,
  );
  const name = screen.getByLabelText('Name of parameter 2');
  fireEvent.change(name, { target: { value: 'pin Inset' } });
  fireEvent.keyDown(name, { key: 'Enter' });
  expect(screen.getByRole('alert').textContent).toMatch(/letters, digits/);
  fireEvent.change(name, { target: { value: 'pinInset' } });
  fireEvent.keyDown(name, { key: 'Enter' });
  expect(screen.getByLabelText('pinInset resolved').textContent).toBe('20');
  fireEvent.click(screen.getByRole('button', { name: 'Delete t' }));
  expect(screen.getByRole('alert').textContent).toMatch(/t is used by 1 value\./);
  fireEvent.click(screen.getByRole('button', { name: 'Replace uses with number' }));
  expect(screen.queryByLabelText('t')).toBeNull();
  expect(screen.getByLabelText('pinInset').value).toBe('20');
});

it('applies a design preset with edited values and the chosen snap, building by default', () => {
  const onApply = vi.fn(() => '');
  render(<DesignParametersForm model={emptyModel()} snap={1} onApply={onApply} onCancel={() => {}} />);
  expect(screen.getByLabelText('Preset').value).toBe('cabinet');
  const build = screen.getByLabelText('Build the starter model from these parameters');
  expect(build.checked).toBe(true);
  type(screen.getByLabelText('width value'), '900');
  fireEvent.change(screen.getByLabelText('Default snap (mm)'), { target: { value: '5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply & build' }));
  const [entries, snap, preset] = onApply.mock.calls[0];
  expect(entries.map((e) => [e.name, e.value])).toEqual([
    ['width', 900],
    ['depth', 500],
    ['height', 1800],
    ['t', 18],
    ['backT', 12],
    ['toe', 100],
  ]);
  expect(snap).toBe(5);
  expect(preset).toBe('cabinet');
  // Unticked: parameters only.
  fireEvent.click(build);
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(onApply.mock.calls[1][2]).toBeNull();
  // Custom has no starter model and no checkbox.
  fireEvent.change(screen.getByLabelText('Preset'), { target: { value: 'custom' } });
  expect(screen.queryByLabelText('Preset name 1')).toBeNull();
  expect(screen.queryByLabelText('Build the starter model from these parameters')).toBeNull();
  expect(screen.getByRole('button', { name: 'Apply' })).toBeTruthy();
});

it('never builds into a model that already has parts', () => {
  const onApply = vi.fn(() => '');
  const model = { ...emptyModel(), parts: [{ id: 'p', name: 'Existing', features: [] }] };
  render(<DesignParametersForm model={model} snap={1} onApply={onApply} onCancel={() => {}} />);
  const build = screen.getByLabelText('Build the starter model from these parameters');
  expect(build.checked).toBe(false);
  expect(build.disabled).toBe(true);
  expect(screen.getByText(/Model already has parts/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(onApply.mock.calls[0][2]).toBeNull();
});

it('highlights the row whose change broke the rebuild, and rows that cannot resolve', () => {
  const model = {
    ...emptyModel(),
    parameters: [
      { id: 'w', name: 'width', value: 900 },
      { id: 'x', name: 'x', value: '=missing*2' },
    ],
  };
  render(<ParametersPanel model={model} onCommit={() => {}} onDesign={() => {}} failingId="w" />);
  const width = screen.getByRole('group', { name: 'Parameter width' });
  expect(width.className).toContain('is-failing');
  expect(width.textContent).toContain('The model failed to rebuild after this change.');
  const x = screen.getByRole('group', { name: 'Parameter x' });
  expect(x.className).toContain('is-failing');
  expect(screen.getByLabelText('x resolved').textContent).toBe('Unknown parameter "missing"');
});
