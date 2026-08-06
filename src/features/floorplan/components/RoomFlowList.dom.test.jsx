/* @vitest-environment jsdom */
/**
 * The shared room readout, in both of its presentations.
 *
 * `WindStudyPanel.dom.test.jsx` covers what the panel does with it in context —
 * when the rows are withheld entirely, and what sits above them. This file
 * covers the component's own contract: what each metric puts first, and what a
 * room with no modelled speed shows instead of a number.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import RoomFlowList from './RoomFlowList';

afterEach(cleanup);

const ROOMS = [
  {
    id: 'living',
    name: 'Living room',
    pressurePa: 1.2,
    crossVentilated: true,
    airChangesPerHour: 2.4,
    airSpeedMs: 0.124,
    airSpeedBand: { lowMs: 0.062, highMs: 0.186, fraction: 0.5 },
  },
  {
    id: 'bed',
    name: 'Bedroom',
    pressurePa: -0.4,
    crossVentilated: false,
    airChangesPerHour: 0.05,
    airSpeedMs: 0.02,
    airSpeedBand: { lowMs: 0.01, highMs: 0.03, fraction: 0.5 },
  },
  {
    id: 'store',
    name: 'Store',
    pressurePa: 0,
    crossVentilated: false,
    airChangesPerHour: 0,
    airSpeedMs: null,
    airSpeedBand: null,
  },
];

describe('RoomFlowList — speed', () => {
  it('leads with the bulk index and demotes air changes to a second line', () => {
    const { container } = render(<RoomFlowList rooms={ROOMS} metric="speed" />);
    expect(container.querySelector('[data-room-flow-metric="speed"]')).not.toBeNull();
    expect(screen.getByText('0.12 m/s')).not.toBeNull();
    expect(screen.getByText('0.06–0.19 m/s')).not.toBeNull();
    expect(screen.getByText('2.4 ACH')).not.toBeNull();
    expect(screen.getByText('Cross-flow')).not.toBeNull();
  });

  it('shows an em dash, never a zero, for a room that was never modelled', () => {
    render(<RoomFlowList rooms={ROOMS} metric="speed" />);
    expect(screen.getByText('—')).not.toBeNull();
    expect(screen.getByText('not modelled')).not.toBeNull();
    // Its air-change rate really is zero, and that one is printed. `Number(null)`
    // is 0, so a formatter that checks the value before the type turns the null
    // into exactly the "0.00 m/s" this asserts is absent.
    expect(screen.getByText('0.0 ACH')).not.toBeNull();
    expect(screen.queryByText('0.00 m/s')).toBeNull();
    expect(screen.getAllByText('—')).toHaveLength(1);
  });

  it('labels a room with a path but no cross-flow, and one with neither', () => {
    render(<RoomFlowList rooms={ROOMS} metric="speed" />);
    expect(screen.getAllByText('Low / no flow')).toHaveLength(2);
  });
});

describe('RoomFlowList — ach', () => {
  it('keeps the original single-line presentation', () => {
    const { container } = render(<RoomFlowList rooms={ROOMS} metric="ach" />);
    expect(container.querySelector('[data-room-flow-metric="ach"]')).not.toBeNull();
    expect(screen.getByText('2.4 ACH')).not.toBeNull();
    // No band, no speed: that is the whole difference between the two modes.
    expect(screen.queryByText('0.12 m/s')).toBeNull();
    expect(screen.queryByText(/–.*m\/s/)).toBeNull();
  });

  it('is the default, so a caller that says nothing gets the old readout', () => {
    const { container } = render(<RoomFlowList rooms={ROOMS} />);
    expect(container.querySelector('[data-room-flow-metric="ach"]')).not.toBeNull();
  });
});

describe('RoomFlowList — bounds', () => {
  it('renders nothing at all for an empty list', () => {
    const { container } = render(<RoomFlowList rooms={[]} metric="speed" />);
    expect(container.querySelectorAll('p, span, strong')).toHaveLength(0);
  });

  it('stops at the row limit rather than growing without bound', () => {
    const many = Array.from({ length: 20 }, (_, index) => ({
      id: `r${index}`,
      name: `Room ${index}`,
      pressurePa: 0,
      crossVentilated: false,
      airChangesPerHour: 1,
      airSpeedMs: 0.1,
      airSpeedBand: { lowMs: 0.05, highMs: 0.15, fraction: 0.5 },
    }));
    render(<RoomFlowList rooms={many} metric="speed" />);
    expect(screen.getByText('Room 7')).not.toBeNull();
    expect(screen.queryByText('Room 8')).toBeNull();
    cleanup();
    render(<RoomFlowList rooms={many} metric="speed" limit={3} />);
    expect(screen.queryByText('Room 3')).toBeNull();
  });

  it('survives a room carrying no pressure, which older results do not have', () => {
    render(<RoomFlowList rooms={[{ id: 'a', name: 'Attic', airChangesPerHour: 1.5 }]} metric="speed" />);
    expect(screen.getByText('Attic').getAttribute('title')).toBeNull();
    expect(screen.getByText('1.5 ACH')).not.toBeNull();
    expect(screen.getByText('—')).not.toBeNull();
  });
});
