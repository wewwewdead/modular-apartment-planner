import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createLinearDimensionAnnotation } from '@/domain/models';
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

// An L of two walls: `buildOverallDimensionFigures` returns nothing for a
// single wall, so two are the least that make the overall chain and totals draw
// when the floor settings ask for them.
function lFloor(annotationSettings, annotations = []) {
  return {
    id: 'floor-1',
    walls: [
      { id: 'wall_1', start: { x: 0, y: 0 }, end: { x: 4000, y: 0 }, thickness: 200, height: 3000 },
      { id: 'wall_2', start: { x: 0, y: 0 }, end: { x: 0, y: 3000 }, thickness: 200, height: 3000 },
    ],
    rooms: [
      {
        id: 'room_1',
        name: 'Living',
        // A detected room carries its area and tag anchor; the tag needs both.
        area: 12_000_000, // mm², as createRoom stores it
        labelPosition: { x: 2000, y: 1500 },
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
    annotations,
    annotationSettings,
  };
}

const ALL_DERIVED_ON = Object.freeze({
  showWallDimensions: true,
  showRoomDimensions: true,
  showOverallDimensions: true,
});

function renderLayer(floor) {
  return renderToStaticMarkup(
    <svg>
      <FloorPlanLayer floor={floor} filteredFloor={floor} selectedId={null} />
    </svg>,
  );
}

describe('FloorPlanLayer wall dimensions', () => {
  it('never draws derived wall, room or overall dimensions on the plan canvas, even when the floor settings ask for them', () => {
    // Tags off, so any text in the output could only be a derived figure.
    const html = renderLayer(lFloor({ ...ALL_DERIVED_ON, showObjectTags: false }));

    expect(html).toContain('data-id="wall_1"');
    expect(html).not.toContain('data-dimension-source="derived"');
    expect(html).not.toContain('mm');
    expect(html).not.toContain('<text');
  });

  it('still draws a manual dimension on the plan canvas — someone placed it on purpose', () => {
    const html = renderLayer(
      lFloor({ ...ALL_DERIVED_ON, showObjectTags: false }, [
        createLinearDimensionAnnotation({ x: 0, y: 0 }, { x: 4000, y: 0 }, { offset: 300 }),
      ]),
    );

    expect(html.match(/data-dimension-source="manual"/g) || []).toHaveLength(1);
    expect(html).not.toContain('data-dimension-source="derived"');
    expect(html).toContain('4000 mm');
  });

  it('still draws the room tag when object tags are on — identity, not measurement', () => {
    const html = renderLayer(lFloor({ ...ALL_DERIVED_ON, showObjectTags: true }));

    expect(html).toContain('Living');
    expect(html).not.toContain('data-dimension-source="derived"');
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
