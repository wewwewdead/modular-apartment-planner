/* @vitest-environment jsdom */
/*
 * The beam level chooser is the only way to place a tie/slab beam, and it was
 * unreachable while it lived in the toolbar's off-screen tail. These pin that
 * it appears over the plan whenever the Beam tool is active, reports the two
 * real elevations for the active floor, and writes the same
 * toolState.beamPlacementMode the placement handler reads.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { TOOLS } from '@/editor/tools';
import BeamLevelChip from './BeamLevelChip';

afterEach(cleanup);

// Storey datum at 3000; columns 3400 tall, so a top beam bears at 6400.
function createFloor() {
  return {
    id: 'floor_1',
    elevation: 3000,
    floorToFloorHeight: 3000,
    columns: [
      { id: 'column_a', x: 0, y: 0, width: 300, depth: 300, rotation: 0, height: 3400 },
      { id: 'column_b', x: 4000, y: 0, width: 300, depth: 300, rotation: 0, height: 3400 },
    ],
  };
}

function renderChip(overrides = {}) {
  const editorDispatch = vi.fn();
  const view = render(
    <BeamLevelChip
      activeTool={TOOLS.BEAM}
      viewMode="plan"
      modelTarget="floor"
      floor={createFloor()}
      beamPlacementMode="roof_ring"
      editorDispatch={editorDispatch}
      {...overrides}
    />,
  );
  const button = (label) => view.container.querySelector(`[aria-label^="${label}"]`);
  return { container: view.container, editorDispatch, button };
}

describe('BeamLevelChip', () => {
  it('offers both levels with the active floor elevations while the Beam tool is active', () => {
    const { container } = renderChip();

    const group = container.querySelector('[role="group"][aria-label="Beam placement elevation"]');
    expect(group).not.toBeNull();
    expect(group.textContent).toContain('Beam level');
    expect(group.textContent).toContain('Floor/slab · 3000 mm');
    expect(group.textContent).toContain('Top/roof · 6400 mm');
  });

  it('stays off the canvas for every other tool and view', () => {
    expect(renderChip({ activeTool: TOOLS.WALL }).container.textContent).toBe('');
    cleanup();
    expect(renderChip({ viewMode: 'section_view' }).container.textContent).toBe('');
    cleanup();
    expect(renderChip({ modelTarget: 'roof' }).container.textContent).toBe('');
    cleanup();
    expect(renderChip({ floor: null }).container.textContent).toBe('');
  });

  it('writes the chosen level into the tool state the placement handler reads', () => {
    const { editorDispatch, button } = renderChip();

    fireEvent.click(button('Place floor or slab beam'));
    expect(editorDispatch).toHaveBeenCalledWith({
      type: 'UPDATE_TOOL_STATE',
      payload: { beamPlacementMode: 'floor' },
    });

    fireEvent.click(button('Place top or roof beam'));
    expect(editorDispatch).toHaveBeenLastCalledWith({
      type: 'UPDATE_TOOL_STATE',
      payload: { beamPlacementMode: 'roof_ring' },
    });
  });

  it('marks the option the tool state currently holds, defaulting to the top beam', () => {
    const { button } = renderChip();
    expect(button('Place floor or slab beam').getAttribute('aria-pressed')).toBe('false');
    expect(button('Place top or roof beam').getAttribute('aria-pressed')).toBe('true');
    expect(button('Place top or roof beam').className).not.toBe(button('Place floor or slab beam').className);
    cleanup();

    const floorMode = renderChip({ beamPlacementMode: 'floor' });
    expect(floorMode.button('Place floor or slab beam').getAttribute('aria-pressed')).toBe('true');
    expect(floorMode.button('Place top or roof beam').getAttribute('aria-pressed')).toBe('false');
    cleanup();

    // Nothing chosen yet is a top beam, matching the handler's own fallback.
    const unset = renderChip({ beamPlacementMode: undefined });
    expect(unset.button('Place top or roof beam').getAttribute('aria-pressed')).toBe('true');
  });
});
