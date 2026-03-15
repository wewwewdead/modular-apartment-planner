import { Link } from 'react-router-dom';
import styles from './HeroSection.module.css';

function GridBackground() {
  return (
    <svg
      className={styles.gridBackground}
      width="100%"
      height="100%"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <pattern id="heroGridMinor" width="30" height="30" patternUnits="userSpaceOnUse">
          <circle cx="15" cy="15" r="0.5" fill="var(--color-grid-minor)" />
        </pattern>
        <pattern id="heroGridMajor" width="120" height="120" patternUnits="userSpaceOnUse">
          <rect width="120" height="120" fill="url(#heroGridMinor)" />
          <line x1="0" y1="0" x2="120" y2="0" stroke="var(--color-grid-minor)" strokeWidth="0.5" />
          <line x1="0" y1="0" x2="0" y2="120" stroke="var(--color-grid-minor)" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#heroGridMajor)" />
    </svg>
  );
}

export default function HeroSection() {
  return (
    <section className={styles.hero}>
      <GridBackground />
      <div className={styles.content}>
        <h1 className={styles.title}>Modular Apartment Planner</h1>
        <p className={styles.tagline}>
          Design, iterate, and document — from concept to construction.
        </p>
        <div className={styles.ctas}>
          <Link to="/floorplan" className={styles.primaryCta}>
            Open Floorplan Editor
          </Link>
          <Link to="/sketch" className={styles.ghostCta}>
            Try Sketch Studio
          </Link>
        </div>
        <Link to="/playground" className={styles.playgroundLink}>
          or explore the playground &rarr;
        </Link>
      </div>
    </section>
  );
}
