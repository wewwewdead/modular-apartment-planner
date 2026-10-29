import { useState } from 'react';
import { HARDWARE_TYPES, METRIC_THREADS, hardwareDefaults, hardwareDimensions } from './hardware.js';
import { ValueField } from './CadEditors.jsx';
import MaterialSelect from './MaterialSelect.jsx';

export function HardwareFields({ feature, onChange }) {
  const update = (key, value) => onChange({ ...feature, [key]: value });
  const shank = ['bolt', 'stud'].includes(feature.kind);
  return (
    <div className="cad-form">
      <p className="cad-help">
        Generic editable envelope. Enter supplier dimensions for purchased hardware. Threads, knurls and clinching
        deformation are not modeled.
      </p>
      {Object.entries({
        length: shank ? 'Shank length (mm)' : 'Body length / thickness (mm)',
        ...(shank
          ? { diameter: 'Shank diameter (mm)' }
          : {
              bodyDiameter: ['nut', 'standoff'].includes(feature.kind)
                ? 'Body across flats (mm)'
                : 'Body diameter (mm)',
              boreDiameter: 'Bore diameter (mm)',
            }),
        ...(!['nut', 'washer', 'standoff', 'insert'].includes(feature.kind)
          ? {
              headDiameter: feature.kind === 'bolt' ? 'Head across flats (mm)' : 'Flange diameter (mm)',
              headHeight: 'Head / flange height (mm)',
            }
          : {}),
        ...(feature.kind !== 'washer' ? { pitch: 'Thread pitch (mm)' } : {}),
        supplierCode: 'Supplier part number',
        installationHole: 'Supplier installation hole (mm)',
        minimumSheet: 'Supplier minimum sheet thickness (mm)',
        notes: 'Installation / finish notes',
      }).map(([key, label]) => (
        <ValueField
          key={`${feature.id}-${key}-${feature[key]}`}
          label={label}
          value={feature[key]}
          asText={['supplierCode', 'notes'].includes(key)}
          onChange={(v) => update(key, v)}
        />
      ))}
    </div>
  );
}
export default function HardwarePanel({ onAdd, canAttach, ready = true, projectMaterials = [] }) {
  const [feature, setFeature] = useState(() => hardwareDefaults());
  const [attach, setAttach] = useState(true);
  let problem = '';
  try {
    hardwareDimensions(feature);
  } catch (e) {
    problem = e.message;
  }
  return (
    <>
      <h3>Hardware library</h3>
      <label className="cad-field">
        Hardware type
        <select
          value={feature.kind}
          onChange={(e) =>
            setFeature({ ...hardwareDefaults(e.target.value, feature.size), material: feature.material })
          }
        >
          {Object.entries(HARDWARE_TYPES).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="cad-field">
        Metric size
        <select
          value={feature.size}
          onChange={(e) =>
            setFeature({ ...hardwareDefaults(feature.kind, e.target.value), material: feature.material })
          }
        >
          {Object.keys(METRIC_THREADS).map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <MaterialSelect
        label="Hardware material"
        value={feature.material}
        projectMaterials={projectMaterials}
        onChange={(material) => setFeature({ ...feature, material })}
      />
      <HardwareFields feature={feature} onChange={setFeature} />
      {canAttach && (
        <label>
          <input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} /> Attach to selected
          hole
        </label>
      )}
      <p className="cad-help">
        {canAttach && attach
          ? 'The seating plane follows this hole and its parent part. Set the axial offset in Connections / welds.'
          : 'Adds a movable part at the origin. Use Move part or exact Position fields to assemble it.'}
      </p>
      <button
        className="cad-primary cad-wide"
        disabled={Boolean(problem) || !ready}
        onClick={() => onAdd(feature, canAttach && attach)}
      >
        Add hardware
      </button>
      {problem && <p role="alert">{problem}</p>}
    </>
  );
}
