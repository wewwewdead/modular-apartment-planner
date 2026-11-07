import styles from './Spinner.module.css';

/** The kit's 12 px ring. `tone`: 'light' (default), 'dark' for 3D panes, 'inverse' on accent buttons. */
export default function Spinner({ tone = 'light', className = '' }) {
  return <span className={`${styles.spinner} ${className}`} data-tone={tone} aria-hidden="true" />;
}
