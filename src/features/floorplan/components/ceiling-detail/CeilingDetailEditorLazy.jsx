import { Suspense, useState } from 'react';
import { getProjectCeiling } from '@/domain/ceilingModels';
import { useEditorState, useProject } from '@/features/floorplan/context/FloorplanContext';
import {
  createEditorChunk,
  DetailEditorLoadBoundary,
} from '@/features/floorplan/components/wall-detail/detailEditorChunk';
import { useShellFirst } from '@/features/floorplan/components/wall-detail/useShellFirst';
import { CeilingEditorOpeningShell } from './ceilingDetailEditorShell';

const ceilingEditorChunk = createEditorChunk(() => import('./CeilingDetailEditor'));
const pickBody = (module) => module.CeilingDetailEditorBody;

/** Fetch the ceiling editor's code ahead of its first opening. */
export const prefetchCeilingDetailEditor = ceilingEditorChunk.prefetch;

/**
 * The workspace's ceiling editor: its shell at once (the shell-first contract
 * of CeilingDetailEditor), the editor itself once its code is here.
 */
export default function CeilingDetailEditorLazy() {
  const { project, dispatch, canUndo = false, canRedo = false } = useProject();
  const { ceilingDetailEditor, dispatch: editorDispatch } = useEditorState();
  const ceilingId = ceilingDetailEditor?.ceilingId ?? null;
  const { openedAt, ready } = useShellFirst(ceilingId, true);
  // Chosen once per opening; see WallDetailEditorLazy.
  const [Body, setBody] = useState(() => ceilingEditorChunk.component(pickBody));

  const showsShell = !ready || !ceilingEditorChunk.loaded();
  const storedCeiling = showsShell ? getProjectCeiling(project, ceilingId) : null;
  const shell =
    ceilingDetailEditor && storedCeiling ? (
      <CeilingEditorOpeningShell
        ceilingId={ceilingId}
        storedCeiling={storedCeiling}
        editorDispatch={editorDispatch}
        openedAt={openedAt}
      />
    ) : null;
  if (!ready && shell) return shell;

  return (
    <DetailEditorLoadBoundary
      dialogLabel="Ceiling assembly detail editor"
      closeTitle="Close the ceiling detail editor and return to the floorplan"
      onClose={() => editorDispatch({ type: 'CLOSE_CEILING_DETAIL_EDITOR' })}
      onRetry={() => setBody(() => ceilingEditorChunk.component(pickBody))}
    >
      <Suspense fallback={shell}>
        <Body
          project={project}
          dispatch={dispatch}
          canUndo={canUndo}
          canRedo={canRedo}
          ceilingDetailEditor={ceilingDetailEditor}
          editorDispatch={editorDispatch}
          openedAt={openedAt}
        />
      </Suspense>
    </DetailEditorLoadBoundary>
  );
}
