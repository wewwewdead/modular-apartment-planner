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

  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) onClose();
  };

  return (
    <div ref={overlayRef} onClick={handleOverlayClick} className={styles.overlay}>
      <div className={styles.dialog}>
        <div className={styles.header}>
          <h3 className={styles.headerTitle}>{title}</h3>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 20 20" aria-hidden="true" className={styles.closeIcon}>
              <path d="M6 6l8 8M14 6l-8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <div className={styles.body}>
          {children}
        </div>
      </div>
    </div>
  );
}
