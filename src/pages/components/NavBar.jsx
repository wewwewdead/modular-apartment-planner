import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import styles from './NavBar.module.css';

export default function NavBar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleMobile = useCallback(() => {
    setMobileOpen((prev) => !prev);
  }, []);

  const closeMobile = useCallback(() => {
    setMobileOpen(false);
  }, []);

  return (
    <>
      <nav className={styles.nav}>
        <Link to="/" className={styles.brand}>
          <svg
            className={styles.logoMark}
            viewBox="0 0 28 28"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <rect
              x="2"
              y="2"
              width="24"
              height="24"
              rx="4"
              stroke="var(--color-accent)"
              strokeWidth="2"
              fill="none"
            />
            <rect x="6" y="6" width="7" height="7" rx="1" fill="var(--color-accent)" opacity="0.8" />
            <rect x="15" y="6" width="7" height="7" rx="1" fill="var(--color-accent)" opacity="0.4" />
            <rect x="6" y="15" width="7" height="7" rx="1" fill="var(--color-accent)" opacity="0.4" />
            <rect x="15" y="15" width="7" height="7" rx="1" fill="var(--color-accent)" opacity="0.2" />
          </svg>
          <span className={styles.brandName}>MAP</span>
        </Link>

        <div className={styles.navRight}>
          <Link to="/floorplan" className={styles.navLink}>
            Floorplan
          </Link>
          <Link to="/sketch" className={styles.navLink}>
            Sketch
          </Link>
          <Link to="/playground" className={styles.navLink}>
            Playground
          </Link>
          <Link to="/floorplan" className={styles.ctaButton}>
            Get Started
          </Link>
        </div>

        <button
          className={`${styles.hamburger} ${mobileOpen ? styles.hamburgerOpen : ''}`}
          onClick={toggleMobile}
          aria-label="Toggle navigation menu"
          aria-expanded={mobileOpen}
        >
          <span className={styles.hamburgerLine} />
          <span className={styles.hamburgerLine} />
          <span className={styles.hamburgerLine} />
        </button>
      </nav>

      <div
        className={`${styles.mobileMenu} ${mobileOpen ? styles.mobileMenuOpen : ''}`}
      >
        <Link to="/floorplan" className={styles.mobileLink} onClick={closeMobile}>
          Floorplan
        </Link>
        <Link to="/sketch" className={styles.mobileLink} onClick={closeMobile}>
          Sketch
        </Link>
        <Link to="/playground" className={styles.mobileLink} onClick={closeMobile}>
          Playground
        </Link>
        <Link to="/floorplan" className={styles.mobileCta} onClick={closeMobile}>
          Get Started
        </Link>
      </div>
    </>
  );
}
