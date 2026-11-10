// @vitest-environment jsdom
// Phase R (docs/sketch-studio-drawing-fit.md §5): Fit to page, the 1-2-5
// slider (a live draft while dragging, one commit per gesture, red stops where
// the views stop fitting) and the custom 1 : N entry.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import SheetScaleControl from './SheetScaleControl.jsx';
import { standardScales } from './sheetLayout.js';
afterEach(cleanup);

const sheet = (extra = {}) => ({
  id: 's',
  title: 'T',
  layout: 'engineering',
  size: 'A3',
  scale: 0.05,
  views: ['front'],
  annotations: [],
  ...extra,
});
// One view on A3 (a 364 × 173 mm box): 7280 mm wide fits at 1:20, not at 1:10.
const views = [{ name: 'front', view: 'front', viewBox: [0, -100, 7280, 100], visible: [], hidden: [] }];
const setup = (props = {}) => {
  const onChange = vi.fn(),
    onDraft = vi.fn();
  render(<SheetScaleControl sheet={sheet()} onChange={onChange} onDraft={onDraft} {...props} />);
  return { onChange, onDraft, slider: screen.getByLabelText('Scale slider') };
};
// The slider's stops run from the smallest scale (left) to the largest.
const stops = () =>
  standardScales()
    .filter((s) => s <= 20 * (1 + 1e-9) && s >= (1 / 5000) * (1 - 1e-9))
    .reverse();

describe('sheet scale control', () => {
  it('drafts while dragging and commits once when the gesture ends', () => {
    const { onChange, onDraft, slider } = setup();
    expect(slider.value).toBe(String(stops().indexOf(0.05)));
    expect(screen.getByLabelText('Sheet scale').textContent).toBe('1:20');
    for (const s of [0.1, 0.2, 0.02]) fireEvent.change(slider, { target: { value: String(stops().indexOf(s)) } });
    expect(onDraft.mock.calls.map(([s]) => s)).toEqual([0.1, 0.2, 0.02]);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Sheet scale').textContent).toBe('1:50');
    fireEvent.pointerUp(slider);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ scaleMode: 'fixed', scale: 0.02 });
    expect(onDraft).toHaveBeenLastCalledWith(null);
    // A gesture that ends where it started adds no undo entry.
    fireEvent.change(slider, { target: { value: String(stops().indexOf(0.05)) } });
    fireEvent.keyUp(slider, { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
  it('Fit to page toggles the mode; leaving fit starts from the fitted scale', () => {
    const fixed = setup({ views });
    fireEvent.click(screen.getByRole('button', { name: 'Fit to page' }));
    expect(fixed.onChange).toHaveBeenCalledWith({ scaleMode: 'fit' });
    cleanup();
    const fitted = setup({ views, sheet: sheet({ scaleMode: 'fit', scale: 1 }) });
    const button = screen.getByRole('button', { name: 'Fit to page · 1:20' });
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByLabelText('Sheet scale').textContent).toBe('1:20');
    fireEvent.click(button);
    expect(fitted.onChange).toHaveBeenCalledWith({ scaleMode: 'fixed', scale: 0.05 });
  });
  it('marks the stops where the views stop fitting and ticks the largest that fits', () => {
    const { slider } = setup({ views });
    const track = slider.style.getPropertyValue('--cad-scale-track');
    expect(track).toContain('linear-gradient');
    expect(track).toContain('#e0716a');
    const at = (stops().indexOf(0.05) / (stops().length - 1)) * 100;
    expect(screen.getByTitle('Largest scale that fits').style.left).toBe(`${at}%`);
    cleanup();
    // Before Generate views: no marks, the slider still works.
    const plain = setup();
    expect(plain.slider.style.getPropertyValue('--cad-scale-track')).toBe('');
    expect(screen.queryByTitle('Largest scale that fits')).toBeNull();
  });
  it('a custom 1:50 is stored fixed as 0.02; bad input is explained, not stored', () => {
    const { onChange } = setup({ sheet: sheet({ scaleMode: 'fit' }) });
    const custom = screen.getByLabelText('Custom scale (1 : N)');
    fireEvent.change(custom, { target: { value: '1:0' } });
    fireEvent.keyDown(custom, { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/Enter a positive scale/)).toBeTruthy();
    fireEvent.change(custom, { target: { value: '1:50' } });
    fireEvent.keyDown(custom, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith({ scaleMode: 'fixed', scale: 0.02 });
    fireEvent.change(custom, { target: { value: '2:1' } });
    fireEvent.blur(custom);
    expect(onChange).toHaveBeenLastCalledWith({ scaleMode: 'fixed', scale: 2 });
  });
});
