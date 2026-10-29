import { describe, expect, it } from 'vitest';
import {
  BOARD_OVERHANG_LIMIT,
  WALL_ASSEMBLY_PRESETS,
  WALL_BOARD_MATERIALS,
  boardLayerAreaMultiplier,
  boardLayerUSpan,
  createWallAssembly,
  deriveWallAssemblyLayers,
  deriveWallFramingLayout,
  resolveWallAssembly,
  wallAssemblyThickness,
  wallFaceViewMirrorsU,
} from './wallAssemblies';

describe('wall assemblies', () => {
  it('keeps legacy walls as CHB assemblies using their modeled thickness', () => {
    const assembly = resolveWallAssembly({ thickness: 100 });
    expect(assembly).toMatchObject({ preset: 'chb', system: 'masonry', coreThickness: 100 });
    expect(wallAssemblyThickness(assembly)).toBe(100);
  });

  it('derives total thickness for single and double framed board walls', () => {
    const single = createWallAssembly(WALL_ASSEMBLY_PRESETS.FIBER_CEMENT);
    expect(wallAssemblyThickness(single)).toBe(87);

    const double = createWallAssembly(WALL_ASSEMBLY_PRESETS.FIBER_CEMENT, {
      interior: { material: 'fiber_cement', thickness: 6, layerCount: 2 },
      exterior: { material: 'plywood', thickness: 12, layerCount: 2 },
      framing: { studDepth: 75, frameCount: 2, frameGap: 25 },
    });
    expect(wallAssemblyThickness(double)).toBe(211);
    expect(boardLayerAreaMultiplier(double, WALL_BOARD_MATERIALS.FIBER_CEMENT)).toBe(2);
    expect(boardLayerAreaMultiplier(double, WALL_BOARD_MATERIALS.PLYWOOD)).toBe(2);
  });

  it('places inside and outside boards on opposite sides and supports flipping the inside direction', () => {
    const leftInside = createWallAssembly(WALL_ASSEMBLY_PRESETS.MIXED_BOARD, {
      interiorSide: 'left',
      interior: { material: 'plywood', thickness: 12, layerCount: 1 },
      exterior: { material: 'fiber_cement', thickness: 6, layerCount: 1 },
    });
    const rightInside = createWallAssembly(WALL_ASSEMBLY_PRESETS.MIXED_BOARD, {
      ...leftInside,
      interiorSide: 'right',
    });

    const leftLayers = deriveWallAssemblyLayers(leftInside);
    const rightLayers = deriveWallAssemblyLayers(rightInside);
    expect(leftLayers.find((layer) => layer.side === 'interior')).toMatchObject({
      sign: -1,
      material: 'plywood',
      buildUp: 12,
    });
    expect(leftLayers.find((layer) => layer.side === 'exterior').sign).toBe(1);
    expect(rightLayers.find((layer) => layer.side === 'interior').sign).toBe(1);
    expect(rightLayers.find((layer) => layer.side === 'exterior').sign).toBe(-1);
  });

  it('mirrors the elevation U axis for exactly the face on the wall far side', () => {
    // The un-mirrored canvas viewpoint matches a viewer on the +perpendicular
    // side (layer sign +1). The sign −1 face is seen from the other side of the
    // wall, so its front-on elevation must flip U — one face of every wall,
    // never both, and which one follows interiorSide.
    const leftInside = createWallAssembly(WALL_ASSEMBLY_PRESETS.MIXED_BOARD, { interiorSide: 'left' });
    expect(wallFaceViewMirrorsU(leftInside, 'interior')).toBe(true);
    expect(wallFaceViewMirrorsU(leftInside, 'exterior')).toBe(false);

    const rightInside = createWallAssembly(WALL_ASSEMBLY_PRESETS.MIXED_BOARD, { interiorSide: 'right' });
    expect(wallFaceViewMirrorsU(rightInside, 'interior')).toBe(false);
    expect(wallFaceViewMirrorsU(rightInside, 'exterior')).toBe(true);

    // Masonry walls carry interiorSide too — the same rule applies.
    const masonry = resolveWallAssembly({ thickness: 100 });
    expect(wallFaceViewMirrorsU(masonry, 'interior')).toBe(true);
    expect(wallFaceViewMirrorsU(masonry, 'exterior')).toBe(false);
  });

  it('lays out two stud rows and frames around door openings', () => {
    const wall = {
      id: 'wall_1',
      start: { x: 0, y: 0 },
      end: { x: 4000, y: 0 },
      height: 3000,
      thickness: 187,
      assembly: createWallAssembly(WALL_ASSEMBLY_PRESETS.PLYWOOD, {
        framing: { spacing: 400, frameCount: 2, frameGap: 25 },
      }),
    };
    const layout = deriveWallFramingLayout(wall, [
      { id: 'door_1', openingKind: 'door', offset: 2000, width: 900, height: 2100 },
    ]);

    // The jambs are at 1550 and 2450. Nothing is CENTRED there any more — a stud
    // centred on the jamb line puts half its width inside the door. The trimmer
    // stands beside it and the king outside that.
    expect(layout.studs.some((stud) => stud.position === 1550)).toBe(false);
    expect(layout.studs.some((stud) => stud.position === 2450)).toBe(false);
    expect(layout.studs.some((stud) => stud.position === 2000)).toBe(false);
    expect(layout.studs.filter((stud) => stud.kind === 'trimmer').map((stud) => stud.position)).toEqual([
      1525, 2475, 1525, 2475,
    ]);
    expect(layout.studs.filter((stud) => stud.kind === 'king').map((stud) => stud.position)).toEqual([
      1475, 2525, 1475, 2525,
    ]);
    expect(new Set(layout.studs.map((stud) => stud.frameIndex))).toEqual(new Set([0, 1]));
    expect(layout.totalLinearLengthMm).toBeGreaterThan(layout.components.studLength);
  });
});

// The wall the reference takeoff is quoted against: 6000 × 2700, one 900 door
// and one 1200 window, single frame, one noggin row.
const REFERENCE_OPENINGS = [
  { id: 'door_1', openingKind: 'door', offset: 1500, width: 900, height: 2100 },
  { id: 'win_1', openingKind: 'window', offset: 4200, width: 1200, sillHeight: 900, height: 1200 },
];

function referenceWall(framing = {}) {
  return {
    id: 'wall_ref',
    start: { x: 0, y: 0 },
    end: { x: 6000, y: 0 },
    height: 2700,
    thickness: 100,
    assembly: createWallAssembly(WALL_ASSEMBLY_PRESETS.PLYWOOD, {
      framing: { spacing: 400, studWidth: 50, studDepth: 75, nogginRows: 1, ...framing },
    }),
  };
}

// A bypass wall dropped 250 past its deck on a 3000 storey: 3250 of frame with
// the finished floor 250 up from the bottom of it.
const BYPASS_OPTIONS = {
  height: 3250,
  datumV: 250,
  bands: [{ slabId: 'slab_1', name: 'Level 2 deck', thickness: 250, v0: 0, v1: 250 }],
};

function rectanglesIntersect(a, b) {
  return a.u0 < b.u1 - 0.01 && a.u1 > b.u0 + 0.01 && a.v0 < b.v1 - 0.01 && a.v1 > b.v0 + 0.01;
}

function kindsOf(layout, kind) {
  return layout.members.filter((member) => member.kind === kind);
}

describe('wall framing layout around openings', () => {
  // The invariant the whole opening rework exists to hold: a wall's frame may
  // touch a hole on every side and stand inside it nowhere.
  it('never leaves a generated member standing inside an opening, platform or bypass', () => {
    for (const options of [{}, BYPASS_OPTIONS]) {
      const layout = deriveWallFramingLayout(
        referenceWall({ frameCount: 2, frameGap: 25 }),
        REFERENCE_OPENINGS,
        options,
      );

      expect(layout.members.length).toBeGreaterThan(20);
      expect(layout.openings).toHaveLength(2);
      const fouling = layout.members.filter((member) =>
        layout.openings.some((opening) => rectanglesIntersect(member, opening)),
      );
      expect(fouling).toEqual([]);
    }
  });

  it('breaks the bottom plate at a doorway, runs it under a window, and leaves the top plate whole', () => {
    const layout = deriveWallFramingLayout(referenceWall(), REFERENCE_OPENINGS);

    // Two lengths of bottom plate: 0 → the door jamb, and the far jamb → the end
    // of the wall. The window's sill is 900 up, so the plate runs under it.
    expect(kindsOf(layout, 'bottom_track').map((member) => [member.u0, member.u1])).toEqual([
      [0, 1050],
      [1950, 6000],
    ]);
    expect(kindsOf(layout, 'top_track').map((member) => [member.u0, member.u1])).toEqual([[0, 6000]]);
  });

  it('frames a doorway with a king outside a trimmer and a header bearing on both', () => {
    const layout = deriveWallFramingLayout(referenceWall(), REFERENCE_OPENINGS);
    const door = layout.openings.find((opening) => opening.id === 'door_1');
    const at = (kind, u0) => layout.members.find((member) => member.kind === kind && member.u0 === u0);

    // Trimmer inner face flush on the jamb, king one trimmer clear outside it.
    expect(at('trimmer', 1000)).toMatchObject({ u1: door.u0, v0: 0, v1: door.v1 });
    expect(at('king', 950)).toMatchObject({ u1: 1000, v0: 0, v1: 2700 });
    expect(at('trimmer', door.u1)).toMatchObject({ u1: 2000, v0: 0, v1: door.v1 });
    expect(at('king', 2000)).toMatchObject({ u1: 2050, v0: 0, v1: 2700 });

    // The header runs trimmer face to trimmer face and its underside lands on
    // the trimmer tops, which is what it bears on.
    const header = layout.members.find((member) => member.kind === 'header' && member.u0 === 950 + 50);
    expect(header).toMatchObject({ u0: 1000, u1: 2000, v0: door.v1, v1: door.v1 + 50 });
    expect(header.u1 - header.u0).toBe(door.u1 - door.u0 + 100);
  });

  it('lands a window sill between the trimmers that carry its header', () => {
    const layout = deriveWallFramingLayout(referenceWall(), REFERENCE_OPENINGS);
    const window = layout.openings.find((opening) => opening.id === 'win_1');
    const sill = kindsOf(layout, 'sill');

    // The trimmers run past the sill to the header, so the rough sill measures
    // the clear opening while the header picks up a trimmer width each side.
    expect(sill).toHaveLength(1);
    expect(sill[0]).toMatchObject({ u0: window.u0, u1: window.u1, v0: window.v0 - 50, v1: window.v0 });
    expect(
      kindsOf(layout, 'header').some((member) => member.u0 === window.u0 - 50 && member.u1 === window.u1 + 50),
    ).toBe(true);
  });

  it('bills exactly what it drew, so plates come up short at the doorway', () => {
    const layout = deriveWallFramingLayout(referenceWall(), REFERENCE_OPENINGS);

    // Two plates of 6000 less the 900 door: the old formula billed the full
    // 12 000 because it never looked at the openings at all.
    expect(layout.components.platesLength).toBe(6000 * 2 - 900);
    expect(layout.components.headerLength).toBe(1000 + 1300);
    expect(layout.components.windowSillLength).toBe(1200);
    expect(layout.components.ledgerLength).toBe(0);

    // Every bucket is the sum of the rectangles the generator actually emitted.
    for (const [kind, bucket] of [
      ['bottom_track', 'platesLength'],
      ['header', 'headerLength'],
      ['sill', 'windowSillLength'],
      ['noggin', 'nogginLength'],
    ]) {
      const drawn = kindsOf(layout, kind).reduce((total, member) => total + (member.u1 - member.u0), 0);
      expect(layout.components[bucket]).toBeGreaterThanOrEqual(drawn);
    }
    expect(Object.values(layout.components).reduce((total, value) => total + value, 0)).toBeCloseTo(
      layout.totalLinearLengthMm,
      6,
    );
  });
});

describe('wall framing layout over a storey line', () => {
  it('runs one frame the whole span of a bypass wall, with plates only at its ends', () => {
    const layout = deriveWallFramingLayout(referenceWall(), REFERENCE_OPENINGS, BYPASS_OPTIONS);

    expect(kindsOf(layout, 'stud').every((member) => member.v0 === 0 && member.v1 === 3250)).toBe(true);
    expect(kindsOf(layout, 'king').every((member) => member.v0 === 0 && member.v1 === 3250)).toBe(true);
    expect(
      [...kindsOf(layout, 'bottom_track'), ...kindsOf(layout, 'top_track')].map((member) => [member.v0, member.v1]),
    ).toEqual([
      [0, 50],
      [3200, 3250],
    ]);
  });

  it('carries the deck on a ledger at the slab band and leaves the plate below it whole', () => {
    const layout = deriveWallFramingLayout(referenceWall(), REFERENCE_OPENINGS, BYPASS_OPTIONS);
    const ledger = kindsOf(layout, 'ledger');

    expect(ledger).toEqual([expect.objectContaining({ u0: 0, u1: 6000, v0: 0, v1: 250 })]);
    expect(layout.components.ledgerLength).toBe(6000);
    // The deck is BELOW the floor the door opens onto, so neither the ledger nor
    // the bottom plate is interrupted by that door.
    expect(kindsOf(layout, 'bottom_track')).toHaveLength(1);
  });

  it('interrupts a ledger that a hole really does cross', () => {
    // A raised deck filed on this floor lands above the finished floor line, so
    // the door does run through its band.
    const layout = deriveWallFramingLayout(referenceWall(), REFERENCE_OPENINGS, {
      ...BYPASS_OPTIONS,
      bands: [{ slabId: 'slab_raised', thickness: 250, v0: 1000, v1: 1250 }],
    });

    expect(kindsOf(layout, 'ledger').map((member) => [member.u0, member.u1])).toEqual([
      [0, 1050],
      [1950, 3600],
      [4800, 6000],
    ]);
  });

  it('measures a bypass wall’s sills from the finished floor, not the bottom of the plane', () => {
    const layout = deriveWallFramingLayout(referenceWall(), REFERENCE_OPENINGS, BYPASS_OPTIONS);

    expect(layout.openings.find((opening) => opening.id === 'door_1')).toMatchObject({ v0: 250, v1: 2350 });
    expect(layout.openings.find((opening) => opening.id === 'win_1')).toMatchObject({ v0: 1150, v1: 2350 });
  });
});

/**
 * Board overhangs — the corner detail.
 *
 * Two bypass-framed walls meeting at a corner each stop their cladding at their
 * own wall end, and the corner stands open with the neighbour's cut edge on
 * show. Running one board past that end closes it. These pin the arithmetic that
 * every view then reads: what a stored number normalizes to, and how far the
 * board actually runs once the wall's own length gets a say.
 */
describe('board layer overhangs', () => {
  const framedWall = (overrides = {}) => ({
    start: { x: 0, y: 0 },
    end: { x: 4000, y: 0 },
    thickness: 100,
    assembly: createWallAssembly(WALL_ASSEMBLY_PRESETS.MIXED_BOARD, overrides),
  });

  it('defaults both edges of both faces to flush with the wall end', () => {
    const assembly = createWallAssembly(WALL_ASSEMBLY_PRESETS.MIXED_BOARD);

    expect(assembly.interior).toMatchObject({ overhangStart: 0, overhangEnd: 0 });
    expect(assembly.exterior).toMatchObject({ overhangStart: 0, overhangEnd: 0 });
    expect(boardLayerUSpan(assembly.exterior, 4000)).toMatchObject({ u0: 0, u1: 4000, length: 4000 });
  });

  it('keeps a stored overhang and lets the other edge be a setback', () => {
    const assembly = createWallAssembly(WALL_ASSEMBLY_PRESETS.MIXED_BOARD, {
      exterior: { material: WALL_BOARD_MATERIALS.FIBER_CEMENT, overhangStart: 137, overhangEnd: -137 },
    });

    // Positive runs the board BACK past u = 0; negative pulls it forward off the
    // far end. Both are measured outward from the wall, which is how a builder
    // reads them at either corner.
    expect(boardLayerUSpan(assembly.exterior, 4000)).toMatchObject({
      start: 137,
      end: -137,
      u0: -137,
      u1: 3863,
      length: 4000,
    });
  });

  it('coerces junk to flush rather than letting it reach the drawing', () => {
    for (const junk of [undefined, null, 'wide', NaN, Infinity, -Infinity, {}]) {
      const assembly = createWallAssembly(WALL_ASSEMBLY_PRESETS.MIXED_BOARD, {
        exterior: { material: WALL_BOARD_MATERIALS.FIBER_CEMENT, overhangStart: junk, overhangEnd: junk },
      });
      expect(assembly.exterior).toMatchObject({ overhangStart: 0, overhangEnd: 0 });
    }
  });

  it('caps a mistyped overhang at the corner-detail limit', () => {
    const assembly = createWallAssembly(WALL_ASSEMBLY_PRESETS.MIXED_BOARD, {
      exterior: { material: WALL_BOARD_MATERIALS.FIBER_CEMENT, overhangStart: 40000, overhangEnd: -40000 },
    });

    expect(assembly.exterior.overhangStart).toBe(BOARD_OVERHANG_LIMIT);
    expect(assembly.exterior.overhangEnd).toBe(-BOARD_OVERHANG_LIMIT);
  });

  it('clamps setbacks so the two of them can never invert the board', () => {
    const layer = { material: WALL_BOARD_MATERIALS.FIBER_CEMENT, overhangStart: -900, overhangEnd: -900 };
    // On a 400 mm stub each setback would eat the whole board twice over. The
    // span still comes back the right way round, with a run left to cut.
    const span = boardLayerUSpan(layer, 400);

    expect(span.u1).toBeGreaterThan(span.u0);
    expect(span.length).toBeCloseTo(1, 6);
    expect(span.start).toBeCloseTo(-199.5, 6);
    expect(span.end).toBeCloseTo(-199.5, 6);
  });

  it('drops the overhang with the board when a face is stripped bare', () => {
    const assembly = createWallAssembly(WALL_ASSEMBLY_PRESETS.MIXED_BOARD, {
      exterior: { material: WALL_BOARD_MATERIALS.NONE, overhangStart: 200, overhangEnd: 200 },
    });

    expect(assembly.exterior).toMatchObject({ layerCount: 0, overhangStart: 0, overhangEnd: 0 });
  });

  it('refuses an overhang on an arc wall, the way an outboard offset is refused', () => {
    // "Past the end" of a curve is along a tangent that has left the surface —
    // there is no straight extension of an arc panel that is still that panel.
    const arc = resolveWallAssembly({
      ...framedWall({
        exterior: { material: WALL_BOARD_MATERIALS.FIBER_CEMENT, overhangStart: 250, overhangEnd: 250 },
      }),
      controlPoint: { x: 2000, y: 900 },
    });

    expect(arc.exterior).toMatchObject({ overhangStart: 0, overhangEnd: 0 });
    // The board itself is untouched — only where it stops was refused.
    expect(arc.exterior.material).toBe(WALL_BOARD_MATERIALS.FIBER_CEMENT);
  });

  it('extends the plan skin and leaves the core exactly where it was', () => {
    const flush = createWallAssembly(WALL_ASSEMBLY_PRESETS.MIXED_BOARD);
    const lapped = createWallAssembly(WALL_ASSEMBLY_PRESETS.MIXED_BOARD, {
      exterior: { material: WALL_BOARD_MATERIALS.FIBER_CEMENT, overhangStart: 137 },
    });
    const [, flushSkin] = deriveWallAssemblyLayers(flush, 4000);
    const [interior, exteriorSkin] = deriveWallAssemblyLayers(lapped, 4000);

    expect(exteriorSkin).toMatchObject({ side: 'exterior', u0: -137, u1: 4000 });
    // Its offset across the wall — where the skin sits in the build-up — is
    // untouched, and so is the face that was not given an overhang.
    expect(exteriorSkin.centerOffset).toBe(flushSkin.centerOffset);
    expect(interior).toMatchObject({ side: 'interior', u0: 0, u1: 4000 });
  });

  it('changes nothing about a layer except where it stops', () => {
    // Everything the views were already reading — the side, the sign, the
    // material, the build-up, the offset across the wall — has to come back
    // identical, or setting an overhang would quietly move the skin sideways.
    const strip = ({ overhangStart: _s, overhangEnd: _e, u0: _u0, u1: _u1, ...rest }) => rest;
    const flush = deriveWallAssemblyLayers(createWallAssembly(WALL_ASSEMBLY_PRESETS.MIXED_BOARD), 4000);
    const lapped = deriveWallAssemblyLayers(
      createWallAssembly(WALL_ASSEMBLY_PRESETS.MIXED_BOARD, {
        exterior: { material: WALL_BOARD_MATERIALS.FIBER_CEMENT, overhangStart: 137, overhangEnd: 60 },
      }),
      4000,
    );

    expect(lapped.map(strip)).toEqual(flush.map(strip));
    // And a flush wall's own spans are plain zeros, not the negative zero a bare
    // negation leaves behind — which is not deep-equal to zero.
    expect(flush.map((layer) => Object.is(layer.u0, 0))).toEqual([true, true]);
  });
});
