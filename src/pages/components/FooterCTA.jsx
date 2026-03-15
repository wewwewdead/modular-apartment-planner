import { Link } from 'react-router-dom';
import useScrollReveal from './useScrollReveal';
import styles from './FooterCTA.module.css';

export default function FooterCTA() {
  const ref = useScrollReveal();

  return (
    <footer className={styles.footer}>
      <div className={styles.inner} ref={ref}>
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
