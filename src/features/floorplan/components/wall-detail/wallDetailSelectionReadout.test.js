import { describe, expect, it } from 'vitest';
import { WALL_BOARD_MATERIALS, WALL_FRAME_MATERIALS } from '@/domain/wallAssemblies';
import {
  boardLayerLabel,
  describeSelectedFastener,
  describeSelectedFraming,
  describeSelectedPanel,
  estimateTagWidth,
  faceSizeLine,
  formatSize,
  framingKindLabel,
  placeSelectionTag,
  selectionTagLines,
  squareMetres,
} from './wallDetailSelectionReadout';

const BOUNDS = { length: 6000, height: 2700 };

describe('framingKindLabel', () => {
  it('names every kind the framing generator produces', () => {
    expect(framingKindLabel('stud')).toBe('Stud');
    expect(framingKindLabel('noggin')).toBe('Noggin');
    expect(framingKindLabel('bottom_track')).toBe('Bottom track');
    expect(framingKindLabel('top_track')).toBe('Top track');
    expect(framingKindLabel('header')).toBe('Header');
    expect(framingKindLabel('sill')).toBe('Sill');
  });

  it('falls back to readable words for an unknown kind instead of raw snake case', () => {
    expect(framingKindLabel('king_stud')).toBe('King stud');
    expect(framingKindLabel(undefined)).toBe('Frame member');
  });
});

describe('formatSize', () => {
  it('drops trailing zeros so a stud reads 50, not 50.00', () => {
    expect(formatSize(50, 0.01)).toBe('50');
    expect(formatSize(3000, 0.01)).toBe('3000');
  });

  it('keeps the decimals a cut piece actually has', () => {
    expect(formatSize(1219.5, 0.01)).toBe('1219.5');
    expect(formatSize(1546.827, 0.01)).toBe('1546.83');
  });

  it('honours a coarser drawing precision', () => {
    expect(formatSize(1219.5, 1)).toBe('1220');
    expect(formatSize(1219.44, 0.1)).toBe('1219.4');
  });

  it('states the unit once per line, not once per number', () => {
    expect(faceSizeLine(1219, 2438, 0.01)).toBe('1219 × 2438 mm');
  });
});

describe('boardLayerLabel', () => {
  it('states the sheet material and thickness', () => {
    expect(boardLayerLabel({ material: WALL_BOARD_MATERIALS.FIBER_CEMENT, thickness: 6, layerCount: 1 }, 0.01)).toBe(
      'Fiber cement · 6 mm',
    );
  });

  it('counts double-layered boards, because the face reads one board but is two', () => {
    expect(boardLayerLabel({ material: WALL_BOARD_MATERIALS.PLYWOOD, thickness: 12, layerCount: 2 }, 0.01)).toBe(
      'Plywood · 2 × 12 mm',
    );
  });

  it('says so plainly when the face carries no board', () => {
    expect(boardLayerLabel({ material: WALL_BOARD_MATERIALS.NONE, thickness: 0, layerCount: 0 }, 0.01)).toBe(
      'No board layer',
    );
  });
});

describe('describeSelectedPanel', () => {
  const layer = { material: WALL_BOARD_MATERIALS.FIBER_CEMENT, thickness: 6, layerCount: 1 };

  it('answers "how big is this board?" in face width × height', () => {
    const described = describeSelectedPanel(
      { label: 'P3', u0: 1200, v0: 0, width: 1200, height: 2400, grossArea: 2880000, netArea: 2880000 },
      layer,
      0.01,
    );
    expect(described.name).toBe('P3');
    expect(described.size).toBe('1200 × 2400 mm');
    expect(described.note).toBe('Fiber cement · 6 mm');
    expect(described.box).toEqual({ u0: 1200, u1: 2400, v0: 0, v1: 2400 });
  });

  it('reports the area left after a door or window is cut out of the board', () => {
    const described = describeSelectedPanel(
      { label: 'P1', u0: 0, v0: 0, width: 1200, height: 2400, grossArea: 2880000, netArea: 1440000 },
      layer,
      0.01,
    );
    expect(described.areaNote).toBe('1.44 m² after cutouts');
  });

  it('returns nothing when no board is selected', () => {
    expect(describeSelectedPanel(null, layer, 0.01)).toBeNull();
  });
});

describe('describeSelectedFraming', () => {
  const framing = { material: WALL_FRAME_MATERIALS.LIGHT_GAUGE_STEEL, studWidth: 50, studDepth: 75 };

  it('sizes a stud as it reads on the elevation and keeps depth separate', () => {
    const described = describeSelectedFraming(
      { kind: 'stud', orientation: 'vertical', u0: 575, u1: 625, v0: 0, v1: 2700, depth: 75 },
      framing,
      0.01,
    );
    expect(described.name).toBe('Stud');
    expect(described.size).toBe('50 × 2700 mm');
    expect(described.note).toBe('Light-gauge steel · 75 mm deep');
    // A stud is set out to its centre line across the wall.
    expect(described.setOut).toBe('centre U 600 mm');
  });

  it('sizes a noggin the same way and sets it out from the floor', () => {
    const described = describeSelectedFraming(
      { kind: 'noggin', orientation: 'horizontal', u0: 625, u1: 1775, v0: 1325, v1: 1375, depth: 75 },
      framing,
      0.01,
    );
    expect(described.name).toBe('Noggin');
    expect(described.size).toBe('1150 × 50 mm');
    expect(described.setOut).toBe('centre V 1350 mm');
  });

  it('states the wall assembly material, not the one a custom member froze', () => {
    // A member that was moved, copied, or materialised out of the generated
    // frame keeps the material it was created under. Switching the wall to
    // timber must not leave it still reading steel.
    const described = describeSelectedFraming(
      {
        kind: 'stud',
        orientation: 'vertical',
        u0: 375,
        u1: 425,
        v0: 0,
        v1: 2700,
        depth: 75,
        material: WALL_FRAME_MATERIALS.LIGHT_GAUGE_STEEL,
      },
      { material: WALL_FRAME_MATERIALS.TIMBER, studDepth: 75 },
      0.01,
    );
    expect(described.note).toBe('Timber · 75 mm deep');
  });

  it('names timber framing and falls back to the assembly depth', () => {
    const described = describeSelectedFraming(
      { kind: 'noggin', orientation: 'horizontal', u0: 0, u1: 600, v0: 1000, v1: 1045 },
      { material: WALL_FRAME_MATERIALS.TIMBER, studDepth: 90 },
      0.01,
    );
    expect(described.note).toBe('Timber · 90 mm deep');
    expect(described.depth).toBe(90);
  });
});

describe('describeSelectedFastener', () => {
  it('reports head size and exact position rather than a meaningless width', () => {
    const described = describeSelectedFastener({ u: 300, v: 1200 }, 8, 0.01);
    expect(described.size).toBe('Ø 8 mm head');
    expect(described.note).toBe('U 300 · V 1200 mm');
  });
});

describe('squareMetres', () => {
  it('drops a decimal place once the sheet is large enough not to need it', () => {
    expect(squareMetres(2880000)).toBe('2.88 m²');
    expect(squareMetres(24000000)).toBe('24.0 m²');
  });
});

describe('placeSelectionTag', () => {
  const lines = ['Stud', '50 × 2700 mm', 'Light-gauge steel · 75 mm deep'];

  it('parks the tag above a board that has headroom left on the wall', () => {
    const placed = placeSelectionTag({ u0: 1200, u1: 2400, v0: 0, v1: 2400 }, BOUNDS, { fontSize: 11, lines, gap: 11 });
    expect(placed.placement).toBe('above');
    expect(placed.point).toEqual({ u: 1800, v: 2400 });
  });

  it('drops the tag inside a full-height stud, which has no headroom above it', () => {
    const placed = placeSelectionTag({ u0: 575, u1: 625, v0: 0, v1: 2700 }, BOUNDS, { fontSize: 11, lines, gap: 11 });
    expect(placed.placement).toBe('below');
    expect(placed.point.v).toBe(2700);
  });

  it('pulls a tag on a piece at the wall end back inside the drawing', () => {
    const placed = placeSelectionTag({ u0: 0, u1: 50, v0: 0, v1: 1200 }, BOUNDS, { fontSize: 11, lines, gap: 11 });
    const halfWidth = estimateTagWidth(lines, 11) / 2;
    expect(placed.point.u).toBeCloseTo(halfWidth);
    expect(placed.point.u).toBeGreaterThan(25);
  });

  it('centres the tag when the drawing is narrower than the text', () => {
    const placed = placeSelectionTag(
      { u0: 0, u1: 200, v0: 0, v1: 400 },
      { length: 200, height: 3000 },
      {
        fontSize: 11,
        lines,
        gap: 11,
      },
    );
    expect(placed.point.u).toBeCloseTo(100);
  });
});

describe('selectionTagLines', () => {
  it('reads name, then size, then what it is made of', () => {
    const described = describeSelectedFraming(
      { kind: 'stud', orientation: 'vertical', u0: 575, u1: 625, v0: 0, v1: 2700, depth: 75 },
      { material: WALL_FRAME_MATERIALS.TIMBER, studDepth: 75 },
      0.01,
    );
    expect(selectionTagLines(described)).toEqual(['Stud', '50 × 2700 mm', 'Timber · 75 mm deep']);
  });

  it('draws nothing when nothing is selected', () => {
    expect(selectionTagLines(null)).toEqual([]);
  });
});
