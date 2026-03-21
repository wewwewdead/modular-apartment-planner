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

function DecorativeLines() {
  return (
    <svg
      className={styles.decorativeLines}
      viewBox="0 0 800 600"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid slice"
    >
      {/* Diagonal construction line — top-left to center */}
      <line
        x1="80" y1="60" x2="400" y2="300"
        className={styles.drawLine}
        stroke="var(--color-arch-line)"
        strokeWidth="0.5"
        strokeDasharray="450"
        strokeDashoffset="450"
      />
      {/* Diagonal construction line — top-right to center */}
      <line
        x1="720" y1="80" x2="400" y2="300"
        className={styles.drawLine}
        stroke="var(--color-arch-line)"
        strokeWidth="0.5"
        strokeDasharray="400"
        strokeDashoffset="400"
      />
      {/* Compass arc near center */}
      <path
        d="M 360 260 A 60 60 0 0 1 440 260"
        className={styles.drawLine}
        stroke="var(--color-arch-line-strong)"
        strokeWidth="0.5"
        fill="none"
        strokeDasharray="95"
        strokeDashoffset="95"
      />
      {/* Small angle mark — bottom-left */}
      <path
        d="M 140 480 L 160 460 L 180 480"
        className={styles.drawLine}
        stroke="var(--color-arch-line)"
        strokeWidth="0.5"
        fill="none"
        strokeDasharray="60"
        strokeDashoffset="60"
      />
      {/* Small angle mark — bottom-right */}
      <path
        d="M 620 480 L 640 460 L 660 480"
        className={styles.drawLine}
        stroke="var(--color-arch-line)"
        strokeWidth="0.5"
        fill="none"
        strokeDasharray="60"
        strokeDashoffset="60"
      />
    </svg>
  );
}

export default function HeroSection() {
  return (
    <section className={styles.hero}>
      <GridBackground />
      <div className={styles.warmGlow} />
      <DecorativeLines />
      <div className={styles.content}>
        <span className={styles.badge}>Modular Object Planner</span>
        <h1 className={styles.title}>
          <span className={styles.titleDisplay}>Design spaces</span>
          <span className={styles.titleStructural}>with precision</span>
        </h1>
        <p className={styles.tagline}>
          From concept to construction, iterate on floorplans, sketch technical
          details, and generate documentation with millimeter accuracy.
        </p>
        <div className={styles.ctas}>
          <Link to="/floorplan" className={styles.primaryCta}>
            Open Floorplan Editor
          </Link>
          <Link to="/playground" className={styles.secondaryCta}>
            Explore Playground
          </Link>
        </div>
      </div>
    </section>
  );
}
