import { describe, expect, it } from 'vitest';
import { createBeam, createProject } from '@/domain/models';
import { createCeiling } from '@/domain/ceilingModels';
import { buildCeilingPreviewObjects } from '@/geometry/ceilingGeometry';
import floorplanReducer, { initializeFloorplanState } from '@/features/floorplan/store/floorplanReducer';
import { buildPreviewScene } from './buildPreviewScene';

// A ceiling's boards are hidden so the grid holding them up can be inspected in
// 3D. Every descriptor tags itself with `ceilingDetailKind`: 'panel' is a board,
// and 'framing'/'hanger'/'opening'/'fixture' are the things behind or through
// it. Unlike a wall there is one board plane, so there are no sides to name.
const BOUNDARY = [
  { x: 1000, y: 500 },
  { x: 5000, y: 500 },
  { x: 5000, y: 3500 },
  { x: 1000, y: 3500 },
];

const SUPPORT_BASE_ELEVATION = 3000;
const SUPPORT_DROP = 150;

// Two 250 mm beams whose inner faces land on BOUNDARY. Hanging the ceiling from
// them is what gives it a plenum, which is what gives it hangers and can lights
// — the parts that have to survive the boards going away.
const SUPPORT_BEAMS = [
  {
    ...createBeam(
      { kind: 'point', x: 1000, y: 375 },
      { kind: 'point', x: 5000, y: 375 },
      250,
      450,
      SUPPORT_BASE_ELEVATION,
    ),
    id: 'beam_south',
  },
  {
    ...createBeam(
      { kind: 'point', x: 1000, y: 3625 },
      { kind: 'point', x: 5000, y: 3625 },
      250,
      450,
      SUPPORT_BASE_ELEVATION,
    ),
    id: 'beam_north',
  },
];

const OPENINGS = [{ id: 'op_light', type: 'downlight', u: 1200, v: 400, width: 200, height: 200 }];

function createFloor(id = 'floor_1') {
  return {
    id,
    name: 'Ground',
    elevation: 0,
    floorToFloorHeight: 3000,
    walls: [],
    rooms: [],
    slabs: [],
    columns: [],
    beams: SUPPORT_BEAMS,
    stairs: [],
    landings: [],
    fixtures: [],
    railings: [],
  };
}

function hungCeiling(overrides = {}) {
  return createCeiling('Hung ceiling', {
    id: 'ceiling_1',
    floorId: 'floor_1',
    boundaryPolygon: BOUNDARY,
    attachment: { mode: 'beam', beamIds: SUPPORT_BEAMS.map((beam) => beam.id) },
    detailing: { suspension: { drop: SUPPORT_DROP }, openings: OPENINGS },
    ...overrides,
  });
}

function projectWith(...ceilings) {
  return { floors: [createFloor()], trussSystems: [], ceilings };
}

const kindsIn = (descriptors) => new Set(descriptors.map((descriptor) => descriptor.metadata?.ceilingDetailKind));
const framingKindsIn = (descriptors) =>
  new Set(descriptors.filter((entry) => entry.metadata?.framingKind).map((entry) => entry.metadata.framingKind));

const build = (options) => {
  const ceiling = hungCeiling();
  return buildCeilingPreviewObjects(ceiling, projectWith(ceiling), options);
};

describe('hiding a ceiling’s boards in the 3D preview', () => {
  it('draws boards and frame alike normally', () => {
    const kinds = kindsIn(build());

    expect(kinds.has('panel')).toBe(true);
    expect(kinds.has('framing')).toBe(true);
    expect(kinds.has('hanger')).toBe(true);
  });

  it('takes the boards away and leaves everything holding them up', () => {
    const stripped = build({ hideBoards: true });
    const kinds = kindsIn(stripped);

    expect(stripped.length).toBeGreaterThan(0);
    expect(kinds.has('panel')).toBe(false);
    expect(kinds.has('framing')).toBe(true);
    expect(kinds.has('hanger')).toBe(true);
  });

  // The point of the toggle: a plane of plasterboard is not a frame to inspect.
  it('exposes real furring, carriers and wall angles', () => {
    const framingKinds = framingKindsIn(build({ hideBoards: true }));

    expect(framingKinds.has('furring')).toBe(true);
    expect(framingKinds.has('carrier')).toBe(true);
    expect(framingKinds.has('wall_angle')).toBe(true);
  });

  // An opening is a fitting, not cladding — the can above the ceiling is exactly
  // the sort of thing you hide the boards to look at.
  it('keeps the trim, fitting and housing of an opening', () => {
    const openingParts = build({ hideBoards: true }).filter(
      (entry) => entry.metadata.ceilingDetailElementId === 'op_light',
    );

    expect(openingParts.map((entry) => entry.id.split(':').pop()).sort()).toEqual(['face', 'housing', 'trim']);
  });

  // Screws go with what they screw into; a head floating in the air is a drawing
  // of nothing.
  it('drops the board screws with the boards', () => {
    expect(kindsIn(build({ fasteners: true })).has('fastener')).toBe(true);
    expect(kindsIn(build({ fasteners: true, hideBoards: true })).has('fastener')).toBe(false);
  });

  it('leaves other ceilings boarded', () => {
    const first = hungCeiling();
    const second = hungCeiling({ id: 'ceiling_2' });
    const project = projectWith(first, second);
    const scene = buildPreviewScene(project, { hiddenCeilingBoards: { ceiling_1: true } });
    const objects = scene.floors.find((floor) => floor.floorId === 'floor_1').objects;
    const kindsFor = (ceilingId) => kindsIn(objects.filter((entry) => entry.metadata?.ceilingId === ceilingId));

    expect(kindsFor('ceiling_1').has('panel')).toBe(false);
    expect(kindsFor('ceiling_2').has('panel')).toBe(true);
  });
});

describe('the ceiling control is a viewing state, not a model edit', () => {
  const setHidden = (state, ceilingId, hidden) =>
    floorplanReducer(state, { type: 'SET_CEILING_BOARD_VISIBILITY', ceilingId, hidden });

  it('records the ceiling hidden and clears back to nothing', () => {
    let state = initializeFloorplanState(createProject());
    expect(state.editor.hiddenCeilingBoards).toEqual({});

    state = setHidden(state, 'ceiling_1', true);
    expect(state.editor.hiddenCeilingBoards).toEqual({ ceiling_1: true });

    // Shown → hidden → shown: nothing hidden has exactly one representation,
    // and it is the absent key rather than a stored false.
    state = setHidden(state, 'ceiling_1', false);
    expect(state.editor.hiddenCeilingBoards).toEqual({});
  });

  it('keeps one ceiling’s answer out of another’s', () => {
    let state = setHidden(initializeFloorplanState(createProject()), 'ceiling_1', true);
    state = setHidden(state, 'ceiling_2', true);
    state = setHidden(state, 'ceiling_1', false);

    expect(state.editor.hiddenCeilingBoards).toEqual({ ceiling_2: true });
  });

  it('ignores an action with no ceiling', () => {
    const before = initializeFloorplanState(createProject());

    expect(setHidden(before, null, true)).toBe(before);
  });

  it('is a no-op when the choice has not changed', () => {
    const before = setHidden(initializeFloorplanState(createProject()), 'ceiling_1', true);

    expect(setHidden(before, 'ceiling_1', true)).toBe(before);
  });

  it('shows every ceiling again in one go', () => {
    let state = setHidden(initializeFloorplanState(createProject()), 'ceiling_1', true);
    state = setHidden(state, 'ceiling_2', true);
    state = floorplanReducer(state, { type: 'SHOW_ALL_CEILING_BOARDS' });

    expect(state.editor.hiddenCeilingBoards).toEqual({});
    expect(floorplanReducer(state, { type: 'SHOW_ALL_CEILING_BOARDS' })).toBe(state);
  });

  it('never touches the project, history or the dirty flag', () => {
    const before = initializeFloorplanState(createProject());
    const after = setHidden(before, 'ceiling_1', true);

    expect(after.project).toBe(before.project);
    expect(after.history).toBe(before.history);
    expect(after.isDirty).toBe(before.isDirty);
    expect(after.changeVersion).toBe(before.changeVersion);
  });

  it('forgets hidden ceilings when another project is loaded', () => {
    let state = setHidden(initializeFloorplanState(createProject()), 'ceiling_1', true);

    state = floorplanReducer(state, { type: 'PROJECT_LOAD', project: createProject() });

    expect(state.editor.hiddenCeilingBoards).toEqual({});
  });

  it('forgets hidden ceilings when a new project is started', () => {
    let state = setHidden(initializeFloorplanState(createProject()), 'ceiling_1', true);

    state = floorplanReducer(state, { type: 'PROJECT_NEW', project: createProject() });

    expect(state.editor.hiddenCeilingBoards).toEqual({});
  });
});

describe('preview scene cache invalidation for ceilings', () => {
  const keyFor = (hiddenCeilingBoards) => {
    const ceiling = hungCeiling();
    return buildPreviewScene(projectWith(ceiling), { hiddenCeilingBoards }).floors[0].sourceKey.strippedCeilingsHere;
  };

  it('changes the floor source key when a ceiling loses its boards', () => {
    // A matching key would let the cache reuse the old geometry and the control
    // would silently do nothing on screen.
    expect(keyFor({ ceiling_1: true })).not.toBe(keyFor({}));
  });

  it('treats a shown ceiling as no ceiling at all', () => {
    expect(keyFor({ ceiling_1: false })).toBe(keyFor({}));
  });

  it('keeps the key stable for a floor holding no hidden ceiling', () => {
    expect(keyFor({ ceiling_on_another_floor: true })).toBe(keyFor({}));
  });

  it('leaves the wall key alone', () => {
    const ceiling = hungCeiling();
    const scene = buildPreviewScene(projectWith(ceiling), { hiddenCeilingBoards: { ceiling_1: true } });

    expect(scene.floors[0].sourceKey.strippedHere).toBe('');
  });
});
