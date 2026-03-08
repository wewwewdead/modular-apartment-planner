import { createContext, useContext, useMemo, useState } from 'react';

const ClipboardContext = createContext(null);

export function ClipboardProvider({ children }) {
  const [clipboard, setClipboardState] = useState(null);

  const value = useMemo(() => ({
    clipboard,
    hasClipboard: Boolean(clipboard?.objectCount),
    setClipboard: (payload) => setClipboardState(payload),
    clearClipboard: () => setClipboardState(null),
  }), [clipboard]);

  return (
    <ClipboardContext.Provider value={value}>
      {children}
    </ClipboardContext.Provider>
  );
}

export function useClipboard() {
  const ctx = useContext(ClipboardContext);
  if (!ctx) throw new Error('useClipboard must be used within ClipboardProvider');
  return ctx;
}
