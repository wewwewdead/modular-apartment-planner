/* @vitest-environment jsdom */
/**
 * Focus mode's Escape. The guard leaves focus on an Escape nobody else used,
 * and stands aside while the canvas is cancelling something, or while a wall
 * or ceiling detail editor covers the plan: an Escape pressed in the editor is
 * the editor's, not a request to leave the focus mode behind it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';

const editorState = {
  pastePreview: { active: false, point: null },
  wallDetailEditor: null,
  ceilingDetailEditor: null,
  dispatch: vi.fn(),
};
let toolState = {};

vi.mock('./context/FloorplanContext', () => ({
  FloorplanProvider: ({ children }) => children,
  useEditorState: () => editorState,
  useToolState: () => toolState,
  useFloorplanContext: () => ({}),
}));

import { FocusEscapeGuard } from './FloorplanWorkspace';

afterEach(cleanup);

function pressEscape() {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
}

const leftFocus = () =>
  editorState.dispatch.mock.calls.some(([action]) => action.type === 'TOGGLE_FOCUS_PANEL' && action.panel === null);

describe('FocusEscapeGuard', () => {
  beforeEach(() => {
    editorState.dispatch.mockClear();
    editorState.wallDetailEditor = null;
    editorState.ceilingDetailEditor = null;
    toolState = {};
  });

  it('leaves focus on an Escape nothing else wanted', () => {
    render(<FocusEscapeGuard focusedPanel="canvas" />);
    pressEscape();
    expect(leftFocus()).toBe(true);
  });

  it('stands aside while a tool flow is under way on the canvas', () => {
    toolState = { start: { x: 0, y: 0 } };
    render(<FocusEscapeGuard focusedPanel="canvas" />);
    pressEscape();
    expect(leftFocus()).toBe(false);
  });

  it.each([
    ['wall', 'wallDetailEditor', { floorId: 'floor_1', wallId: 'wall_1' }],
    ['ceiling', 'ceilingDetailEditor', { ceilingId: 'ceiling_1' }],
  ])('stands aside while the %s detail editor is open', (name, key, value) => {
    editorState[key] = value;
    for (const focusedPanel of ['canvas', 'preview']) {
      render(<FocusEscapeGuard focusedPanel={focusedPanel} />);
      pressEscape();
      cleanup();
    }
    expect(leftFocus()).toBe(false);
  });
});
