import styles from './RouteProgress.module.css';

/**
 * The only thing on screen while a route module is on its way.
 *
 * Route chunks here are large — the floorplan workspace alone is well over a
 * megabyte of JavaScript — so a navigation into it takes seconds on a first
 * visit. Until the module lands the router has nothing new to render, so the
 * *previous* page stays up: without this, clicking "Floorplan" looked like the
 * click had simply been ignored.
 *
 * It is deliberately an overlay rather than a replacement screen. Keeping the
 * page you came from visible is the pleasant half of how the router behaves;
 * the only thing missing was any sign that something had been set in motion.
 */
export default function RouteProgress({ active }) {
  if (!active) return null;

  return (
    <>
      <div className={styles.bar} aria-hidden="true">
        <div className={styles.barFill} />
      </div>
      <div className={styles.label} role="status" aria-live="polite">
        <span className={styles.spinner} aria-hidden="true" />
        Opening workspace...
      </div>
    </>
  );
}

/**
 * Shown when the app is opened *directly* on a route whose module is still
 * loading — there is no previous page to keep, so this fills the window.
 */
export function RouteHydrateFallback() {
  return (
    <div className={styles.hydrateFallback} role="status" aria-live="polite">
      <span className={styles.spinner} aria-hidden="true" />
      Loading...
    </div>
  );
}
