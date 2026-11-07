import { LOADING_TIMING } from './loadingCopy';
import { useDelayedFlag, usePresence } from './timing';
import styles from './LoadingBar.module.css';

/**
 * The 3 px indeterminate bar — the one loading element with no delay by
 * default, because it is what answers the click (§3 rule 1).
 *
 * `placement`: 'viewport' (fixed to the top of the window) or 'region'
 * (absolute to the top of the nearest positioned parent).
 */
export default function LoadingBar({ active = true, placement = 'viewport', delayMs = 0, tone = 'light' }) {
  const shown = useDelayedFlag(active, { delayMs });
  const { mounted, leaving } = usePresence(active && shown, LOADING_TIMING.exitMs);
  if (!mounted) return null;

  return (
    <div
      className={styles.bar}
      data-loading-bar={placement}
      data-placement={placement}
      data-tone={tone}
      data-leaving={leaving ? 'true' : 'false'}
      aria-hidden="true"
    >
      <div className={styles.fill} />
    </div>
  );
}
