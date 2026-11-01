// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createFloor } from '@/domain/models';
import { AnnotationSettingsProperties } from './DimensionProperties';

/**
 * The Annotations panel's "Sheets only" note covers all three derived
 * dimension switches, because the plan canvas draws none of them. It must sit
 * after Overall Dimensions (or Overall reads as if it applied to the canvas)
 * and before Object Tags (which do draw on the canvas).
 */

let container = null;
let root = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

function mount() {
  const floor = { ...createFloor('Ground', 0), id: 'floor_ground' };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<AnnotationSettingsProperties floor={floor} dispatch={() => {}} />));
}

describe('AnnotationSettingsProperties', () => {
  it('lists the three derived dimension switches, then the sheets-only note, then Object Tags', () => {
    mount();
    const text = container.textContent;
    const at = (needle) => {
      const index = text.indexOf(needle);
      expect(index, needle).toBeGreaterThanOrEqual(0);
      return index;
    };

    const wall = at('Wall Dimensions');
    const room = at('Room Dimensions');
    const overall = at('Overall Dimensions');
    const note = at('Sheets only — the plan never draws derived dimensions. Select an object to read its size here.');
    const tags = at('Object Tags');

    expect(wall).toBeLessThan(room);
    expect(room).toBeLessThan(overall);
    expect(overall).toBeLessThan(note);
    expect(note).toBeLessThan(tags);
  });
});
