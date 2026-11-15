import { LoadingBar, PanePlaceholder, Skeleton } from '@/ui/loading';
import { ToolGlyph, ToolbarButton } from './WallDetailUiKit';
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
 * It mirrors the editor's layout (docs/assembly-editor-ui.md §2.3): the 48 px
 * header line, the 44 px toolbar, the 32 px context bar, the 280 / 320 px side
 * panels and the 62 / 38 split, all on the light ground.
 *
 * Only data already in memory goes in: the object's name, its outline (the
 * `silhouette`, drawn on both panes), section titles. Back and Close work;
 * nothing else here is interactive, because nothing here is real yet.
 */
export default function DetailEditorShell({
  dialogLabel,
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
        <div className={styles.headerLead}>
          <button type="button" className={styles.backButton} title={closeTitle} onClick={onClose}>
            <ToolGlyph name="back" />
            <span>Back to plan</span>
          </button>
          <span className={styles.headerDivider} aria-hidden="true" />
          <div className={styles.headerIdentity}>
            <h1>{title}</h1>
            {subtitle ? <span className={styles.headerMeta}>{subtitle}</span> : null}
          </div>
        </div>
        <div className={styles.headerActions}>
          <ToolbarButton title={closeTitle} onClick={onClose}>
            Close
            <ToolGlyph name="close" />
          </ToolbarButton>
        </div>
      </header>

      <div className={styles.body} data-focus={focus ? 'true' : 'false'}>
        <aside className={styles.leftPanel} aria-label={leftLabel} aria-hidden={focus ? 'true' : undefined}>
          <ShellSections sections={leftSections} />
        </aside>

        <main className={styles.workspace}>
          <div className={styles.toolbar} aria-hidden="true">
            <Skeleton className={styles.shellToolbar}>
              <Skeleton.Row />
            </Skeleton>
          </div>
          {/* Kept for its height; the panes below carry the words. */}
          <div className={styles.contextBar} aria-hidden="true" />
          <div className={styles.workspaceViews} data-view="split">
            <div className={styles.elevationPane}>
              <PanePlaceholder
                tone="paper"
                label={label}
                detail={detail}
                silhouette={silhouette}
                since={since}
                data-editor-canvas="opening"
              />
            </div>
            <div className={styles.previewPane}>
              <PanePlaceholder
                tone="paper"
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
    <section
      key={section.id}
      className={styles.collapsible}
      data-open={index === 0 ? 'true' : 'false'}
      data-step={section.step || section.optional ? 'true' : undefined}
      data-static={section.static ? 'true' : undefined}
    >
      <h2 className={styles.sectionHeading}>
        <span className={`${styles.sectionHeader} ${section.static ? styles.sectionHeaderStatic : ''}`}>
          {section.step ? <span className={styles.sectionStep}>{section.step}</span> : null}
          <span className={styles.sectionTitles}>
            <span className={styles.sectionTitle}>
              {section.title}
              {section.optional ? <span className={styles.sectionOptional}>Optional</span> : null}
            </span>
          </span>
        </span>
      </h2>
      {index === 0 ? (
        <div className={styles.sectionBody}>
          <Skeleton>
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
