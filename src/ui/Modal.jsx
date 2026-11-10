import { useEffect, useRef } from 'react';
import styles from './Modal.module.css';

export default function Modal({ title, onClose, children }) {
  const overlayRef = useRef(null);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  /*
   * The app behind a dialog must not hear the keyboard: with "Delete
   * 'Floor 2'?" up, Delete removed the selection under it and Ctrl+Z undid.
   * A key aimed outside every open dialog (focus left on the page) stops at
   * the window, before anything sees it; one aimed inside stops on its way
   * out of the dialog (`stopKeysLeaving`), after the dialog's own controls
   * have had it. Escape passes both ways, as before: it is how a dialog
   * closes. Defaults (typing, Tab, Enter on a button) are left alone.
   */
  useEffect(() => {
    const isolate = (e) => {
      if (e.key === 'Escape') return;
      if (e.target instanceof Element && e.target.closest('[role="dialog"]')) return;
      e.stopPropagation();
    };
    window.addEventListener('keydown', isolate, true);
    return () => window.removeEventListener('keydown', isolate, true);
  }, []);

  const stopKeysLeaving = (e) => {
    if (e.key !== 'Escape') e.stopPropagation();
  };

  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) onClose();
  };

  return (
    <div ref={overlayRef} onClick={handleOverlayClick} onKeyDown={stopKeysLeaving} className={styles.overlay}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-label={title}>
        <div className={styles.header}>
          <h3 className={styles.headerTitle}>{title}</h3>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 20 20" aria-hidden="true" className={styles.closeIcon}>
              <path
                d="M6 6l8 8M14 6l-8 8"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}
