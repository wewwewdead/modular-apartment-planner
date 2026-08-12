import { memo } from 'react';
import { BUILDING_COMMANDS } from '@/domain/buildingCommands';
import InputField from '../InputField';
import styles from '../PropertiesPanel.module.css';

/**
 * Transform controls for a selected structural grid. Position comes from
 * dragging on the plan or the origin fields; rotation is numeric because a
 * drag cannot express it — and for surveyed lots the one rotation that
 * matters, parallel to the road frontage, is one button away.
 */
function StructuralGridProperties({ grid, site, dispatch, u }) {
  const transform = (updates) => {
    const origin = { ...(grid.origin || { x: 0, y: 0 }), ...(updates.origin || {}) };
    const rotation = updates.rotation ?? grid.rotation ?? 0;
    // A half-typed entry must never reach the command: it would come back as a
    // silent invalid-grid-transform rejection and the field would snap back
    // with nothing to explain it.
    if (!Number.isFinite(origin.x) || !Number.isFinite(origin.y) || !Number.isFinite(rotation)) return;

    dispatch({
      type: 'EXECUTE_BUILDING_COMMAND',
      command: {
        type: BUILDING_COMMANDS.TRANSFORM_STRUCTURAL_GRID,
        gridId: grid.id,
        origin,
        rotation,
      },
    });
  };

  const boundary = site?.boundary || [];
  const frontage = site?.roadEdges?.[0];
  const frontageStart = Number.isInteger(frontage?.edgeIndex) ? boundary[frontage.edgeIndex] : null;
  const frontageEnd = frontageStart ? boundary[(frontage.edgeIndex + 1) % boundary.length] : null;

  const alignToFrontage = () => {
    let angle = (Math.atan2(frontageEnd.y - frontageStart.y, frontageEnd.x - frontageStart.x) * 180) / Math.PI;
    // Normalize to (-90, 90] — an axis line has no direction, and this keeps
    // the lettered rows parallel to the road without turning the grid over.
    if (angle > 90) angle -= 180;
    if (angle <= -90) angle += 180;
    transform({ rotation: Math.round(angle * 100) / 100 });
  };

  return (
    <div>
      <div className={styles.title}>{grid.name || 'Structural grid'}</div>
      <InputField
        label="Origin X"
        type="number"
        suffix={u.suffix}
        step={u.step(100)}
        value={u.toDisplay(grid.origin?.x || 0)}
        onChange={(value) => transform({ origin: { x: u.fromDisplay(value) } })}
      />
      <InputField
        label="Origin Y"
        type="number"
        suffix={u.suffix}
        step={u.step(100)}
        value={u.toDisplay(grid.origin?.y || 0)}
        onChange={(value) => transform({ origin: { y: u.fromDisplay(value) } })}
      />
      <InputField
        label="Rotation"
        type="number"
        suffix="°"
        step={1}
        value={grid.rotation || 0}
        onChange={(value) => transform({ rotation: value })}
      />
      {frontageStart && frontageEnd && (
        <button type="button" className={styles.actionBtn} onClick={alignToFrontage}>
          Align rotation to road frontage
        </button>
      )}
      <div className={styles.subtitle}>
        Drag the grid on the plan by any part of it, or enter the exact origin. Column stacks pinned to intersections
        move with it; axis spacing is edited in the Structure stage.
      </div>
    </div>
  );
}

export default memo(StructuralGridProperties);
