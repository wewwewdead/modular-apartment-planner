import { describe, expect, it } from 'vitest';
import { createBeam } from '@/domain/models';
import { createTrussSystem, syncProjectTrussSystems, TRUSS_SUPPORT_MODES } from '@/domain/trussModels';
import { deriveRoofBoundaryFromTrussSystem } from './roofAttachment';
import { deriveCeilingBoundaryFromTrussSystem } from './ceilingAttachment';

const BEAM_WIDTH = 250;
const BEAM_TOP = 3000;
const SPAN = 6000;
const OVERHANG = 300;

function column(id, x, y) {
  return { id, x, y, width: 300, depth: 300, rotation: 0 };
}

function boundsOf(boundary) {
  const xs = boundary.map((point) => point.x);
  const ys = boundary.map((point) => point.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

/**
 * Two parallel beams running along x at y = 0 and y = 6000, carrying gable
 * trusses that span between them. Truss local x = 0 sits on the first beam's
 * centreline, x = span on the second, and the 300 mm overhangs run past both.
 */
function makeBeamSupportedProject({ supportMode = TRUSS_SUPPORT_MODES.BEAM_PAIR, ...instanceOverrides } = {}) {
  const beamA = {
    ...createBeam({ kind: 'column', id: 'col_a1' }, { kind: 'column', id: 'col_a2' }, BEAM_WIDTH, 450, BEAM_TOP),
    id: 'beam_a',
  };
  const beamB = {
    ...createBeam({ kind: 'column', id: 'col_b1' }, { kind: 'column', id: 'col_b2' }, BEAM_WIDTH, 450, BEAM_TOP),
    id: 'beam_b',
  };
  const floor = {
    id: 'floor_1',
    elevation: 0,
    floorToFloorHeight: BEAM_TOP,
    columns: [
      column('col_a1', 0, 0),
      column('col_a2', 8000, 0),
      column('col_b1', 0, SPAN),
      column('col_b2', 8000, SPAN),
    ],
    beams: [beamA, beamB],
  };

  const project = syncProjectTrussSystems({
    floors: [floor],
    trussSystems: [
      createTrussSystem('Roof trusses', {
        floorId: floor.id,
        baseElevation: BEAM_TOP,
        trussInstances: [
          {
            trussTypeId: 'truss_type_gable',
            startPoint: { x: 0, y: SPAN / 2 },
            endPoint: { x: 8000, y: SPAN / 2 },
            span: SPAN,
            rise: 1200,
            spacing: 2000,
            count: 4,
            overhangs: { start: OVERHANG, end: OVERHANG },
            supportMode,
            supportBeamIds: { start: 'beam_a', end: 'beam_b' },
            ...instanceOverrides,
          },
        ],
      }),
    ],
  });

  return { floor, project, trussSystem: project.trussSystems[0] };
}

describe('deriveCeilingBoundaryFromTrussSystem', () => {
  it('stops at the inner faces of the beams the trusses bear on', () => {
    const { floor, trussSystem } = makeBeamSupportedProject();

    const ceiling = boundsOf(deriveCeilingBoundaryFromTrussSystem(trussSystem, floor));

    // Bearings sit on the beam centrelines, so the ceiling gives up half a beam
    // width at each end rather than burying its boards in the beam below.
    expect(ceiling.minY).toBeCloseTo(BEAM_WIDTH / 2, 6);
    expect(ceiling.maxY).toBeCloseTo(SPAN - BEAM_WIDTH / 2, 6);
  });

  it('keeps the roof boundary running out over the overhangs', () => {
    const { trussSystem } = makeBeamSupportedProject();

    const roof = boundsOf(deriveRoofBoundaryFromTrussSystem(trussSystem));

    expect(roof.minY).toBeCloseTo(-OVERHANG, 6);
    expect(roof.maxY).toBeCloseTo(SPAN + OVERHANG, 6);
  });

  it('falls back to the bearing line when the trusses are not carried by beams', () => {
    const { floor, trussSystem } = makeBeamSupportedProject({ supportMode: null });

    const ceiling = boundsOf(deriveCeilingBoundaryFromTrussSystem(trussSystem, floor));

    expect(ceiling.minY).toBeCloseTo(0, 6);
    expect(ceiling.maxY).toBeCloseTo(SPAN, 6);
  });

  it('never reaches past a bottom chord that stops short of its beams', () => {
    const { floor, trussSystem } = makeBeamSupportedProject({ span: 4000 });

    const ceiling = boundsOf(deriveCeilingBoundaryFromTrussSystem(trussSystem, floor));

    // Trusses are centred between the beams, so a 4000 span leaves the bearings
    // 1000 mm inboard of each beam: the chord, not the beam, is the limit.
    expect(ceiling.minY).toBeCloseTo(1000, 6);
    expect(ceiling.maxY).toBeCloseTo(5000, 6);
  });

  it('shares the layout run with the roof boundary', () => {
    const { floor, trussSystem } = makeBeamSupportedProject();

    const ceiling = boundsOf(deriveCeilingBoundaryFromTrussSystem(trussSystem, floor));
    const roof = boundsOf(deriveRoofBoundaryFromTrussSystem(trussSystem));

    expect(ceiling.minX).toBeCloseTo(roof.minX, 6);
    expect(ceiling.maxX).toBeCloseTo(roof.maxX, 6);
  });

  it('ignores support beams that no longer line up once the system is rotated', () => {
    const { floor, project } = makeBeamSupportedProject();
    const rotated = { ...project.trussSystems[0], planRotationOffsetDegrees: 30 };

    const boundary = deriveCeilingBoundaryFromTrussSystem(rotated, floor);
    const spanDepth = Math.hypot(boundary[1].x - boundary[0].x, boundary[1].y - boundary[0].y);

    expect(spanDepth).toBeCloseTo(SPAN, 6);
  });

  it('returns null for a system with no trusses', () => {
    expect(deriveCeilingBoundaryFromTrussSystem({ id: 'ts', trussInstances: [] }, null)).toBeNull();
    expect(deriveCeilingBoundaryFromTrussSystem(null, null)).toBeNull();
  });
});
