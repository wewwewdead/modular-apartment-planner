// @vitest-environment jsdom
// Phase Q (docs/sketch-studio-hardware-seat-side.md §4.6): a concentric
// connection to a hole shows Seat side; Far side writes side: 'far', Drill
// side removes the key; other targets have no Seat side.
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ConnectionEditor from './ConnectionEditor.jsx';
import { emptyModel } from './model.js';

afterEach(cleanup);

const model = (connection) => ({
  ...emptyModel(),
  parts: [
    { id: 'board', name: 'Board', features: [{ id: 'h', type: 'hole', diameter: 6.6, depth: 5 }] },
    { id: 'bolt', name: 'Bolt', features: [{ id: 'hw', type: 'hardware', kind: 'bolt' }] },
    { id: 'pin', name: 'Pin', features: [{ id: 'axis', type: 'cylinder', radius: 3, length: 20 }] },
  ],
  instances: [
    { id: 'b1', partId: 'board', position: [0, 0, 0], rotation: [0, 0, 0] },
    { id: 'bolt1', partId: 'bolt', position: [0, 0, 0], rotation: [0, 0, 0] },
    { id: 'pin1', partId: 'pin', position: [0, 0, 0], rotation: [0, 0, 0] },
  ],
  connections: [connection],
});
const seat = {
  id: 'c1',
  type: 'concentric',
  from: 'bolt1',
  to: 'b1',
  fromFeatureId: 'hw',
  toFeatureId: 'h',
  offset: 0,
};

it('Seat side: Far side writes side far, Drill side removes the key', () => {
  const onChange = vi.fn();
  const view = render(<ConnectionEditor model={model(seat)} selectedId="bolt1" onChange={onChange} />);
  const select = screen.getByLabelText('Seat side');
  expect(select.value).toBe('drill');
  fireEvent.change(select, { target: { value: 'far' } });
  expect(onChange.mock.calls[0][0]).toEqual([{ ...seat, side: 'far' }]);
  view.rerender(<ConnectionEditor model={model({ ...seat, side: 'far' })} selectedId="bolt1" onChange={onChange} />);
  expect(screen.getByLabelText('Seat side').value).toBe('far');
  fireEvent.change(screen.getByLabelText('Seat side'), { target: { value: 'drill' } });
  expect(onChange.mock.calls[1][0]).toEqual([seat]);
  expect('side' in onChange.mock.calls[1][0][0]).toBe(false);
});

it('no Seat side when the target axis is not a hole', () => {
  render(
    <ConnectionEditor
      model={model({ ...seat, to: 'pin1', toFeatureId: 'axis' })}
      selectedId="bolt1"
      onChange={() => {}}
    />,
  );
  expect(screen.queryByLabelText('Seat side')).toBeNull();
});
