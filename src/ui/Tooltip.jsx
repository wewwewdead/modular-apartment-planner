import styles from './Tooltip.module.css';

export default function Tooltip({ label, shortcut, children }) {
  return (
    <span className={styles.wrapper}>
      {children}
      <span className={styles.tooltip}>
        {label}
        {shortcut && <kbd className={styles.kbd}>{shortcut}</kbd>}
      </span>
    </span>
  );
}
