import { describe, expect, it } from 'vitest';
import {
  detachColumnAttachments,
  getWallRenderData,
  resolveColumnAttachmentPoint,
  resolveWallEndpoints,
  snapWallEndpoint,
  syncWallAttachmentPoints,
} from './wallColumnGeometry';
import { createColumn, createWall } from '@/domain/models';

// Column centered at (1000,1000), 400 wide x 300 deep, no rotation.
// Corners (CW in y-down space): (800,850) (1200,850) (1200,1150) (800,1150).
function makeColumn() {
  return createColumn(1000, 1000, 400, 300);
}

function cornerAttachment(columnId, featureIndex = 0) {
  return { kind: 'column', columnId, featureType: 'corner', featureIndex };
}

describe('resolveColumnAttachmentPoint', () => {
  it('resolves a corner attachment to the corresponding corner', () => {
    const col = makeColumn();
    expect(resolveColumnAttachmentPoint(col, { featureType: 'corner', featureIndex: 0 })).toEqual({ x: 800, y: 850 });
    expect(resolveColumnAttachmentPoint(col, { featureType: 'corner', featureIndex: 2 })).toEqual({ x: 1200, y: 1150 });
  });

  it('resolves a face attachment at offset 0 to the edge midpoint', () => {
    const col = makeColumn();
    // Face 0 is the top edge from (800,850) to (1200,850); midpoint is (1000,850).
    expect(resolveColumnAttachmentPoint(col, { featureType: 'face', featureIndex: 0, offset: 0 })).toEqual({
      x: 1000,
      y: 850,
    });
  });

  it('clamps a face offset to the half-length of the edge', () => {
    const col = makeColumn();
    // Top edge is 400 long, half-length 200; an offset of 9999 clamps to +200 along the tangent.
    const point = resolveColumnAttachmentPoint(col, { featureType: 'face', featureIndex: 0, offset: 9999 });
    expect(point.x).toBeCloseTo(1200, 6);
    expect(point.y).toBeCloseTo(850, 6);
  });

  it('resolves a centerline attachment along the axis with the given offset', () => {
    const col = makeColumn();
    // Centerline 0 is the x-axis through the center (1000,1000); offset 50 -> (1050,1000).
    expect(resolveColumnAttachmentPoint(col, { featureType: 'centerline', featureIndex: 0, offset: 50 })).toEqual({
      x: 1050,
      y: 1000,
    });
  });

  it('returns null for a missing column or attachment', () => {
    expect(resolveColumnAttachmentPoint(null, { featureType: 'corner', featureIndex: 0 })).toBeNull();
    expect(resolveColumnAttachmentPoint(makeColumn(), null)).toBeNull();
  });

  it('returns null for an out-of-range corner index', () => {
    expect(resolveColumnAttachmentPoint(makeColumn(), { featureType: 'corner', featureIndex: 99 })).toBeNull();
  });
});

describe('syncWallAttachmentPoints', () => {
  it('moves the attached endpoint to the resolved column feature', () => {
    const col = makeColumn();
    const wall = createWall({ x: 0, y: 0 }, { x: 5000, y: 5000 }, 150, {
      startAttachment: cornerAttachment(col.id, 0),
    });
    const synced = syncWallAttachmentPoints(wall, [col]);
    expect(synced.start).toEqual({ x: 800, y: 850 });
    // The unattached end is untouched.
    expect(synced.end).toEqual({ x: 5000, y: 5000 });
    // The attachment metadata is preserved (cloned).
    expect(synced.startAttachment).toEqual(cornerAttachment(col.id, 0));
    expect(synced.startAttachment).not.toBe(wall.startAttachment);
  });

  it('follows the column when the column moves (attachment tracks feature)', () => {
    const wall = createWall({ x: 0, y: 0 }, { x: 5000, y: 5000 }, 150, {
      startAttachment: cornerAttachment('col_1', 0),
    });
    const movedColumn = { ...makeColumn(), id: 'col_1', x: 3000, y: 3000 };
    const synced = syncWallAttachmentPoints(wall, [movedColumn]);
    // Corner 0 of the moved column is (3000-200, 3000-150) = (2800, 2850).
    expect(synced.start).toEqual({ x: 2800, y: 2850 });
  });

  it('drops a dangling attachment whose column no longer exists', () => {
    const wall = createWall({ x: 0, y: 0 }, { x: 5000, y: 5000 }, 150, {
      startAttachment: cornerAttachment('ghost-column', 0),
    });
    const synced = syncWallAttachmentPoints(wall, []);
    expect(synced.startAttachment).toBeNull();
    // The endpoint is left where it was (not moved) when the attachment is dropped.
    expect(synced.start).toEqual({ x: 0, y: 0 });
  });

  it('drops an attachment that references an invalid feature index', () => {
    const col = makeColumn();
    const wall = createWall({ x: 0, y: 0 }, { x: 5000, y: 5000 }, 150, {
      startAttachment: cornerAttachment(col.id, 99),
    });
    const synced = syncWallAttachmentPoints(wall, [col]);
    expect(synced.startAttachment).toBeNull();
    expect(synced.start).toEqual({ x: 0, y: 0 });
  });

  it('syncs both endpoints independently', () => {
    const colA = { ...makeColumn(), id: 'colA' };
    const colB = { ...makeColumn(), id: 'colB', x: 4000, y: 4000 };
    const wall = createWall({ x: 0, y: 0 }, { x: 9000, y: 9000 }, 150, {
      startAttachment: cornerAttachment('colA', 0),
      endAttachment: cornerAttachment('colB', 2),
    });
    const synced = syncWallAttachmentPoints(wall, [colA, colB]);
    expect(synced.start).toEqual({ x: 800, y: 850 });
    // Corner 2 of colB (center 4000,4000) is (4000+200, 4000+150) = (4200, 4150).
    expect(synced.end).toEqual({ x: 4200, y: 4150 });
  });

  it('leaves walls with no attachments unchanged', () => {
    const wall = createWall({ x: 0, y: 0 }, { x: 1000, y: 0 });
    const synced = syncWallAttachmentPoints(wall, [makeColumn()]);
    expect(synced.start).toEqual({ x: 0, y: 0 });
    expect(synced.end).toEqual({ x: 1000, y: 0 });
  });
});

describe('detachColumnAttachments', () => {
  it('nulls attachments that reference the removed column id', () => {
    const col = makeColumn();
    const wall = createWall({ x: 0, y: 0 }, { x: 5000, y: 5000 }, 150, {
      startAttachment: cornerAttachment(col.id, 0),
    });
    const detached = detachColumnAttachments(wall, [col], col.id);
    expect(detached.startAttachment).toBeNull();
  });

  it('keeps attachments that reference a different column', () => {
    const col = makeColumn();
    const other = { ...makeColumn(), id: 'other-col' };
    const wall = createWall({ x: 0, y: 0 }, { x: 5000, y: 5000 }, 150, {
      startAttachment: cornerAttachment('other-col', 0),
    });
    const detached = detachColumnAttachments(wall, [col, other], col.id);
    expect(detached.startAttachment).toEqual(cornerAttachment('other-col', 0));
  });
});

describe('snapWallEndpoint', () => {
  it('snaps to an existing wall endpoint within snap distance (no attachment)', () => {
    const existing = createWall({ x: 3000, y: 0 }, { x: 3000, y: 4000 });
    const result = snapWallEndpoint({ x: 3000, y: 5 }, { walls: [existing], columns: [], snapDist: 100 });
    expect(result).not.toBeNull();
    expect(result.point).toEqual({ x: 3000, y: 0 });
    expect(result.attachment).toBeNull();
  });

  it('snaps to a column corner and reports the corner attachment', () => {
    const col = makeColumn();
    const result = snapWallEndpoint({ x: 810, y: 855 }, { walls: [], columns: [col], snapDist: 100 });
    expect(result).not.toBeNull();
    expect(result.point).toEqual({ x: 800, y: 850 });
    expect(result.attachment).toMatchObject({
      kind: 'column',
      columnId: col.id,
      featureType: 'corner',
      featureIndex: 0,
    });
  });

  it('snaps to the column centre so a bay wall measures centre to centre', () => {
    const col = makeColumn();
    // Well inside the column but nowhere near a corner or a face.
    const result = snapWallEndpoint({ x: 1030, y: 985 }, { walls: [], columns: [col], snapDist: 100 });
    expect(result.point).toEqual({ x: 1000, y: 1000 });
    expect(result.attachment).toMatchObject({
      kind: 'column',
      columnId: col.id,
      featureType: 'centerline',
      featureIndex: 0,
      offset: 0,
    });
    // It has to resolve back to the exact centre through the normal path.
    expect(resolveColumnAttachmentPoint(col, result.attachment)).toEqual({ x: 1000, y: 1000 });
  });

  it('still gives a face its own midpoint when the cursor is out by the column core', () => {
    const col = makeColumn(); // 400x300, so the centre core reaches 75mm
    // Right face midpoint is (1200,1000); the cursor sits 10mm off it and 190 from the centre.
    const result = snapWallEndpoint({ x: 1190, y: 1000 }, { walls: [], columns: [col], snapDist: 100 });
    expect(result.point).toEqual({ x: 1200, y: 1000 });
    expect(result.attachment).toMatchObject({ featureType: 'face', featureIndex: 1 });
  });

  it('takes the column centre over a wall endpoint sitting on it, keeping the attachment', () => {
    const col = makeColumn();
    // A previous wall already died on this centre but recorded no attachment.
    const existing = createWall({ x: 1000, y: 1000 }, { x: 5000, y: 1000 });
    const result = snapWallEndpoint({ x: 1002, y: 1001 }, { walls: [existing], columns: [col], snapDist: 100 });
    expect(result.point).toEqual({ x: 1000, y: 1000 });
    expect(result.attachment).toMatchObject({ columnId: col.id, featureType: 'centerline', offset: 0 });
  });

  it('carries the chain-start attachment back when a loop closes on a column', () => {
    const col = makeColumn();
    const attachment = { kind: 'column', columnId: col.id, featureType: 'centerline', featureIndex: 0, offset: 0 };
    const result = snapWallEndpoint(
      { x: 1005, y: 1005 },
      { walls: [], columns: [col], snapDist: 100, chainStart: { x: 1000, y: 1000 }, chainStartAttachment: attachment },
    );
    expect(result.point).toEqual({ x: 1000, y: 1000 });
    expect(result.attachment).toMatchObject(attachment);
  });

  it('returns null when nothing is within snap distance', () => {
    const existing = createWall({ x: 3000, y: 0 }, { x: 3000, y: 4000 });
    const result = snapWallEndpoint(
      { x: 99999, y: 99999 },
      {
        walls: [existing],
        columns: [makeColumn()],
        snapDist: 100,
      },
    );
    expect(result).toBeNull();
  });

  it('prefers the chain-start point over other candidates (priority 0)', () => {
    const chainStart = { x: 1234, y: 5678 };
    const existing = createWall({ x: 1240, y: 5680 }, { x: 2000, y: 6000 });
    const result = snapWallEndpoint(
      { x: 1235, y: 5679 },
      {
        walls: [existing],
        columns: [],
        snapDist: 100,
        chainStart,
      },
    );
    expect(result.point).toEqual(chainStart);
  });

  it('ignores the wall being edited via ignoreWallId', () => {
    const editing = createWall({ x: 3000, y: 0 }, { x: 3000, y: 4000 });
    const result = snapWallEndpoint(
      { x: 3000, y: 5 },
      {
        walls: [editing],
        columns: [],
        snapDist: 100,
        ignoreWallId: editing.id,
      },
    );
    expect(result).toBeNull();
  });
});

describe('resolveWallEndpoints', () => {
  it('returns synced endpoints and cloned attachment metadata', () => {
    const col = makeColumn();
    const wall = createWall({ x: 0, y: 0 }, { x: 5000, y: 5000 }, 150, {
      startAttachment: cornerAttachment(col.id, 0),
    });
    const resolved = resolveWallEndpoints(wall, [col]);
    expect(resolved.start).toEqual({ x: 800, y: 850 });
    expect(resolved.end).toEqual({ x: 5000, y: 5000 });
    expect(resolved.startAttachment).toEqual(cornerAttachment(col.id, 0));
    expect(resolved.endAttachment).toBeNull();
  });
});

describe('getWallRenderData', () => {
  it('produces a 4-point rectangular outline for a straight wall', () => {
    const wall = createWall({ x: 0, y: 0 }, { x: 1000, y: 0 }, 200);
    const data = getWallRenderData(wall, []);
    expect(data.outline).toHaveLength(4);
    // A horizontal wall of thickness 200 offsets +/-100 in y.
    const ys = data.outline.map((p) => p.y).sort((a, b) => a - b);
    expect(ys[0]).toBeCloseTo(-100, 6);
    expect(ys[ys.length - 1]).toBeCloseTo(100, 6);
  });

  it('keeps the synced attachment point as the trim start and leaves the free end untrimmed', () => {
    const col = makeColumn(); // spans x in [800,1200], y in [850,1150]
    // Attached at the midpoint of the right face (1200,1000); wall runs to the right.
    const wall = createWall({ x: 1200, y: 1000 }, { x: 5000, y: 1000 }, 150, {
      startAttachment: { kind: 'column', columnId: col.id, featureType: 'face', featureIndex: 1, offset: 0 },
    });
    const data = getWallRenderData(wall, [col]);
    // sync places the start on the right face; the outward-pointing ray exits immediately,
    // so trimStart stays on the face rather than moving inward.
    expect(data.trimStart).toEqual({ x: 1200, y: 1000 });
    expect(data.trimEnd).toEqual({ x: 5000, y: 1000 });
  });

  it('trims a wall crossing a column back to the near column face', () => {
    const col = makeColumn(); // spans x in [800,1200]
    // Wall starts at the column center and heads right; attached at a corner so sync
    // repositions the start, then the trim ray re-enters/exits the column outline.
    const wall = createWall({ x: 1000, y: 1000 }, { x: 5000, y: 1000 }, 150, {
      startAttachment: cornerAttachment(col.id, 0),
    });
    const data = getWallRenderData(wall, [col]);
    // Current behavior: sync moves the start to corner 0 (800,850); the trim ray toward
    // (5000,1000) exits the column, so trimStart lands on the outline (x in [800,1200]).
    expect(data.trimStart.x).toBeGreaterThanOrEqual(800);
    expect(data.trimStart.x).toBeLessThanOrEqual(1200);
    expect(data.trimEnd).toEqual({ x: 5000, y: 1000 });
  });
});
