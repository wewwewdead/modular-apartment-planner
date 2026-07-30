import { memo } from 'react';
import { getLandingDisplayLabel } from '@/domain/landingLabels';
import { computeLandingElevation } from '@/geometry/landingGeometry';
import InputField from '../InputField';
import PhaseSelector from '../PhaseSelector';
import styles from '../PropertiesPanel.module.css';

function LandingProperties({ landing, floor, dispatch, floorId, u, phases }) {
  const updateLanding = (updates) => {
    dispatch({ type: 'LANDING_UPDATE', floorId, landing: { id: landing.id, ...updates } });
  };

  const stairs = floor?.stairs || [];
  const autoElevation = computeLandingElevation(landing, stairs, 0);
  const connectedStairs = stairs.filter(
    (s) => s.startLandingAttachment?.landingId === landing.id || s.endLandingAttachment?.landingId === landing.id,
  );

  return (
    <div>
      <div className={styles.title}>Landing</div>
      <PhaseSelector phaseId={landing.phaseId} phases={phases} onChange={(v) => updateLanding({ phaseId: v })} />
      <InputField label="Label" value={getLandingDisplayLabel(landing)} readOnly />
      <div className={styles.subtitle}>Position</div>
      <InputField
        label="X"
        type="number"
        suffix={u.suffix}
        value={u.toDisplay(landing.position.x)}
        onChange={(v) => updateLanding({ position: { ...landing.position, x: u.fromDisplay(v) } })}
      />
      <InputField
        label="Y"
        type="number"
        suffix={u.suffix}
        value={u.toDisplay(landing.position.y)}
        onChange={(v) => updateLanding({ position: { ...landing.position, y: u.fromDisplay(v) } })}
      />
      <div className={styles.subtitle}>Geometry</div>
      <InputField
        label="Width"
        type="number"
        suffix={u.suffix}
        step={u.step(10)}
        value={u.toDisplay(landing.width)}
        onChange={(v) => updateLanding({ width: Math.max(200, u.fromDisplay(v)) })}
      />
      <InputField
        label="Depth"
        type="number"
        suffix={u.suffix}
        step={u.step(10)}
        value={u.toDisplay(landing.depth)}
        onChange={(v) => updateLanding({ depth: Math.max(200, u.fromDisplay(v)) })}
      />
      <InputField
        label="Thickness"
        type="number"
        suffix={u.suffix}
        step={u.step(10)}
        value={u.toDisplay(landing.thickness)}
        onChange={(v) => updateLanding({ thickness: Math.max(50, u.fromDisplay(v)) })}
      />
      <InputField
        label="Rotation"
        type="number"
        suffix="deg"
        step={1}
        value={+(landing.rotation || 0).toFixed(1)}
        onChange={(v) => updateLanding({ rotation: v })}
      />
      <div className={styles.subtitle}>Elevation</div>
      <InputField
        label="Elevation"
        type="number"
        suffix={u.suffix}
        value={u.toDisplay(landing.elevation || autoElevation)}
        onChange={(v) => updateLanding({ elevation: u.fromDisplay(v) })}
      />
      <InputField label="Auto Elev" type="number" suffix={u.suffix} value={u.toDisplay(autoElevation)} readOnly />
      {connectedStairs.length > 0 && (
        <>
          <div className={styles.subtitle}>Connected Stairs</div>
          {connectedStairs.map((s) => (
            <InputField key={s.id} label="Stair" value={s.id.split('_').pop()} readOnly />
          ))}
        </>
      )}
    </div>
  );
}

export default memo(LandingProperties);
