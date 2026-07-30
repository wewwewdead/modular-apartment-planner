import { useCallback, useEffect, useRef } from 'react';
import styles from './ShortcutOverlay.module.css';
import {
  SHORTCUT_OVERLAY_FOOTNOTE,
  SHORTCUT_OVERLAY_TITLE,
  SHORTCUT_OVERLAY_TOGGLE_KEY,
  SHORTCUT_SECTIONS,
} from '../utils/shortcutManifest';

function ShortcutCombos({ combos }) {
  return (
    <span className={styles.combos}>
      {combos.map((combo, comboIndex) => (
        <span className={styles.combo} key={combo.join('+')}>
          {comboIndex > 0 && <span className={styles.comboSeparator}>or</span>}
          {combo.map((chip, chipIndex) => (
            <span className={styles.chipGroup} key={chip}>
              {chipIndex > 0 && <span className={styles.chipJoiner}>+</span>}
              <kbd className={styles.kbd}>{chip}</kbd>
            </span>
          ))}
        </span>
      ))}
    </span>
  );
}

/**
 * Modal shortcut reference for Sketch Studio.
 *
 * Open/close state lives in the store (`ui.shortcutOverlayOpen`). The `?` and `Esc`
 * keys are handled centrally in `useSketchKeyboard` so the overlay can swallow every
 * other binding while it is open; this component owns the backdrop click and the
 * close button only.
 */
export default function ShortcutOverlay({ onClose, sections = SHORTCUT_SECTIONS }) {
  const backdropRef = useRef(null);
  const closeButtonRef = useRef(null);

  useEffect(() => {
    const previouslyFocused = typeof document === 'undefined' ? null : document.activeElement;
    closeButtonRef.current?.focus();

    return () => {
      if (previouslyFocused instanceof HTMLElement) {
        previouslyFocused.focus();
      }
    };
  }, []);

  const handleBackdropClick = useCallback(
    (event) => {
      if (event.target === backdropRef.current) {
        onClose?.();
      }
    },
    [onClose],
  );

  return (
    <div ref={backdropRef} className={styles.backdrop} onClick={handleBackdropClick}>
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sketchStudioShortcutOverlayTitle"
        aria-describedby="sketchStudioShortcutOverlayNote"
      >
        <header className={styles.header}>
          <div className={styles.headerText}>
            <span className={styles.eyebrow}>Sketch Studio</span>
            <h2 className={styles.title} id="sketchStudioShortcutOverlayTitle">
              {SHORTCUT_OVERLAY_TITLE}
            </h2>
          </div>
          <div className={styles.headerActions}>
            <span className={styles.headerHint}>
              <kbd className={styles.kbd}>{SHORTCUT_OVERLAY_TOGGLE_KEY}</kbd> toggles
            </span>
            <button
              ref={closeButtonRef}
              type="button"
              className={styles.closeBtn}
              onClick={() => onClose?.()}
              aria-label="Close keyboard shortcuts"
            >
              <svg viewBox="0 0 20 20" aria-hidden="true" className={styles.closeIcon}>
                <path
                  d="M6 6l8 8M14 6l-8 8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </header>
        <div className={styles.body}>
          {sections.map((section) => (
            <section className={styles.section} key={section.id}>
              <h3 className={styles.sectionTitle}>{section.title}</h3>
              <ul className={styles.entryList}>
                {section.entries.map((entry) => (
                  <li className={styles.entry} key={entry.id}>
                    <span className={styles.entryText}>
                      <span className={styles.entryLabel}>{entry.label}</span>
                      {entry.detail && <span className={styles.entryDetail}>{entry.detail}</span>}
                    </span>
                    <ShortcutCombos combos={entry.combos} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <footer className={styles.footer} id="sketchStudioShortcutOverlayNote">
          {SHORTCUT_OVERLAY_FOOTNOTE}
        </footer>
      </div>
    </div>
  );
}
