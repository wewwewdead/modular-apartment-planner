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
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 4l6 6-8 8H6v-6l8-8z" />
        <path d="M3 21l3-3" />
      </svg>
      <span>Craftsman</span>
    </button>
  );
}
