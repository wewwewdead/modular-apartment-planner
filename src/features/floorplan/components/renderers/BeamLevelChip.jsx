import { memo } from 'react';
import { TOOLS } from '@/editor/tools';
import { getFloorElevation } from '@/domain/floorModels';
import { resolveFloorBeamBearingLevel } from '@/domain/beamLevels';
import styles from './SvgCanvas.module.css';

/*
 * Which level a beam lands on — the storey datum (a tie/slab beam) or the top
 * of the columns (a top/roof beam) — floats over the plan rather than sitting
 * in the toolbar. The toolbar's content runs ~2970px wide, so at a 1536px
 * window this control sat entirely past the fold behind an invisible scrollbar
 * and no tie beam could be placed at all.
 *
 * It drives toolState.beamPlacementMode directly, which is the same value
 * beamPlaceHandler reads; there is no second copy of the choice.
 */
const BeamLevelChip = memo(function BeamLevelChip({
  activeTool,
  viewMode,
  modelTarget,
  floor,
  beamPlacementMode,
  editorDispatch,
}) {
  if (activeTool !== TOOLS.BEAM || viewMode !== 'plan' || modelTarget !== 'floor' || !floor) return null;

  const isFloorMode = beamPlacementMode === 'floor';
  const floorLevel = Math.round(getFloorElevation(floor));
  const bearingLevel = Math.round(resolveFloorBeamBearingLevel(floor));
  const selectMode = (mode) => editorDispatch({ type: 'UPDATE_TOOL_STATE', payload: { beamPlacementMode: mode } });

  return (
    <div className={styles.chipDock} role="group" aria-label="Beam placement elevation">
      <span className={styles.chipLabel}>Beam level</span>
      <div className={styles.chipGroup}>
        <button
          type="button"
          className={isFloorMode ? styles.chipBtnActive : styles.chipBtn}
          onClick={() => selectMode('floor')}
          aria-pressed={isFloorMode}
          aria-label={`Place floor or slab beam at ${floorLevel} millimetres`}
        >
          Floor/slab · {floorLevel} mm
        </button>
        <button
          type="button"
          className={!isFloorMode ? styles.chipBtnActive : styles.chipBtn}
          onClick={() => selectMode('roof_ring')}
          aria-pressed={!isFloorMode}
          aria-label={`Place top or roof beam at ${bearingLevel} millimetres`}
        >
          Top/roof · {bearingLevel} mm
        </button>
      </div>
    </div>
  );
});

export default BeamLevelChip;
