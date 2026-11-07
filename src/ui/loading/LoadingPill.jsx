import { LOADING_COPY, LOADING_TIMING } from './loadingCopy';
import Spinner from './Spinner';
import { useRef } from 'react';
import { useCompositorTiming, useDelayedFlag, usePresence } from './timing';
import styles from './LoadingPill.module.css';

/**
 * Spinner + words for a wait. Owns its timing: the words fade in after
 * `delayMs`, stay at least `minVisibleMs` once up, gain the `detail` line from
 * 2 s (or at once with `showDetail`), and from 10 s — when there is an
 * `action` to offer — admit the wait is long and offer the way out.
 *
 * The live region is mounted with the wait, words and all, so assistive tech
 * hears it at once; only the visual is held back (§3 rules 5 and 9).
 *
 * `placement`: 'viewport' (fixed, top centre of the window), 'region'
 * (absolute, top centre of its positioned parent), or 'inline'.
 */
export default function LoadingPill({
  active = true,
  label,
  detail,
  showDetail = false,
  delayMs = LOADING_TIMING.wordsDelayMs,
  minVisibleMs = LOADING_TIMING.minVisibleMs,
  placement = 'viewport',
  tone = 'light',
  action = null,
  since,
}) {
  const rootRef = useRef(null);
  useCompositorTiming(rootRef, { since, delayMs });
  const shown = useDelayedFlag(active, { delayMs, minVisibleMs, since });
  const detailDue = useDelayedFlag(active, { delayMs: LOADING_TIMING.detailDelayMs, since });
  const slow = useDelayedFlag(active && Boolean(action), { delayMs: LOADING_TIMING.slowDelayMs, since });
  // Fades out only if it was ever seen; a wait that ended unseen leaves at once.
  const { mounted: fading } = usePresence(shown, LOADING_TIMING.exitMs);
  if (!active && !fading) return null;

  const detailText = slow ? LOADING_COPY.slow : detail && (showDetail || detailDue) ? detail : null;

  return (
    <div
      ref={rootRef}
      className={styles.pill}
      data-placement={placement}
      data-tone={tone}
      data-words={shown ? 'shown' : active ? 'scheduled' : 'hidden'}
      data-loading-pill=""
      role="status"
      aria-live="polite"
    >
      <span className={styles.line}>
        <Spinner tone={tone === 'dark' ? 'dark' : 'light'} />
        {label}
      </span>
      {detailText ? <span className={styles.detail}>{detailText}</span> : null}
      {slow && action ? (
        <button type="button" className={styles.action} onClick={action.onClick}>
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
