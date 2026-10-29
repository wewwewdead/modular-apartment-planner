// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import DraftingImport from './DraftingImport.jsx';

afterEach(cleanup);

// A rectangle whose last corner missed the first by 0.3 mm, plus annotations.
const entities = [
  { id: 'line_1', type: 'line', x1: 100, y1: 100, x2: 400, y2: 100, layerId: 'default' },
  { id: 'line_2', type: 'line', x1: 400, y1: 100, x2: 400, y2: 300, layerId: 'default' },
  { id: 'line_3', type: 'line', x1: 400, y1: 300, x2: 100.3, y2: 300, layerId: 'default' },
  { id: 'line_4', type: 'line', x1: 100.3, y1: 300, x2: 100.3, y2: 100, layerId: 'default' },
  { id: 'line_5', type: 'line', x1: 100, y1: 100, x2: 100, y2: 20, layerId: 'construction' },
  { id: 'dim_1', type: 'dimension' },
  { id: 'dim_2', type: 'dimension' },
  { id: 'text_1', type: 'text' },
];
const layers = [
  { id: 'default', visible: true },
  { id: 'construction', visible: false },
];

function mount(props = {}) {
  const onImport = vi.fn();
  render(<DraftingImport entities={entities} layers={layers} onImport={onImport} onDrafting={vi.fn()} {...props} />);
  return { onImport };
}

describe('DraftingImport', () => {
  it('closes small gaps by default and says where', () => {
    const { onImport } = mount();
    expect(screen.getByLabelText('Close small gaps').checked).toBe(true);
    expect(screen.getByLabelText('Gap tolerance (mm)').value).toBe('0.5');
    expect(screen.getByText('Closed a 0.30 mm gap at (100.00, 100.00) between line_1 and line_4')).toBeTruthy();
    // Annotations and the hidden construction line are a quiet summary, not failures.
    expect(screen.getByText('2 dimensions and 1 text skipped (annotations are not geometry)')).toBeTruthy();
    expect(screen.getByText('1 hidden entity ignored')).toBeTruthy();
    expect(screen.queryByText(/Not imported/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Import 1 part into 3D' }));
    expect(onImport).toHaveBeenCalledTimes(1);
    expect(onImport.mock.calls[0][0][0].part.sourceEntityIds.sort()).toEqual(['line_1', 'line_2', 'line_3', 'line_4']);
  });

  it('points at the gap diagnostics when healing is off and only open loops remain', () => {
    mount();
    fireEvent.click(screen.getByLabelText('Close small gaps'));
    expect(screen.queryByLabelText('Gap tolerance (mm)')).toBeNull();
    expect(screen.getByText(/4 connected lines: open loop — 0\.30 mm gap between/)).toBeTruthy();
    expect(screen.getByText(/Every outline above is open: the smallest gap is 0\.30 mm/)).toBeTruthy();
    expect(screen.getByText(/Turn on "Close small gaps"/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Import 0 parts into 3D' }).disabled).toBe(true);
  });

  it('suggests raising the tolerance when the gap is larger than it', () => {
    mount();
    fireEvent.change(screen.getByLabelText('Gap tolerance (mm)'), { target: { value: '0.1' } });
    expect(screen.getByText(/smallest gap is 0\.30 mm\. Raise the gap tolerance above it/)).toBeTruthy();
  });
});
