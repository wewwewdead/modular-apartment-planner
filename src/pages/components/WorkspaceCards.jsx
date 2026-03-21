import { Link } from 'react-router-dom';
import useScrollReveal from './useScrollReveal';
import FloorplanIllustration from './FloorplanIllustration';
import SketchStudioIllustration from './SketchStudioIllustration';
import styles from './WorkspaceCards.module.css';

export default function WorkspaceCards() {
  const floorplanRef = useScrollReveal();
  const sketchRef = useScrollReveal();

  return (
    <section className={styles.section}>
      <div className={styles.grid}>
        <Link
          to="/floorplan"
          className={`${styles.card} ${styles.cardFloorplan}`}
          ref={floorplanRef}
        >
          <div className={styles.cardBody}>
            <span className={styles.cardLabel}>01 / Floorplan</span>
            <h3 className={styles.cardTitle}>Floorplan Editor</h3>
            <p className={styles.cardDesc}>
              Draw walls, place doors and windows, define rooms, and generate
              construction-ready documentation with millimeter precision and
              phase-based planning.
            </p>
          </div>
          <FloorplanIllustration className={styles.cardIllustration} />
          <span className={styles.cardArrow} aria-hidden="true">&rarr;</span>
        </Link>

        <Link
          to="/sketch"
          className={`${styles.card} ${styles.cardSketch}`}
          ref={sketchRef}
        >
          <div className={styles.cardBody}>
            <span className={styles.cardLabel}>02 / Sketch Studio</span>
            <h3 className={styles.cardTitle}>SketchStudio</h3>
            <p className={styles.cardDesc}>
              Draft panels, cabinets, supports, and custom technical objects in a dedicated 2D workspace built for
              precise geometry, viewport control, and future export into the planner.
            </p>
          </div>
          <SketchStudioIllustration className={styles.cardIllustration} />
          <span className={styles.cardArrow} aria-hidden="true">&rarr;</span>
        </Link>
      </div>
    </section>
  );
}
