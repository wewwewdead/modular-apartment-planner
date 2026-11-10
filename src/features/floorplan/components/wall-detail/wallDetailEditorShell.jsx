import { useMemo } from 'react';
import { WALL_DETAIL_SIDES } from '@/domain/wallDetailing';
import { wallElevationSilhouette } from '@/features/floorplan/components/preview/loadingSilhouettes';
import { LOADING_COPY, wallEditorDetail } from '@/ui/loading';
import DetailEditorShell from './DetailEditorShell';

/*
 * What the wall editor paints before any of it is derived — kept apart from the
 * editor itself so the workspace can show it at once and load the editor's own
 * code behind it (WallDetailEditorLazy).
 */

/** The opening shell's panel headers: the real sections' titles, in order. */
const WALL_SHELL_LEFT_SECTIONS = Object.freeze([
  { id: 'face', step: 1, title: 'Wall face' },
  { id: 'assembly', step: 2, title: 'Complete wall assembly' },
  { id: 'panels', step: 3, title: 'Panels' },
  { id: 'framing', step: 4, title: 'Framing' },
  { id: 'fasteners', step: 5, title: 'Fasteners' },
  { id: 'dimensions', step: 6, title: 'Construction dimensions' },
]);
const WALL_SHELL_RIGHT_SECTIONS = Object.freeze([
  { id: 'selection', title: 'Selection' },
  { id: 'takeoff', title: 'Exact takeoff' },
  { id: 'schedule', title: 'Dimension schedule' },
  { id: 'asBuilt', title: 'Site / as-built comparison' },
  { id: 'checks', title: 'Coordination checks' },
]);

/*
 * What the last opening of each wall face laid out, so the next one can say
 * how much it is laying out before deriving anything (§7: real numbers only).
 */
export const lastBoardCounts = new Map();

export const FOCUS_MODE_STORAGE_KEY = 'floorplan.wallDetailEditor.focusMode';

export function readFocusModePreference() {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(FOCUS_MODE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

/** The floor and wall an open wall editor is on, or nulls. Two lookups. */
export function resolveWallShellTarget(project, wallDetailEditor) {
  const floor = project.floors.find((entry) => entry.id === wallDetailEditor?.floorId) || null;
  const wall = floor?.walls.find((entry) => entry.id === wallDetailEditor?.wallId) || null;
  return { floor, wall };
}

/** The wall editor's frame for `wall`, drawn only from data already in memory. */
export function WallEditorOpeningShell({ wallDetailEditor, floor, wall, editorDispatch, openedAt }) {
  const silhouette = useMemo(() => wallElevationSilhouette(wall, floor), [wall, floor]);
  const side = wallDetailEditor.side || wall.assembly?.detailing?.activeSide || WALL_DETAIL_SIDES.INTERIOR;
  const boards = lastBoardCounts.get(`${wall.id}:${side}`);
  return (
    <DetailEditorShell
      dialogLabel="Wall assembly detail editor"
      eyebrow="Construction-detail workspace"
      title="Wall-local assembly editor"
      subtitle={wall.id}
      closeTitle="Close the wall detail editor and return to the floorplan"
      onClose={() => editorDispatch({ type: 'CLOSE_WALL_DETAIL_EDITOR' })}
      leftLabel="Wall detailing steps"
      leftSections={WALL_SHELL_LEFT_SECTIONS}
      rightLabel="Selection, numbers, and checks"
      rightSections={WALL_SHELL_RIGHT_SECTIONS}
      focus={readFocusModePreference()}
      silhouette={silhouette}
      label={LOADING_COPY.wallEditor}
      detail={boards === undefined ? undefined : wallEditorDetail(boards)}
      previewLabel={LOADING_COPY.livePreview}
      previewKind="wall"
      since={openedAt}
    />
  );
}
