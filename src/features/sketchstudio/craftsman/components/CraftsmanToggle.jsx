import { useEffect } from 'react';
import styles from '../styles/craftsman.module.css';

const STORAGE_KEY = 'craftsmanMode';

export function loadCraftsmanPreference() {
  try { return localStorage.getItem(STORAGE_KEY) === 'true'; } catch { return false; }
}

export default function CraftsmanToggle({ isActive, onToggle }) {
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, String(isActive)); } catch { /* ignore */ }
  }, [isActive]);

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
