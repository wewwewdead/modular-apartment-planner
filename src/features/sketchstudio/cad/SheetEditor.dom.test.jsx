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
