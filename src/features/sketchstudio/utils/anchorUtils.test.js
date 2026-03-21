import { describe, expect, it } from 'vitest';
import { buildExportAnchorPayload, computeAnchorFromBounds, createDefaultAnchor, setPrimaryAnchor } from './anchorUtils';

describe('anchorUtils', () => {
  it('creates anchors from bounds', () => {
    const bounds = { minX: 10, minY: 20, maxX: 110, maxY: 220 };
    expect(createDefaultAnchor(bounds)).toMatchObject({ x: 10, y: 20, kind: 'primary' });
    expect(computeAnchorFromBounds(bounds, 'center')).toMatchObject({ x: 60, y: 120 });
  });

  it('builds export anchor payload from the primary anchor', () => {
    const anchors = setPrimaryAnchor([
      { id: 'a1', name: 'origin', x: 0, y: 0, kind: 'secondary' },
      { id: 'a2', name: 'center', x: 50, y: 25, kind: 'custom' },
    ], 'a2');

    expect(buildExportAnchorPayload({ anchors })).toMatchObject({ x: 50, y: 25, name: 'center', kind: 'primary' });
  });
});
