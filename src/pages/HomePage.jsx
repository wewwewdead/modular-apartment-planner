import { useEffect } from 'react';
import NavBar from './components/NavBar';
import HeroSection from './components/HeroSection';
import WorkspaceCards from './components/WorkspaceCards';
import FeatureGrid from './components/FeatureGrid';
import FooterCTA from './components/FooterCTA';
import styles from './HomePage.module.css';

/**
 * Fetch the floorplan route module while the browser has nothing better to do.
 *
 * Six of the links on this page lead to `/floorplan`, and its chunk is by far
 * the largest in the app — a first visit spends seconds downloading it after
 * the click. Reading the home page is dead time that can pay for most of that,
 * and the module resolves once, so the navigation later either finds it already
 * in hand or simply joins the request that is still in flight.
 *
 * Idle-scheduled rather than immediate: the home page has its own animations to
 * get through first, and this must not compete with them.
 */
function usePreloadFloorplanRoute() {
  useEffect(() => {
    // Best-effort: a failure here costs nothing, because the navigation will
    // ask for the module again and report the problem properly if it still
    // cannot be had.
    const preload = () => {
      import('./Floorplan').catch(() => {});
    };

    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(preload, { timeout: 3000 });
      return () => window.cancelIdleCallback(handle);
    }

    const timer = window.setTimeout(preload, 1500);
    return () => window.clearTimeout(timer);
  }, []);
}

export default function HomePage() {
  usePreloadFloorplanRoute();

  return (
    <div className={styles.page}>
      <NavBar />
      <HeroSection />
      <WorkspaceCards />
      <FeatureGrid />
      <FooterCTA />
    </div>
  );
}
