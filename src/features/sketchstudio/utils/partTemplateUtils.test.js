import { describe, expect, it } from 'vitest';
import {
  createDoorPart,
  createPanelPart,
  createShelfPart,
} from './partTemplateUtils';

describe('partTemplateUtils', () => {
  it('creates panel and shelf parts with parametric metadata', () => {
    const panel = createPanelPart({ width: 600, height: 900, thickness: 18, material: 'plywood' });
    const shelf = createShelfPart({ width: 564, height: 432, thickness: 18, material: 'oak' });

    expect(panel.role).toBe('panel');
    expect(panel.parametric.template).toBe('panel');
    expect(panel.parametric.extents.width).toBe(600);
    expect(shelf.role).toBe('shelf');
    expect(shelf.material).toBe('oak');
  });

  it('creates furniture-specific templates', () => {
    const door = createDoorPart({ width: 500, height: 720, thickness: 18 });
    expect(door.role).toBe('door');
    expect(door.parametric.template).toBe('door');
  });
});
