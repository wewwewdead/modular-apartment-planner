// @vitest-environment jsdom
// Cut's picker (docs/sketch-studio-cut-pick.md §4.2): every outline ready to
// cut ticked to cut, Select all / none and the count, quantities that stay
// while a row is unticked, a row that makes no blank, Cut on the laser's
// items, Already cut and its Open on the laser, Edit handing the state back.
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { CutFromSheetPanel, sheetMetalPart } from './ShopPanels.jsx';
import { emptyModel } from './model.js';

afterEach(() => cleanup());

const rect = (width, height) => ({ type: 'rectangle', width, height, origin: [0, 0] });
// Three outlines ready to cut, one not closed, one a part is cut from (two blanks of it).
function shopModel() {
  const tray = { ...sheetMetalPart({ sketchId: 'cut', stock: 'spcc', thickness: 1.5, name: 'Tray' }), id: 'tray' };
  return {
    ...emptyModel(),
    sketches: [
      { id: 'a', name: 'Base', plane: 'XY', profile: rect(300, 200) },
      { id: 'open', name: 'Open', plane: 'XY', profile: { type: 'path', start: [0, 0], segments: [], closed: false } },
      { id: 'b', name: 'Side', plane: 'XY', profile: rect(200, 100) },
      { id: 'cut', name: 'Tray outline', plane: 'XY', profile: rect(120, 80) },
      { id: 'c', name: 'Lid', plane: 'XY', origin: [500, 0, 0], profile: rect(150, 150) },
    ],
    parts: [tray],
    instances: [
      { id: 't1', partId: 'tray', name: '', position: [0, 0, 0], rotation: [0, 0, 0] },
      { id: 't2', partId: 'tray', name: '', position: [200, 0, 0], rotation: [0, 0, 0] },
    ],
  };
}
// The workspace holds the picker's state (cutOutline) and hands it to Edit's
// return (returnTo's outline); this stands in for it.
function Picker({ model, initial, onCreate, onEditOutline = null, onOpenPart = null }) {
  const [outline, setOutline] = useState(initial);
  return (
    <CutFromSheetPanel
      model={model}
      outline={outline}
      onOutline={setOutline}
      onCreate={onCreate}
      onEditOutline={onEditOutline && ((sketchId) => onEditOutline(sketchId, outline))}
      onOpenPart={onOpenPart}
    />
  );
}
const panel = () => screen.getByRole('region', { name: 'Cut from sheet' });
const rows = () => within(within(panel()).getByRole('list', { name: 'Outlines to cut' })).getAllByRole('listitem');
const names = () => rows().map((li) => li.querySelector('strong').textContent);
const box = (name) => within(panel()).getByRole('checkbox', { name: `Select ${name}` });
const count = () => within(panel()).getByLabelText('Selected outlines').textContent;
const figure = () => within(panel()).getByLabelText('Batch').textContent;
const primary = () => within(panel()).getByRole('button', { name: 'Cut on the laser' });
const commitNumber = (field, value) => {
  act(() => {
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: String(value) } });
  });
  act(() => fireEvent.blur(field));
};

it('lists every outline ready to cut, nothing selected, and keeps Cut on the laser off', () => {
  render(<Picker model={shopModel()} initial={{ kind: 'pick', selected: [] }} onCreate={vi.fn()} />);
  expect(within(panel()).getByText('Choose the outlines to cut, then the sheet stock.')).toBeTruthy();
  // Model order; the open line and the tray's outline are not here (Draw has the one, the other is cut).
  expect(names()).toEqual(['Base', 'Side', 'Lid']);
  expect(rows()[1].textContent).toContain('200 × 100 mm');
  expect(count()).toBe('0 of 3 selected');
  expect(figure()).toBe('0 blanks from 0 outlines');
  expect(primary().disabled).toBe(true);
  expect(within(panel()).queryByLabelText(/^Quantity of /)).toBeNull();
  expect(within(panel()).getByText(/^One sheet is one stock and thickness: every outline selected/)).toBeTruthy();
});

it('ticks, selects all and none, and keeps a quantity while its row is unticked', () => {
  render(<Picker model={shopModel()} initial={{ kind: 'pick', selected: [] }} onCreate={vi.fn()} />);
  act(() => fireEvent.click(box('Side')));
  expect(count()).toBe('1 of 3 selected');
  expect(rows()[1].className).toBe('is-picked');
  commitNumber(within(panel()).getByLabelText('Quantity of Side'), 3);
  expect(figure()).toBe('3 blanks from 1 outline');
  expect(primary().disabled).toBe(false);
  // Unticked: its quantity field goes, the figure drops it; ticked again, 3 is back.
  act(() => fireEvent.click(box('Side')));
  expect(within(panel()).queryByLabelText('Quantity of Side')).toBeNull();
  expect(figure()).toBe('0 blanks from 0 outlines');
  act(() => fireEvent.click(box('Side')));
  expect(within(panel()).getByLabelText('Quantity of Side').value).toBe('3');
  act(() => fireEvent.click(within(panel()).getByRole('button', { name: 'Select all' })));
  expect(count()).toBe('3 of 3 selected');
  expect(figure()).toBe('5 blanks from 3 outlines');
  expect(within(panel()).getByRole('button', { name: 'Select all' }).disabled).toBe(true);
  act(() => fireEvent.click(within(panel()).getByRole('button', { name: 'Select none' })));
  expect(count()).toBe('0 of 3 selected');
  expect(primary().disabled).toBe(true);
  expect(within(panel()).getByRole('button', { name: 'Select none' }).disabled).toBe(true);
});

it('says why a row makes no blank at this stock and will not tick it', () => {
  render(<Picker model={shopModel()} initial={{ kind: 'pick', selected: ['a'], thickness: 0 }} onCreate={vi.fn()} />);
  expect(rows().map((li) => li.querySelector('[role="note"]')?.textContent)).toEqual([
    'Sheet thickness must be greater than zero.',
    'Sheet thickness must be greater than zero.',
    'Sheet thickness must be greater than zero.',
  ]);
  expect(box('Base').checked).toBe(false);
  expect(box('Base').disabled).toBe(true);
  expect(count()).toBe('0 of 3 selected');
  expect(within(panel()).getByRole('button', { name: 'Select all' }).disabled).toBe(true);
  expect(primary().disabled).toBe(true);
  // A thickness that takes it gives the tick back.
  act(() => fireEvent.change(within(panel()).getByLabelText('Thickness'), { target: { value: '2' } }));
  expect(box('Base').checked).toBe(true);
  expect(count()).toBe('1 of 3 selected');
});

it('cuts the ticked outlines from one stock: one item, then three', () => {
  const onCreate = vi.fn();
  render(<Picker model={shopModel()} initial={{ kind: 'pick', selected: [] }} onCreate={onCreate} />);
  act(() => fireEvent.click(box('Base')));
  act(() => fireEvent.click(primary()));
  let { items } = onCreate.mock.calls[0][0];
  // The XY sketch at the origin is the blank itself, the part named after it.
  expect(items.map((item) => [item.sketch, item.part.name, item.quantity, item.centre])).toEqual([
    [null, 'Base', 1, [150, 100]],
  ]);
  expect(items[0].part.features[0]).toMatchObject({ type: 'sheetmetal', sketchId: 'a', stock: 'spcc', thickness: 1.5 });
  expect(within(panel()).getByRole('status', { name: '' }).textContent).toBe(
    'Cut 1 blank from 1.5 mm SPCC cold-rolled steel',
  );
  // Three, in model order whatever the ticking order; one sheet: another stock for all.
  act(() => fireEvent.click(box('Lid')));
  act(() => fireEvent.click(box('Side')));
  commitNumber(within(panel()).getByLabelText('Quantity of Lid'), 2);
  act(() => fireEvent.change(within(panel()).getByLabelText('Sheet stock'), { target: { value: 'a5052' } }));
  expect(figure()).toBe('4 blanks from 3 outlines');
  act(() => fireEvent.click(primary()));
  ({ items } = onCreate.mock.calls[1][0]);
  expect(items.map((item) => [item.part.name, item.quantity])).toEqual([
    ['Base', 1],
    ['Side', 1],
    ['Lid', 2],
  ]);
  expect(items.every((item) => item.part.features[0].stock === 'a5052')).toBe(true);
  // The Lid away from the origin is copied flat (a new blank sketch), as Cut from sheet always did.
  expect(items[2].sketch).toMatchObject({ name: 'Lid blank', plane: 'XY' });
  expect(items[2].part.features[0].sketchId).toBe(items[2].sketch.id);
});

it('lists the parts already cut, each opening on the laser', () => {
  const onOpenPart = vi.fn();
  render(
    <Picker model={shopModel()} initial={{ kind: 'pick', selected: [] }} onCreate={vi.fn()} onOpenPart={onOpenPart} />,
  );
  const cut = within(panel()).getByRole('list', { name: 'Already cut' });
  const [row] = within(cut).getAllByRole('listitem');
  expect(row.querySelector('strong').textContent).toBe('Tray × 2');
  expect(row.querySelector('small').textContent).toBe('t 1.5 SPCC');
  act(() => fireEvent.click(within(cut).getByRole('button', { name: 'Open Tray on the laser' })));
  expect(onOpenPart).toHaveBeenCalledWith('t1');
  cleanup();
  // No sheet-metal part: no Already cut.
  render(
    <Picker
      model={{ ...shopModel(), parts: [], instances: [] }}
      initial={{ kind: 'pick', selected: [] }}
      onCreate={vi.fn()}
    />,
  );
  expect(within(panel()).queryByRole('list', { name: 'Already cut' })).toBeNull();
});

it('hands Edit the row, and the state it hands back reopens the picker as it was', () => {
  const onEditOutline = vi.fn();
  const model = shopModel();
  render(
    <Picker model={model} initial={{ kind: 'pick', selected: [] }} onCreate={vi.fn()} onEditOutline={onEditOutline} />,
  );
  act(() => fireEvent.click(box('Side')));
  commitNumber(within(panel()).getByLabelText('Quantity of Side'), 4);
  act(() => fireEvent.change(within(panel()).getByLabelText('Sheet stock'), { target: { value: 'sus304' } }));
  act(() => fireEvent.click(within(panel()).getByRole('button', { name: 'Edit Lid' })));
  // The row's sketch id, and what the workspace keeps for the return (returnTo's outline).
  const [[sketchId, back]] = onEditOutline.mock.calls;
  expect(sketchId).toBe('c');
  expect(back).toMatchObject({ kind: 'pick', selected: ['b'], quantities: { b: 4 }, stock: 'sus304' });
  cleanup();
  render(<Picker model={model} initial={back} onCreate={vi.fn()} />);
  expect(box('Side').checked).toBe(true);
  expect(within(panel()).getByLabelText('Quantity of Side').value).toBe('4');
  expect(within(panel()).getByLabelText('Sheet stock').value).toBe('sus304');
  // Without the callback, Edit is off.
  expect(within(panel()).getByRole('button', { name: 'Edit Lid' }).disabled).toBe(true);
});
