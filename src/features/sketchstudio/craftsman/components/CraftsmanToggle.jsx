import styles from '../styles/craftsman.module.css';

export default function CraftsmanToggle({ isActive, onToggle }) {
  return (
    <button
      type="button"
      className={`${styles.craftsmanToggle} ${isActive ? styles.craftsmanToggleActive : ''}`}
      onClick={onToggle}
      title={isActive ? 'Switch to standard mode' : 'Switch to Craftsman mode'}
      aria-pressed={isActive}
      aria-label="Craftsman Mode"
    >
      Craftsman
    </button>
  );
}
