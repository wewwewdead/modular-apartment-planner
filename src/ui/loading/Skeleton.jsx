import styles from './Skeleton.module.css';

/**
 * Stand-ins for panel content that is still being derived: `Skeleton.Row`
 * (a control row), `Skeleton.Field` (label + control), `Skeleton.Text`
 * (`lines` of prose). Wrap them in `Skeleton` — it is hidden from assistive
 * tech, since the region's own status already says what is happening.
 */
export default function Skeleton({ children, tone = 'light', className = '' }) {
  return (
    <div className={`${styles.skeleton} ${className}`} data-tone={tone} data-skeleton="" aria-hidden="true">
      {children}
    </div>
  );
}

function SkeletonRow() {
  return <span className={`${styles.block} ${styles.row}`} />;
}

function SkeletonField() {
  return (
    <span className={styles.field}>
      <span className={`${styles.block} ${styles.fieldLabel}`} />
      <span className={`${styles.block} ${styles.fieldControl}`} />
    </span>
  );
}

function SkeletonText({ lines = 2 }) {
  return (
    <span className={styles.text}>
      {Array.from({ length: Math.max(1, lines) }, (_, index) => (
        <span key={index} className={`${styles.block} ${styles.textLine}`} />
      ))}
    </span>
  );
}

Skeleton.Row = SkeletonRow;
Skeleton.Field = SkeletonField;
Skeleton.Text = SkeletonText;
