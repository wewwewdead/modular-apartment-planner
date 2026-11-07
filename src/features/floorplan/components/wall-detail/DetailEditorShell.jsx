import { LoadingBar, PanePlaceholder, Skeleton } from '@/ui/loading';
import { ToolbarButton } from './WallDetailUiKit';
import styles from './WallDetailEditor.module.css';

/**
 * The frame of an assembly editor, painted before any of its content is
 * derived (docs/loading-states.md §5.4–5.5, §6.1).
 *
 * The wall and ceiling editors are one giant render each: deriving the
 * assembly, the snap targets and the preview project, then committing a
 * drawing of a couple of thousand nodes. Run in the same task as the click
 * that opened them, that was ~450 ms of nothing on screen. This is what goes
 * up first instead — the same overlay, header, panels and panes as the real
 * editor, in the same grid, so the swap moves nothing — while the editor
 * itself renders behind it as a transition.
 *
 * Only data already in memory goes in: the object's name, its outline (the
 * `silhouette`, drawn on both panes), section titles. Close works; nothing
 * else here is interactive, because nothing here is real yet.
 */
export default function DetailEditorShell({
  dialogLabel,
  eyebrow,
  title,
  subtitle,
  closeTitle,
  onClose,
  leftLabel,
  leftSections,
  rightLabel,
  rightSections,
  focus = false,
  silhouette,
  label,
  detail,
  previewLabel,
  previewKind,
  since,
}) {
  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={dialogLabel}
      aria-busy="true"
      data-editor-phase="opening"
    >
      <LoadingBar placement="viewport" />
      <header className={styles.header}>
        <div className={styles.headerIdentity}>
          <span className={styles.eyebrow}>{eyebrow}</span>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <div className={styles.headerActions}>
          <ToolbarButton title={closeTitle} onClick={onClose}>
            Close
          </ToolbarButton>
        </div>
      </header>

      <div className={styles.body} data-focus={focus ? 'true' : 'false'}>
        <aside className={styles.leftPanel} aria-label={leftLabel} aria-hidden={focus ? 'true' : undefined}>
          <ShellSections sections={leftSections} />
        </aside>

        <main className={styles.workspace}>
          <div className={styles.canvasToolbar} aria-hidden="true">
            <Skeleton tone="dark" className={styles.shellToolbar}>
              <Skeleton.Row />
            </Skeleton>
          </div>
          {/* Kept for its height; the panes below carry the words. */}
          <div className={styles.statusBar} aria-hidden="true" />
          <div className={styles.workspaceViews} data-view="split">
            <div className={styles.elevationPane}>
              <PanePlaceholder
                tone="dark"
                label={label}
                detail={detail}
                silhouette={silhouette}
                since={since}
                data-editor-canvas="opening"
              />
            </div>
            <div className={styles.previewPane}>
              <PanePlaceholder
                tone="dark"
                label={previewLabel}
                silhouette={silhouette}
                since={since}
                data-preview-pane={previewKind}
              />
            </div>
          </div>
        </main>

        <aside className={styles.rightPanel} aria-label={rightLabel} aria-hidden={focus ? 'true' : undefined}>
          <ShellSections sections={rightSections} />
        </aside>
      </div>
    </div>
  );
}

/*
 * The real section headers — the same markup and classes CollapsibleSection
 * draws — over skeleton bodies, so the panel reads as the editor's own from
 * the first frame and nothing shifts when the controls land.
 */
function ShellSections({ sections = [] }) {
  return sections.map((section, index) => (
    <section key={section.id} className={styles.collapsible} data-open={index === 0 ? 'true' : 'false'}>
      <h2 className={styles.sectionHeading}>
        <span className={styles.sectionHeader}>
          {section.step ? <span className={styles.sectionStep}>{section.step}</span> : null}
          <span className={styles.sectionTitles}>
            <span className={styles.sectionTitle}>{section.title}</span>
          </span>
        </span>
      </h2>
      {index === 0 ? (
        <div className={styles.sectionBody}>
          <Skeleton tone="dark">
            <Skeleton.Field />
            <Skeleton.Field />
            <Skeleton.Field />
            <Skeleton.Text lines={2} />
          </Skeleton>
        </div>
      ) : null}
    </section>
  ));
}
