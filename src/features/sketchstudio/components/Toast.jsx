import { useEffect } from 'react';

const TOAST_DURATION = 4000;

export default function Toast({ message, type, onDismiss }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, TOAST_DURATION);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const bgColor = type === 'error' ? '#ff6b6b' : type === 'warning' ? '#d4856b' : '#51cf66';

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 60,
        right: 16,
        padding: '10px 16px',
        background: bgColor,
        color: '#1a1a2e',
        borderRadius: 6,
        fontSize: 13,
        fontWeight: 600,
        zIndex: 9999,
        maxWidth: 320,
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      }}
    >
      {message}
    </div>
  );
}
