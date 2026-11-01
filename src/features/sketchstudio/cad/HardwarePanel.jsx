import { useRef, useState } from 'react';
import {
  DRIVES,
  HARDWARE_GROUPS,
  HARDWARE_TYPES,
  HEAD_STYLES,
  POINTS,
  SCREW_KINDS,
  catalogOf,
  drivesFor,
  hardwareDefaults,
  hardwareDimensions,
  hardwareFieldLabels,
  headsFor,
  pointsFor,
  resolveHardware,
  sizesFor,
  withDrive,
  withHead,
  withPoint,
} from './hardware.js';
import { ValueField } from './CadEditors.jsx';
import MaterialSelect from './MaterialSelect.jsx';

// A choice select (Phase N): applies at once, no live-field debounce.
function Choice({ label, value, options, names, onChange }) {
  return (
    <label className="cad-field">
      {label}
      {/* An explicit name: the wrapping label would add the chosen option's text. */}
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((key) => (
          <option key={key} value={key}>
            {names[key].label}
          </option>
        ))}
      </select>
    </label>
  );
}

// The sizes of the library, the tree editor and Place. Screws (Phase N,
// docs/sketch-studio-screw-library.md §7) add Head style / Drive / Point
// selects where their standard offers a choice; a head, drive or point change
// re-derives the dependent sizes from the standard.
export function HardwareFields({ feature, onChange }) {
  const update = (key, value) => onChange({ ...feature, [key]: value });
  const screw = SCREW_KINDS[feature.kind] ? resolveHardware(feature) : null;
  const heads = headsFor(feature.kind);
  const drives = screw ? drivesFor(feature.kind, screw.head) : [];
  // A saved drive 'none' on a recessed kind stays selectable.
  const driveOptions = screw?.drive === 'none' && !drives.includes('none') ? [...drives, 'none'] : drives;
  const points = pointsFor(feature.kind);
  const shown = screw || feature;
  return (
    <div className="cad-form">
      <p className="cad-help">
        Generic editable envelope. Enter supplier dimensions for purchased hardware. Threads, knurls, drill flutes and
        clinching deformation are not modeled; drive recesses are schematic.
      </p>
      {heads.length > 1 && (
        <Choice
          label="Head style"
          value={screw.head}
          options={heads}
          names={HEAD_STYLES}
          onChange={(head) => onChange(withHead(feature, head))}
        />
      )}
      {driveOptions.length > 1 && (
        <Choice
          label="Drive"
          value={screw.drive}
          options={driveOptions}
          names={DRIVES}
          onChange={(drive) => onChange(withDrive(feature, drive))}
        />
      )}
      {points.length > 1 && (
        <Choice
          label="Point"
          value={screw.point}
          options={points}
          names={POINTS}
          onChange={(point) => onChange(withPoint(feature, point))}
        />
      )}
      {hardwareFieldLabels(feature).map(([key, label]) => (
        <ValueField
          key={`${feature.id}-${key}`}
          label={label}
          value={shown[key]}
          asText={['supplierCode', 'notes'].includes(key)}
          onChange={(v) => update(key, v)}
        />
      ))}
    </div>
  );
}
// attachRow (Phase M): the selected hole is a hole row, so Attach to selected
// hole opens Place with every hole of the row chosen instead of committing.
export default function HardwarePanel({ onAdd, canAttach, attachRow = false, ready = true, projectMaterials = [] }) {
  const [feature, setFeature] = useState(() => hardwareDefaults());
  const [attach, setAttach] = useState(true);
  // The last size chosen in each catalog: bolt M6 → wood screw (4.0) → bolt
  // lands on M6 again (spec §5).
  const lastSizes = useRef({});
  let problem = '';
  try {
    hardwareDimensions(feature);
  } catch (e) {
    problem = e.message;
  }
  const changeKind = (kind) => {
    lastSizes.current[catalogOf(feature.kind)] = feature.size;
    const sizes = sizesFor(kind);
    const remembered = lastSizes.current[catalogOf(kind)];
    const size = sizes.includes(feature.size) ? feature.size : sizes.includes(remembered) ? remembered : undefined;
    setFeature({ ...hardwareDefaults(kind, size), material: feature.material });
  };
  // A new size keeps the chosen head, drive and point.
  const changeSize = (size) => {
    lastSizes.current[catalogOf(feature.kind)] = size;
    let next = hardwareDefaults(feature.kind, size);
    if (SCREW_KINDS[feature.kind]) {
      if (feature.head && feature.head !== next.head) next = withHead(next, feature.head);
      if (feature.drive && feature.drive !== next.drive) next = withDrive(next, feature.drive);
      if (feature.point && feature.point !== next.point) next = withPoint(next, feature.point);
    }
    setFeature({ ...next, material: feature.material });
  };
  return (
    <>
      <h3>Hardware library</h3>
      <label className="cad-field">
        Hardware type
        <select value={feature.kind} onChange={(e) => changeKind(e.target.value)}>
          {HARDWARE_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.kinds.map((key) => (
                <option key={key} value={key}>
                  {HARDWARE_TYPES[key]}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <label className="cad-field">
        Metric size
        <select value={feature.size} onChange={(e) => changeSize(e.target.value)}>
          {sizesFor(feature.kind).map((s) => (
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
          ? attachRow
            ? "Opens Place with every hole of this row chosen; remove any you don't want, then press Enter."
            : 'The seating plane follows this hole and its parent part. Set the axial offset in Connections / welds.'
          : 'Add hardware, then click the hole centres it goes in (click one again to remove it, Shift+click picks a whole row) and press Enter: one part is seated in every chosen hole. Or click a flat face in the view to seat it there (bolts, studs and screws point into the face), or click empty ground; that single one is a movable part.'}
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
