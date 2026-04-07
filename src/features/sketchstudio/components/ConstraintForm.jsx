import { memo } from 'react';
import {
  getConstraintMidpointOptions,
  getConstraintPointOptions,
  getConstraintSegmentOptions,
  getConstraintSupportedEntityOptions,
  getConstraintTypeOptions,
  parseSerializedConstraintReference,
  createSketchConstraint,
} from '../utils/sketchConstraintUtils';
import { computeIsometricAngle } from '../utils/angleUtils';

export function serializeConstraintReference(reference) {
  if (!reference?.entityId || !reference?.sourceType) {
    return '';
  }

  return `${reference.entityId}:${reference.sourceType}:${reference.sourceKey ?? ''}`;
}

export function renderReadOnlyRows(rows) {
  return rows.map(([label, value]) => (
    <div key={label} className="sketchStudioPropertyRow">
      <span className="sketchStudioPropertyKey">{label}</span>
      <span className="sketchStudioPropertyValue">{typeof value === 'number' ? value.toFixed(1) : value}</span>
    </div>
  ));
}

export function renderEditableField(field, value, onCommit) {
  return (
    <label key={`${field}-${value}`} className="sketchStudioEditableRow">
      <span className="sketchStudioPropertyKey">{field}</span>
      <input
        type="number"
        step="0.1"
        defaultValue={value}
        className="sketchStudioPropertyInput"
        onBlur={(event) => onCommit(field, event.target.value)}
      />
    </label>
  );
}

export function renderEditableTextField(field, value, onCommit) {
  return (
    <label key={`${field}-${value}`} className="sketchStudioEditableRow">
      <span className="sketchStudioPropertyKey">{field}</span>
      <input
        type="text"
        defaultValue={value}
        className="sketchStudioPropertyInput"
        onBlur={(event) => onCommit(field, event.target.value)}
      />
    </label>
  );
}

export function renderEditableFields(entity, onCommit) {
  if (!entity) {
    return null;
  }

  if (entity.type === 'line') {
    return ['x1', 'y1', 'x2', 'y2'].map((field) => renderEditableField(field, entity[field], onCommit));
  }

  if (entity.type === 'rect') {
    return ['x', 'y', 'width', 'height', 'rotation'].map((field) =>
      renderEditableField(field, entity[field] ?? 0, onCommit),
    );
  }

  if (entity.type === 'circle') {
    return ['cx', 'cy', 'r'].map((field) => renderEditableField(field, entity[field], onCommit));
  }

  if (entity.type === 'text') {
    return [
      renderEditableTextField('text', entity.text, onCommit),
      ...['x', 'y', 'fontSize', 'rotation'].map((field) => renderEditableField(field, entity[field] ?? 0, onCommit)),
      <label key={`leaderEnabled-${entity.id}`} className="sketchStudioEditableRow">
        <span className="sketchStudioPropertyKey">Arrow</span>
        <select
          className="sketchStudioPropertyInput"
          defaultValue={entity.leader?.target ? 'on' : 'off'}
          onChange={(event) => onCommit('leaderEnabled', event.target.value === 'on' ? 'true' : 'false')}
        >
          <option value="off">None</option>
          <option value="on">Leader arrow</option>
        </select>
      </label>,
      ...(entity.leader?.target
        ? [
            renderEditableField('leaderTargetX', entity.leader.target.x, onCommit),
            renderEditableField('leaderTargetY', entity.leader.target.y, onCommit),
          ]
        : []),
    ];
  }

  if (entity.type === 'feature') {
    if (entity.shape === 'circle') {
      return ['cx', 'cy', 'diameter'].map((field) => renderEditableField(field, entity[field], onCommit));
    }

    return ['x', 'y', 'width', 'height'].map((field) => renderEditableField(field, entity[field], onCommit));
  }

  if (entity.type === 'angle-dimension') {
    const dir1 = { x: entity.p1.x - entity.vertex.x, y: entity.p1.y - entity.vertex.y };
    const dir2 = { x: entity.p2.x - entity.vertex.x, y: entity.p2.y - entity.vertex.y };
    let angleDeg;
    if (entity.isometricPlane) {
      angleDeg = computeIsometricAngle(dir1, dir2, entity.isometricPlane);
    } else {
      const len1 = Math.hypot(dir1.x, dir1.y) || 1;
      const len2 = Math.hypot(dir2.x, dir2.y) || 1;
      const dot = Math.max(-1, Math.min(1, (dir1.x * dir2.x + dir1.y * dir2.y) / (len1 * len2)));
      angleDeg = Math.acos(dot) * (180 / Math.PI);
    }

    return (
      <>
        {renderReadOnlyRows([['Angle', `${Math.round(angleDeg * 10) / 10}\u00B0`]])}
        {renderEditableField('arcRadius', entity.arcRadius, onCommit)}
      </>
    );
  }

  if (entity.type === 'dimension') {
    return (
      <>
        <label key={`subtype-${entity.subtype}`} className="sketchStudioEditableRow">
          <span className="sketchStudioPropertyKey">Subtype</span>
          <select
            className="sketchStudioPropertyInput"
            defaultValue={entity.subtype}
            onChange={(event) => onCommit('subtype', event.target.value)}
          >
            <option value="horizontal">Horizontal</option>
            <option value="vertical">Vertical</option>
            <option value="aligned">Aligned</option>
          </select>
        </label>
        {renderEditableField('offset', entity.offset, onCommit)}
      </>
    );
  }

  return null;
}

export function buildConstraintForm(type, entities, selectedEntities, existing = null) {
  const referenceEntities = existing ? entities : selectedEntities.length ? selectedEntities : entities;
  const supportedEntities = getConstraintSupportedEntityOptions(entities, type);
  const pointOptions = getConstraintPointOptions(referenceEntities.length ? referenceEntities : entities);
  const midpointOptions = getConstraintMidpointOptions(referenceEntities.length ? referenceEntities : entities);
  const segmentOptions = getConstraintSegmentOptions(referenceEntities.length ? referenceEntities : entities);
  const firstEntityId = selectedEntities[0]?.id || supportedEntities[0]?.value || '';
  const secondEntityId =
    selectedEntities[1]?.id ||
    supportedEntities.find((option) => option.value !== firstEntityId)?.value ||
    supportedEntities[0]?.value ||
    '';

  return {
    id: existing?.id || null,
    type,
    label: existing?.label || '',
    enabled: existing?.enabled !== false,
    driverEntityId: existing?.driverEntityId || firstEntityId,
    drivenEntityId: existing?.drivenEntityId || secondEntityId,
    entityId: existing?.entityId || firstEntityId,
    driverRefValue: serializeConstraintReference(existing?.driverRef) || pointOptions[0]?.value || '',
    drivenRefValue:
      serializeConstraintReference(existing?.drivenRef) || pointOptions[1]?.value || pointOptions[0]?.value || '',
    midpointRefValue: serializeConstraintReference(existing?.midpointRef) || midpointOptions[0]?.value || '',
    betweenStartRefValue: serializeConstraintReference(existing?.betweenStartRef) || pointOptions[0]?.value || '',
    betweenEndRefValue:
      serializeConstraintReference(existing?.betweenEndRef) || pointOptions[1]?.value || pointOptions[0]?.value || '',
    sourceSegmentValue: serializeConstraintReference(existing?.sourceSegmentRef) || segmentOptions[0]?.value || '',
    targetSegmentValue:
      serializeConstraintReference(existing?.targetSegmentRef) ||
      segmentOptions[1]?.value ||
      segmentOptions[0]?.value ||
      '',
    axis: existing?.axis || 'x',
    distanceExpression: existing?.distanceExpression || '=thickness',
  };
}

export function buildConstraintPayload(formState) {
  const base = {
    type: formState.type,
    label: formState.label,
    enabled: formState.enabled,
  };

  if (formState.type === 'equal_length' || formState.type === 'equal_width' || formState.type === 'equal_height') {
    return formState.driverEntityId && formState.drivenEntityId
      ? createSketchConstraint({
          ...base,
          driverEntityId: formState.driverEntityId,
          drivenEntityId: formState.drivenEntityId,
        })
      : null;
  }

  if (formState.type === 'horizontal' || formState.type === 'vertical') {
    return formState.entityId ? createSketchConstraint({ ...base, entityId: formState.entityId }) : null;
  }

  if (formState.type === 'coincident_point') {
    const driverRef = parseSerializedConstraintReference(formState.driverRefValue);
    const drivenRef = parseSerializedConstraintReference(formState.drivenRefValue);
    return driverRef && drivenRef ? createSketchConstraint({ ...base, driverRef, drivenRef }) : null;
  }

  if (formState.type === 'midpoint_lock') {
    const midpointRef = parseSerializedConstraintReference(formState.midpointRefValue);
    const drivenRef = parseSerializedConstraintReference(formState.drivenRefValue);
    return midpointRef && drivenRef ? createSketchConstraint({ ...base, midpointRef, drivenRef }) : null;
  }

  if (formState.type === 'centered_between') {
    const betweenStartRef = parseSerializedConstraintReference(formState.betweenStartRefValue);
    const betweenEndRef = parseSerializedConstraintReference(formState.betweenEndRefValue);
    return betweenStartRef && betweenEndRef && formState.drivenEntityId
      ? createSketchConstraint({
          ...base,
          betweenStartRef,
          betweenEndRef,
          drivenEntityId: formState.drivenEntityId,
          axis: formState.axis,
        })
      : null;
  }

  if (formState.type === 'offset_distance' || formState.type === 'thickness_offset') {
    const sourceSegmentRef = parseSerializedConstraintReference(formState.sourceSegmentValue);
    const targetSegmentRef = parseSerializedConstraintReference(formState.targetSegmentValue);
    return sourceSegmentRef && targetSegmentRef
      ? createSketchConstraint({
          ...base,
          sourceSegmentRef,
          targetSegmentRef,
          distanceExpression: formState.distanceExpression,
        })
      : null;
  }

  return null;
}

function ConstraintForm({ document, selectedEntities, formState, setFormState, onSubmit, onCancel, submitLabel }) {
  const entityOptions = getConstraintSupportedEntityOptions(document.entities, formState.type);
  const referenceEntities = selectedEntities.length ? selectedEntities : document.entities;
  const pointOptions = getConstraintPointOptions(referenceEntities);
  const midpointOptions = getConstraintMidpointOptions(referenceEntities);
  const segmentOptions = getConstraintSegmentOptions(referenceEntities);
  const setField = (field, value) => setFormState((current) => ({ ...current, [field]: value }));

  return (
    <div className="sketchStudioSubpanelCard">
      <div className="sketchStudioPropertyList">
        <label className="sketchStudioEditableRow">
          <span className="sketchStudioPropertyKey">Type</span>
          <select
            className="sketchStudioPropertyInput"
            value={formState.type}
            onChange={(event) =>
              setFormState(
                buildConstraintForm(
                  event.target.value,
                  document.entities,
                  selectedEntities,
                  formState.id ? { ...formState, type: event.target.value } : null,
                ),
              )
            }
          >
            {getConstraintTypeOptions().map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="sketchStudioEditableRow">
          <span className="sketchStudioPropertyKey">Label</span>
          <input
            type="text"
            className="sketchStudioPropertyInput"
            value={formState.label}
            onChange={(event) => setField('label', event.target.value)}
            placeholder="Optional label"
          />
        </label>
      </div>
      {(formState.type === 'equal_length' || formState.type === 'equal_width' || formState.type === 'equal_height') && (
        <div className="sketchStudioPropertyList">
          <label className="sketchStudioEditableRow">
            <span className="sketchStudioPropertyKey">Driver</span>
            <select
              className="sketchStudioPropertyInput"
              value={formState.driverEntityId}
              onChange={(event) => setField('driverEntityId', event.target.value)}
            >
              {entityOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="sketchStudioEditableRow">
            <span className="sketchStudioPropertyKey">Driven</span>
            <select
              className="sketchStudioPropertyInput"
              value={formState.drivenEntityId}
              onChange={(event) => setField('drivenEntityId', event.target.value)}
            >
              {entityOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {(formState.type === 'horizontal' || formState.type === 'vertical') && (
        <div className="sketchStudioPropertyList">
          <label className="sketchStudioEditableRow">
            <span className="sketchStudioPropertyKey">Entity</span>
            <select
              className="sketchStudioPropertyInput"
              value={formState.entityId}
              onChange={(event) => setField('entityId', event.target.value)}
            >
              {entityOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {formState.type === 'coincident_point' && (
        <div className="sketchStudioPropertyList">
          <label className="sketchStudioEditableRow">
            <span className="sketchStudioPropertyKey">Driver Point</span>
            <select
              className="sketchStudioPropertyInput"
              value={formState.driverRefValue}
              onChange={(event) => setField('driverRefValue', event.target.value)}
            >
              {pointOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.entityLabel} · {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="sketchStudioEditableRow">
            <span className="sketchStudioPropertyKey">Driven Point</span>
            <select
              className="sketchStudioPropertyInput"
              value={formState.drivenRefValue}
              onChange={(event) => setField('drivenRefValue', event.target.value)}
            >
              {pointOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.entityLabel} · {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {formState.type === 'midpoint_lock' && (
        <div className="sketchStudioPropertyList">
          <label className="sketchStudioEditableRow">
            <span className="sketchStudioPropertyKey">Midpoint</span>
            <select
              className="sketchStudioPropertyInput"
              value={formState.midpointRefValue}
              onChange={(event) => setField('midpointRefValue', event.target.value)}
            >
              {midpointOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.entityLabel} · {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="sketchStudioEditableRow">
            <span className="sketchStudioPropertyKey">Driven Point</span>
            <select
              className="sketchStudioPropertyInput"
              value={formState.drivenRefValue}
              onChange={(event) => setField('drivenRefValue', event.target.value)}
            >
              {pointOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.entityLabel} · {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {formState.type === 'centered_between' && (
        <div className="sketchStudioPropertyList">
          <label className="sketchStudioEditableRow">
            <span className="sketchStudioPropertyKey">Start Ref</span>
            <select
              className="sketchStudioPropertyInput"
              value={formState.betweenStartRefValue}
              onChange={(event) => setField('betweenStartRefValue', event.target.value)}
            >
              {pointOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.entityLabel} · {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="sketchStudioEditableRow">
            <span className="sketchStudioPropertyKey">End Ref</span>
            <select
              className="sketchStudioPropertyInput"
              value={formState.betweenEndRefValue}
              onChange={(event) => setField('betweenEndRefValue', event.target.value)}
            >
              {pointOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.entityLabel} · {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="sketchStudioEditableRow">
            <span className="sketchStudioPropertyKey">Driven</span>
            <select
              className="sketchStudioPropertyInput"
              value={formState.drivenEntityId}
              onChange={(event) => setField('drivenEntityId', event.target.value)}
            >
              {entityOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="sketchStudioEditableRow">
            <span className="sketchStudioPropertyKey">Axis</span>
            <select
              className="sketchStudioPropertyInput"
              value={formState.axis}
              onChange={(event) => setField('axis', event.target.value)}
            >
              <option value="x">X</option>
              <option value="y">Y</option>
              <option value="both">Both</option>
            </select>
          </label>
        </div>
      )}
      {(formState.type === 'offset_distance' || formState.type === 'thickness_offset') && (
        <div className="sketchStudioPropertyList">
          <label className="sketchStudioEditableRow">
            <span className="sketchStudioPropertyKey">Source Segment</span>
            <select
              className="sketchStudioPropertyInput"
              value={formState.sourceSegmentValue}
              onChange={(event) => setField('sourceSegmentValue', event.target.value)}
            >
              {segmentOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.entityLabel} · {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="sketchStudioEditableRow">
            <span className="sketchStudioPropertyKey">Driven Segment</span>
            <select
              className="sketchStudioPropertyInput"
              value={formState.targetSegmentValue}
              onChange={(event) => setField('targetSegmentValue', event.target.value)}
            >
              {segmentOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.entityLabel} · {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="sketchStudioEditableRow">
            <span className="sketchStudioPropertyKey">Distance</span>
            <input
              type="text"
              className="sketchStudioPropertyInput"
              value={formState.distanceExpression}
              onChange={(event) => setField('distanceExpression', event.target.value)}
              placeholder="=thickness"
            />
          </label>
        </div>
      )}
      <div className="sketchStudioActionRow">
        <button type="button" className="sketchStudioInlineButton" onClick={onSubmit}>
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="sketchStudioInlineButton" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

export default memo(ConstraintForm);
