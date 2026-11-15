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

describe('Toolbar model target buttons', () => {
  it('say which of Floor, Roof, Truss and Sheets is current, like the view modes beside them', () => {
    const container = renderToolbar();
    const pressed = (label) =>
      [...container.querySelectorAll('button')]
        .find((button) => button.textContent.trim() === label)
        ?.getAttribute('aria-pressed');

    expect(pressed('Floor')).toBe('true');
    expect(pressed('Roof')).toBe('false');
    expect(pressed('Truss')).toBe('false');
    expect(pressed('Sheets')).toBe('false');
  });
});

describe('Toolbar unsaved dot (docs/paint-edit-performance.md §2.1)', () => {
  let animate;
  let cancel;

  beforeEach(() => {
    cancel = vi.fn();
    animate = vi.fn(() => ({ cancel }));
    // jsdom has no Web Animations; the toolbar only needs `animate` to exist.
    HTMLElement.prototype.animate = animate;
  });

  afterEach(() => {
    delete HTMLElement.prototype.animate;
    delete window.matchMedia;
    projectState.isDirty = false;
  });

  const saveButton = (container) => container.querySelector('button[aria-label="Save"]');

  it('breathes the dot with a compositor-only Web Animation while the project is dirty', () => {
    projectState.isDirty = true;
    const container = renderToolbar();

    expect(saveButton(container).getAttribute('data-dirty')).toBe('true');
    expect(animate).toHaveBeenCalledTimes(1);
    const [keyframes, options] = animate.mock.calls[0];
    // Opacity only: anything but opacity or transform would need the main
    // thread, and a transform makes every other main frame dearer.
    for (const frame of keyframes) {
      expect(Object.keys(frame).filter((key) => key !== 'offset')).toEqual(['opacity']);
    }
    expect(options).toMatchObject({ iterations: Infinity, pseudoElement: '::after' });
    expect(animate.mock.contexts[0]).toBe(saveButton(container));
  });

  it('starts nothing for a clean project, and stops on unmount', () => {
    const container = renderToolbar();
    expect(saveButton(container).getAttribute('data-dirty')).toBe('false');
    expect(animate).not.toHaveBeenCalled();

    cleanup();
    projectState.isDirty = true;
    renderToolbar();
    expect(animate).toHaveBeenCalledTimes(1);
    cleanup();
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('leaves the dot still under reduced motion', () => {
    window.matchMedia = vi.fn((query) => ({ matches: query === '(prefers-reduced-motion: reduce)' }));
    projectState.isDirty = true;
    renderToolbar();
    expect(animate).not.toHaveBeenCalled();
  });
});
