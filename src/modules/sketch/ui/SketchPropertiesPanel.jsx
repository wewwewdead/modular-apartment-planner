import { useEffect, useState } from 'react';
import { useSketch } from '../app/SketchProvider';
import { useSketchEditor } from '../app/SketchEditorProvider';
import { createAssembly } from '../domain/assemblyModels';
import { CONSTRUCTION_ANNOTATION_TYPES } from '../domain/constructionModels';
import { MATERIAL_OPTIONS, LEG_PROFILE_OPTIONS, FRAME_AXIS_OPTIONS } from '../domain/partDefaults';
import { clampDimension } from '../domain/validation';
import { getPartsBounds3d } from '../domain/objectResize';
import {
  createConstraint,
  createEqualSpacingConstraint,
  CONSTRAINT_TYPES,
  ANCHOR_OPTIONS,
  CENTER_AXIS_OPTIONS,
  SPACING_AXIS_OPTIONS,
} from '../domain/constraintModels';
import { applyDimensionValueToPart, bindDimensionToPart } from '../domain/dimensionBinding';
import { generateAssemblySheet, generateObjectSheet } from '../sheets/sketchSheetTemplates';
import { exportActiveSheetAsPdf, exportActiveSheetAsPng } from '@/export/sheetExport';
import { getTemplate } from '../domain/templates/templateRegistry';
import TemplateParamsForm from './TemplateParamsForm';
import styles from './SketchPropertiesPanel.module.css';

function computeBounds(parts) {
  return getPartsBounds3d(parts);
}

function NumberInput({ label, value, onChange, suffix = 'mm', step = 1, readOnly = false }) {
  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <div className={styles.fieldInput}>
        <input
          type="number"
          value={Math.round(value)}
          step={step}
          readOnly={readOnly}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) onChange(v);
          }}
          onBlur={(e) => {
            if (readOnly) return;
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) {
              const clamped = clampDimension(v);
              if (clamped !== v) onChange(clamped);
            }
          }}
          className={styles.numberInput}
        />
        {suffix && <span className={styles.suffix}>{suffix}</span>}
      </div>
    </label>
  );
}

const ARRAY_AXIS_OPTIONS = [
  { value: 'x', label: 'X' },
  { value: 'y', label: 'Y' },
  { value: 'z', label: 'Z' },
];

const ARRAY_MODE_OPTIONS = [
  { value: 'independent', label: 'Independent' },
  { value: 'linked', label: 'Linked' },
];

const ARRAY_PATTERN_OPTIONS = [
  { value: 'linear', label: 'Linear' },
  { value: 'radial', label: 'Radial' },
];

const ANNOTATION_LABELS = {
  [CONSTRUCTION_ANNOTATION_TYPES.GUIDE_POINT]: 'Guide Point',
  [CONSTRUCTION_ANNOTATION_TYPES.GUIDE_LINE]: 'Guide Line',
  [CONSTRUCTION_ANNOTATION_TYPES.REFERENCE_PLANE]: 'Reference Plane',
  [CONSTRUCTION_ANNOTATION_TYPES.SECTION_PLANE]: 'Section Plane',
};

function SelectInput({ label, value, options, onChange }) {
  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={styles.selectInput}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </label>
  );
}

function TextInput({ label, value, onChange }) {
  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={styles.textInput}
      />
    </label>
  );
}

function PositionSection({ position, onUpdate }) {
  return (
    <div className={styles.fieldGroup}>
      <span className={styles.groupTitle}>Position</span>
      <div className={styles.fieldRow}>
        <NumberInput label="X" value={position.x} onChange={(v) => onUpdate({ x: v })} />
        <NumberInput label="Y" value={position.y} onChange={(v) => onUpdate({ y: v })} />
        <NumberInput label="Z" value={position.z} onChange={(v) => onUpdate({ z: v })} />
      </div>
    </div>
  );
}

const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;

function RotationSection({ rotation, onUpdate }) {
  return (
    <div className={styles.fieldGroup}>
      <span className={styles.groupTitle}>Rotation</span>
      <div className={styles.fieldRow}>
        <NumberInput label="X" value={Math.round((rotation.x || 0) * RAD_TO_DEG)} suffix="°" onChange={(v) => onUpdate({ x: v * DEG_TO_RAD })} />
        <NumberInput label="Y" value={Math.round((rotation.y || 0) * RAD_TO_DEG)} suffix="°" onChange={(v) => onUpdate({ y: v * DEG_TO_RAD })} />
        <NumberInput label="Z" value={Math.round((rotation.z || 0) * RAD_TO_DEG)} suffix="°" onChange={(v) => onUpdate({ z: v * DEG_TO_RAD })} />
      </div>
      <div className={styles.fieldRow}>
        <button type="button" className={styles.quickRotateBtn} onClick={() => onUpdate({ x: (rotation.x || 0) + Math.PI / 2 })}>+90 X</button>
        <button type="button" className={styles.quickRotateBtn} onClick={() => onUpdate({ y: (rotation.y || 0) + Math.PI / 2 })}>+90 Y</button>
        <button type="button" className={styles.quickRotateBtn} onClick={() => onUpdate({ z: (rotation.z || 0) + Math.PI / 2 })}>+90 Z</button>
      </div>
    </div>
  );
}

function FlipSection({ flip, onToggle }) {
  const current = flip || { x: false, y: false, z: false };
  return (
    <div className={styles.fieldGroup}>
      <span className={styles.groupTitle}>Flip</span>
      <div className={styles.fieldRow}>
        <button type="button" className={`${styles.flipBtn} ${current.x ? styles.flipBtnActive : ''}`} onClick={() => onToggle('x')}>Flip X</button>
        <button type="button" className={`${styles.flipBtn} ${current.y ? styles.flipBtnActive : ''}`} onClick={() => onToggle('y')}>Flip Y</button>
        <button type="button" className={`${styles.flipBtn} ${current.z ? styles.flipBtnActive : ''}`} onClick={() => onToggle('z')}>Flip Z</button>
      </div>
    </div>
  );
}

function PanelFields({ part, onUpdate }) {
  return (
    <>
      <NumberInput label="Width" value={part.width} onChange={(v) => onUpdate({ width: v })} />
      <NumberInput label="Depth" value={part.depth} onChange={(v) => onUpdate({ depth: v })} />
      <NumberInput label="Thickness" value={part.thickness} onChange={(v) => onUpdate({ thickness: v })} />
      <SelectInput label="Material" value={part.material} options={MATERIAL_OPTIONS} onChange={(v) => onUpdate({ material: v })} />
    </>
  );
}

function LegFields({ part, onUpdate }) {
  return (
    <>
      <NumberInput label="Width" value={part.width} onChange={(v) => onUpdate({ width: v })} />
      <NumberInput label="Depth" value={part.depth} onChange={(v) => onUpdate({ depth: v })} />
      <NumberInput label="Height" value={part.height} onChange={(v) => onUpdate({ height: v })} />
      <SelectInput label="Profile" value={part.profile} options={LEG_PROFILE_OPTIONS} onChange={(v) => onUpdate({ profile: v })} />
      <SelectInput label="Material" value={part.material} options={MATERIAL_OPTIONS} onChange={(v) => onUpdate({ material: v })} />
    </>
  );
}

function FrameFields({ part, onUpdate }) {
  return (
    <>
      <NumberInput label="Width" value={part.width} onChange={(v) => onUpdate({ width: v })} />
      <NumberInput label="Height" value={part.height} onChange={(v) => onUpdate({ height: v })} />
      <NumberInput label="Length" value={part.length} onChange={(v) => onUpdate({ length: v })} />
      <SelectInput label="Axis" value={part.axis} options={FRAME_AXIS_OPTIONS} onChange={(v) => onUpdate({ axis: v })} />
      <SelectInput label="Material" value={part.material} options={MATERIAL_OPTIONS} onChange={(v) => onUpdate({ material: v })} />
    </>
  );
}

function SolidFields({ part, onUpdate }) {
  const bounds = computeBounds([part]);
  return (
    <>
      <NumberInput label="Extrusion" value={part.extrusionDepth || 120} onChange={(v) => onUpdate({ extrusionDepth: v })} />
      <NumberInput label="Width" value={bounds.width} readOnly onChange={() => {}} />
      <NumberInput label="Depth" value={bounds.depth} readOnly onChange={() => {}} />
      <NumberInput label="Height" value={bounds.height} readOnly onChange={() => {}} />
      <div className={styles.field}>
        <span className={styles.fieldLabel}>Profile</span>
        <span className={styles.typeBadge}>{(part.profilePoints || []).length} pts</span>
      </div>
    </>
  );
}

function CutoutFields({ part, onUpdate }) {
  return (
    <>
      <NumberInput label="Width" value={part.width} onChange={(v) => onUpdate({ width: v })} />
      <NumberInput label="Height" value={part.height} onChange={(v) => onUpdate({ height: v })} />
      <NumberInput label="Depth" value={part.depth} onChange={(v) => onUpdate({ depth: v })} />
    </>
  );
}

function HoleFields({ part, onUpdate }) {
  return (
    <>
      <NumberInput label="Diameter" value={part.diameter} onChange={(v) => onUpdate({ diameter: v })} />
      <NumberInput label="Depth" value={part.depth} onChange={(v) => onUpdate({ depth: v })} />
    </>
  );
}

function Mesh3dFields({ part, onUpdate }) {
  return (
    <>
      <NumberInput label="Thickness" value={part.thickness ?? 18} onChange={(v) => onUpdate({ thickness: v })} />
      <div className={styles.field}>
        <span className={styles.fieldLabel}>Vertices</span>
        <span className={styles.typeBadge}>{(part.vertices3d || []).length} pts</span>
      </div>
    </>
  );
}

function DimensionFields({ part, onUpdate, dispatch, project }) {
  const measurement = Math.round(
    Math.sqrt(
      Math.pow((part.endPoint?.x || 0) - (part.startPoint?.x || 0), 2) +
      Math.pow((part.endPoint?.y || 0) - (part.startPoint?.y || 0), 2) +
      Math.pow((part.endPoint?.z || 0) - (part.startPoint?.z || 0), 2)
    )
  );

  const handleBoundValueChange = (newVal) => {
    if (!part.boundPartId || !part.boundProperty) return;
    const boundPart = project.parts.find((p) => p.id === part.boundPartId);
    if (!boundPart) return;
    const result = applyDimensionValueToPart(part, newVal, boundPart);
    if (result) {
      dispatch({ type: 'PART_UPDATE', part: { id: result.partId, ...result.changes } });
    }
  };

  const bindableParts = project.parts.filter((p) => p.type !== 'dimension');

  const BINDABLE_PROPS = {
    panel: ['width', 'depth', 'thickness'],
    leg: ['width', 'depth', 'height'],
    frame: ['width', 'height', 'length'],
    solid: ['extrusionDepth'],
    cutout: ['width', 'height', 'depth'],
    hole: ['diameter', 'depth'],
    mesh3d: ['thickness'],
  };

  const handleBind = (partId, property) => {
    const target = project.parts.find((p) => p.id === partId);
    if (!target) return;
    const updated = bindDimensionToPart(part, target, property);
    dispatch({ type: 'PART_UPDATE', part: { id: part.id, ...updated } });
  };

  return (
    <>
      {part.boundPartId ? (
        <NumberInput
          label="Value"
          value={measurement}
          suffix="mm"
          onChange={handleBoundValueChange}
        />
      ) : (
        <NumberInput label="Measured" value={measurement} readOnly suffix="mm" onChange={() => {}} />
      )}
      <NumberInput label="Offset" value={part.offset || 200} onChange={(v) => onUpdate({ offset: v })} />
      <TextInput label="Text Override" value={part.textOverride || ''} onChange={(v) => onUpdate({ textOverride: v || null })} />
      {part.boundPartId && (
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Bound to</span>
          <span className={styles.typeBadge}>{part.boundProperty || 'part'}</span>
        </div>
      )}
      {!part.boundPartId && bindableParts.length > 0 && (
        <BindDimensionUI parts={bindableParts} bindableProps={BINDABLE_PROPS} onBind={handleBind} />
      )}
    </>
  );
}

function BindDimensionUI({ parts, bindableProps, onBind }) {
  const [selectedPartId, setSelectedPartId] = useState('');
  const [selectedProp, setSelectedProp] = useState('');

  const selectedPart = parts.find((p) => p.id === selectedPartId);
  const props = selectedPart ? (bindableProps[selectedPart.type] || []) : [];

  return (
    <div className={styles.fieldGroup}>
      <span className={styles.groupTitle}>Bind to Part</span>
      <select
        className={styles.selectInput}
        value={selectedPartId}
        onChange={(e) => { setSelectedPartId(e.target.value); setSelectedProp(''); }}
      >
        <option value="">Select part...</option>
        {parts.map((p) => (
          <option key={p.id} value={p.id}>{p.name} ({p.type})</option>
        ))}
      </select>
      {props.length > 0 && (
        <select
          className={styles.selectInput}
          value={selectedProp}
          onChange={(e) => setSelectedProp(e.target.value)}
        >
          <option value="">Select property...</option>
          {props.map((pr) => (
            <option key={pr} value={pr}>{pr}</option>
          ))}
        </select>
      )}
      {selectedPartId && selectedProp && (
        <button
          className={styles.duplicateBtn}
          onClick={() => onBind(selectedPartId, selectedProp)}
        >
          Bind
        </button>
      )}
    </div>
  );
}

function EqualSpacingForm({ part, project, dispatch, onClose }) {
  const [spacingAxis, setSpacingAxis] = useState('z');
  const [refPartId, setRefPartId] = useState('');
  const [startAnchor, setStartAnchor] = useState('bottom');
  const [endAnchor, setEndAnchor] = useState('top');
  const [selectedPartIds, setSelectedPartIds] = useState(() => [part.id]);

  // Sibling parts in same assembly, or all non-dimension parts
  const candidateParts = project.parts.filter((p) => {
    if (p.type === 'dimension') return false;
    if (part.assemblyId) return p.assemblyId === part.assemblyId;
    return true;
  });

  const togglePart = (id) => {
    setSelectedPartIds((prev) =>
      prev.includes(id) ? prev.filter((pid) => pid !== id) : [...prev, id]
    );
  };

  const handleCreate = () => {
    if (selectedPartIds.length < 2) return;
    const constraint = createEqualSpacingConstraint({
      partIds: selectedPartIds,
      axis: spacingAxis,
      referencePartId: refPartId || null,
      startAnchor,
      endAnchor,
    });
    dispatch({ type: 'CONSTRAINT_ADD', constraint });
    onClose();
  };

  return (
    <div className={styles.constraintSection}>
      <span className={styles.groupTitle}>Equal Spacing</span>
      <div className={styles.fieldGroup}>
        <span className={styles.fieldLabel}>Parts to distribute</span>
        <div style={{ maxHeight: '120px', overflowY: 'auto', fontSize: '11px' }}>
          {candidateParts.map((p) => (
            <label key={p.id} style={{ display: 'flex', gap: '4px', alignItems: 'center', padding: '1px 0' }}>
              <input
                type="checkbox"
                checked={selectedPartIds.includes(p.id)}
                onChange={() => togglePart(p.id)}
              />
              {p.name} ({p.type})
            </label>
          ))}
        </div>
      </div>
      <SelectInput label="Axis" value={spacingAxis} options={SPACING_AXIS_OPTIONS} onChange={setSpacingAxis} />
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Reference Part</span>
        <select className={styles.selectInput} value={refPartId} onChange={(e) => setRefPartId(e.target.value)}>
          <option value="">None (auto range)</option>
          {project.parts.filter((p) => p.type !== 'dimension').map((p) => (
            <option key={p.id} value={p.id}>{p.name} ({p.type})</option>
          ))}
        </select>
      </label>
      {refPartId && (
        <>
          <SelectInput label="Start Anchor" value={startAnchor} options={ANCHOR_OPTIONS} onChange={setStartAnchor} />
          <SelectInput label="End Anchor" value={endAnchor} options={ANCHOR_OPTIONS} onChange={setEndAnchor} />
        </>
      )}
      <div style={{ display: 'flex', gap: '4px' }}>
        <button className={styles.duplicateBtn} onClick={handleCreate} disabled={selectedPartIds.length < 2}>
          Create
        </button>
        <button className={styles.duplicateBtn} onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

function ConstraintsSection({ part, project, dispatch }) {
  const [showForm, setShowForm] = useState(false);
  const [showSpacingForm, setShowSpacingForm] = useState(false);
  const [cType, setCType] = useState('attach_face');
  const [targetId, setTargetId] = useState('');
  const [srcAnchor, setSrcAnchor] = useState('bottom');
  const [tgtAnchor, setTgtAnchor] = useState('top');
  const [offset, setOffset] = useState(0);
  const [centerAxis, setCenterAxis] = useState('both');

  const constraints = (project.constraints || []).filter(
    (c) => {
      if (c.type === 'equal_spacing') {
        return (c.partIds || []).includes(part.id) || c.referencePartId === part.id;
      }
      return c.sourcePartId === part.id || c.targetPartId === part.id;
    }
  );

  const otherParts = project.parts.filter((p) => p.id !== part.id && p.type !== 'dimension');

  const handleAddConstraint = () => {
    if (!targetId) return;
    const overrides = {
      type: cType,
      sourcePartId: part.id,
      targetPartId: targetId,
      sourceAnchor: srcAnchor,
      targetAnchor: tgtAnchor,
      offset: parseFloat(offset) || 0,
    };
    if (cType === 'center_axis') {
      overrides.axis = centerAxis;
    }
    const constraint = createConstraint(overrides);
    dispatch({ type: 'CONSTRAINT_ADD', constraint });
    setShowForm(false);
    setTargetId('');
  };

  const formatConstraintLabel = (c) => {
    if (c.type === 'equal_spacing') {
      const names = (c.partIds || []).map((id) => {
        const p = project.parts.find((pp) => pp.id === id);
        return p?.name || '?';
      }).join(', ');
      return `equal_spacing [${c.axis}]: ${names}`;
    }
    const targetPart = project.parts.find((p) => p.id === (c.sourcePartId === part.id ? c.targetPartId : c.sourcePartId));
    const axisLabel = c.type === 'center_axis' && c.axis && c.axis !== 'both' ? ` [${c.axis}]` : '';
    return `${c.type}${axisLabel}: ${c.sourceAnchor} → ${c.targetAnchor} (${targetPart?.name || '?'})`;
  };

  return (
    <div className={styles.fieldGroup}>
      <span className={styles.groupTitle}>Constraints</span>
      <div className={styles.constraintSection}>
        {constraints.map((c) => (
          <div key={c.id} className={styles.constraintItem}>
            <span>{formatConstraintLabel(c)}</span>
            <button
              className={styles.constraintDelete}
              onClick={() => dispatch({ type: 'CONSTRAINT_DELETE', constraintId: c.id })}
              title="Remove constraint"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {showSpacingForm ? (
        <EqualSpacingForm
          part={part}
          project={project}
          dispatch={dispatch}
          onClose={() => setShowSpacingForm(false)}
        />
      ) : !showForm ? (
        <div style={{ display: 'flex', gap: '4px' }}>
          <button className={styles.duplicateBtn} onClick={() => setShowForm(true)}>
            Add Constraint
          </button>
          <button className={styles.duplicateBtn} onClick={() => setShowSpacingForm(true)}>
            Equal Spacing
          </button>
        </div>
      ) : (
        <div className={styles.constraintSection}>
          <SelectInput
            label="Type"
            value={cType}
            options={CONSTRAINT_TYPES.filter((t) => t.value !== 'equal_spacing')}
            onChange={setCType}
          />
          {cType === 'center_axis' && (
            <SelectInput label="Axis" value={centerAxis} options={CENTER_AXIS_OPTIONS} onChange={setCenterAxis} />
          )}
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Target</span>
            <select className={styles.selectInput} value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              <option value="">Select...</option>
              {otherParts.map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({p.type})</option>
              ))}
            </select>
          </label>
          <SelectInput label="Source Anchor" value={srcAnchor} options={ANCHOR_OPTIONS} onChange={setSrcAnchor} />
          <SelectInput label="Target Anchor" value={tgtAnchor} options={ANCHOR_OPTIONS} onChange={setTgtAnchor} />
          <NumberInput label="Offset" value={offset} suffix="mm" onChange={setOffset} />
          <div style={{ display: 'flex', gap: '4px' }}>
            <button className={styles.duplicateBtn} onClick={handleAddConstraint}>Create</button>
            <button className={styles.duplicateBtn} onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function AssemblyArraySection({ assembly, project, dispatch }) {
  const assemblyParts = project.parts.filter((part) => part.assemblyId === assembly.id && part.type !== 'dimension');
  const bounds = computeBounds(assemblyParts);
  const [copies, setCopies] = useState(3);
  const [mode, setMode] = useState(assembly.instanceMode === 'linked' ? 'linked' : 'independent');
  const [patternType, setPatternType] = useState('linear');
  const [axis, setAxis] = useState('x');
  const [spacing, setSpacing] = useState(Math.max(Math.round(bounds.width || 300), 300));
  const [angleStep, setAngleStep] = useState(15);

  useEffect(() => {
    const axisLength = (
      axis === 'x' ? bounds.width
        : axis === 'y' ? bounds.depth
          : bounds.height
    );
    const suggested = Math.max(Math.round((axisLength || 180) + 120), 180);
    setSpacing(suggested);
  }, [assembly.id, axis, bounds.depth, bounds.height, bounds.width]);

  const handleCreate = () => {
    const copyCount = Math.max(1, Math.floor(copies || 0));
    if (copyCount < 1) return;

    dispatch({
      type: 'ASSEMBLY_ARRAY_CREATE',
      assemblyId: assembly.id,
      copies: copyCount,
      mode,
      patternType,
      axis,
      angleStep,
      delta: {
        dx: axis === 'x' ? spacing : 0,
        dy: axis === 'y' ? spacing : 0,
        dz: axis === 'z' ? spacing : 0,
      },
    });
  };

  return (
    <div className={styles.fieldGroup}>
      <span className={styles.groupTitle}>Pattern</span>
      <SelectInput label="Mode" value={mode} options={ARRAY_MODE_OPTIONS} onChange={setMode} />
      <SelectInput label="Pattern" value={patternType} options={ARRAY_PATTERN_OPTIONS} onChange={setPatternType} />
      <NumberInput label="Copies" value={copies} onChange={(value) => setCopies(Math.max(1, Math.round(value)))} suffix="" step={1} />
      <SelectInput label="Axis" value={axis} options={ARRAY_AXIS_OPTIONS} onChange={setAxis} />
      {patternType === 'linear' ? (
        <NumberInput label="Spacing" value={spacing} onChange={setSpacing} />
      ) : (
        <NumberInput label="Angle Step" value={angleStep} onChange={setAngleStep} suffix="°" />
      )}
      <button className={styles.duplicateBtn} onClick={handleCreate}>
        Create Pattern
      </button>
    </div>
  );
}

function AssemblyReuseSection({ assembly, project, dispatch }) {
  const [mirrorAxis, setMirrorAxis] = useState('x');

  const handleLinkedCopy = () => {
    dispatch({ type: 'ASSEMBLY_CLONE', assemblyId: assembly.id, mode: 'linked' });
  };

  const handleMirror = (mode = 'independent') => {
    dispatch({
      type: 'ASSEMBLY_MIRROR_CREATE',
      assemblyId: assembly.id,
      axis: mirrorAxis,
      mode,
    });
  };

  const handleDetachLink = () => {
    dispatch({ type: 'ASSEMBLY_DETACH_LINK', assemblyId: assembly.id });
  };

  return (
    <div className={styles.fieldGroup}>
      <span className={styles.groupTitle}>Reuse</span>
      <TextInput
        label="Component Label"
        value={assembly.componentLabel || ''}
        onChange={(value) => dispatch({
          type: 'ASSEMBLY_UPDATE',
          assembly: { id: assembly.id, componentLabel: value || null },
        })}
      />
      <div className={styles.field}>
        <span className={styles.fieldLabel}>Instance Mode</span>
        <span className={styles.typeBadge}>{assembly.instanceMode || 'independent'}</span>
      </div>
      {assembly.linkedSourceAssemblyId && (
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Linked Source</span>
          <span className={styles.typeBadge}>{assembly.linkedSourceAssemblyId}</span>
        </div>
      )}
      {assembly.patternType && (
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Pattern</span>
          <span className={styles.typeBadge}>{assembly.patternType}</span>
        </div>
      )}
      <button className={styles.duplicateBtn} onClick={handleLinkedCopy}>
        Create Linked Copy
      </button>
      <SelectInput label="Mirror Axis" value={mirrorAxis} options={ARRAY_AXIS_OPTIONS} onChange={setMirrorAxis} />
      <button className={styles.duplicateBtn} onClick={() => handleMirror('independent')}>
        Mirror Module
      </button>
      <button className={styles.duplicateBtn} onClick={() => handleMirror('linked')}>
        Mirror as Linked
      </button>
      {assembly.linkedSourceAssemblyId && (
        <button className={styles.duplicateBtn} onClick={handleDetachLink}>
          Detach Linked Instance
        </button>
      )}
    </div>
  );
}

function AnnotationProperties({ annotation, dispatch, editorDispatch }) {
  const handleUpdate = (changes) => {
    dispatch({ type: 'ANNOTATION_UPDATE', annotation: { id: annotation.id, ...changes } });
  };

  const handleDelete = () => {
    dispatch({ type: 'ANNOTATION_DELETE', annotationId: annotation.id });
    editorDispatch({ type: 'DESELECT' });
  };

  const handleUseAsPlane = () => {
    if (!annotation.plane) return;
    editorDispatch({ type: 'SET_DRAWING_PLANE', plane: annotation.plane });
    editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Drawing plane updated from construction plane.' });
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>Construction Aid</div>
      <div className={styles.content}>
        <TextInput label="Label" value={annotation.label || ''} onChange={(value) => handleUpdate({ label: value })} />
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Type</span>
          <span className={styles.typeBadge}>{ANNOTATION_LABELS[annotation.type] || annotation.type}</span>
        </div>

        {annotation.type === CONSTRUCTION_ANNOTATION_TYPES.GUIDE_POINT && annotation.position && (
          <PositionSection position={annotation.position} onUpdate={(position) => handleUpdate({ position })} />
        )}

        {annotation.type === CONSTRUCTION_ANNOTATION_TYPES.GUIDE_LINE && (
          <>
            <div className={styles.fieldGroup}>
              <span className={styles.groupTitle}>Start</span>
              <PositionSection position={annotation.startPoint || { x: 0, y: 0, z: 0 }} onUpdate={(startPoint) => handleUpdate({ startPoint })} />
            </div>
            <div className={styles.fieldGroup}>
              <span className={styles.groupTitle}>End</span>
              <PositionSection position={annotation.endPoint || { x: 0, y: 0, z: 0 }} onUpdate={(endPoint) => handleUpdate({ endPoint })} />
            </div>
          </>
        )}

        {(annotation.type === CONSTRUCTION_ANNOTATION_TYPES.REFERENCE_PLANE || annotation.type === CONSTRUCTION_ANNOTATION_TYPES.SECTION_PLANE) && (
          <>
            <div className={styles.fieldGroup}>
              <span className={styles.groupTitle}>Plane</span>
              <PositionSection position={annotation.plane?.origin || { x: 0, y: 0, z: 0 }} onUpdate={(origin) => handleUpdate({ plane: { origin } })} />
              <NumberInput label="Size" value={annotation.size || 1600} onChange={(size) => handleUpdate({ size })} />
            </div>
            <button className={styles.duplicateBtn} onClick={handleUseAsPlane}>
              Use as Drawing Plane
            </button>
          </>
        )}

        <button
          className={styles.duplicateBtn}
          onClick={() => handleUpdate(
            annotation.type === CONSTRUCTION_ANNOTATION_TYPES.SECTION_PLANE
              ? { enabled: !(annotation.enabled ?? true) }
              : { visible: annotation.visible === false }
          )}
        >
          {annotation.type === CONSTRUCTION_ANNOTATION_TYPES.SECTION_PLANE
            ? ((annotation.enabled ?? true) ? 'Disable Section' : 'Enable Section')
            : ((annotation.visible ?? true) ? 'Hide' : 'Show')}
        </button>
        <button className={styles.duplicateBtn} onClick={handleDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}

const partFieldComponents = {
  panel: PanelFields,
  leg: LegFields,
  frame: FrameFields,
  solid: SolidFields,
  cutout: CutoutFields,
  hole: HoleFields,
  mesh3d: Mesh3dFields,
};

const PAPER_SIZE_OPTIONS = [
  { value: 'A4_LANDSCAPE', label: 'A4 Landscape' },
  { value: 'A4_PORTRAIT', label: 'A4 Portrait' },
  { value: 'A3_LANDSCAPE', label: 'A3 Landscape' },
  { value: 'A3_PORTRAIT', label: 'A3 Portrait' },
  { value: 'A2_LANDSCAPE', label: 'A2 Landscape' },
  { value: 'A2_PORTRAIT', label: 'A2 Portrait' },
  { value: 'A1_LANDSCAPE', label: 'A1 Landscape' },
  { value: 'LETTER_LANDSCAPE', label: 'Letter Landscape' },
  { value: 'TABLOID_LANDSCAPE', label: 'Tabloid Landscape' },
];

const VIEWPORT_SOURCE_OPTIONS = [
  { value: 'sketch_object_top', label: 'Object Top' },
  { value: 'sketch_object_front', label: 'Object Front' },
  { value: 'sketch_object_side', label: 'Object Side' },
  { value: 'sketch_part_detail', label: 'Part Detail' },
  { value: 'sketch_part_list', label: 'Parts List' },
  { value: 'sketch_assembly_top', label: 'Assembly Top (Legacy)' },
  { value: 'sketch_assembly_front', label: 'Assembly Front (Legacy)' },
  { value: 'sketch_assembly_side', label: 'Assembly Side (Legacy)' },
];

function SheetProperties({ sheet, project, dispatch }) {
  const handleUpdate = (changes) => {
    dispatch({ type: 'SKETCH_SHEET_UPDATE', sheet: { id: sheet.id, ...changes } });
  };

  return (
    <>
      <TextInput label="Title" value={sheet.title || ''} onChange={(v) => handleUpdate({ title: v })} />
      <TextInput label="Number" value={sheet.number || ''} onChange={(v) => handleUpdate({ number: v })} />
      <TextInput label="Drawing Name" value={sheet.drawingName || ''} onChange={(v) => handleUpdate({ drawingName: v })} />
      <SelectInput
        label="Paper Size"
        value={sheet.paperSize || 'A3_LANDSCAPE'}
        options={PAPER_SIZE_OPTIONS}
        onChange={(v) => handleUpdate({ paperSize: v })}
      />
      <TextInput label="Scale Label" value={sheet.scaleLabel || ''} onChange={(v) => handleUpdate({ scaleLabel: v })} />
    </>
  );
}

function SheetViewportProperties({ viewport, sheet, project, dispatch }) {
  const objects = project.objects || [];
  const assemblies = project.assemblies || [];
  const selectableParts = project.parts.filter((p) => p.type !== 'dimension');

  const handleUpdate = (changes) => {
    dispatch({
      type: 'SKETCH_SHEET_VIEWPORT_UPDATE',
      sheetId: sheet.id,
      viewport: { id: viewport.id, ...changes },
    });
  };

  const handleDelete = () => {
    dispatch({ type: 'SKETCH_SHEET_VIEWPORT_DELETE', sheetId: sheet.id, viewportId: viewport.id });
  };

  return (
    <>
      <TextInput label="Title" value={viewport.title || ''} onChange={(v) => handleUpdate({ title: v })} />
      <SelectInput
        label="Source View"
        value={viewport.sourceView || 'sketch_object_top'}
        options={VIEWPORT_SOURCE_OPTIONS}
        onChange={(v) => handleUpdate({ sourceView: v })}
      />
      {viewport.sourceView?.startsWith('sketch_object') && (
        <SelectInput
          label="Object"
          value={viewport.sourceRefId || ''}
          options={[
            { value: '', label: 'All Objects' },
            ...objects.map((object) => ({ value: object.id, label: object.name })),
          ]}
          onChange={(v) => handleUpdate({ sourceRefId: v || null, sourceObjectId: v || null })}
        />
      )}
      {viewport.sourceView?.startsWith('sketch_assembly') && (
        <SelectInput
          label="Assembly"
          value={viewport.sourceRefId || ''}
          options={[
            { value: '', label: 'All Parts' },
            ...assemblies.map((a) => ({ value: a.id, label: a.name })),
          ]}
          onChange={(v) => handleUpdate({ sourceRefId: v || null })}
        />
      )}
      {viewport.sourceView === 'sketch_part_detail' && (
        <SelectInput
          label="Part"
          value={viewport.sourceRefId || ''}
          options={[
            { value: '', label: 'Select part...' },
            ...selectableParts.map((p) => ({ value: p.id, label: `${p.name} (${p.type})` })),
          ]}
          onChange={(v) => handleUpdate({ sourceRefId: v || null })}
        />
      )}
      {viewport.sourceView === 'sketch_part_list' && (
        <>
          <SelectInput
            label="Object"
            value={viewport.sourceObjectId || ''}
            options={[
              { value: '', label: 'No object filter' },
              ...objects.map((object) => ({ value: object.id, label: object.name })),
            ]}
            onChange={(v) => handleUpdate({ sourceObjectId: v || null, sourceRefId: v || viewport.sourceRefId || null })}
          />
          <SelectInput
            label="Assembly"
            value={viewport.sourceObjectId ? '' : (viewport.sourceRefId || '')}
            options={[
              { value: '', label: 'All Parts' },
              ...assemblies.map((a) => ({ value: a.id, label: a.name })),
            ]}
            onChange={(v) => handleUpdate({ sourceRefId: v || null, sourceObjectId: null })}
          />
        </>
      )}
      <NumberInput label="Scale" value={viewport.scale || 100} suffix=":1" onChange={(v) => handleUpdate({ scale: v })} />
      <SelectInput
        label="Caption"
        value={viewport.captionPosition || 'below'}
        options={[
          { value: 'below', label: 'Below' },
          { value: 'above', label: 'Above' },
        ]}
        onChange={(v) => handleUpdate({ captionPosition: v })}
      />
      <button className={styles.duplicateBtn} onClick={handleDelete} style={{ color: '#c44' }}>
        Remove Viewport
      </button>
    </>
  );
}

function AssemblyProperties({ assembly, project, dispatch, editorDispatch }) {
  const template = assembly.templateType ? getTemplate(assembly.templateType) : null;
  const owningObject = assembly.objectId
    ? (project.objects || []).find((entry) => entry.id === assembly.objectId)
    : null;
  const object = owningObject?.editingPolicy === 'parametric' ? owningObject : null;
  const [pendingParams, setPendingParams] = useState(
    assembly.templateParams ? { ...assembly.templateParams } : {}
  );

  const partCount = assembly.partIds.length;

  const handleNameChange = (name) => {
    dispatch({ type: 'ASSEMBLY_UPDATE', assembly: { id: assembly.id, name } });
  };

  const handleParamChange = (key, value) => {
    setPendingParams((prev) => ({ ...prev, [key]: value }));
  };

  const handleApply = () => {
    dispatch({ type: 'TEMPLATE_REGENERATE', assemblyId: assembly.id, params: pendingParams });
  };

  const handleDetach = () => {
    dispatch({ type: 'TEMPLATE_DETACH', assemblyId: assembly.id });
  };

  const handleEditModule = () => {
    editorDispatch({ type: 'ENTER_ASSEMBLY_EDIT', assemblyId: assembly.id });
  };

  const handleGenerateSheet = () => {
    const sheet = generateAssemblySheet(project, assembly.id);
    dispatch({ type: 'SKETCH_SHEET_ADD', sheet });
    editorDispatch({ type: 'SET_ACTIVE_SHEET', sheetId: sheet.id });
    editorDispatch({ type: 'SET_WORKSPACE_MODE', workspaceMode: 'sheet' });
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>{assembly.objectId ? 'Module' : 'Assembly'}</div>
      <div className={styles.content}>
        {object ? (
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Name</span>
            <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{assembly.name}</span>
          </div>
        ) : (
          <TextInput label="Name" value={assembly.name} onChange={handleNameChange} />
        )}

        {owningObject && (
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Object</span>
            <span className={styles.typeBadge}>{owningObject.name}</span>
          </div>
        )}

        {object && (
          <>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Managed by</span>
              <span className={styles.typeBadge}>{object.name}</span>
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Editing</span>
              <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                This assembly is generated from object parameters.
              </span>
            </div>
          </>
        )}

        {template && !object ? (
          <>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Template</span>
              <span className={styles.typeBadge}>{template.label}</span>
            </div>

            <div className={styles.field}>
              <span className={styles.fieldLabel}>Parts</span>
              <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{partCount}</span>
            </div>

            <div className={styles.fieldGroup}>
              <span className={styles.groupTitle}>Parameters</span>
              <TemplateParamsForm
                parameters={template.parameters}
                values={pendingParams}
                onChange={handleParamChange}
              />
            </div>

            <button className={styles.duplicateBtn} onClick={handleApply}>
              Apply Changes
            </button>
            <button className={styles.duplicateBtn} onClick={handleDetach} style={{ color: '#888' }}>
              Detach Template
            </button>
          </>
        ) : (
          <>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Category</span>
              <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{assembly.category || 'general'}</span>
            </div>
            {assembly.componentLabel && (
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Component</span>
                <span className={styles.typeBadge}>{assembly.componentLabel}</span>
              </div>
            )}
            {assembly.instanceMode && (
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Instance Mode</span>
                <span className={styles.typeBadge}>{assembly.instanceMode}</span>
              </div>
            )}
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Parts</span>
              <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{partCount}</span>
            </div>
            {assembly.description && (
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Description</span>
                <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{assembly.description}</span>
              </div>
            )}
          </>
        )}

        {!object && partCount > 0 && (
          <AssemblyArraySection assembly={assembly} project={project} dispatch={dispatch} />
        )}
        {!object && (
          <AssemblyReuseSection assembly={assembly} project={project} dispatch={dispatch} />
        )}

        <button className={styles.duplicateBtn} onClick={handleEditModule}>
          Edit Module
        </button>
        <button className={styles.duplicateBtn} onClick={handleGenerateSheet}>
          Generate Module Sheet
        </button>
      </div>
    </div>
  );
}

export default function SketchPropertiesPanel() {
  const { getPart, dispatch, project } = useSketch();
  const { selectedId, selectedType, workspaceMode, activeSheetId, dispatch: editorDispatch } = useSketchEditor();

  const isSheetMode = workspaceMode === 'sheet';
  const activeSheet = isSheetMode
    ? (project.sheets || []).find((s) => s.id === activeSheetId)
    : null;

  // Sheet mode properties
  if (isSheetMode) {
    if (selectedType === 'sheetViewport' && selectedId && activeSheet) {
      const viewport = (activeSheet.viewports || []).find((vp) => vp.id === selectedId);
      if (viewport) {
        return (
          <div className={styles.panel}>
            <div className={styles.header}>Viewport Properties</div>
            <div className={styles.content}>
              <SheetViewportProperties
                viewport={viewport}
                sheet={activeSheet}
                project={project}
                dispatch={dispatch}
              />
            </div>
          </div>
        );
      }
    }

    if (activeSheet) {
      const handleGenerateObjectSheet = (objectId) => {
        const sheet = generateObjectSheet(project, objectId);
        dispatch({ type: 'SKETCH_SHEET_ADD', sheet });
        editorDispatch({ type: 'SET_ACTIVE_SHEET', sheetId: sheet.id });
        editorDispatch({ type: 'SET_WORKSPACE_MODE', workspaceMode: 'sheet' });
      };

      const handleGenerateAssemblySheet = (assemblyId) => {
        const sheet = generateAssemblySheet(project, assemblyId);
        dispatch({ type: 'SKETCH_SHEET_ADD', sheet });
        editorDispatch({ type: 'SET_ACTIVE_SHEET', sheetId: sheet.id });
        editorDispatch({ type: 'SET_WORKSPACE_MODE', workspaceMode: 'sheet' });
      };

      const handleExportPdf = async () => {
        try {
          await exportActiveSheetAsPdf(activeSheet.title || 'sketch-sheet', activeSheet.paperSize);
        } catch (err) {
          console.error('PDF export failed:', err);
        }
      };

      const handleExportPng = async () => {
        try {
          await exportActiveSheetAsPng(activeSheet.title || 'sketch-sheet');
        } catch (err) {
          console.error('PNG export failed:', err);
        }
      };

      return (
        <div className={styles.panel}>
          <div className={styles.header}>Sheet Properties</div>
          <div className={styles.content}>
            <SheetProperties sheet={activeSheet} project={project} dispatch={dispatch} />

            <div className={styles.fieldGroup}>
              <span className={styles.groupTitle}>Actions</span>
              {(project.objects || []).map((object) => (
                <button
                  key={object.id}
                  className={styles.duplicateBtn}
                  onClick={() => handleGenerateObjectSheet(object.id)}
                >
                  Generate Sheet: {object.name}
                </button>
              ))}
              {(project.assemblies || []).map((asm) => (
                <button
                  key={asm.id}
                  className={styles.duplicateBtn}
                  onClick={() => handleGenerateAssemblySheet(asm.id)}
                >
                  Generate Sheet: {asm.name}
                </button>
              ))}
              <button className={styles.duplicateBtn} onClick={handleExportPdf}>
                Export PDF
              </button>
              <button className={styles.duplicateBtn} onClick={handleExportPng}>
                Export PNG
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className={styles.panel}>
        <div className={styles.header}>Properties</div>
        <div className={styles.empty}>No sheet selected</div>
      </div>
    );
  }

  if (selectedType === 'annotation' && selectedId) {
    const annotation = (project.annotations || []).find((entry) => entry.id === selectedId);
    if (annotation) {
      return <AnnotationProperties annotation={annotation} dispatch={dispatch} editorDispatch={editorDispatch} />;
    }
  }

  // Model mode: assembly selection (only for assemblies belonging to an object)
  if (selectedType === 'assembly' && selectedId) {
    const asm = project.assemblies.find((a) => a.id === selectedId);
    if (asm && asm.objectId) {
      return (
        <AssemblyProperties key={asm.id} assembly={asm} project={project} dispatch={dispatch} editorDispatch={editorDispatch} />
      );
    }
  }

  // Model mode properties
  const part = selectedId ? getPart(selectedId) : null;

  if (!part) {
    return (
      <div className={styles.panel}>
        <div className={styles.header}>Properties</div>
        <div className={styles.empty}>Select an object, assembly, or part to view its properties</div>
      </div>
    );
  }

  const handleUpdate = (changes) => {
    dispatch({ type: 'PART_UPDATE', part: { id: part.id, ...changes } });
  };

  const handlePositionUpdate = (posChanges) => {
    dispatch({ type: 'PART_UPDATE', part: { id: part.id, position: { ...part.position, ...posChanges } } });
  };

  const handleRotationUpdate = (rotChanges) => {
    dispatch({ type: 'PART_UPDATE', part: { id: part.id, rotation: { ...part.rotation, ...rotChanges } } });
  };

  const handleFlipToggle = (axis) => {
    const currentFlip = part.flip || { x: false, y: false, z: false };
    dispatch({ type: 'PART_UPDATE', part: { id: part.id, flip: { [axis]: !currentFlip[axis] } } });
  };

  const handleDuplicate = () => {
    dispatch({ type: 'PART_CLONE', partId: part.id });
  };

  const handleMakeModule = () => {
    const objectAssemblyCount = (project.assemblies || []).filter((entry) => entry.objectId === (part.objectId || null)).length;
    const nextAssembly = createAssembly(`${part.name} Module`, {
      objectId: part.objectId || null,
      category: managedObject?.category || assembly?.category || part.type,
      description: `Module built from ${part.name}`,
      source: 'manual',
      sortIndex: objectAssemblyCount,
    });
    dispatch({ type: 'PART_WRAP_IN_ASSEMBLY', partId: part.id, assembly: nextAssembly });
    editorDispatch({ type: 'ENTER_ASSEMBLY_EDIT', assemblyId: nextAssembly.id });
  };

  const isDimension = part.type === 'dimension';
  const FieldsComponent = isDimension ? null : partFieldComponents[part.type];

  // Find assembly this part belongs to
  const assembly = part.assemblyId
    ? project.assemblies.find((a) => a.id === part.assemblyId)
    : null;
  const managedObject = part.objectId
    ? (project.objects || []).find((object) => object.id === part.objectId)
    : null;
  const isManagedGeneratedPart = !!managedObject && part.source === 'generated';

  if (isManagedGeneratedPart && !isDimension) {
    return (
      <div className={styles.panel}>
        <div className={styles.header}>Part</div>
        <div className={styles.content}>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Name</span>
            <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{part.name}</span>
          </div>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Type</span>
            <span className={styles.typeBadge}>{part.type}</span>
          </div>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Managed by</span>
            <span className={styles.typeBadge}>{managedObject.name}</span>
          </div>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Assembly</span>
            <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{assembly?.name || 'None'}</span>
          </div>
          <div className={styles.fieldGroup}>
            <span className={styles.groupTitle}>Editing</span>
            <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
              This generated part is driven by object parameters. Select the object to change geometry, or detach the object to edit parts manually.
            </span>
          </div>
          <ConstraintsSection part={part} project={project} dispatch={dispatch} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>Properties</div>

      <div className={styles.content}>
        {/* Name */}
        <TextInput label="Name" value={part.name} onChange={(v) => handleUpdate({ name: v })} />

        {/* Type badge */}
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Type</span>
          <span className={styles.typeBadge}>{part.type}</span>
        </div>

        {part.linkedSourcePartId && (
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Linked Source</span>
            <span className={styles.typeBadge}>{part.linkedSourcePartId}</span>
          </div>
        )}

        {/* Position (skip for dimensions) */}
        {!isDimension && (
          <PositionSection position={part.position} onUpdate={handlePositionUpdate} />
        )}

        {/* Rotation (skip for dimensions) */}
        {!isDimension && (
          <RotationSection rotation={part.rotation} onUpdate={handleRotationUpdate} />
        )}

        {/* Flip (skip for dimensions) */}
        {!isDimension && (
          <FlipSection flip={part.flip} onToggle={handleFlipToggle} />
        )}

        {/* Dimension-specific fields */}
        {isDimension && (
          <div className={styles.fieldGroup}>
            <span className={styles.groupTitle}>Dimension</span>
            <DimensionFields part={part} onUpdate={handleUpdate} dispatch={dispatch} project={project} />
          </div>
        )}

        {/* Type-specific dimensions */}
        {FieldsComponent && (
          <div className={styles.fieldGroup}>
            <span className={styles.groupTitle}>Dimensions</span>
            <FieldsComponent part={part} onUpdate={handleUpdate} />
          </div>
        )}

        {/* Style (skip for dimensions) */}
        {!isDimension && (
          <div className={styles.fieldGroup}>
            <span className={styles.groupTitle}>Style</span>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Fill</span>
              <input
                type="color"
                value={part.fill === 'none' ? '#ffffff' : part.fill}
                onChange={(e) => handleUpdate({ fill: e.target.value })}
                className={styles.colorInput}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Stroke</span>
              <input
                type="color"
                value={part.stroke || '#1E2433'}
                onChange={(e) => handleUpdate({ stroke: e.target.value })}
                className={styles.colorInput}
              />
            </label>
          </div>
        )}

        {/* Module (skip for dimensions) */}
        {!isDimension && (
          <div className={styles.fieldGroup}>
            <span className={styles.groupTitle}>Module</span>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>{assembly ? assembly.name : 'None'}</span>
            </div>
            <button className={styles.duplicateBtn} onClick={handleMakeModule}>
              {assembly ? 'Extract Selection to New Module' : 'Make Module from Selection'}
            </button>
          </div>
        )}

        {/* Constraints (skip for dimensions) */}
        {!isDimension && (
          <ConstraintsSection part={part} project={project} dispatch={dispatch} />
        )}

        {/* Duplicate button */}
        {!isDimension && (
          <button className={styles.duplicateBtn} onClick={handleDuplicate}>
            Duplicate
          </button>
        )}
      </div>
    </div>
  );
}
