import { memo } from 'react';
import { getOrderedFloors } from '@/domain/floorModels';
import { getStairDisplayLabel } from '@/domain/stairLabels';
import { isRoofAccessOpening, normalizeRoofOpeningType } from '@/roof/openings';
import { stairRun, stairTotalRise } from '@/geometry/stairGeometry';
import InputField from '../InputField';
import PhaseSelector from '../PhaseSelector';
import styles from '../PropertiesPanel.module.css';

function StairProperties({ stair, project, dispatch, floorId, u, phases }) {
  const updateStair = (updates) => {
    dispatch({ type: 'STAIR_UPDATE', floorId, stair: { id: stair.id, ...updates } });
  };

  const floorOptions = getOrderedFloors(project);
  const roofSystem = project.roofSystem || null;
  const roofOpenings = (roofSystem?.roofOpenings || []).map((opening, index) => ({
    ...opening,
    label: opening.name || `Roof Opening ${index + 1}`,
  }));
  const totalRise = stairTotalRise(stair);
  const totalRun = stairRun(stair);
  const directionAngle = stair.direction?.angle ?? 0;

  return (
    <div>
      <div className={styles.title}>Stair</div>
      <PhaseSelector phaseId={stair.phaseId} phases={phases} onChange={(v) => updateStair({ phaseId: v })} />
      <InputField label="Label" value={getStairDisplayLabel(stair)} readOnly />
      <div className={styles.subtitle}>Start Point</div>
      <InputField
        label="X"
        type="number"
        suffix={u.suffix}
        value={u.toDisplay(stair.startPoint.x)}
        onChange={(v) => updateStair({ startPoint: { ...stair.startPoint, x: u.fromDisplay(v) } })}
      />
      <InputField
        label="Y"
        type="number"
        suffix={u.suffix}
        value={u.toDisplay(stair.startPoint.y)}
        onChange={(v) => updateStair({ startPoint: { ...stair.startPoint, y: u.fromDisplay(v) } })}
      />
      <div className={styles.subtitle}>Geometry</div>
      <InputField
        label="Width"
        type="number"
        suffix={u.suffix}
        step={u.step(10)}
        value={u.toDisplay(stair.width)}
        onChange={(v) => updateStair({ width: Math.max(300, u.fromDisplay(v)) })}
      />
      <InputField
        label="Risers"
        type="number"
        step={1}
        value={stair.numberOfRisers}
        onChange={(v) => updateStair({ numberOfRisers: Math.max(1, Math.round(v)) })}
      />
      <InputField
        label="Riser H"
        type="number"
        suffix={u.suffix}
        step={u.step(5)}
        value={u.toDisplay(stair.riserHeight)}
        onChange={(v) => updateStair({ riserHeight: Math.max(50, u.fromDisplay(v)) })}
      />
      <InputField
        label="Tread D"
        type="number"
        suffix={u.suffix}
        step={u.step(5)}
        value={u.toDisplay(stair.treadDepth)}
        onChange={(v) => updateStair({ treadDepth: Math.max(50, u.fromDisplay(v)) })}
      />
      <InputField
        label="Direction"
        type="number"
        suffix="deg"
        step={1}
        value={+directionAngle.toFixed(1)}
        onChange={(v) => updateStair({ direction: { angle: v } })}
      />
      <div className={styles.subtitle}>Floor Relation</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <label style={{ flex: '0 0 80px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>From</label>
        <select
          value={stair.floorRelation?.fromFloorId || floorId}
          onChange={(e) =>
            updateStair({
              floorRelation: {
                ...(stair.floorRelation || {}),
                fromFloorId: e.target.value,
              },
            })
          }
          style={{
            flex: 1,
            height: '28px',
            padding: '0 4px',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '12px',
          }}
        >
          {floorOptions.map((floor) => (
            <option key={floor.id} value={floor.id}>
              {floor.name}
            </option>
          ))}
        </select>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <label style={{ flex: '0 0 80px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>To</label>
        <select
          value={stair.floorRelation?.toFloorId || floorId}
          onChange={(e) =>
            updateStair({
              floorRelation: {
                ...(stair.floorRelation || {}),
                toFloorId: e.target.value,
              },
            })
          }
          style={{
            flex: 1,
            height: '28px',
            padding: '0 4px',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '12px',
          }}
        >
          {floorOptions.map((floor) => (
            <option key={floor.id} value={floor.id}>
              {floor.name}
            </option>
          ))}
        </select>
      </div>
      {roofSystem && (
        <>
          <div className={styles.subtitle}>Roof Access</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <label style={{ flex: '0 0 80px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>Opening</label>
            <select
              value={stair.roofAccess?.roofOpeningId || ''}
              onChange={(e) => updateStair({ roofAccess: e.target.value ? { roofOpeningId: e.target.value } : null })}
              style={{
                flex: 1,
                height: '28px',
                padding: '0 4px',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '12px',
              }}
            >
              <option value="">None</option>
              {roofOpenings.map((opening) => (
                <option key={opening.id} value={opening.id}>
                  {opening.label} ({normalizeRoofOpeningType(opening.type || 'opening')})
                </option>
              ))}
            </select>
          </div>
          {roofOpenings.length === 0 ? (
            <div className={styles.drawingHint}>
              Add a roof opening first. Set the opening type to `Hatch` if it should act as roof access.
            </div>
          ) : stair.roofAccess?.roofOpeningId ? (
            <div className={styles.drawingHint}>
              The linked roof opening will be used as the stair&apos;s roof-access target in sections. Hatch-type
              openings are recommended for access.
            </div>
          ) : (
            <div className={styles.drawingHint}>
              Select a roof opening if this stair should terminate at a roof hatch or access opening.
            </div>
          )}
          {stair.roofAccess?.roofOpeningId &&
            !roofOpenings.some((opening) => opening.id === stair.roofAccess.roofOpeningId) && (
              <div className={styles.drawingHint}>
                This stair references a roof opening that is no longer available.
              </div>
            )}
          {roofOpenings.some((opening) => isRoofAccessOpening(opening.type || 'opening')) &&
            !stair.roofAccess?.roofOpeningId && (
              <div className={styles.drawingHint}>
                Hatch-type roof openings are available and can be linked here for roof access.
              </div>
            )}
        </>
      )}
      <div className={styles.subtitle}>Derived</div>
      <InputField label="Total Rise" type="number" suffix={u.suffix} value={u.toDisplay(totalRise)} readOnly />
      <InputField label="Stair Run" type="number" suffix={u.suffix} value={u.toDisplay(totalRun)} readOnly />
    </div>
  );
}

export default memo(StairProperties);
