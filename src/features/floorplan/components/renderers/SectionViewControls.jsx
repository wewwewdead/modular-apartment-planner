import { getSectionLimitedDepth } from '@/domain/sectionModels';
import { useNumericDraft } from '../useNumericDraft';
import canvasStyles from './SvgCanvas.module.css';
import styles from './SectionViewControls.module.css';

function DepthInput({ sectionCut, update }) {
  const { displayValue, handleChange, handleKeyDown, handleBlur } = useNumericDraft(
    getSectionLimitedDepth(sectionCut),
    (depth) => update({ depth: Math.max(100, depth), depthMode: 'limited' }),
  );
  return (
    <label className={styles.depth}>
      Depth
      <input
        type="number"
        aria-label="Section depth in millimetres"
        min="100"
        step="100"
        value={displayValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
      />
      mm
    </label>
  );
}

export default function SectionViewControls({ project, scene, dispatch }) {
  if (!scene?.viewDepth) return null;
  const floor = project.floors.find((entry) => entry.sectionCuts?.some((cut) => cut.id === scene.sectionCutId));
  const sectionCut = floor?.sectionCuts.find((cut) => cut.id === scene.sectionCutId);
  if (!sectionCut) return null;
  const update = (updates) =>
    dispatch({
      type: 'SECTION_UPDATE',
      floorId: floor.id,
      sectionCut: { id: sectionCut.id, ...updates },
    });
  const { mode, stairs } = scene.viewDepth;
  return (
    <div className={`${canvasStyles.chipDock} ${styles.dock}`} role="group" aria-label="Section view controls">
      <div className={styles.row}>
        <span className={canvasStyles.chipLabel}>View depth</span>
        <div className={canvasStyles.chipGroup}>
          {['full', 'limited'].map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              className={mode === value ? canvasStyles.chipBtnActive : canvasStyles.chipBtn}
              onClick={() => update({ depthMode: value })}
            >
              {value === 'full' ? 'Full building' : 'Limited depth'}
            </button>
          ))}
        </div>
        {mode === 'limited' && <DepthInput key={sectionCut.id} sectionCut={sectionCut} update={update} />}
        <button
          type="button"
          className={canvasStyles.chipBtn}
          onClick={() => update({ direction: sectionCut.direction === -1 ? 1 : -1 })}
        >
          Flip direction
        </button>
      </div>
      {stairs.clippedByDepth > 0 && (
        <p className={styles.notice} role="status">
          {stairs.clippedByDepth} stair {stairs.clippedByDepth === 1 ? 'flight extends' : 'flights extend'} beyond this
          depth. Choose Full building to include them.
        </p>
      )}
      {stairs.behindCut > 0 && (
        <p className={styles.notice}>
          {stairs.behindCut} stair {stairs.behindCut === 1 ? 'flight is' : 'flights are'} behind the cut. Flip direction
          to view that side.
        </p>
      )}
      {stairs.outsideWidth > 0 && (
        <p className={styles.notice}>
          {stairs.outsideWidth} stair {stairs.outsideWidth === 1 ? 'flight is' : 'flights are'} beyond the ends of the
          cut. Extend the section line in plan to include them.
        </p>
      )}
    </div>
  );
}
