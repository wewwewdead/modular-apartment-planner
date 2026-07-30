import { memo } from 'react';
import { getAnnotationDisplayLabel } from '@/annotations/format';
import { normalize, subtract, add, scale } from '@/geometry/point';
import { getManualAnnotationFigure } from '@/annotations/scene';
import InputField from '../InputField';
import styles from '../PropertiesPanel.module.css';

function AnnotationProperties({ annotation, floor, dispatch, floorId, u }) {
  const updateAnnotation = (updates) => {
    dispatch({ type: 'ANNOTATION_UPDATE', floorId, annotation: { id: annotation.id, ...updates } });
  };

  const figure = getManualAnnotationFigure(floor, annotation.id);
  const measuredValue = figure?.measurement || 0;

  return (
    <div>
      <div className={styles.title}>Dimension</div>
      <InputField label="Label" value={getAnnotationDisplayLabel(annotation)} readOnly />
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <label style={{ flex: '0 0 80px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>Mode</label>
        <select
          value={annotation.mode}
          onChange={(e) => updateAnnotation({ mode: e.target.value })}
          style={{
            flex: 1,
            height: '28px',
            padding: '0 4px',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '12px',
          }}
        >
          <option value="aligned">Aligned</option>
          <option value="horizontal">Horizontal</option>
          <option value="vertical">Vertical</option>
        </select>
      </div>
      <div className={styles.subtitle}>Start Point</div>
      <InputField
        label="X"
        type="number"
        suffix={u.suffix}
        value={u.toDisplay(annotation.startPoint.x)}
        onChange={(value) => updateAnnotation({ startPoint: { ...annotation.startPoint, x: u.fromDisplay(value) } })}
      />
      <InputField
        label="Y"
        type="number"
        suffix={u.suffix}
        value={u.toDisplay(annotation.startPoint.y)}
        onChange={(value) => updateAnnotation({ startPoint: { ...annotation.startPoint, y: u.fromDisplay(value) } })}
      />
      <div className={styles.subtitle}>End Point</div>
      <InputField
        label="X"
        type="number"
        suffix={u.suffix}
        value={u.toDisplay(annotation.endPoint.x)}
        onChange={(value) => updateAnnotation({ endPoint: { ...annotation.endPoint, x: u.fromDisplay(value) } })}
      />
      <InputField
        label="Y"
        type="number"
        suffix={u.suffix}
        value={u.toDisplay(annotation.endPoint.y)}
        onChange={(value) => updateAnnotation({ endPoint: { ...annotation.endPoint, y: u.fromDisplay(value) } })}
      />
      <div className={styles.subtitle}>Properties</div>
      <InputField
        label="Offset"
        type="number"
        suffix={u.suffix}
        step={u.step(10)}
        value={u.toDisplay(annotation.offset)}
        onChange={(value) => updateAnnotation({ offset: u.fromDisplay(value) })}
      />
      <InputField
        label="Text"
        value={annotation.textOverride}
        onChange={(value) => updateAnnotation({ textOverride: value })}
      />
      <InputField
        label="Measured"
        type="number"
        suffix={u.suffix}
        step={u.step(100)}
        value={u.toDisplay(measuredValue)}
        onChange={(value) => {
          const newLen = u.fromDisplay(value);
          if (newLen <= 0) return;
          const s = annotation.startPoint;
          const e = annotation.endPoint;
          const mode = annotation.mode;
          let newEnd;
          if (mode === 'horizontal') {
            const sign = e.x >= s.x ? 1 : -1;
            newEnd = { ...e, x: s.x + sign * newLen };
          } else if (mode === 'vertical') {
            const sign = e.y >= s.y ? 1 : -1;
            newEnd = { ...e, y: s.y + sign * newLen };
          } else {
            const dir = normalize(subtract(e, s));
            newEnd = add(s, scale(dir, newLen));
          }
          updateAnnotation({ endPoint: newEnd });
        }}
      />
    </div>
  );
}

function AnnotationSettingsPropertiesInner({ floor, dispatch }) {
  const settings = floor.annotationSettings || {};

  const updateSettings = (nextSettings) => {
    dispatch({ type: 'ANNOTATION_SETTINGS_UPDATE', floorId: floor.id, settings: nextSettings });
  };

  const checkbox = (label, key) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }} key={key}>
      <label style={{ flex: '0 0 140px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>{label}</label>
      <input
        type="checkbox"
        checked={Boolean(settings[key])}
        onChange={(e) => updateSettings({ [key]: e.target.checked })}
      />
    </div>
  );

  return (
    <div>
      <div className={styles.title}>Annotations</div>
      {checkbox('Wall Dimensions', 'showWallDimensions')}
      {checkbox('Room Dimensions', 'showRoomDimensions')}
      {checkbox('Overall Dimensions', 'showOverallDimensions')}
      {checkbox('Object Tags', 'showObjectTags')}
      {checkbox('Elev. Overall', 'showElevationOverallDimensions')}
      {checkbox('Elev. Levels', 'showElevationLevelDimensions')}
      {checkbox('Elev. Openings', 'showElevationOpeningDimensions')}
      <InputField label="Manual Dims" value={(floor.annotations || []).length} readOnly />
    </div>
  );
}

export const AnnotationSettingsProperties = memo(AnnotationSettingsPropertiesInner);

export default memo(AnnotationProperties);
