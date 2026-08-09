import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFloor } from '@/domain/models';
import { createCeiling } from '@/domain/ceilingModels';
import CeilingDetailEditor from './CeilingDetailEditor';

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

describe('CeilingDetailEditor', () => {
  beforeEach(() => {
    const floor = createFloor('Ground', 0);
    const ceiling = createCeiling('Living room ceiling', {
      floorId: floor.id,
      boundaryPolygon: [
        { x: 0, y: 0 },
        { x: 6000, y: 0 },
        { x: 6000, y: 4000 },
        { x: 0, y: 4000 },
      ],
    });
    mocks.project = { id: 'project', floors: [floor], ceilings: [ceiling], trussSystems: [] };
    mocks.editor = { ceilingDetailEditor: { ceilingId: ceiling.id } };
    mocks.dispatch.mockReset();
    mocks.editorDispatch.mockReset();
  });

  it('renders the reflected-ceiling-plan workspace and every workflow section', () => {
    const html = renderToStaticMarkup(<CeilingDetailEditor />);

    expect(html).toContain('Ceiling assembly editor — reflected ceiling plan');
    expect(html).toContain('Living room ceiling');
    expect(html).toContain('Face and boards');
    expect(html).toContain('Structure');
    expect(html).toContain('Suspension');
    expect(html).toContain('Openings');
    expect(html).toContain('Screws');
    expect(html).toContain('Takeoff');
    expect(html).toContain('RCP');
    expect(html).toContain('Split');
    expect(html).toContain('Live 3D');
    expect(html).toContain('Updates after every committed board, member, screw, opening, or suspension edit');
  });

  it('exposes every canvas tool as an icon button with a keyboard shortcut', () => {
    const html = renderToStaticMarkup(<CeilingDetailEditor />);

    expect(html).toContain('aria-label="Drawing tools"');
    ['V', 'H', 'P', 'T', 'S', 'C', 'O', 'F', 'Del'].forEach((shortcut) => {
      expect(html).toContain(`aria-keyshortcuts="${shortcut}"`);
    });
    expect(html).toContain('Draw board (rectangle) — drag out a ceiling board (P)');
    expect(html).toContain('Trace cut board — click each corner, then close the outline (T)');
    expect(html).toContain('Draw furring channel — click for the full width, or drag its span (S)');
    expect(html).toContain('Draw carrier — click for the full depth, or drag its span (C)');
    expect(html).toContain('Draw opening — drag out a hatch, downlight, or diffuser cut-out (O)');
    expect(html).toContain('Esc cancels, then returns to Select');
  });

  it('renders the canvas chrome: mm rulers, the real snap grid, and undo/redo controls', () => {
    const html = renderToStaticMarkup(<CeilingDetailEditor />);

    expect(html).toContain('data-testid="wall-rulers"');
    expect(html).toContain('wall-grid-major');
    expect(html).toContain('wall-grid-minor');
    expect(html).toContain('Undo the last change (Ctrl+Z)');
    expect(html).toContain('Redo the undone change (Ctrl+Y)');
    expect(html).toContain('Fit the whole ceiling in view (0)');
  });

  it('states the plan-aligned RCP convention on the status line and never mirrors U', () => {
    const html = renderToStaticMarkup(<CeilingDetailEditor />);

    expect(html).toContain('U 0 → 6000 mm');
    expect(html).toContain('V 0 → 4000 mm');
    expect(html).toContain('Origin: south-west corner · North up · matches floor plan');
    expect(html).toContain('data-mirrored="false"');
    expect(html).toContain('translate(0 4000) scale(1 -1)');
  });

  it('lists the takeoff the installer orders from', () => {
    const html = renderToStaticMarkup(<CeilingDetailEditor />);

    [
      'Boards',
      'Stock sheets',
      'Installed area',
      'Screws',
      'Furring',
      'Carrier',
      'Wall angle',
      'Trimmers',
      'Hangers',
    ].forEach((label) => {
      expect(html).toContain(label);
    });
  });

  it('gives the right panel a selection inspector with an empty state', () => {
    const html = renderToStaticMarkup(<CeilingDetailEditor />);

    expect(html).toContain('Nothing selected');
    expect(html).toContain('click a board, furring channel, screw, or opening on the plan');
  });

  it('keeps every workflow section as an accordion with a controlled body', () => {
    const html = renderToStaticMarkup(<CeilingDetailEditor />);

    expect(html).toContain('aria-controls="wall-detail-ceiling-face"');
    expect(html).toContain('aria-controls="wall-detail-ceiling-structure"');
    expect(html).toContain('aria-controls="wall-detail-ceiling-suspension"');
    expect(html).toContain('aria-controls="wall-detail-ceiling-openings"');
    expect(html).toContain('aria-controls="wall-detail-ceiling-screws"');
    expect(html).toContain('aria-controls="wall-detail-ceiling-takeoff"');
    expect(html).toContain('aria-expanded="false"');
  });

  it('carries the professional-review disclaimer for the selected product profile', () => {
    const html = renderToStaticMarkup(<CeilingDetailEditor />);

    // The default profile is a custom assumption, not a verified manufacturer rule set.
    expect(html).toContain('custom assumption');
    expect(html).toContain('A qualified professional must review the whole assembly before construction.');
  });

  it('shows an unavailable card with a close action when the ceiling is gone', () => {
    mocks.editor = { ceilingDetailEditor: { ceilingId: 'ceiling_missing' } };

    const html = renderToStaticMarkup(<CeilingDetailEditor />);

    expect(html).toContain('Ceiling detail is unavailable');
    expect(html).toContain('The ceiling or owning floor no longer exists.');
    expect(html).toContain('Close');
  });

  it('renders nothing when the editor is closed', () => {
    mocks.editor = { ceilingDetailEditor: null };

    expect(renderToStaticMarkup(<CeilingDetailEditor />)).toBe('');
  });
});
