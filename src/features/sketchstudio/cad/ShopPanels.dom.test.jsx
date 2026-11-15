// @vitest-environment jsdom
// Cut from sheet's other sources (docs/sketch-studio-fab-shop.md §9 SM-1
// item 4), chosen in Draw since docs/sketch-studio-shop-floor.md §4.4–4.5:
// the 2D drawing's closed profiles, nested into blanks with cut-outs, and a
// sketch of the model (reused on XY, copied flat otherwise); the Cut panel
// then takes the stock and cuts.
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { CutFromSheetPanel } from './ShopPanels.jsx';
import { DrawPanel } from './ShopFloor.jsx';
import { emptyModel } from './model.js';

afterEach(() => cleanup());

const entities = [
  { id: 'outline', type: 'rect', name: 'Bracket', x: 0, y: 0, width: 100, height: 60 },
  { id: 'window', type: 'circle', name: 'Window', cx: 30, cy: 30, r: 10 },
  { id: 'island', type: 'circle', name: 'Island', cx: 30, cy: 30, r: 3 },
  { id: 'tab', type: 'rect', name: 'Tab', x: 200, y: 0, width: 20, height: 10 },
];

it('cuts a blank from the 2D drawing: an inner loop is its cut-out, a loop inside a cut-out is reported', () => {
  const onOutline = vi.fn();
  render(<DrawPanel model={emptyModel()} entities={entities} onOutline={onOutline} onSketch={() => {}} />);
  const draw = screen.getByRole('region', { name: 'Draw' });
  act(() => fireEvent.click(within(draw).getByRole('button', { name: /^From the 2D drawing/ })));
  const blanks = within(draw).getByRole('list', { name: 'Drawing blanks' });
  expect(
    within(blanks)
      .getAllByRole('listitem')
      .map((li) => li.querySelector('strong').textContent + ' · ' + li.querySelector('small').textContent),
  ).toEqual(['Bracket · 1 cut-out', 'Tab · no cut-outs']);
  expect(within(draw).getByRole('note').textContent).toBe(
    'Not cut: Island — It sits inside a cut-out; cut it from its own blank.',
  );
  act(() => fireEvent.click(within(blanks).getByRole('button', { name: 'Cut Bracket' })));
  const outline = onOutline.mock.calls[0][0];
  expect(outline).toMatchObject({ kind: 'drawing', blank: { name: 'Bracket', sourceIds: ['outline', 'window'] } });
  cleanup();

  const onCreate = vi.fn();
  render(<CutFromSheetPanel model={emptyModel()} outline={outline} onCreate={onCreate} />);
  const panel = screen.getByRole('region', { name: 'Cut from sheet' });
  expect(within(panel).getByLabelText('Outline').textContent).toMatch(/^Bracket · from the 2D drawing/);
  expect(within(panel).getByLabelText('Blank size').textContent).toBe(
    `Blank 100 × 60 mm · cut length ${Number((320 + 20 * Math.PI).toFixed(2))} mm · 2 pierces`,
  );
  act(() => fireEvent.change(within(panel).getByLabelText('Sheet stock'), { target: { value: 'sus304' } }));
  act(() => fireEvent.change(within(panel).getByLabelText('Thickness'), { target: { value: '2' } }));
  act(() => fireEvent.click(within(panel).getByRole('button', { name: 'Cut on the laser' })));
  const { sketch, part, centre } = onCreate.mock.calls[0][0];
  expect(sketch).toMatchObject({
    plane: 'XY',
    name: 'Bracket blank',
    sourceEntityIds: ['outline', 'window'],
    profile: { type: 'rectangle', width: 100, height: 60, holes: [{ type: 'circle', radius: 10, center: [30, 30] }] },
  });
  expect(part).toMatchObject({
    material: 'SUS304 stainless',
    features: [{ type: 'sheetmetal', stock: 'sus304', thickness: 2 }],
  });
  expect(part.features[0].sketchId).toBe(sketch.id);
  expect(centre).toEqual([50, 30]);
  expect(within(panel).getByRole('status').textContent).toContain('from 2 mm SUS304 stainless');
});

it('uses an XY sketch as the blank itself and copies a sketch on another plane flat', () => {
  const onCreate = vi.fn();
  const model = {
    ...emptyModel(),
    sketches: [
      { id: 'flat', name: 'Plate', plane: 'XY', profile: { type: 'circle', radius: 20, center: [0, 0] } },
      { id: 'side', name: 'Side', plane: 'XZ', profile: { type: 'rectangle', width: 30, height: 10, origin: [0, 0] } },
    ],
  };
  const { rerender } = render(
    <CutFromSheetPanel model={model} outline={{ kind: 'sketch', sketchId: 'flat' }} onCreate={onCreate} />,
  );
  const panel = screen.getByRole('region', { name: 'Cut from sheet' });
  act(() => fireEvent.click(within(panel).getByRole('button', { name: 'Cut on the laser' })));
  expect(onCreate.mock.calls[0][0].sketch).toBe(null);
  expect(onCreate.mock.calls[0][0].part.features[0].sketchId).toBe('flat');
  rerender(<CutFromSheetPanel model={model} outline={{ kind: 'sketch', sketchId: 'side' }} onCreate={onCreate} />);
  act(() => fireEvent.click(within(panel).getByRole('button', { name: 'Cut on the laser' })));
  expect(onCreate.mock.calls[1][0].sketch).toMatchObject({
    plane: 'XY',
    name: 'Side blank',
    profile: model.sketches[1].profile,
  });
  expect(onCreate.mock.calls[1][0].centre).toEqual([15, 5]);
});

it('lists the outlines ready to cut and marks the one just drawn', () => {
  const onOutline = vi.fn();
  const model = {
    ...emptyModel(),
    sketches: [{ id: 'flat', name: 'Plate', plane: 'XY', profile: { type: 'circle', radius: 20, center: [0, 0] } }],
  };
  render(
    <DrawPanel
      model={model}
      outlines={[{ id: 'flat', name: 'Plate', ready: true, width: 40, height: 40, problem: '', editProblem: '' }]}
      chosen="flat"
      onOutline={onOutline}
      onSketch={() => {}}
    />,
  );
  const list = screen.getByRole('list', { name: 'Outlines ready to cut' });
  expect(within(list).getByRole('listitem').className).toBe('is-chosen');
  expect(within(list).getByRole('listitem').textContent).toContain('40 × 40 mm');
  act(() => fireEvent.click(within(list).getByRole('button', { name: 'Cut Plate' })));
  expect(onOutline).toHaveBeenCalledWith({ kind: 'sketch', sketchId: 'flat' });
  // Nothing not ready: no second list.
  expect(screen.queryByRole('list', { name: 'Not ready to cut' })).toBeNull();
  // No 2D drawing: its tile says so and is off.
  expect(screen.getByRole('button', { name: /^From the 2D drawing/ }).disabled).toBe(true);
});

// docs/sketch-studio-outline-edit-sheet-nest.md §3.2: every outline, each with Edit and Delete.
it('lists every outline, ready or not, each with Edit and Delete; a not-ready one says why and has no Cut', () => {
  const onOutline = vi.fn(),
    onEdit = vi.fn(),
    onDelete = vi.fn();
  const model = {
    ...emptyModel(),
    sketches: [
      { id: 'a', name: 'Plate', plane: 'XY', profile: { type: 'rectangle', width: 40, height: 30, origin: [0, 0] } },
      { id: 'b', name: 'Open', plane: 'XY', profile: { type: 'path', start: [0, 0], segments: [], closed: false } },
      { id: 'c', name: 'Spline', plane: 'XY', profile: { type: 'rectangle', width: 10, height: 10, offset: 2 } },
    ],
  };
  const outlines = [
    { id: 'a', name: 'Plate', ready: true, width: 40, height: 30, problem: '', editProblem: '' },
    {
      id: 'b',
      name: 'Open',
      ready: false,
      width: null,
      height: null,
      problem: 'Not closed: connect the ends so the outline is one loop.',
      editProblem: '',
    },
    { id: 'c', name: 'Spline', ready: false, width: null, height: null, problem: 'No offset.', editProblem: 'Frozen.' },
  ];
  render(
    <DrawPanel
      model={model}
      outlines={outlines}
      chosen="b"
      notice="Sketch 2 held 2 separate outlines: each is its own blank."
      onOutline={onOutline}
      onSketch={() => {}}
      onEdit={onEdit}
      onDelete={onDelete}
    />,
  );
  const ready = screen.getByRole('list', { name: 'Outlines ready to cut' });
  expect(within(ready).getAllByRole('listitem')).toHaveLength(1);
  expect(
    within(ready)
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label')),
  ).toEqual(['Edit Plate', 'Delete Plate', 'Cut Plate']);
  act(() => fireEvent.click(within(ready).getByRole('button', { name: 'Edit Plate' })));
  expect(onEdit).toHaveBeenCalledWith('a');
  act(() => fireEvent.click(within(ready).getByRole('button', { name: 'Delete Plate' })));
  expect(onDelete).toHaveBeenCalledWith('a');
  const notReady = screen.getByRole('list', { name: 'Not ready to cut' });
  const rows = within(notReady).getAllByRole('listitem');
  expect(rows.map((r) => r.className)).toEqual(['is-chosen', '']);
  expect(within(rows[0]).getByRole('note').textContent).toBe(
    'Not closed: connect the ends so the outline is one loop.',
  );
  expect(within(notReady).queryByRole('button', { name: /^Cut / })).toBeNull();
  // An outline the sketcher would freeze: Edit is off, its reason the title.
  const frozen = within(notReady).getByRole('button', { name: 'Edit Spline' });
  expect(frozen.disabled).toBe(true);
  expect(frozen.title).toBe('Frozen.');
  act(() => fireEvent.click(within(notReady).getByRole('button', { name: 'Edit Open' })));
  expect(onEdit).toHaveBeenLastCalledWith('b');
  expect(screen.getByRole('status').textContent).toBe('Sketch 2 held 2 separate outlines: each is its own blank.');
  expect(onOutline).not.toHaveBeenCalled();
});

// docs/sketch-studio-outline-edit-sheet-nest.md §3.6: Edit outline beside a sketch outline's name, with the stock chosen.
it('offers Edit outline for a sketch outline (with the stock chosen) and starts from the stock it comes back with', () => {
  const onEditOutline = vi.fn();
  const model = {
    ...emptyModel(),
    sketches: [
      { id: 'flat', name: 'Plate', plane: 'XY', profile: { type: 'rectangle', width: 40, height: 30, origin: [0, 0] } },
      { id: 'frozen', name: 'Frozen', plane: 'XY', profile: { type: 'rectangle', width: 40, height: 30, offset: 1 } },
    ],
  };
  render(
    <CutFromSheetPanel
      model={model}
      outline={{ kind: 'sketch', sketchId: 'flat' }}
      onCreate={vi.fn()}
      onEditOutline={onEditOutline}
    />,
  );
  const panel = screen.getByRole('region', { name: 'Cut from sheet' });
  act(() => fireEvent.change(within(panel).getByLabelText('Sheet stock'), { target: { value: 'sus304' } }));
  act(() => fireEvent.click(within(panel).getByRole('button', { name: 'Edit outline' })));
  expect(onEditOutline).toHaveBeenCalledWith({ stock: 'sus304', thickness: 1.5 });
  cleanup();
  // Back from the sketcher: a new panel (the workspace keys it on the outline) with the stock as it was.
  const { rerender } = render(
    <CutFromSheetPanel
      model={model}
      outline={{ kind: 'sketch', sketchId: 'flat', stock: 'sus304', thickness: 2 }}
      onCreate={vi.fn()}
      onEditOutline={onEditOutline}
      editNotice="Plate held 2 separate outlines: each is its own blank."
    />,
  );
  const back = screen.getByRole('region', { name: 'Cut from sheet' });
  expect(within(back).getByLabelText('Sheet stock').value).toBe('sus304');
  expect(within(back).getByLabelText('Thickness').value).toBe('2');
  expect(within(back).getByText('Plate held 2 separate outlines: each is its own blank.')).toBeTruthy();
  // The sketcher would freeze an offset profile: Edit outline is off, its reason the title.
  rerender(
    <CutFromSheetPanel
      model={model}
      outline={{ kind: 'sketch', sketchId: 'frozen' }}
      onCreate={vi.fn()}
      onEditOutline={onEditOutline}
    />,
  );
  const off = within(screen.getByRole('region', { name: 'Cut from sheet' })).getByRole('button', {
    name: 'Edit outline',
  });
  expect(off.disabled).toBe(true);
  expect(off.title).toMatch(/^This profile uses parameter expressions/);
  // A rectangle or a drawing profile has no sketch to edit.
  rerender(
    <CutFromSheetPanel
      model={model}
      outline={{ kind: 'rectangle', width: 10, height: 10 }}
      onCreate={vi.fn()}
      onEditOutline={onEditOutline}
    />,
  );
  expect(screen.queryByRole('button', { name: 'Edit outline' })).toBeNull();
});

// docs/sketch-studio-outline-edit-sheet-nest.md §4.8: several outlines in one cut.
it('offers Cut all for two or more ready outlines and for the drawing’s blanks, in list order', () => {
  const onOutline = vi.fn();
  const row = (id, name) => ({ id, name, ready: true, width: 40, height: 40, problem: '', editProblem: '' });
  const model = {
    ...emptyModel(),
    sketches: ['a', 'b'].map((id) => ({
      id,
      name: id,
      plane: 'XY',
      profile: { type: 'circle', radius: 20, center: [0, 0] },
    })),
  };
  const { rerender } = render(
    <DrawPanel
      model={model}
      outlines={[row('a', 'A')]}
      entities={entities}
      onOutline={onOutline}
      onSketch={() => {}}
    />,
  );
  // One outline: Cut this is enough.
  expect(screen.queryByRole('button', { name: 'Cut all outlines' })).toBeNull();
  rerender(
    <DrawPanel
      model={model}
      outlines={[row('a', 'A'), row('b', 'B')]}
      entities={entities}
      onOutline={onOutline}
      onSketch={() => {}}
    />,
  );
  const all = screen.getByRole('button', { name: 'Cut all outlines' });
  expect(all.textContent).toMatch(/^Cut all 2 outlines/);
  act(() => fireEvent.click(all));
  expect(onOutline).toHaveBeenLastCalledWith({
    kind: 'batch',
    items: [
      { kind: 'sketch', sketchId: 'a' },
      { kind: 'sketch', sketchId: 'b' },
    ],
  });
  // The 2D drawing's two blanks.
  act(() => fireEvent.click(screen.getByRole('button', { name: /^From the 2D drawing/ })));
  const drawingAll = screen.getByRole('button', { name: 'Cut all drawing blanks' });
  expect(drawingAll.textContent).toMatch(/^Cut all 2/);
  act(() => fireEvent.click(drawingAll));
  const batch = onOutline.mock.calls.at(-1)[0];
  expect(batch.kind).toBe('batch');
  expect(batch.items.map((item) => [item.kind, item.blank.name])).toEqual([
    ['drawing', 'Bracket'],
    ['drawing', 'Tab'],
  ]);
});

it('cuts a batch from one stock: a quantity each, a row that makes no blank keeps Cut off until left out', () => {
  const onCreate = vi.fn();
  const model = {
    ...emptyModel(),
    sketches: [
      {
        id: 'plate',
        name: 'Plate',
        plane: 'XY',
        profile: { type: 'rectangle', width: 300, height: 200, origin: [0, 0] },
      },
      {
        id: 'open',
        name: 'Open',
        plane: 'XY',
        profile: { type: 'path', start: [0, 0], segments: [], closed: false },
      },
    ],
  };
  const blank = {
    id: 'blank-tab',
    name: 'Tab',
    sourceIds: ['tab'],
    profile: { type: 'rectangle', width: 20, height: 10, origin: [200, 0] },
  };
  const outline = {
    kind: 'batch',
    items: [
      { kind: 'sketch', sketchId: 'plate' },
      { kind: 'sketch', sketchId: 'open' },
      { kind: 'drawing', blank },
    ],
  };
  render(<CutFromSheetPanel model={model} outline={outline} onCreate={onCreate} />);
  const panel = screen.getByRole('region', { name: 'Cut from sheet' });
  const list = within(panel).getByRole('list', { name: 'Outlines to cut' });
  expect(
    within(list)
      .getAllByRole('listitem')
      .map((li) => li.querySelector('strong').textContent),
  ).toEqual(['Plate', 'Open', 'Tab']);
  expect(within(list).getByRole('note').textContent).toBe('Not closed: connect the ends so the outline is one loop.');
  expect(within(panel).getByText(/^One sheet is one stock and thickness/)).toBeTruthy();
  const cut = within(panel).getByRole('button', { name: 'Cut on the laser' });
  expect(cut.disabled).toBe(true);
  act(() => fireEvent.click(within(panel).getByRole('button', { name: 'Leave out Open' })));
  expect(cut.disabled).toBe(false);
  const quantity = within(panel).getByLabelText('Quantity of Tab');
  act(() => {
    fireEvent.focus(quantity);
    fireEvent.change(quantity, { target: { value: '3' } });
  });
  act(() => fireEvent.blur(quantity));
  expect(within(panel).getByLabelText('Batch').textContent).toBe('4 blanks from 2 outlines');
  act(() => fireEvent.change(within(panel).getByLabelText('Sheet stock'), { target: { value: 'a5052' } }));
  act(() => fireEvent.click(cut));
  const { items } = onCreate.mock.calls[0][0];
  // The XY sketch at the origin is the blank itself; the drawing's is copied flat, both named after their outline.
  expect(items.map((item) => [item.sketch?.name ?? null, item.part.name, item.quantity, item.centre])).toEqual([
    [null, 'Plate', 1, [150, 100]],
    ['Tab blank', 'Tab', 3, [210, 5]],
  ]);
  expect(items[0].part.features[0]).toMatchObject({ sketchId: 'plate', stock: 'a5052', thickness: 1.5 });
  expect(items[1].sketch).toMatchObject({ plane: 'XY', sourceEntityIds: ['tab'] });
  expect(items[1].part.features[0].sketchId).toBe(items[1].sketch.id);
  expect(items[1].bounds).toEqual([
    [200, 0],
    [220, 10],
  ]);
  // The last row left cannot be left out.
  act(() => fireEvent.click(within(panel).getByRole('button', { name: 'Leave out Plate' })));
  expect(within(panel).getByRole('button', { name: 'Leave out Tab' }).disabled).toBe(true);
});
