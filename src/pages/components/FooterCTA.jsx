import { Link } from 'react-router-dom';
import useScrollReveal from './useScrollReveal';
import styles from './FooterCTA.module.css';

function Ornament() {
  return (
    <svg
      className={styles.ornament}
      viewBox="0 0 40 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M8 18L20 4L32 18" stroke="currentColor" strokeWidth="1" fill="none" />
      <path d="M14 18L20 10L26 18" stroke="currentColor" strokeWidth="0.5" fill="none" opacity="0.5" />
    </svg>
  );
}

export default function FooterCTA() {
  const ref = useScrollReveal();

  return (
    <footer className={styles.footer}>
      <div className={styles.inner} ref={ref}>
        <Ornament />
        <h2 className={styles.heading}>Ready to start designing?</h2>
        <Link to="/floorplan" className={styles.ctaButton}>
          Get Started
        </Link>
        <p className={styles.copyright}>
          &copy; {new Date().getFullYear()} Modular Apartment Planner
        </p>
      </div>
    </footer>
  );
}
