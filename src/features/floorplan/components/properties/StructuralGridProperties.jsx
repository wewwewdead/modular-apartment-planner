import { memo } from 'react';
import { BUILDING_COMMANDS } from '@/domain/buildingCommands';
import InputField from '../InputField';
import styles from '../PropertiesPanel.module.css';

/** Axes of one direction, in the order they read on the plan. */
function sortedAxes(grid, orientation) {
  return (grid.axes || []).filter((axis) => axis.orientation === orientation).sort((a, b) => a.offset - b.offset);
}

/**
 * Transform controls for a selected structural grid. Position comes from
 * dragging on the plan or the origin fields; rotation is numeric because a
 * drag cannot express it — and for surveyed lots the one rotation that
 * matters, parallel to the road frontage, is one button away.
 *
 * Bay distances are here too: a grid is dimensioned bay by bay, not by one
 * spacing applied everywhere, so each adjacent axis pair gets its own field.
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

  const setBaySpacing = (orientation, bayIndex, spacing) => {
    // Same reasoning as transform(): a half-typed or cleared field parses to
    // something the command would reject, and the rejection would arrive as an
    // unexplained snap-back.
    if (!Number.isFinite(spacing) || spacing <= 0) return;

    dispatch({
      type: 'EXECUTE_BUILDING_COMMAND',
      command: {
        type: BUILDING_COMMANDS.SET_STRUCTURAL_GRID_BAY_SPACING,
        gridId: grid.id,
        orientation,
        bayIndex,
        spacing,
      },
    });
  };

  const renderBays = (orientation, heading) => {
    const axes = sortedAxes(grid, orientation);
    // One axis draws no bay, so there is nothing to dimension.
    if (axes.length < 2) return null;
    return (
      <>
        <div className={styles.subtitle}>{heading}</div>
        {axes.slice(0, -1).map((axis, index) => (
          <InputField
            key={axis.id}
            label={`${axis.label} → ${axes[index + 1].label}`}
            type="number"
            suffix={u.suffix}
            step={u.step(100)}
            value={u.toDisplay(axes[index + 1].offset - axis.offset)}
            onChange={(value) => setBaySpacing(orientation, index, u.fromDisplay(value))}
          />
        ))}
      </>
    );
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
      {renderBays('vertical', 'Numbered axis bays')}
      {renderBays('horizontal', 'Lettered axis bays')}
      <div className={styles.subtitle}>
        Drag the grid on the plan by any part of it, or enter the exact origin. Column stacks pinned to intersections
        move with it. Retuning one bay shifts the axes after it and leaves every other bay at its own distance; the
        uniform regular-grid generator still lives in the Structure stage.
      </div>
    </div>
  );
}

export default memo(StructuralGridProperties);
