import styles from './CompassOverlay.module.css';

export default function CompassOverlay({ className = '', headingDeg = 0, needleRef = null }) {
  const compassClassName = className ? `${styles.compass} ${className}` : styles.compass;
  const needleStyle = needleRef ? undefined : { '--compass-heading': `${headingDeg}deg` };

  return (
    <div className={compassClassName} aria-hidden="true">
      <div className={styles.rose}>
        <span className={`${styles.label} ${styles.north}`}>N</span>
        <span className={`${styles.label} ${styles.east}`}>E</span>
        <span className={`${styles.label} ${styles.south}`}>S</span>
        <span className={`${styles.label} ${styles.west}`}>W</span>
        <div ref={needleRef} className={styles.needle} style={needleStyle}>
          <span className={styles.needleNorth} />
          <span className={styles.needleSouth} />
        </div>
        <span className={styles.centerDot} />
      </div>
    </div>
  );
}
