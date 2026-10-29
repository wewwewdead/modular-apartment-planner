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

describe('FloorPlanLayer wall dimensions', () => {
  it('never draws derived wall or room dimensions on the plan canvas, even when the floor settings ask for them', () => {
    const floor = {
      id: 'floor-1',
      walls: [{ id: 'wall_1', start: { x: 0, y: 0 }, end: { x: 4000, y: 0 }, thickness: 200, height: 3000 }],
      rooms: [
        {
          id: 'room_1',
          points: [
            { x: 0, y: 0 },
            { x: 4000, y: 0 },
            { x: 4000, y: 3000 },
            { x: 0, y: 3000 },
          ],
        },
      ],
      doors: [],
      windows: [],
      columns: [],
      annotations: [],
      // Overall dims and tags off, so any dimension text in the output could
      // only be the wall's or the room's derived figures.
      annotationSettings: {
        showWallDimensions: true,
        showRoomDimensions: true,
        showOverallDimensions: false,
        showObjectTags: false,
      },
    };

    const html = renderToStaticMarkup(
      <svg>
        <FloorPlanLayer floor={floor} filteredFloor={floor} selectedId={null} />
      </svg>,
    );

    expect(html).toContain('data-id="wall_1"');
    expect(html).not.toContain('4000 mm');
    expect(html).not.toContain('<text');
  });
});

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
