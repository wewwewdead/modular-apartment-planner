import styles from './RouteProgress.module.css';
import { LOADING_COPY, LoadingBar, LoadingPill, PanePlaceholder, routeLabel } from '@/ui/loading';

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
 * The bar answers at once; the pill is held back 100 ms so a navigation into an
 * already-loaded route never flashes one. `pathname` is where the navigation
 * is going, which is what the pill names.
 */
export default function RouteProgress({ active, pathname }) {
  // The bar stays mounted so the end of a navigation fades it out. The pill
  // leaves the instant the page arrives: the new page is the answer, and words
  // saying it is still opening would be stale over it.
  return (
    <>
      <LoadingBar active={active} placement="viewport" />
      {active ? <LoadingPill label={routeLabel(pathname)} placement="viewport" delayMs={100} /> : null}
    </>
  );
}

/**
 * Shown when the app is opened *directly* on a route whose module is still
 * loading — there is no previous page to keep, so this fills the window.
 */
export function RouteHydrateFallback() {
  return (
    <div className={styles.hydrateFallback}>
      <PanePlaceholder label={LOADING_COPY.opening} eyebrow={LOADING_COPY.appName} data-route-fallback="" />
    </div>
  );
}
