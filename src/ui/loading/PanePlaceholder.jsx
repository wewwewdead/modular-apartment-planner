import { LOADING_COPY, LOADING_TIMING } from './loadingCopy';
import Spinner from './Spinner';
import { useRef } from 'react';
import { useCompositorTiming, useDelayedFlag, usePresence } from './timing';
import styles from './PanePlaceholder.module.css';

/**
 * The stand-in for a region that is not ready: grid paper, the outline of
 * what is coming (when the caller knows it), and — from 300 ms — the words.
 *
 * - `tone`: 'paper' for drawings and panels, 'dark' for 3D panes.
 * - `silhouette`: `{ viewBox, children }`, inline SVG in the caller's own
 *   units, drawn as a breathing hairline. Built from data already in memory.
 * - `state`: written to `data-loading-state` for scripts ('loading',
 *   'compiling', … ) — 'error' swaps the words for `error.message` and its
 *   "Try again" / "Go back".
 * - `active={false}` fades the placeholder out (with `overlay`, over the
 *   content that has arrived beneath it) and then unmounts it.
 * - `since`: when the wait began, so a placeholder that replaces another
 *   mid-wait keeps the same 300 ms / 2 s / 10 s timeline.
 *
 * Any other prop (`data-*`, `aria-label`) lands on the root.
 */
export default function PanePlaceholder({
  label,
  detail,
  showDetail = false,
  tone = 'paper',
  size = 'regular',
  silhouette = null,
  eyebrow = null,
  delayMs = LOADING_TIMING.wordsDelayMs,
  state = 'loading',
  error = null,
  action = null,
  active = true,
  overlay = false,
  since,
  className = '',
  ...rest
}) {
  const rootRef = useRef(null);
  const entering = useCompositorTiming(rootRef, { since, delayMs });
  const isError = state === 'error';
  const waiting = active && !isError;
  const wordsShown = useDelayedFlag(waiting, { delayMs, minVisibleMs: LOADING_TIMING.minVisibleMs, since });
  const detailDue = useDelayedFlag(waiting, { delayMs: LOADING_TIMING.detailDelayMs, since });
  const slow = useDelayedFlag(waiting && Boolean(action), { delayMs: LOADING_TIMING.slowDelayMs, since });
  // Words that made it onto the screen stay their 400 ms even when the content
  // arrives sooner: the placeholder waits for them before it fades.
  const { mounted, leaving } = usePresence(active || (wordsShown && !isError), LOADING_TIMING.exitMs);
  if (!mounted) return null;

  const detailText = slow ? LOADING_COPY.slow : detail && (showDetail || detailDue) ? detail : null;
  // 'scheduled' reveals itself by CSS at --words-delay; 'shown' once the
  // timer has caught up; 'hidden' as the placeholder leaves.
  const words = wordsShown && !leaving ? 'shown' : waiting ? 'scheduled' : 'hidden';

  return (
    <div
      {...rest}
      ref={rootRef}
      className={`${styles.pane} ${className}`}
      data-enter={entering ? 'true' : 'false'}
      data-tone={tone}
      data-size={size}
      data-state={isError ? 'error' : 'loading'}
      data-loading-state={state}
      data-overlay={overlay ? 'true' : 'false'}
      data-leaving={leaving ? 'true' : 'false'}
      aria-busy={waiting ? 'true' : 'false'}
    >
      {silhouette ? (
        <svg
          className={styles.silhouette}
          viewBox={silhouette.viewBox}
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
          focusable="false"
        >
          {silhouette.children}
        </svg>
      ) : null}
      {eyebrow ? <div className={styles.eyebrow}>{eyebrow}</div> : null}
      {isError ? (
        <div className={styles.words} data-words="shown" role="alert">
          <span className={styles.message}>{error?.message || LOADING_COPY.previewFailed}</span>
          {error?.onRetry || error?.onBack ? (
            <span className={styles.actions}>
              {error.onRetry ? (
                <button type="button" onClick={error.onRetry}>
                  {LOADING_COPY.tryAgain}
                </button>
              ) : null}
              {error.onBack ? (
                <button type="button" onClick={error.onBack}>
                  {LOADING_COPY.goBack}
                </button>
              ) : null}
            </span>
          ) : null}
        </div>
      ) : label ? (
        <div className={styles.words} data-words={words} role="status" aria-live="polite">
          <span className={styles.label}>
            <Spinner tone={tone === 'dark' ? 'dark' : 'light'} />
            {label}
          </span>
          {detailText ? <span className={styles.detail}>{detailText}</span> : null}
          {slow && action ? (
            <span className={styles.actions}>
              <button type="button" onClick={action.onClick}>
                {action.label}
              </button>
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
