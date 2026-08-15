import { useCallback, useRef, useState } from 'react';
import { computeIsometricAngle, computeScreenAngle, formatAngleText } from '../utils/angleUtils';
import { evaluateExpression } from '../utils/parametricEngine';

/**
 * Property rows for the selection panel: the read-only measurements a tool
 * computes, and the editable fields each entity type exposes.
 */
export function renderReadOnlyRows(rows) {
  return rows.map(([label, value]) => (
    <div key={label} className="sketchStudioPropertyRow">
      <span className="sketchStudioPropertyKey">{label}</span>
      <span className="sketchStudioPropertyValue">{typeof value === 'number' ? value.toFixed(1) : value}</span>
    </div>
  ));
}

// Keys that can change the text. Steppers (Up/Down), navigation and modifiers
// deliberately do not count — pressing them must not leave a flag behind that
// makes the next spinner click look like typing.
function isTextEditingKey(key) {
  return key.length === 1 || key === 'Backspace' || key === 'Delete';
}

/**
 * The number a field is allowed to hand to the document, or null.
 *
 * A `type="number"` input reports anything it cannot parse as the empty string,
 * and `Number('')` is a perfectly finite 0 — which is how clearing the width box
 * and clicking away used to collapse a rectangle to nothing. Half-typed entries
 * ('-', '1.') are the same story, so the parse is deliberately strict and the
 * caller simply declines to commit when it returns null.
 */
function toCommittableNumber(rawValue) {
  const text = String(rawValue ?? '').trim();

  if (!text) {
    return null;
  }

  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Number entry for the selection panel.
 *
 * Typing keeps a local draft and commits nothing, because every keystroke that
 * reached the document would be normalized (Math.abs, rounding) and written
 * straight back over the half-finished number. Enter and blur commit the draft,
 * Escape throws it away, and the stepper commits on the spot — stepping cannot
 * produce a half-finished number, so there is nothing to wait for. Clearing the
 * draft after a commit is what makes a rejected or normalized value show up: the
 * box always falls back to the value the entity actually holds.
 */
function NumericPropertyField({ field, label, value, onCommit, readOnly = false, hint }) {
  const [draft, setDraft] = useState(null);
  // Set by the keydown that is about to produce an input event; read once and
  // cleared. Without it a spinner click after a keystroke would look like typing.
  const typedRef = useRef(false);

  const commit = useCallback(
    (rawValue) => {
      if (readOnly) return;
      if (toCommittableNumber(rawValue) === null) return;
      onCommit(field, rawValue);
    },
    [field, onCommit, readOnly],
  );

  const handleChange = useCallback(
    (event) => {
      const rawValue = event.target.value;
      const typed = typedRef.current;
      typedRef.current = false;

      // The stepper — arrow buttons, wheel, Up/Down — does not edit text, so the
      // browser fires an input event carrying no inputType. Typed text always
      // carries one, and the keydown flag is the second opinion.
      const stepped = !event.nativeEvent?.inputType && !typed;

      if (stepped && toCommittableNumber(rawValue) !== null) {
        setDraft(null);
        commit(rawValue);
        return;
      }

      setDraft(rawValue);
    },
    [commit],
  );

  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === 'Enter') {
        commit(event.target.value);
        setDraft(null);
        return;
      }

      if (event.key === 'Escape') {
        // Safe to settle here: the studio's global key handler already ignores
        // events aimed at an input, so abandoning the draft cannot also cancel
        // the active tool or clear the selection.
        setDraft(null);
        return;
      }

      typedRef.current = isTextEditingKey(event.key);
    },
    [commit],
  );

  // Leaving the field is a commit — a number typed and then clicked away from
  // was still meant to be kept. A partial entry parses to nothing and falls back
  // to the committed value, so it never lingers as though it had been saved.
  const handleBlur = useCallback(
    (event) => {
      if (draft !== null) commit(event.target.value);
      setDraft(null);
      typedRef.current = false;
    },
    [commit, draft],
  );

  return (
    <label className="sketchStudioEditableRow" title={hint}>
      <span className="sketchStudioPropertyKey">{label ?? field}</span>
      <input
        type="number"
        step="0.1"
        value={draft ?? value ?? ''}
        readOnly={readOnly}
        aria-readonly={readOnly || undefined}
        className="sketchStudioPropertyInput"
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
      />
    </label>
  );
}

/** Same draft semantics as the numeric row, minus the parsing. */
function TextPropertyField({ field, label, value, onCommit }) {
  const [draft, setDraft] = useState(null);

  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === 'Enter') {
        onCommit(field, event.target.value);
        setDraft(null);
        return;
      }

      if (event.key === 'Escape') {
        setDraft(null);
      }
    },
    [field, onCommit],
  );

  const handleBlur = useCallback(
    (event) => {
      if (draft !== null) onCommit(field, event.target.value);
      setDraft(null);
    },
    [draft, field, onCommit],
  );

  return (
    <label className="sketchStudioEditableRow">
      <span className="sketchStudioPropertyKey">{label ?? field}</span>
      <input
        type="text"
        value={draft ?? value ?? ''}
        className="sketchStudioPropertyInput"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
      />
    </label>
  );
}

/**
 * A field whose value is produced by a parametric expression, or null.
 *
 * Resolution runs on every document write, so a typed edit to a bound field is
 * overwritten before it can be seen. Rather than let the panel pretend, the row
 * is engraved: it shows the resolved number read-only, the way the floorplan
 * panels present derived values. The binding is edited where it lives — the
 * expression and its variables — not by typing over the result.
 */
function getParametricBinding(entity, field, variables) {
  const expression = entity?.parametricExpressions?.[field];

  if (!expression || !variables?.length) {
    return null;
  }

  return evaluateExpression(expression, variables) === null ? null : { expression };
}

export function renderEditableField(field, value, onCommit, options = {}) {
  const { entityId, label, readOnly = false, hint } = options;

  return (
    <NumericPropertyField
      // Keyed by entity, not by value: a value-keyed row is torn down and
      // rebuilt on every commit, which drops focus mid-edit. Keying by entity
      // still discards a pending draft when the selection moves on, so a number
      // typed for one entity can never land on the next one.
      key={entityId ? `${entityId}-${field}` : field}
      field={field}
      label={label}
      value={value}
      onCommit={onCommit}
      readOnly={readOnly}
      hint={hint}
    />
  );
}

export function renderEditableTextField(field, value, onCommit, options = {}) {
  const { entityId, label } = options;

  return (
    <TextPropertyField
      key={entityId ? `${entityId}-${field}` : field}
      field={field}
      label={label}
      value={value}
      onCommit={onCommit}
    />
  );
}

export function renderEditableFields(entity, onCommit, variables = []) {
  if (!entity) {
    return null;
  }

  const numericField = (field, value) => {
    const binding = getParametricBinding(entity, field, variables);

    return renderEditableField(field, value, onCommit, {
      entityId: entity.id,
      readOnly: Boolean(binding),
      hint: binding ? `Driven by the expression ${binding.expression}` : undefined,
    });
  };

  if (entity.type === 'line') {
    return ['x1', 'y1', 'x2', 'y2'].map((field) => numericField(field, entity[field]));
  }

  if (entity.type === 'rect') {
    return ['x', 'y', 'width', 'height', 'rotation'].map((field) => numericField(field, entity[field] ?? 0));
  }

  if (entity.type === 'circle') {
    return ['cx', 'cy', 'r'].map((field) => numericField(field, entity[field]));
  }

  if (entity.type === 'text') {
    return [
      renderEditableTextField('text', entity.text, onCommit, { entityId: entity.id }),
      ...['x', 'y', 'fontSize', 'rotation'].map((field) => numericField(field, entity[field] ?? 0)),
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
        ? [numericField('leaderTargetX', entity.leader.target.x), numericField('leaderTargetY', entity.leader.target.y)]
        : []),
    ];
  }

  if (entity.type === 'feature') {
    if (entity.shape === 'circle') {
      return ['cx', 'cy', 'diameter'].map((field) => numericField(field, entity[field]));
    }

    return ['x', 'y', 'width', 'height'].map((field) => numericField(field, entity[field]));
  }

  if (entity.type === 'angle-dimension') {
    const dir1 = { x: entity.p1.x - entity.vertex.x, y: entity.p1.y - entity.vertex.y };
    const dir2 = { x: entity.p2.x - entity.vertex.x, y: entity.p2.y - entity.vertex.y };
    const angleDeg = entity.isometricPlane
      ? computeIsometricAngle(dir1, dir2, entity.isometricPlane)
      : computeScreenAngle(dir1, dir2);

    return (
      <>
        {renderReadOnlyRows([['Angle', formatAngleText(angleDeg)]])}
        {numericField('arcRadius', entity.arcRadius)}
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
        {numericField('offset', entity.offset)}
      </>
    );
  }

  return null;
}
