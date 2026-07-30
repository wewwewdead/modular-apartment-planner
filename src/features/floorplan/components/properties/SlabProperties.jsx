import { memo } from 'react';
import { getSlabDisplayLabel } from '@/domain/slabLabels';
import { slabArea } from '@/geometry/slabGeometry';
import InputField from '../InputField';
import PhaseSelector from '../PhaseSelector';
import styles from '../PropertiesPanel.module.css';

function SlabProperties({ slab, floor, dispatch, floorId, u, phases }) {
  const updateSlab = (updates) => {
    dispatch({ type: 'SLAB_UPDATE', floorId, slab: { id: slab.id, ...updates } });
  };
  const areaM2 = (slabArea(slab) / 1_000_000).toFixed(2);

  return (
    <div>
      <div className={styles.title}>Slab</div>
      <PhaseSelector phaseId={slab.phaseId} phases={phases} onChange={(v) => updateSlab({ phaseId: v })} />
      <InputField label="Name" value={slab.name} onChange={(value) => updateSlab({ name: value })} />
      <InputField label="Type" value={slab.type} onChange={(value) => updateSlab({ type: value })} />
      <InputField label="Floor" value={floor.name} readOnly />
      <div className={styles.subtitle}>Properties</div>
      <InputField
        label="Thickness"
        type="number"
        suffix={u.suffix}
        step={u.step(10)}
        value={u.toDisplay(slab.thickness)}
        onChange={(value) => updateSlab({ thickness: Math.max(50, u.fromDisplay(value)) })}
      />
      <InputField
        label="Elevation"
        type="number"
        suffix={u.suffix}
        step={u.step(10)}
        value={u.toDisplay(slab.elevation)}
        onChange={(value) => updateSlab({ elevation: u.fromDisplay(value) })}
      />
      <InputField label="Area" suffix="m²" value={areaM2} readOnly />
      <InputField label="Label" value={getSlabDisplayLabel(slab)} readOnly />
    </div>
  );
}

export default memo(SlabProperties);
