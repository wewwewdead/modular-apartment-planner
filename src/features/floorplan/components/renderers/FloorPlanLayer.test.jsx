import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { filterFloorByPhase } from '@/domain/phaseFilter';
import FloorPlanLayer from './FloorPlanLayer';

function phasedFloor() {
  return {
    id: 'floor-1',
    walls: [],
    rooms: [],
    doors: [],
    windows: [],
    columns: [
      { id: 'col_a', x: 0, y: 0, width: 300, depth: 300, phaseId: 'p1' },
      { id: 'col_b', x: 4000, y: 0, width: 300, depth: 300, phaseId: 'p1' },
    ],
    beams: [
      {
        id: 'beam_1',
        startRef: { kind: 'column', id: 'col_a' },
        endRef: { kind: 'column', id: 'col_b' },
        width: 200,
        depth: 400,
        floorLevel: 0,
        placementRole: 'floor',
        phaseId: 'p3',
      },
    ],
  };
}

const PHASES = [
  { id: 'p1', name: 'Phase 1', order: 0, color: '#111111', visible: false },
  { id: 'p3', name: 'Phase 3', order: 2, color: '#333333', visible: true },
];

describe('FloorPlanLayer with phase-hidden beam supports', () => {
  it('still draws a visible beam whose supporting columns are phase-hidden', () => {
    const floor = phasedFloor();
    const filteredFloor = filterFloorByPhase(floor, PHASES, null, 'all');

    const html = renderToStaticMarkup(
      <svg>
        <FloorPlanLayer floor={floor} filteredFloor={filteredFloor} selectedId={null} />
      </svg>,
    );

    // The phase-1 columns are hidden…
    expect(html).not.toContain('data-id="col_a"');
    // …but the phase-3 beam still renders between their positions.
    expect(html).toContain('data-id="beam_1"');
  });
});
