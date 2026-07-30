import { memo } from 'react';
import { getBeamDisplayLabel } from '@/domain/beamLabels';
import { getColumnListLabel } from '@/domain/columnLabels';
import { beamLength } from '@/geometry/beamGeometry';
import InputField from '../InputField';
import PhaseSelector from '../PhaseSelector';
import styles from '../PropertiesPanel.module.css';

function BeamProperties({ beam, floor, dispatch, floorId, u, phases }) {
  const updateBeam = (updates) => {
    dispatch({ type: 'BEAM_UPDATE', floorId, beam: { id: beam.id, ...updates } });
  };

  const startColumn = (floor.columns || []).find((column) => column.id === beam.startRef?.id);
  const endColumn = (floor.columns || []).find((column) => column.id === beam.endRef?.id);
  const len = beamLength(beam, floor.columns || []);

  return (
    <div>
      <div className={styles.title}>Beam</div>
      <PhaseSelector phaseId={beam.phaseId} phases={phases} onChange={(v) => updateBeam({ phaseId: v })} />
      <InputField label="Label" value={getBeamDisplayLabel(beam, floor.columns || [])} readOnly />
      <InputField
        label="Start"
        value={startColumn ? getColumnListLabel(startColumn, floor.columns || []) : beam.startRef?.id || '—'}
        readOnly
      />
      <InputField
        label="End"
        value={endColumn ? getColumnListLabel(endColumn, floor.columns || []) : beam.endRef?.id || '—'}
        readOnly
      />
      <div className={styles.subtitle}>Properties</div>
      <InputField
        label="Width"
        type="number"
        suffix={u.suffix}
        step={u.step(10)}
        value={u.toDisplay(beam.width)}
        onChange={(v) => updateBeam({ width: Math.max(50, u.fromDisplay(v)) })}
      />
      <InputField
        label="Depth"
        type="number"
        suffix={u.suffix}
        step={u.step(10)}
        value={u.toDisplay(beam.depth)}
        onChange={(v) => updateBeam({ depth: Math.max(50, u.fromDisplay(v)) })}
      />
      <InputField
        label="Floor Level"
        type="number"
        suffix={u.suffix}
        step={u.step(100)}
        value={u.toDisplay(beam.floorLevel)}
        onChange={(v) => updateBeam({ floorLevel: u.fromDisplay(v) })}
      />
      <InputField label="Span" type="number" suffix={u.suffix} value={u.toDisplay(len)} readOnly />
    </div>
  );
}

export default memo(BeamProperties);
