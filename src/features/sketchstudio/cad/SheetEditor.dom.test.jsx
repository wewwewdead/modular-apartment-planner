// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import SheetEditor from './SheetEditor.jsx';
import { pumpBracketExample } from './pumpBracket.js';
afterEach(cleanup);

function Harness() {
  const model = pumpBracketExample();
  const [sheet, setSheet] = useState({ ...model.sheets[1], annotations: [] });
  return (
    <>
      <SheetEditor sheet={sheet} model={model} onChange={setSheet} ready onGenerate={() => {}} />
      <output data-testid="sheet">{JSON.stringify(sheet)}</output>
    </>
  );
}
const saved = () => JSON.parse(screen.getByTestId('sheet').textContent);
describe('drawing sheet editor', () => {
  it('edits title-block metadata and creates/removes linked hole chains without JSON', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Drawing number'), { target: { value: 'FAB-101' } });
    fireEvent.blur(screen.getByLabelText('Drawing number'));
    expect(saved().drawingNumber).toBe('FAB-101');
    fireEvent.click(screen.getByLabelText('Hole 1 · Ø=openingDiameter'));
    fireEvent.click(screen.getByLabelText('Hole 2 · Ø=openingDiameter'));
    fireEvent.click(screen.getByRole('button', { name: 'Add chain dimension' }));
    expect(saved().annotations[0]).toMatchObject({
      type: 'hole-chain',
      view: 'front',
      partId: 'pump-bracket',
      featureIds: ['pump-opening-1', 'pump-opening-2'],
    });
    fireEvent.change(screen.getByLabelText('Dimension direction'), { target: { value: 'Y' } });
    expect(saved().annotations[0].axis).toBe('Y');
    fireEvent.click(screen.getByRole('button', { name: 'Remove annotation 1' }));
    expect(saved().annotations).toEqual([]);
  });
  it('names a hole row in the holes list (Phase K): "Hole 1 · Ø… · row of 5"', () => {
    const model = pumpBracketExample();
    const part = model.parts.find((p) => p.id === 'pump-bracket');
    part.features = part.features.map((f) =>
      f.id === 'pump-opening-1' ? { ...f, row: { count: 5, pitch: '=holePitch', direction: [1, 0, 0] } } : f,
    );
    render(
      <SheetEditor
        sheet={{ ...model.sheets[1], annotations: [] }}
        model={model}
        onChange={() => {}}
        ready
        onGenerate={() => {}}
      />,
    );
    expect(screen.getByLabelText('Hole 1 · Ø=openingDiameter · row of 5')).toBeTruthy();
    expect(screen.getByLabelText('Hole 2 · Ø=openingDiameter')).toBeTruthy();
  });
  it('updates view scales and notes and clears references when changing the subject', () => {
    render(<Harness />);
    fireEvent.change(screen.getAllByLabelText('View scale (blank = sheet)')[0], { target: { value: '0.5' } });
    fireEvent.blur(screen.getAllByLabelText('View scale (blank = sheet)')[0]);
    expect(saved().views[0].scale).toBe(0.5);
    fireEvent.change(screen.getByLabelText('Drawing notes'), { target: { value: 'Deburr all edges.' } });
    fireEvent.blur(screen.getByLabelText('Drawing notes'));
    expect(saved().notes).toBe('Deburr all edges.');
    fireEvent.click(screen.getByLabelText('Hole 1 · Ø=openingDiameter'));
    fireEvent.click(screen.getByRole('button', { name: 'Add hole callout' }));
    fireEvent.change(screen.getByLabelText('Drawing subject'), { target: { value: 'pump-standoff' } });
    expect(saved().annotations).toEqual([]);
    expect(screen.getByLabelText('Hole 1 · Ø4')).toBeTruthy();
  });
});

// Phase R (docs/sketch-studio-drawing-fit.md §7.3): Whole assembly, One part
// or Chosen parts, with a checklist and the 3D selection.
function ChosenHarness({ selection }) {
  const model = pumpBracketExample();
  const [sheet, setSheet] = useState({
    ...model.sheets[1],
    partId: undefined,
    annotations: [{ id: 'a', type: 'note' }],
  });
  return (
    <>
      <SheetEditor
        sheet={sheet}
        model={model}
        onChange={setSheet}
        ready
        onGenerate={() => {}}
        viewportSelection={selection}
      />
      <output data-testid="sheet">{JSON.stringify(sheet)}</output>
    </>
  );
}
describe('drawing subject: chosen parts', () => {
  const standoff = (i) => `M4 × 31.1 standoff ${i}`;
  it('checks parts on and off, never down to none, and clears annotations on each change', () => {
    render(<ChosenHarness selection={{ ids: [], name: '' }} />);
    expect(saved().annotations).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Drawing subject'), { target: { value: '__chosen-parts' } });
    // Nothing selected in 3D: every instance to start from.
    expect(saved().instanceIds).toHaveLength(5);
    expect(saved().annotations).toEqual([]);
    expect(screen.getByText('Chosen parts · 5 of 5')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Use 3D selection (0)' }).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Pump bracket'));
    fireEvent.click(screen.getByLabelText(standoff(1)));
    fireEvent.click(screen.getByLabelText(standoff(3)));
    expect(saved().instanceIds).toEqual(['pump-standoff-instance-1', 'pump-standoff-instance-3']);
    fireEvent.click(screen.getByLabelText(standoff(2)));
    expect(saved().instanceIds).toEqual(['pump-standoff-instance-3']);
    // The last one cannot be unchecked.
    expect(screen.getByLabelText(standoff(4)).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(standoff(2)));
    expect(saved().instanceIds).toEqual(['pump-standoff-instance-1', 'pump-standoff-instance-3']);
    fireEvent.change(screen.getByLabelText('Drawing subject'), { target: { value: '' } });
    expect(saved().instanceIds).toBeUndefined();
    expect(screen.queryByText(/Chosen parts ·/)).toBeNull();
  });
  it('Use 3D selection takes the viewport selection; choosing Chosen parts starts from it', () => {
    const selection = { ids: ['pump-standoff-instance-0', 'pump-standoff-instance-2'], name: 'Front standoffs' };
    render(<ChosenHarness selection={selection} />);
    fireEvent.change(screen.getByLabelText('Drawing subject'), { target: { value: '__chosen-parts' } });
    expect(saved().instanceIds).toEqual(selection.ids);
    expect(screen.getByText('3D selection: Front standoffs')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Pump bracket'));
    expect(saved().instanceIds).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Use 3D selection (2)' }));
    expect(saved().instanceIds).toEqual(selection.ids);
    expect(screen.getByLabelText('Drawing subject').value).toBe('__chosen-parts');
  });
});
