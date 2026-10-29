import { describe, expect, it } from 'vitest';
import {
  createFloor,
  createLanding,
  createSectionCut,
  createSlab,
  createStair,
  createWall,
  createWindow,
} from '@/domain/models';
import { createCeiling, deriveCeilingDetail } from '@/domain/ceilingModels';
import { createRoofSystem } from '@/domain/roofModels';
import { buildSectionScene, buildProjectSectionScene } from './scene';
import { clipSectionSegment, projectSectionLine, sectionCutIntervals, sectionProjectedFaces } from './geometry';
import { getVisibleSectionDrawables } from './visibility';
import { elevationRegionContainsPoint } from '@/elevations/visibility';
import { buildRoofSectionElements } from '@/geometry/roofSectionGeometry';

const rectangle = (left, bottom, right, top) => [
  { x: left, y: bottom },
  { x: right, y: bottom },
  { x: right, y: top },
  { x: left, y: top },
];
const cutAt = (y = 0, options = {}) =>
  createSectionCut({ x: 0, y }, { x: 6000, y }, { direction: -1, depth: 3000, ...options });

describe('section geometry fidelity', () => {
  it('keeps separate intersections of a concave slab', () => {
    const outline = [
      { x: 0, y: 0 },
      { x: 6000, y: 0 },
      { x: 6000, y: 4000 },
      { x: 4000, y: 4000 },
      { x: 4000, y: 1000 },
      { x: 2000, y: 1000 },
      { x: 2000, y: 4000 },
      { x: 0, y: 4000 },
    ];
    expect(sectionCutIntervals(cutAt(2000), outline)).toEqual([
      { left: 0, right: 2000 },
      { left: 4000, right: 6000 },
    ]);
  });

  it('subtracts overlapping slab voids without double-counting or filling the gap', () => {
    const floor = createFloor('Ground', 0);
    floor.slabs = [
      createSlab(floor.id, rectangle(0, 0, 6000, 4000), 200, 0, {
        openings: [
          { boundaryPoints: rectangle(2000, 1000, 3500, 3000) },
          { boundaryPoints: rectangle(3000, 1000, 4000, 3000) },
        ],
      }),
    ];
    const solids = buildSectionScene(floor, cutAt(2000)).rectElements.filter(
      (e) => e.category === 'slab' && e.renderMode === 'cut',
    );
    expect(solids.map(({ left, right }) => [left, right])).toEqual([
      [0, 2000],
      [4000, 6000],
    ]);
  });

  it('clips angled background faces at the depth limit instead of projecting their entire width', () => {
    const cut = cutAt(0, { depth: 1000 });
    const outline = [
      { x: 0, y: -500 },
      { x: 4000, y: -2500 },
      { x: 4000, y: -2600 },
      { x: 0, y: -600 },
    ];
    const faces = sectionProjectedFaces(cut, outline);
    expect(Math.max(...faces.map((e) => e.right))).toBeCloseTo(1000);
    expect(faces.every((e) => e.left >= 0 && e.right <= 1000)).toBe(true);
  });

  it('interpolates clipped truss elevations and removes portions behind the viewer', () => {
    const cut = cutAt(0, { depth: 1000 });
    const line = projectSectionLine(
      cut,
      { x: -1000, y: 1000, elevation: 1000 },
      { x: 3000, y: -3000, elevation: 5000 },
      { id: 'truss' },
    );
    expect(line.points).toEqual([
      { x: 0, z: 2000 },
      { x: 1000, z: 3000 },
    ]);
    expect(line.renderMode).toBe('projection');
    expect(clipSectionSegment(cut, { x: 0, y: -100 }, { x: 1000, y: -100 })).toBeNull();
  });

  it('clips stairs without squeezing their full rise into a short cut', () => {
    const floor = createFloor('Ground', 0);
    floor.stairs = [createStair({ x: 0, y: 0 }, 1000, 12, 175, 250, { angle: 0 })];
    const cut = createSectionCut({ x: 500, y: 0 }, { x: 1500, y: 0 }, { direction: -1 });
    const steps = buildSectionScene(floor, cut).rectElements.filter(
      (e) => e.category === 'stair' && e.renderMode === 'cut',
    );
    expect(steps).toHaveLength(4);
    expect(steps.map((e) => [e.left, e.right, e.bottom, e.top])).toEqual([
      [0, 250, 350, 525],
      [250, 500, 525, 700],
      [500, 750, 700, 875],
      [750, 1000, 875, 1050],
    ]);
  });

  it('shows a transverse stair section and its landing at the correct upper-floor datum', () => {
    const floor = createFloor('Upper', 1, { elevation: 3000 });
    const landing = createLanding({ x: 0, y: 0 }, 1200, 1000, { elevation: 450, thickness: 180 });
    floor.landings = [landing];
    floor.stairs = [
      createStair(
        { x: 0, y: 0 },
        1000,
        8,
        175,
        250,
        { angle: 0 },
        {},
        { startLandingAttachment: { landingId: landing.id } },
      ),
    ];
    const cut = createSectionCut({ x: 625, y: -1000 }, { x: 625, y: 1000 }, { direction: 1 });
    const scene = buildSectionScene(floor, cut);
    const step = scene.rectElements.find((e) => e.category === 'stair' && e.renderMode === 'cut');
    expect([step.bottom, step.top, step.right - step.left]).toEqual([3800, 3975, 1000]);
    expect(scene.rectElements.some((e) => e.category === 'landing' && e.bottom === 3450 && e.top === 3630)).toBe(true);
  });

  it('uses the built wall position for openings in offset walls', () => {
    const floor = createFloor('Ground', 0);
    const wall = { ...createWall({ x: 0, y: 0 }, { x: 6000, y: 0 }, 200), outboardOffset: 600 };
    floor.walls = [wall];
    floor.windows = [createWindow(wall.id, 3000, 1000)];
    const cut = createSectionCut({ x: 3000, y: -1000 }, { x: 3000, y: 2000 }, { direction: -1 });
    const scene = buildSectionScene(floor, cut);
    const wallCut = scene.rectElements.find((e) => e.category === 'wall' && e.renderMode === 'cut');
    const opening = scene.rectElements.find((e) => e.isOpeningCut);
    expect([opening.left, opening.right]).toEqual([wallCut.left, wallCut.right]);
    const solids = getVisibleSectionDrawables(scene).filter((e) => e.category === 'wall' && e.renderMode === 'cut');
    expect(
      solids.some((e) => elevationRegionContainsPoint(e, { x: (opening.left + opening.right) / 2, y: -1500 })),
    ).toBe(false);
    expect(opening.insertIntervals[0].right - opening.insertIntervals[0].left).toBeLessThan(
      opening.right - opening.left,
    );
  });

  it('hides background polygons and structural lines behind a cut wall', () => {
    const scene = {
      rectElements: [
        { id: 'wall', category: 'wall', renderMode: 'cut', left: 0, right: 2000, bottom: 0, top: 3000, depth: 0 },
      ],
      polygonElements: [
        {
          id: 'roof',
          category: 'slab',
          renderMode: 'projection',
          depth: 1000,
          points: [
            { x: 500, z: 2000 },
            { x: 1500, z: 2500 },
            { x: 1500, z: 2300 },
            { x: 500, z: 1800 },
          ],
        },
      ],
      lineElements: [
        {
          id: 'truss',
          renderMode: 'projection',
          depth: 2000,
          points: [
            { x: 500, z: 1500 },
            { x: 1500, z: 1700 },
          ],
        },
      ],
    };
    expect(getVisibleSectionDrawables(scene).map((e) => e.id)).toEqual(['wall']);
  });

  it('resolves sloping roof visibility by elevation as well as horizontal position', () => {
    const scene = {
      rectElements: [
        {
          id: 'wall',
          category: 'wall',
          renderMode: 'projection',
          left: 0,
          right: 1000,
          bottom: 0,
          top: 1000,
          depth: 500,
        },
      ],
      polygonElements: [
        {
          id: 'roof',
          category: 'slab',
          renderMode: 'projection',
          depth: 500,
          depthSlopeZ: -1,
          depthIntercept: 1000,
          points: [
            { x: 0, z: 0 },
            { x: 1000, z: 0 },
            { x: 1000, z: 1000 },
            { x: 0, z: 1000 },
          ],
        },
      ],
    };
    const roof = getVisibleSectionDrawables(scene).find((e) => e.id === 'roof');
    expect(elevationRegionContainsPoint(roof, { x: 200, y: -800 })).toBe(true);
    expect(elevationRegionContainsPoint(roof, { x: 200, y: -200 })).toBe(false);
  });

  it('preserves a skylight opening in a sloped roof cut', () => {
    const roof = createRoofSystem('Roof', {
      roofType: 'shed',
      baseElevation: 3000,
      slabThickness: 200,
      boundaryPolygon: rectangle(0, 0, 6000, 4000),
      pitch: { slope: 25, overhang: 0, direction: { x: 1, y: 0 } },
      roofOpenings: [
        { id: 'skylight', boundaryPoints: rectangle(2000, 1000, 4000, 3000), type: 'skylight', curbHeight: 0 },
      ],
    });
    const cutFaces = buildRoofSectionElements(roof, cutAt(2000)).polygonElements.filter((e) => e.renderMode === 'cut');
    expect(cutFaces.map((e) => [Math.min(...e.points.map((p) => p.x)), Math.max(...e.points.map((p) => p.x))])).toEqual(
      [
        [0, 2000],
        [4000, 6000],
      ],
    );
  });

  it('includes ceiling boards and framing at the same levels as the ceiling model', () => {
    const floor = createFloor('Ground', 0);
    floor.sectionCuts = [cutAt(2000)];
    const ceiling = createCeiling('Ceiling', {
      floorId: floor.id,
      boundaryPolygon: rectangle(0, 0, 6000, 4000),
      baseElevation: 2700,
    });
    const project = { floors: [floor], ceilings: [ceiling] };
    const detail = deriveCeilingDetail(ceiling, project);
    const scene = buildProjectSectionScene(project, floor.id);
    const ceilings = scene.rectElements.filter((e) => e.category === 'ceiling' && e.renderMode === 'cut');
    expect(ceilings.length).toBeGreaterThan(0);
    expect(
      ceilings.some((e) => e.bottom === detail.elevations.boardUnderside && e.top === detail.elevations.boardTop),
    ).toBe(true);
  });

  it('slopes a stair handrail with its flight instead of leaving it at floor level', () => {
    const floor = createFloor('Ground', 0);
    floor.stairs = [createStair({ x: 0, y: 0 }, 1000, 12, 175, 250, { angle: 0 })];
    floor.railings = [
      {
        id: 'rail',
        startPoint: { x: 0, y: -500 },
        endPoint: { x: 3000, y: -500 },
        width: 50,
        height: 1000,
        type: 'handrail',
      },
    ];
    const scene = buildSectionScene(floor, cutAt(0));
    const rails = scene.polygonElements.filter((e) => e.sourceId === 'rail');
    expect(rails.length).toBeGreaterThan(0);
    expect(Math.max(...rails.flatMap((e) => e.points.map((p) => p.z)))).toBeCloseTo(3100);
    expect(scene.rectElements.some((e) => e.sourceId === 'rail' && e.top > 2500)).toBe(true);
  });
});
