/* @vitest-environment jsdom */
/**
 * Which consumers a dispatch is allowed to wake.
 *
 * The store is one reducer, so before it was published through layered contexts
 * a pan frame re-rendered the toolbar, the sidebar, the properties panel and the
 * 3D preview along with the canvas that had actually moved. That is invisible
 * from the outside except as a frame rate, so the layering is pinned here by
 * counting renders per window onto the store.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { useEffect } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { ConfirmDialogProvider } from '@/ui/ConfirmDialog';
import { createProject } from '@/domain/models';
import {
  FloorplanProvider,
  useEditor,
  useEditorState,
  useProject,
  useToolSettings,
  useToolState,
  useViewport,
} from './FloorplanContext';

afterEach(cleanup);

const counts = {
  project: 0,
  editorState: 0,
  toolSettings: 0,
  toolState: 0,
  viewport: 0,
  editor: 0,
};

const box = { dispatch: null, editor: null };

/*
 * Counted from an effect rather than during render, so the probes stay pure. An
 * effect with no dependency list runs on every commit of its own component, and
 * a component React never re-rendered never commits — which is exactly the thing
 * being measured.
 */
function useCommitCount(key) {
  useEffect(() => {
    counts[key] += 1;
  });
}

function ProjectProbe() {
  const { dispatch } = useProject();
  useCommitCount('project');

  useEffect(() => {
    box.dispatch = dispatch;
  });

  return null;
}

function EditorStateProbe() {
  useEditorState();
  useCommitCount('editorState');
  return null;
}

function ToolSettingsProbe() {
  useToolSettings();
  useCommitCount('toolSettings');
  return null;
}

function ToolStateProbe() {
  useToolState();
  useCommitCount('toolState');
  return null;
}

function ViewportProbe() {
  useViewport();
  useCommitCount('viewport');
  return null;
}

function EditorProbe() {
  const editor = useEditor();
  useCommitCount('editor');

  useEffect(() => {
    box.editor = editor;
  });

  return null;
}

function renderProbes() {
  for (const key of Object.keys(counts)) counts[key] = 0;

  // A data router, because the workspace registers an unsaved-changes blocker.
  const router = createMemoryRouter([
    {
      path: '/',
      element: (
        <ConfirmDialogProvider>
          <FloorplanProvider initialProject={createProject('Layering')}>
            <ProjectProbe />
            <EditorStateProbe />
            <ToolSettingsProbe />
            <ToolStateProbe />
            <ViewportProbe />
            <EditorProbe />
          </FloorplanProvider>
        </ConfirmDialogProvider>
      ),
    },
  ]);

  const result = render(<RouterProvider router={router} />);
  const baseline = { ...counts };
  return { ...result, baseline };
}

function since(baseline) {
  return Object.fromEntries(Object.keys(counts).map((key) => [key, counts[key] - baseline[key]]));
}

describe('FloorplanContext layering', () => {
  it('a pan reaches the viewport and nothing else', () => {
    const { baseline } = renderProbes();

    act(() => box.dispatch({ type: 'PAN', dx: 20, dy: 10 }));

    const rendered = since(baseline);
    expect(rendered.viewport).toBe(1);
    expect(rendered.editor).toBe(1);
    expect(rendered.project).toBe(0);
    expect(rendered.editorState).toBe(0);
    expect(rendered.toolSettings).toBe(0);
    expect(rendered.toolState).toBe(0);
  });

  it('a ghost-preview frame reaches the live tool state and nothing else', () => {
    const { baseline } = renderProbes();

    act(() => box.dispatch({ type: 'UPDATE_TOOL_STATE', payload: { preview: { x: 1200, y: 800 } } }));

    const rendered = since(baseline);
    expect(rendered.toolState).toBe(1);
    expect(rendered.editor).toBe(1);
    expect(rendered.project).toBe(0);
    expect(rendered.editorState).toBe(0);
    // The settled choices are unmoved: arming a fixture is what changes these,
    // not the ghost that follows the pointer.
    expect(rendered.toolSettings).toBe(0);
    expect(rendered.viewport).toBe(0);
  });

  it('arming a tool does reach the settled tool choices', () => {
    const { baseline } = renderProbes();

    act(() => box.dispatch({ type: 'UPDATE_TOOL_STATE', payload: { fixtureType: 'toilet' } }));

    const rendered = since(baseline);
    expect(rendered.toolSettings).toBe(1);
    expect(rendered.project).toBe(0);
  });

  it('a selection reaches the editor slice, not the project facade', () => {
    const { baseline } = renderProbes();

    act(() => box.dispatch({ type: 'SELECT_OBJECT', id: 'wall_1', objectType: 'wall' }));

    const rendered = since(baseline);
    expect(rendered.editorState).toBe(1);
    expect(rendered.project).toBe(0);
    expect(rendered.viewport).toBe(0);
  });

  it('useEditor still hands back the flat editor slice', () => {
    renderProbes();

    expect(box.editor).toMatchObject({
      activeTool: 'select',
      modelTarget: 'floor',
      workspaceMode: 'model',
      viewMode: 'plan',
      selectedId: null,
      showGrid: true,
      snapEnabled: true,
      phaseViewMode: 'all',
    });
    expect(box.editor.toolState).toEqual({});
    expect(box.editor.viewport).toMatchObject({ panX: expect.any(Number), zoom: expect.any(Number) });
    expect(typeof box.editor.dispatch).toBe('function');
  });
});
