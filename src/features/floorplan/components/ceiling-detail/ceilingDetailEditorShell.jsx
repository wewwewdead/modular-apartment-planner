import { useMemo } from 'react';
import { ceilingSilhouette } from '@/features/floorplan/components/preview/loadingSilhouettes';
import DetailEditorShell from '@/features/floorplan/components/wall-detail/DetailEditorShell';
import { LOADING_COPY, ceilingEditorDetail } from '@/ui/loading';

/*
 * What the ceiling editor paints before any of it is derived — kept apart from
 * the editor itself so the workspace can show it at once and load the editor's
 * own code behind it (CeilingDetailEditorLazy).
 */

/*
 * What the last opening of each ceiling laid out, so the next one can say how
 * much it is laying out before it has derived anything (§7: the detail line
 * only ever carries real numbers). Per session; a first open has no detail.
 */
export const lastLayoutCounts = new Map();

/** The opening shell's panel headers: the real sections' titles, in order. */
const CEILING_SHELL_LEFT_SECTIONS = Object.freeze([
  { id: 'face', step: 1, title: 'Face and boards' },
  { id: 'structure', step: 2, title: 'Structure' },
  { id: 'suspension', step: 3, title: 'Suspension' },
  { id: 'openings', step: 4, title: 'Openings' },
  { id: 'lighting', step: 5, title: 'Lighting' },
  { id: 'screws', step: 6, title: 'Screws' },
  { id: 'dimensions', step: 7, title: 'Dimensions' },
  { id: 'takeoff', step: 8, title: 'Takeoff' },
]);
const CEILING_SHELL_RIGHT_SECTIONS = Object.freeze([
  { id: 'selection', title: 'Selection' },
  { id: 'summary', title: 'Takeoff summary' },
  { id: 'elevations', title: 'Elevations' },
]);

/** The ceiling editor's frame for `storedCeiling`, drawn only from data already in memory. */
export function CeilingEditorOpeningShell({ ceilingId, storedCeiling, editorDispatch, openedAt }) {
  const boundary = storedCeiling.boundaryPolygon;
  const silhouette = useMemo(() => ceilingSilhouette({ boundaryPolygon: boundary }), [boundary]);
  const counts = lastLayoutCounts.get(ceilingId);
  return (
    <DetailEditorShell
      dialogLabel="Ceiling assembly detail editor"
      eyebrow="Reflected ceiling plan workspace"
      title="Ceiling assembly editor — reflected ceiling plan"
      subtitle={storedCeiling.name || 'Ceiling'}
      closeTitle="Close the ceiling detail editor and return to the floorplan"
      onClose={() => editorDispatch({ type: 'CLOSE_CEILING_DETAIL_EDITOR' })}
      leftLabel="Ceiling detailing steps"
      leftSections={CEILING_SHELL_LEFT_SECTIONS}
      rightLabel="Selection and numbers"
      rightSections={CEILING_SHELL_RIGHT_SECTIONS}
      silhouette={silhouette}
      label={LOADING_COPY.ceilingEditor}
      detail={counts ? ceilingEditorDetail(counts.boards, counts.screws) : undefined}
      previewLabel={LOADING_COPY.livePreview}
      previewKind="ceiling"
      since={openedAt}
    />
  );
}
