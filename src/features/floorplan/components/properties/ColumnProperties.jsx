import { memo } from 'react';
import { getColumnAutoLabel } from '@/domain/columnLabels';
import { duplicateColumn } from '@/domain/columnModels';
import InputField from '../InputField';
import PhaseSelector from '../PhaseSelector';
import styles from '../PropertiesPanel.module.css';

function ColumnProperties({ column, floor, dispatch, floorId, editorDispatch, u, phases }) {
  const updateColumn = (updates) => {
    dispatch({ type: 'COLUMN_UPDATE', floorId, column: { id: column.id, ...updates } });
  };
  const autoLabel = getColumnAutoLabel(column, floor?.columns || []);
  const normalizedRotation = ((+(column.rotation || 0) % 360) + 360) % 360;

  return (
    <div>
      <div className={styles.title}>Column</div>
      <PhaseSelector phaseId={column.phaseId} phases={phases} onChange={(v) => updateColumn({ phaseId: v })} />
      <InputField
        label="Name"
        value={column.name}
        onChange={(v) => updateColumn({ name: v, showLabel: v ? true : column.showLabel })}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <label style={{ flex: '0 0 80px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>Label</label>
        <input
          type="checkbox"
          checked={Boolean(column.showLabel)}
          onChange={(e) => updateColumn({ showLabel: e.target.checked })}
        />
        <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
          {column.name?.trim() || autoLabel || 'Hidden'}
        </span>
      </div>
      <div className={styles.subtitle}>Position</div>
      <InputField
        label="X"
        type="number"
        suffix={u.suffix}
        value={u.toDisplay(column.x)}
        onChange={(v) => updateColumn({ x: u.fromDisplay(v) })}
      />
      <InputField
        label="Y"
        type="number"
        suffix={u.suffix}
        value={u.toDisplay(column.y)}
        onChange={(v) => updateColumn({ y: u.fromDisplay(v) })}
      />
      <div className={styles.subtitle}>Dimensions</div>
      <InputField
        label="Width"
        type="number"
        suffix={u.suffix}
        step={u.step(10)}
        value={u.toDisplay(column.width)}
        onChange={(v) => updateColumn({ width: Math.max(50, u.fromDisplay(v)) })}
      />
      <InputField
        label="Depth"
        type="number"
        suffix={u.suffix}
        step={u.step(10)}
        value={u.toDisplay(column.depth)}
        onChange={(v) => updateColumn({ depth: Math.max(50, u.fromDisplay(v)) })}
      />
      <InputField
        label="Height"
        type="number"
        suffix={u.suffix}
        step={u.step(100)}
        value={u.toDisplay(column.height)}
        onChange={(v) => updateColumn({ height: Math.max(100, u.fromDisplay(v)) })}
      />
      <InputField
        label="Rotation"
        type="number"
        suffix="°"
        step={1}
        value={normalizedRotation}
        onChange={(v) => updateColumn({ rotation: ((+v % 360) + 360) % 360 })}
      />
      <button
        className={styles.actionBtn}
        onClick={() => {
          const cloned = duplicateColumn(column);
          dispatch({ type: 'COLUMN_DUPLICATE', floorId, column: cloned });
          editorDispatch({ type: 'SELECT_OBJECT', id: cloned.id, objectType: 'column' });
        }}
      >
        Duplicate column
      </button>
    </div>
  );
}

export default memo(ColumnProperties);
