import { Suspense, useState } from 'react';
import { useEditorState, useProject } from '@/features/floorplan/context/FloorplanContext';
import { createEditorChunk, DetailEditorLoadBoundary } from './detailEditorChunk';
import { useShellFirst } from './useShellFirst';
import { WallEditorOpeningShell, resolveWallShellTarget } from './wallDetailEditorShell';

const wallEditorChunk = createEditorChunk(() => import('./WallDetailEditor'));
const pickBody = (module) => module.WallDetailEditorBody;

/** Fetch the wall editor's code ahead of its first opening. */
export const prefetchWallDetailEditor = wallEditorChunk.prefetch;

/**
 * The workspace's wall editor: its shell at once (the shell-first contract of
 * WallDetailEditor), the editor itself once its code is here. A click is
 * answered by the shell even on a cold first open; until the code arrives the
 * shell simply stays up.
 */
export default function WallDetailEditorLazy() {
  const { project } = useProject();
  const { wallDetailEditor, dispatch: editorDispatch } = useEditorState();
  const openKey = wallDetailEditor ? `${wallDetailEditor.floorId}:${wallDetailEditor.wallId}` : null;
  const { openedAt, ready } = useShellFirst(openKey, true);
  // Chosen once per opening: the editor itself when its code is already here,
  // else a lazy one. Swapping one for the other mid-opening would remount it.
  const [Body, setBody] = useState(() => wallEditorChunk.component(pickBody));

  const showsShell = !ready || !wallEditorChunk.loaded();
  const target = showsShell ? resolveWallShellTarget(project, wallDetailEditor) : null;
  const shell =
    wallDetailEditor && target?.wall ? (
      <WallEditorOpeningShell
        wallDetailEditor={wallDetailEditor}
        floor={target.floor}
        wall={target.wall}
        editorDispatch={editorDispatch}
        openedAt={openedAt}
      />
    ) : null;
  if (!ready && shell) return shell;

  return (
    <DetailEditorLoadBoundary
      dialogLabel="Wall assembly detail editor"
      closeTitle="Close the wall detail editor and return to the floorplan"
      onClose={() => editorDispatch({ type: 'CLOSE_WALL_DETAIL_EDITOR' })}
      onRetry={() => setBody(() => wallEditorChunk.component(pickBody))}
    >
      <Suspense fallback={shell}>
        <Body openedAt={openedAt} />
      </Suspense>
    </DetailEditorLoadBoundary>
  );
}
