import { memo } from 'react';
import { getFloorElevation, getFloorLevelIndex, getFloorToFloorHeight } from '@/domain/floorModels';
import InputField from '../InputField';
import styles from '../PropertiesPanel.module.css';

function FloorProperties({ floor, dispatch, onDuplicate, onDelete, canDelete, u }) {
  const updateFloor = (updates) => {
    dispatch({ type: 'FLOOR_UPDATE', floor: { id: floor.id, ...updates } });
  };

  return (
    <div>
      <div className={styles.title}>Floor</div>
      <InputField label="Name" value={floor.name} onChange={(value) => updateFloor({ name: value })} />
      <InputField
        label="Level Index"
        type="number"
        step={1}
        value={getFloorLevelIndex(floor)}
        onChange={(value) => updateFloor({ levelIndex: Math.round(value) })}
      />
      <InputField
        label="Elevation"
        type="number"
        suffix={u.suffix}
        step={u.step(100)}
        value={u.toDisplay(getFloorElevation(floor))}
        onChange={(value) => updateFloor({ elevation: u.fromDisplay(value) })}
      />
      <InputField
        label="Floor to Floor"
        type="number"
        suffix={u.suffix}
        step={u.step(100)}
        value={u.toDisplay(getFloorToFloorHeight(floor))}
        onChange={(value) => updateFloor({ floorToFloorHeight: Math.max(100, u.fromDisplay(value)) })}
      />
      <div className={styles.subtitle}>Contents</div>
      <InputField label="Walls" value={floor.walls.length} readOnly />
      <InputField label="Rooms" value={floor.rooms.length} readOnly />
      <InputField label="Doors" value={floor.doors.length} readOnly />
      <InputField label="Windows" value={floor.windows.length} readOnly />
      <InputField label="Columns" value={(floor.columns || []).length} readOnly />
      <InputField label="Beams" value={(floor.beams || []).length} readOnly />
      <InputField label="Stairs" value={(floor.stairs || []).length} readOnly />
      <InputField label="Slabs" value={(floor.slabs || []).length} readOnly />
      <button className={styles.actionBtn} onClick={() => onDuplicate(floor)}>
        Duplicate floor
      </button>
      <button className={styles.deleteBtn} onClick={() => onDelete(floor)} disabled={!canDelete}>
        Delete floor
      </button>
    </div>
  );
}

export default memo(FloorProperties);
