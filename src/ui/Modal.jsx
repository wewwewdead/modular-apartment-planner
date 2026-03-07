import { useEffect, useRef } from 'react';

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
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(10, 12, 15, 0.45)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        animation: 'modalOverlayIn 0.2s ease',
      }}
    >
      <div style={{
        background: '#FAFAF8',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-xl)',
        minWidth: '360px',
        maxWidth: '480px',
        boxShadow: 'var(--shadow-overlay)',
        border: '1px solid var(--color-border)',
        animation: 'modalDialogIn 0.25s var(--ease-out)',
      }}>
        <h3 style={{
          margin: '0 0 16px',
          fontSize: '16px',
          fontWeight: 600,
          letterSpacing: '-0.01em',
        }}>
          {title}
        </h3>
        {children}
      </div>
    </div>
  );
}
