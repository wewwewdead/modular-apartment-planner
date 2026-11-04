/* @vitest-environment jsdom */
/*
 * The beam level chooser (BeamLevelChip) and the electrical device palette
 * (ElectricalDeviceChip) moved to chips over the plan because the toolbar's
 * tail is off-screen at ordinary window widths. These pin that neither came
 * back here, where nobody could click them.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TOOLS } from '@/editor/tools';

const editorState = {
  activeTool: TOOLS.BEAM,
  showGrid: true,
  snapEnabled: true,
  activeFloorId: 'floor_1',
  viewMode: 'plan',
  workspaceMode: 'model',
  modelTarget: 'floor',
  toolState: { beamPlacementMode: 'roof_ring' },
  activePhaseId: null,
  selectedId: null,
  selectedType: null,
  sunStudy: { enabled: false },
  dispatch: vi.fn(),
};

const projectState = {
  project: {
    floors: [{ id: 'floor_1', elevation: 3000, floorToFloorHeight: 3000, walls: [], columns: [] }],
    trussSystems: [],
  },
  isDirty: false,
  canUndo: false,
  canRedo: false,
  dispatch: vi.fn(),
};

vi.mock('@/features/floorplan/context/FloorplanContext', () => ({
  useEditor: () => editorState,
  useEditorState: () => editorState,
  useToolSettings: () => editorState.toolState,
  useProject: () => projectState,
}));

vi.mock('@/features/floorplan/hooks/usePlanClipboardController', () => ({
  usePlanClipboardController: () => ({
    canCopySelection: false,
    canPaste: false,
    copySelection: vi.fn(),
    cutSelection: vi.fn(),
    beginPaste: vi.fn(),
  }),
}));

import Toolbar from './Toolbar';

afterEach(cleanup);

function renderToolbar() {
  return render(
    <MemoryRouter>
      <Toolbar
        onNew={() => {}}
        onSave={() => {}}
        onShare={() => {}}
        onLoad={() => {}}
        isSidebarCollapsed={false}
        isPropertiesCollapsed={false}
        onToggleSidebar={() => {}}
        onToggleProperties={() => {}}
      />
    </MemoryRouter>,
  ).container;
}

describe('Toolbar beam level group', () => {
  it('no longer carries the beam placement elevation control with the Beam tool active', () => {
    const container = renderToolbar();

    expect(container.querySelector('[aria-label="Beam placement elevation"]')).toBeNull();
    expect(container.textContent).not.toContain('Beam level');
    expect(container.textContent).not.toContain('Floor/slab');
    expect(container.textContent).not.toContain('Top/roof');
  });
});

describe('Toolbar electrical device group', () => {
  beforeEach(() => {
    editorState.activeTool = TOOLS.ELECTRICAL;
    editorState.toolState = { deviceType: null };
  });

  afterEach(() => {
    editorState.activeTool = TOOLS.BEAM;
    editorState.toolState = { beamPlacementMode: 'roof_ring' };
  });

  it('no longer carries the device type palette with the Electrical tool active on a plan view', () => {
    const container = renderToolbar();

    expect(container.querySelector('[aria-label="Electrical device type"]')).toBeNull();
    expect(container.textContent).not.toContain('Device');
    for (const code of ['DUP', 'GFCI', '220', 'S3', 'SD']) {
      expect(container.textContent).not.toContain(code);
    }
    // The Electrical tool button itself stays — only the device palette moved.
    expect(container.querySelector('[aria-label="Electrical"]')).not.toBeNull();
  });
});

describe('Toolbar furniture popover', () => {
  afterEach(() => {
    editorState.activeTool = TOOLS.BEAM;
    editorState.toolState = { beamPlacementMode: 'roof_ring' };
    editorState.dispatch.mockClear();
  });

  it('puts every fixture type behind one Furniture button instead of a button each', () => {
    const container = renderToolbar();

    expect(container.querySelectorAll('[aria-label="Furniture"]')).toHaveLength(1);
    for (const label of ['Kitchen Top', 'Toilet', 'Lavatory', 'Table', 'TV', 'Sofa', 'Bed']) {
      expect(container.querySelector(`[aria-label="${label}"]`), label).toBeNull();
    }
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });

  it('opens a grid of the nine types and arms the one chosen', () => {
    const container = renderToolbar();
    const trigger = container.querySelector('[aria-label="Furniture"]');
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');

    act(() => {
      fireEvent.click(trigger);
    });
    const items = [...document.querySelectorAll('[role="menuitemradio"]')];
    expect(items.map((item) => item.textContent)).toEqual([
      'Sofa',
      'Table',
      'TV',
      'Bed',
      'Kitchen Top',
      'Toilet',
      'Lavatory',
      'Shower',
      'Plant',
    ]);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    act(() => {
      fireEvent.click(items.find((item) => item.textContent === 'Plant'));
    });
    expect(editorState.dispatch).toHaveBeenCalledWith({ type: 'SET_TOOL', tool: TOOLS.FIXTURE });
    expect(editorState.dispatch).toHaveBeenCalledWith({
      type: 'UPDATE_TOOL_STATE',
      payload: { fixtureType: 'plant', previewRotation: 0 },
    });
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });

  it('shows the armed type as a pressed trigger and a checked item', () => {
    editorState.activeTool = TOOLS.FIXTURE;
    editorState.toolState = { fixtureType: 'shower' };
    const container = renderToolbar();
    const trigger = container.querySelector('[aria-label="Furniture"]');

    expect(trigger.getAttribute('aria-pressed')).toBe('true');
    expect(trigger.getAttribute('data-armed-fixture')).toBe('shower');
    act(() => {
      fireEvent.click(trigger);
    });
    const checked = document.querySelector('[role="menuitemradio"][aria-checked="true"]');
    expect(checked.textContent).toBe('Shower');
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });
});
