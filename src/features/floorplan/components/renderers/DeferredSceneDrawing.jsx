import { useState } from 'react';
import { useVisibleDrawables } from '@/features/floorplan/hooks/useSectionDrawables';
import { loadingClock } from '@/ui/loading';
import { DeferredDrawingProgress, useDeferredDrawing } from './DeferredDrawing';
import SectionPlaceholder from './SectionPlaceholder';

/**
 * A section or elevation drawing that, inside the plan canvas, paints its
 * paper first and its hidden-line pass after (docs/night-section-freezes.md
 * §4.3.3); outside it (tests, static renders) it draws synchronously as it
 * always did.
 *
 * - First entry into a view: the placeholder — paper over the drawing's own
 *   envelope, its title and ground line where the drawing will put them —
 *   with the region bar, words from 300 ms; the drawing lands all at once and
 *   the paper fades off it.
 * - An edit while in the view (`viewKey` unchanged): the previous drawing
 *   stays up under the bar and a "Recomputing…" pill until the new one lands.
 *
 * `children(scene, drawables)` draws a finished (or stale) result; the scene it
 * is handed is the one those drawables belong to.
 */
export default function DeferredSceneDrawing({ kind, scene, viewKey, label, detail = null, children }) {
  const deferred = Boolean(useDeferredDrawing());
  const { status, scene: drawnScene, drawables } = useVisibleDrawables(kind, scene, { deferred, viewKey });
  // When this wait began — the click that opened the view, if there was one —
  // so the words land 300 ms after the user started waiting, not 300 ms after
  // a commit that may itself have come a frame or two later.
  const [loadingSince, setLoadingSince] = useState(null);
  if (status === 'loading' && loadingSince === null) setLoadingSince(loadingClock());
  if (status !== 'loading' && loadingSince !== null) setLoadingSince(null);

  return (
    <g data-drawing-status={status} aria-busy={status === 'ready' ? undefined : 'true'}>
      {drawables ? children(drawnScene, drawables) : null}
      {deferred ? (
        <SectionPlaceholder
          active={status === 'loading'}
          bounds={scene?.bounds}
          groundLevel={scene?.groundLevel}
          title={scene?.title}
          label={label}
          detail={detail}
          since={loadingSince ?? undefined}
        />
      ) : null}
      {deferred ? <DeferredDrawingProgress status={status} /> : null}
    </g>
  );
}
