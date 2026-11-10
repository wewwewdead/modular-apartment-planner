import { startTransition, useState } from 'react';
import { loadingClock, useAfterPaint } from '@/ui/loading';

/**
 * The shell-first contract both assembly editors open under (§6.1): with
 * `mountShellFirst`, the first commit for `openKey` is the editor's frame, and
 * the real editor is let in after that frame has painted, as a transition.
 * Without it the editor renders in one pass (`ready` from the start).
 *
 * `openedAt` is when this opening began, for the loading copy's timers.
 */
export function useShellFirst(openKey, mountShellFirst) {
  const [openedAt] = useState(loadingClock);
  const [readyFor, setReadyFor] = useState(mountShellFirst ? null : openKey);
  const ready = !mountShellFirst || readyFor === openKey;
  useAfterPaint(() => {
    if (!ready) startTransition(() => setReadyFor(openKey));
  }, [openKey, ready]);
  return { openedAt, ready };
}
