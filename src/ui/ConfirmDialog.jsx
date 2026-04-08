import { createContext, useContext, useState, useCallback, useRef } from 'react';
import Modal from './Modal';

const ConfirmContext = createContext(null);

export function ConfirmDialogProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const resolveRef = useRef(null);

  const confirm = useCallback((message, { title = 'Confirm' } = {}) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setDialog({ title, message });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    resolveRef.current?.(true);
    resolveRef.current = null;
    setDialog(null);
  }, []);

  const handleCancel = useCallback(() => {
    resolveRef.current?.(false);
    resolveRef.current = null;
    setDialog(null);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {dialog && (
        <Modal title={dialog.title} onClose={handleCancel}>
          <p style={{ margin: '0 0 16px', lineHeight: 1.5 }}>{dialog.message}</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={handleCancel}
              style={{
                padding: '6px 16px',
                border: '1px solid var(--color-border, #ccc)',
                borderRadius: 4,
                background: 'var(--color-surface, #fff)',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              autoFocus
              style={{
                padding: '6px 16px',
                border: 'none',
                borderRadius: 4,
                background: 'var(--color-primary, #2563eb)',
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              OK
            </button>
          </div>
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirmDialog() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirmDialog must be used within ConfirmDialogProvider');
  return confirm;
}
