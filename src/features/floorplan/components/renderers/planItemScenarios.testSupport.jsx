/**
 * Plans for the per-item renderer tests (perf pass 3, D2.1): every wall kind the
 * plan draws (masonry, framed, mixed boards with finishes, plank siding, a lapped
 * skin, a double frame, an outboard body, an arc, column-attached ends), every
 * door / window / fixture type, rooms, stairs, plus the playground's two
 * storeys. Ids are fixed so two runs render the same markup.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import {
  createColumn,
  createDoor,
  createFixture,
  createRoom,
  createStair,
  createWall,
  createWindow,
} from '@/domain/models';
import { deserializeProject } from '@/persistence/deserialize';
import demoData from '@/pages/playground-demo.json';
import { CanvasZoomProvider } from './CanvasZoomContext';
import FloorPlanLayer from './FloorPlanLayer';
import { PLAN_STYLES, PlanStyleProvider } from './PlanStyleContext';

const ORANGE = {
  kind: 'paint',
  colour: { hex: '#E0701F', name: 'Signal Orange', catalogue: 'facade' },
  sheen: 'matte',
};

const withId = (id, entity) => ({ ...entity, id });

const centreAttachment = (columnId) => ({
  kind: 'column',
  columnId,
  featureType: 'centerline',
  featureIndex: 0,
  offset: 0,
});

export function richFloor() {
  const columns = [
    withId('c1', createColumn(0, 0, 300, 300)),
    withId('c2', createColumn(6000, 0, 300, 300)),
    withId('c3', createColumn(3000, 4000, 300, 300)),
  ];
  const walls = [
    {
      ...withId('w_masonry', createWall({ x: 0, y: 0 }, { x: 6000, y: 0 }, 200)),
      startAttachment: centreAttachment('c1'),
      endAttachment: centreAttachment('c2'),
    },
    withId('w_fc', createWall({ x: 6000, y: 0 }, { x: 6000, y: 4000 }, 100, { assembly: { preset: 'fiber_cement' } })),
    withId(
      'w_mixed',
      createWall({ x: 6000, y: 4000 }, { x: 0, y: 4000 }, undefined, {
        assembly: {
          preset: 'mixed_board',
          interior: { material: 'plywood', finish: { ...ORANGE, kind: 'timber' } },
          exterior: { material: 'fiber_cement', finish: { ...ORANGE, kind: 'render' }, overhangEnd: 99 },
        },
      }),
    ),
    withId(
      'w_outboard',
      createWall({ x: 0, y: 4000 }, { x: 0, y: 0 }, undefined, {
        assembly: { preset: 'plywood' },
        outboardOffset: 300,
      }),
    ),
    withId(
      'w_siding',
      createWall({ x: 0, y: 8000 }, { x: 6000, y: 8000 }, undefined, {
        assembly: {
          preset: 'plywood',
          exterior: { material: 'siding', finish: { ...ORANGE, kind: 'timber' } },
        },
      }),
    ),
    withId(
      'w_double',
      createWall({ x: 0, y: 10000 }, { x: 6000, y: 10000 }, undefined, {
        assembly: { preset: 'fiber_cement', framing: { spacing: 400, frameCount: 2, frameGap: 25 } },
      }),
    ),
    withId('w_offset_masonry', createWall({ x: 8000, y: 0 }, { x: 8000, y: 6000 }, 200, { outboardOffset: -150 })),
    {
      ...withId('w_arc', createWall({ x: 9000, y: 0 }, { x: 12000, y: 0 }, 150)),
      controlPoint: { x: 10500, y: -1200 },
    },
    {
      ...withId('w_partition', createWall({ x: 3000, y: 0 }, { x: 3000, y: 4000 }, 100)),
      endAttachment: centreAttachment('c3'),
    },
  ];
  const doors = [
    withId('d_swing', createDoor('w_fc', 1200, 900, 'left', 'swing')),
    withId('d_swing_r', createDoor('w_masonry', 4000, 800, 'right', 'swing')),
    withId('d_double', createDoor('w_mixed', 2500, 1600, 'left', 'double')),
    withId('d_sliding', createDoor('w_outboard', 2000, 1800, 'right', 'sliding')),
    withId('d_double_frame', createDoor('w_double', 3000, 900, 'left', 'swing')),
    withId('d_orphan', createDoor('w_missing', 500, 900, 'left', 'swing')),
  ];
  const windows = [
    withId('n_std', createWindow('w_masonry', 1500, 1200, 'standard')),
    withId('n_case', createWindow('w_fc', 2800, 900, 'casement', 'right')),
    withId('n_awn', createWindow('w_mixed', 900, 1000, 'awning', 'left')),
    withId('n_fixed', createWindow('w_siding', 2000, 1500, 'fixed')),
    withId('n_jal', createWindow('w_offset_masonry', 2500, 900, 'jalousie')),
    withId('n_std2', createWindow('w_double', 1000, 600, 'standard')),
    withId('n_orphan', createWindow('w_missing', 500, 900, 'standard')),
  ];
  const fixtureTypes = [
    'kitchenTop',
    'toilet',
    'lavatory',
    'table',
    'tv',
    'sofa',
    'bed',
    'shower',
    'plant',
    'wardrobe',
  ];
  const fixtures = fixtureTypes.map((type, index) =>
    withId(`f_${type}`, createFixture(type, 1000 + index * 700, 2000, { rotation: index * 15 })),
  );
  const square = [
    { x: 0, y: 0 },
    { x: 3000, y: 0 },
    { x: 3000, y: 4000 },
    { x: 0, y: 4000 },
  ];
  const rooms = [
    withId('r_bed', createRoom('Bedroom', square)),
    withId(
      'r_kitchen',
      createRoom('Kitchen', [
        { x: 3000, y: 0 },
        { x: 6000, y: 0 },
        { x: 6000, y: 4000 },
        { x: 3000, y: 4000 },
      ]),
    ),
    withId(
      'r_degenerate',
      createRoom('Sliver', [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ]),
    ),
  ];
  const stairs = [
    withId('s_up', createStair({ x: 7000, y: 7000 }, 1000, 16, 175, 250, { angle: 90 }, { fromFloorId: 'floor_rich' })),
    withId('s_dn', createStair({ x: 9000, y: 7000 }, 1000, 14, 180, 260, { angle: 0 }, { toFloorId: 'floor_rich' })),
  ];
  return {
    id: 'floor_rich',
    name: 'Rich',
    walls,
    columns,
    doors,
    windows,
    fixtures,
    rooms,
    stairs,
    slabs: [],
    beams: [],
    landings: [],
    railings: [],
    electricalDevices: [],
    sectionCuts: [],
    annotations: [],
  };
}

export function playgroundFloors() {
  const project = deserializeProject(JSON.parse(JSON.stringify(demoData))).project;
  return project.floors.filter((floor) => floor.walls?.length);
}

/** One plan layer, in the style asked for, as static markup. */
export function planMarkup(floor, { style = 'drafting', dragging = false, zoom = null, selectedId = null } = {}) {
  const layer = <FloorPlanLayer floor={floor} filteredFloor={floor} selectedId={selectedId} />;
  const styled =
    style === 'presentation' ? (
      <PlanStyleProvider value={PLAN_STYLES.PRESENTATION} dragging={dragging}>
        {layer}
      </PlanStyleProvider>
    ) : (
      layer
    );
  return renderToStaticMarkup(
    <svg>{zoom ? <CanvasZoomProvider value={zoom}>{styled}</CanvasZoomProvider> : styled}</svg>,
  );
}

/** Every (plan, style) pair the equivalence checks run over, by name. */
export function scenarioMarkups() {
  const out = {};
  const floors = {
    rich: richFloor(),
    ...Object.fromEntries(playgroundFloors().map((floor, i) => [`playground${i}`, floor])),
  };
  for (const [name, floor] of Object.entries(floors)) {
    out[`${name}:drafting`] = planMarkup(floor, { selectedId: floor.rooms?.[0]?.id ?? null });
    out[`${name}:drafting:zoom`] = planMarkup(floor, { zoom: 0.35 });
    out[`${name}:presentation`] = planMarkup(floor, { style: 'presentation', zoom: 0.1, selectedId: 'r_kitchen' });
    // Fresh wall arrays mid-drag: the per-wall fallback, columns painted.
    out[`${name}:presentation:drag`] = planMarkup(
      { ...floor, walls: floor.walls.map((wall) => ({ ...wall })) },
      { style: 'presentation', dragging: true, zoom: 0.2 },
    );
  }
  return out;
}
