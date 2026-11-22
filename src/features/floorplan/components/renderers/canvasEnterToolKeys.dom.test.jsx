/* @vitest-environment jsdom */
/**
 * The plan keys that enter a tool already armed with something send exactly
 * these actions, in this order: SET_TOOL first, because it clears the tool
 * state the setting goes into. Recorded at the store, so whatever the key
 * handler is built from, what reaches the reducer is what is pinned.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { ClipboardProvider } from '@/app/ClipboardProvider';
import { ConfirmDialogProvider } from '@/ui/ConfirmDialog';
import { createProject } from '@/domain/models';
import { TOOLS } from '@/editor/tools';

const recorded = vi.hoisted(() => ({ actions: [] }));

vi.mock('@/features/floorplan/store/floorplanReducer', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    default: (state, action) => {
      recorded.actions.push(action);
      return original.default(state, action);
    },
  };
});

import { FloorplanProvider, useFloorplanContext } from '../../context/FloorplanContext';
import { DaylightStudyProvider } from '../../context/DaylightStudyContext';
import SvgCanvas from './SvgCanvas';

afterEach(cleanup);

const storeBox = { current: null };
const store = () => storeBox.current;

function StoreProbe() {
  const context = useFloorplanContext();
  useEffect(() => {
    storeBox.current = context;
  });
  return null;
}

function renderCanvas() {
  const router = createMemoryRouter([
    {
      path: '/',
      element: (
        <ConfirmDialogProvider>
          <ClipboardProvider>
            <FloorplanProvider initialProject={createProject('Keys')}>
              <DaylightStudyProvider>
                <StoreProbe />
                <SvgCanvas />
              </DaylightStudyProvider>
            </FloorplanProvider>
          </ClipboardProvider>
        </ConfirmDialogProvider>
      ),
    },
  ]);
  render(<RouterProvider router={router} />);
}

// The actions one key press sends, and only those.
function actionsOfKey(key) {
  recorded.actions.length = 0;
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
  return [...recorded.actions];
}

describe('plan keys that enter an armed tool', () => {
  beforeEach(() => {
    storeBox.current = null;
  });

  it('F arms the furniture tool with a kitchen top, square on', () => {
    renderCanvas();

    expect(actionsOfKey('f')).toEqual([
      { type: 'SET_TOOL', tool: TOOLS.FIXTURE },
      { type: 'UPDATE_TOOL_STATE', payload: { fixtureType: 'kitchenTop', previewRotation: 0 } },
    ]);
    expect(store().state.editor.toolState).toMatchObject({ fixtureType: 'kitchenTop', previewRotation: 0 });
  });

  it('T on the truss plan arms the truss draw tool with its target', () => {
    renderCanvas();
    act(() => store().dispatch({ type: 'SET_MODEL_TARGET', modelTarget: 'truss' }));

    expect(actionsOfKey('t')).toEqual([
      { type: 'SET_TOOL', tool: TOOLS.TRUSS_DRAW },
      {
        type: 'UPDATE_TOOL_STATE',
        payload: { targetTrussSystemId: null, trussTypeId: null, trussMaterial: null },
      },
    ]);
    expect(store().state.editor.activeTool).toBe(TOOLS.TRUSS_DRAW);
  });
});
