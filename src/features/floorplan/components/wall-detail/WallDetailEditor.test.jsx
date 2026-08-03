import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFloor, createWall } from '@/domain/models';
import { createWallAssembly } from '@/domain/wallAssemblies';
import { createWallDetailing } from '@/domain/wallDetailing';
import WallDetailEditor from './WallDetailEditor';

const mocks = vi.hoisted(() => ({
  project: null,
  dispatch: vi.fn(),
  editorDispatch: vi.fn(),
  editor: null,
}));

vi.mock('@/features/floorplan/context/FloorplanContext', () => ({
  useProject: () => ({ project: mocks.project, dispatch: mocks.dispatch }),
  useEditor: () => ({ ...mocks.editor, dispatch: mocks.editorDispatch }),
}));

describe('WallDetailEditor', () => {
  beforeEach(() => {
    const floor = createFloor('Ground', 0);
    const wall = createWall({ x: 0, y: 0 }, { x: 3000, y: 0 }, 100, {
      assembly: { preset: 'fiber_cement', framing: { spacing: 400, nogginRows: 1 } },
    });
    wall.assembly.detailing = createWallDetailing({
      enabled: true,
      sides: { interior: { enabled: true } },
    });
    floor.walls = [wall];
    mocks.project = { id: 'project', floors: [floor] };
    mocks.editor = { wallDetailEditor: { floorId: floor.id, wallId: wall.id } };
    mocks.dispatch.mockReset();
    mocks.editorDispatch.mockReset();
  });

  it('renders the wall-local workspace, exact takeoff, validation, exports, and as-built controls', () => {
    const html = renderToStaticMarkup(<WallDetailEditor />);

    expect(html).toContain('Wall-local assembly editor');
    expect(html).toContain('Complete wall assembly');
    expect(html).toContain('Panel layout');
    expect(html).toContain('Select / move');
    expect(html).toContain('Pan');
    expect(html).toContain('Fit wall');
    expect(html).toContain('Split');
    expect(html).toContain('Live 3D');
    expect(html).toContain('Updates after every committed panel, frame, screw, gap, or assembly edit');
    expect(html).toContain('Draw panel');
    expect(html).toContain('Trace cut panel');
    expect(html).toContain('Express joint — open shadow reveal');
    expect(html).toContain('Vertical reveal');
    expect(html).toContain('Shadow reveal');
    expect(html).toContain('Hold Space + drag to pan');
    expect(html).toContain('Panel landing / side');
    expect(html).toContain('(50 mm support − reveal) ÷ 2');
    expect(html).toContain('Aesthetic shadow line');
    expect(html).toContain('Draw stud');
    expect(html).toContain('Add missing joint backing');
    expect(html).toContain('Place screw');
    expect(html).toContain('Visual expression');
    expect(html).toContain('Quiet / panel-matched');
    expect(html).toContain('Deliberate dark accent');
    expect(html).toContain('Head diameter');
    expect(html).toContain('keep the fixing rhythm quiet and regular');
    expect(html).toContain('Measured screw pencil guide');
    expect(html).toContain('panel edge is the set-out datum');
    expect(html).toContain('Trace selected panel perimeter');
    expect(html).toContain('Trace all panel perimeters');
    expect(html).toContain('Apply guide screws');
    expect(html).toContain('Screw pitch O.C.');
    expect(html).toContain('Edge setback');
    expect(html).toContain('Corner setback');
    expect(html).toContain('Product planning maximum');
    expect(html).toContain('Construction dimensions');
    expect(html).toContain('Draw measurement');
    expect(html).toContain('64-bit model geometry');
    expect(html).toContain('Click two exact points to measure, or drag; hold Shift');
    expect(html).toContain('Aim for the green snap target');
    expect(html).toContain('drag either green endpoint');
    expect(html).toContain('drag the amber line to move the whole guide');
    expect(html).toContain('Place Screw snaps continuously to user measurements and their crossings');
    expect(html).toContain('Measure precision: 0.01 mm');
    expect(html).toContain('Overall width and height');
    expect(html).toContain('Dimension schedule');
    expect(html).toContain('Exact takeoff');
    expect(html).toContain('Export drawing SVG');
    expect(html).toContain('Site / as-built comparison');
    expect(html).toContain('Coordination checks');
  });

  it('guides a first-time user with an orientation card, a numbered workflow, and collapsible steps', () => {
    const html = renderToStaticMarkup(<WallDetailEditor />);

    // First-open orientation card.
    expect(html).toContain('Detail this wall in six steps');
    expect(html).toContain('Got it');

    // Numbered workflow strip covering every step through checking and export.
    expect(html).toContain('aria-label="Wall detailing workflow"');
    expect(html).toContain('Workflow');
    expect(html).toContain('Boards');
    expect(html).toContain('Screws');

    // Each panel section is an accordion header with a controlled body.
    expect(html).toContain('aria-controls="wall-detail-face"');
    expect(html).toContain('aria-controls="wall-detail-panels"');
    expect(html).toContain('aria-controls="wall-detail-checks"');
    expect(html).toContain('aria-expanded="false"');

    // Advanced fields stay reachable, just folded away by default.
    expect(html).toContain('Advanced framing');
    expect(html).toContain('Product and code rules');
    expect(html).toContain('Screw appearance');
    expect(html).toContain('Layout offset');
    expect(html).toContain('Grid origin U');
    expect(html).toContain('Joint finish');
  });

  it('exposes every canvas tool as an icon button with a keyboard shortcut', () => {
    const html = renderToStaticMarkup(<WallDetailEditor />);

    expect(html).toContain('aria-label="Drawing tools"');
    ['V', 'H', 'P', 'T', 'S', 'N', 'F', 'M', 'Del'].forEach((shortcut) => {
      expect(html).toContain(`aria-keyshortcuts="${shortcut}"`);
    });
    expect(html).toContain('Select / move — click to pick anything, drag to move it (V)');
    expect(html).toContain('Trace cut panel — click each corner, then close the outline (T)');
    expect(html).toContain('Draw measurement — click two exact points, or drag; Shift locks level/plumb (M)');
    expect(html).toContain('Esc cancels, then returns to Select');
  });

  it('renders the canvas chrome: mm rulers, the real snap grid, and undo/redo controls', () => {
    const html = renderToStaticMarkup(<WallDetailEditor />);

    expect(html).toContain('data-testid="wall-rulers"');
    expect(html).toContain('wall-grid-major');
    expect(html).toContain('wall-grid-minor');
    expect(html).toContain('Undo the last change (Ctrl+Z)');
    expect(html).toContain('Redo the undone change (Ctrl+Y)');
    expect(html).toContain('Fit the whole wall in view (0)');
  });

  it('gives the right panel a selection inspector with an empty state', () => {
    const html = renderToStaticMarkup(<WallDetailEditor />);

    expect(html).toContain('Nothing selected');
    expect(html).toContain('click a board, stud, screw, or measurement on the drawing');
  });

  it('opens the explicitly requested outside fiber-cement face instead of the inside plywood face', () => {
    const wall = mocks.project.floors[0].walls[0];
    wall.assembly = createWallAssembly('mixed_board', {
      interior: { material: 'plywood', thickness: 12, layerCount: 1 },
      exterior: { material: 'fiber_cement', thickness: 6, layerCount: 1 },
      detailing: createWallDetailing({ enabled: true, activeSide: 'exterior' }),
    });
    mocks.editor.wallDetailEditor = { ...mocks.editor.wallDetailEditor, side: 'exterior' };

    const html = renderToStaticMarkup(<WallDetailEditor />);

    expect(html).toContain('Editing outside face · Fiber cement');
    expect(html).toContain('Outside · Fiber cement');
    expect(html).toContain('value="fiber_cement" selected=""');
  });
});
