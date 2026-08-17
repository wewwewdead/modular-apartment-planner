/* @vitest-environment jsdom */
/*
 * The beam level chooser (BeamLevelChip) and the electrical device palette
 * (ElectricalDeviceChip) moved to chips over the plan because the toolbar's
 * tail is off-screen at ordinary window widths. These pin that neither came
 * back here, where nobody could click them.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
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
