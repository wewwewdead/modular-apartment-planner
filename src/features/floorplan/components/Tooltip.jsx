import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './Tooltip.module.css';

export default function Tooltip({ label, shortcut, children }) {
  const wrapperRef = useRef(null);
  const [pos, setPos] = useState(null);

  const handleEnter = useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceAbove = rect.top;
    // If less than 40px above the button, show tooltip below instead
    const showBelow = spaceAbove < 40;
    setPos({
      left: rect.left + rect.width / 2,
      top: showBelow ? rect.bottom + 6 : rect.top - 6,
      below: showBelow,
    });
  }, []);

  const handleLeave = useCallback(() => {
    setPos(null);
  }, []);

  return (
    <span ref={wrapperRef} className={styles.wrapper} onPointerEnter={handleEnter} onPointerLeave={handleLeave}>
      {children}
      {pos &&
        createPortal(
          <span
            className={pos.below ? styles.tooltipBelow : styles.tooltipAbove}
            style={{ left: pos.left, top: pos.top }}
          >
            {label}
            {shortcut && <kbd className={styles.kbd}>{shortcut}</kbd>}
          </span>,
          document.body,
        )}
    </span>
  );
}
