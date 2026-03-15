import { Link } from 'react-router-dom';
import useScrollReveal from './useScrollReveal';
import FloorplanIllustration from './FloorplanIllustration';
import SketchIllustration from './SketchIllustration';
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
            <h3 className={styles.cardTitle}>Floorplan Editor</h3>
            <p className={styles.cardDesc}>
              Draw walls, place doors and windows, define rooms, and generate
              construction-ready documentation with millimeter precision and
              phase-based planning.
            </p>
          </div>
          <FloorplanIllustration className={styles.cardIllustration} />
        </Link>

        <Link
          to="/sketch"
          className={`${styles.card} ${styles.cardSketch}`}
          ref={sketchRef}
        >
          <div className={styles.cardBody}>
            <h3 className={styles.cardTitle}>Sketch Studio</h3>
            <p className={styles.cardDesc}>
              Freeform 2D drawing for quick concepts, site studies, and design
              explorations. Sketch freely with geometric primitives and
              annotation tools.
            </p>
          </div>
          <SketchIllustration className={styles.cardIllustration} />
        </Link>
      </div>
    </section>
  );
}
