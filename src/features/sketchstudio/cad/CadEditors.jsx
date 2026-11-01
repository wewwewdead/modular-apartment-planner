import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { numeric, resolveParameters, uid, vector } from './model.js';
import { enableConstraints, addConstraint, CONSTRAINT_TYPES } from './constraints.js';
import { HardwareFields } from './HardwarePanel.jsx';
import { METRIC_THREADS, holePreset } from './hardware.js';
import { CUT_SIDES, cutWidthDirection } from './cutPlacement.js';
import { defaultPitch, flipRow, setRowLength } from './placementRows.js';
import ExpressionInput, { ParameterContext } from './ExpressionInput.jsx';
import { FieldSessionContext, LIVE_DEBOUNCE_MS, liveFieldValue, stepFieldValue } from './liveField.js';

// A Properties field (Phase L, docs/sketch-studio-live-fields.md §3). The
// value applies as you type, LIVE_DEBOUNCE_MS after the last keystroke,
// whenever the text is committable (liveFieldValue): onChange(next, { live:
// true, session }). Enter / Tab / click-away commit the text as before
// ({ live: false, session }), so text that cannot be parsed still reaches the
// consumer and its error shows. Esc puts back the value the field had when
// the edit began. Up / Down step a plain number by 1 (Shift: 10). While
// editing, the draft is never overwritten from props, so a live commit
// echoing back cannot move the caret or eat a trailing "."; the field keeps
// its identity (call sites key on the object, never on the value).
export function ValueField({ label, value, onChange, asText = false, live = true }) {
  const { values } = useContext(ParameterContext);
  const channel = useContext(FieldSessionContext);
  // The text being edited; null when not editing (the field shows the value).
  const [draft, setDraft] = useState(null);
  // Text that could not be committed, kept on screen after blur until the
  // value changes (its error refers to it): { text, value }.
  const [held, setHeld] = useState(null);
  // The edit session: { session, start, last, committed, dirty, reverting }.
  const edit = useRef(null);
  const timer = useRef(null);
  const latest = useRef(onChange);
  useLayoutEffect(() => {
    latest.current = onChange;
  });
  useEffect(() => () => clearTimeout(timer.current), []);
  const shown = draft ?? (held && Object.is(held.value, value) ? held.text : String(value ?? ''));
  const stopTimer = () => {
    clearTimeout(timer.current);
    timer.current = null;
  };
  const begin = () => {
    if (edit.current) return edit.current;
    edit.current = {
      session: uid('field'),
      start: value,
      last: value,
      committed: false,
      dirty: false,
      reverting: false,
    };
    setDraft(shown);
    setHeld(null);
    return edit.current;
  };
  const end = () => {
    stopTimer();
    edit.current = null;
    setDraft(null);
  };
  // onChange with the session published on the workspace channel for the
  // duration of the (synchronous) call.
  const send = (next, meta) => {
    if (channel) channel.current = meta;
    try {
      latest.current(next, meta);
    } finally {
      if (channel) channel.current = null;
    }
  };
  const sendLive = (next) => {
    const session = edit.current;
    if (!session) return;
    session.last = next;
    session.committed = true;
    try {
      send(next, { live: true, session: session.session });
    } catch {
      // A live value the consumer rejects waits for Enter / blur (spec §2.2).
    }
  };
  const schedule = (text) => {
    stopTimer();
    const session = edit.current;
    if (!live || !session) return;
    const next = liveFieldValue(text, { asText, values });
    if (next === undefined || String(next) === String(session.last ?? '')) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      sendLive(next);
    }, LIVE_DEBOUNCE_MS);
  };
  return (
    <label className="cad-field">
      <span>{label}</span>
      <ExpressionInput
        // An explicit name: the open suggestion list sits inside the label.
        aria-label={typeof label === 'string' ? label : undefined}
        value={shown}
        onFocus={begin}
        onChange={(text) => {
          begin().dirty = true;
          setDraft(text);
          setHeld(null);
          schedule(text);
        }}
        onBlur={() => {
          const session = edit.current;
          if (!session) return;
          const raw = draft ?? shown;
          end();
          if (session.reverting || !session.dirty) return;
          const text = raw.trim();
          if (text === String(value ?? '')) return;
          if (liveFieldValue(text, { asText, values }) === undefined) setHeld({ text: raw, value });
          send(!asText && text !== '' && Number.isFinite(Number(text)) ? Number(text) : text, {
            live: false,
            session: session.session,
          });
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          else if ((e.ctrlKey || e.metaKey) && ['z', 'y'].includes(e.key.toLowerCase())) {
            // The studio's Undo / Redo runs even in a field: drop the typing
            // (the field then shows the restored value) so a later keystroke
            // starts a new session instead of folding into an undone entry.
            if (edit.current) end();
          } else if (e.key === 'Escape') {
            const session = edit.current;
            // Nothing typed: Esc does its usual job (closes the tool, and so on).
            if (!session || (!session.dirty && !session.committed)) return;
            e.preventDefault();
            e.stopPropagation();
            stopTimer();
            session.reverting = true;
            if (session.committed) {
              try {
                send(session.start, { live: false, session: session.session, revert: true });
              } catch {
                // The value from before the edit; nothing to report.
              }
            }
            setHeld(null);
            e.currentTarget.blur();
            // Not focused (no blur event): close the session here.
            if (edit.current === session) end();
          } else if (
            (e.key === 'ArrowUp' || e.key === 'ArrowDown') &&
            !asText &&
            !e.altKey &&
            !e.ctrlKey &&
            !e.metaKey
          ) {
            // ExpressionInput keeps the arrows while its suggestion list is open.
            const next = stepFieldValue(shown, e.key === 'ArrowUp' ? 1 : -1, e.shiftKey ? 10 : 1);
            if (next == null) return;
            e.preventDefault();
            begin().dirty = true;
            stopTimer();
            setDraft(String(next));
            setHeld(null);
            if (live) sendLive(next);
          }
        }}
      />
    </label>
  );
}

export function JsonEditor({ value, onApply, label }) {
  const [text, setText] = useState(JSON.stringify(value, null, 2)),
    [error, setError] = useState('');
  return (
    <div className="cad-json-editor">
      <label>
        {label}
        <textarea aria-label={label} spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <button
        onClick={() => {
          try {
            onApply(JSON.parse(text));
            setError('');
          } catch (e) {
            setError(e.message);
          }
        }}
      >
        Apply changes
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

export function VectorFields({ label, value, onChange }) {
  return (
    <fieldset className="cad-vector-fields">
      <legend>{label}</legend>
      {value.map((component, index) => (
        <ValueField
          key={index}
          label={['X', 'Y', 'Z'][index]}
          value={component}
          onChange={(next, meta) =>
            onChange(
              value.map((v, i) => (i === index ? next : v)),
              meta,
            )
          }
        />
      ))}
    </fieldset>
  );
}

export function FeatureForm({
  feature,
  model,
  onChange,
  cutMetrics,
  onFocusCut,
  onMoveCut,
  cutBounds,
  referenceOptions = [],
  targetPartId,
  operationLabel = 'Operation',
}) {
  if (feature.type === 'hardware') return <HardwareFields feature={feature} onChange={onChange} />;
  if (['hole', 'pocket'].includes(feature.type))
    return (
      <CutFeatureForm
        feature={feature}
        model={model}
        onChange={onChange}
        metrics={cutMetrics}
        onFocus={onFocusCut}
        onMove={onMoveCut}
        bounds={cutBounds}
      />
    );
  const update = (key, value) => onChange({ ...feature, [key]: value });
  const fields = Object.entries(feature).filter(
    ([key]) =>
      !['id', 'type', 'suppressed'].includes(key) &&
      !(feature.type === 'pattern' && (feature.circular ? key === 'step' : ['angle', 'axis', 'origin'].includes(key))),
  );
  const labels = {
    length: 'Length (mm)',
    angle: 'Angle (degrees)',
    radius: feature.type === 'chamfer' ? 'Chamfer distance (mm)' : 'Radius (mm)',
    thickness: 'Shell offset (mm; signed)',
    count: 'Total copies',
    step: 'Spacing XYZ (mm)',
    origin: 'Origin (part mm)',
    position: 'Position (part mm)',
    rotation: 'Rotation (degrees)',
    axis: 'Axis direction',
    normal: 'Plane normal',
    ruled: 'Straight sides between sections',
    circular: 'Circular pattern',
    reverse: 'Flip direction (against the sketch normal)',
    throughAll: 'Through all (ignores length)',
  };
  return (
    <div className="cad-form">
      {fields.map(([key, value]) => {
        if (key === 'operation')
          return (
            <label className="cad-field" key={key}>
              {operationLabel}
              <select aria-label="Operation" value={value} onChange={(e) => update(key, e.target.value)}>
                {['add', 'cut', 'intersect', 'replace'].map((mode) => (
                  <option key={mode}>{mode}</option>
                ))}
              </select>
            </label>
          );
        if (
          ['start', 'end', 'position', 'origin', 'rotation', 'direction', 'normal', 'axis', 'step'].includes(key) &&
          Array.isArray(value) &&
          value.length === 3
        )
          return (
            <VectorFields key={key} label={labels[key] || key} value={value} onChange={(next) => update(key, next)} />
          );
        if (key === 'plane' || key === 'side')
          return (
            <label className="cad-field" key={key}>
              {key === 'plane' ? 'Mirror plane' : 'Retain side'}
              <select
                aria-label={key === 'plane' ? 'Mirror plane' : 'Retain side'}
                value={value}
                onChange={(e) => update(key, e.target.value)}
              >
                {(key === 'plane' ? ['XY', 'XZ', 'YZ'] : ['positive', 'negative']).map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
          );
        if (key === 'reference') {
          const kind = feature.type === 'shell' ? 'faces' : 'edges';
          const options = referenceOptions.filter((r) => r[kind] > 0);
          const selected = options.findIndex(
            (r) =>
              r.plane === value.plane &&
              Math.abs(r.offset - Number(value.offset)) < 1e-5 &&
              r[kind] === value.expectedCount,
          );
          return (
            <fieldset key={key}>
              <legend>{feature.type === 'shell' ? 'Faces to open' : 'Edges to modify'}</legend>
              <label className="cad-field">
                Geometry reference
                <select
                  aria-label="Geometry reference"
                  value={selected < 0 ? '' : String(selected)}
                  onChange={(e) => {
                    const r = options[Number(e.target.value)];
                    if (r) update(key, { plane: r.plane, offset: r.offset, expectedCount: r[kind] });
                  }}
                >
                  <option value="">Custom reference</option>
                  {options.map((r, i) => (
                    <option key={i} value={i}>
                      {r.label} · {r[kind]} {kind}
                    </option>
                  ))}
                </select>
              </label>
              {!options.length && (
                <p className="cad-help">
                  No axis-aligned boundary matches are available. Enter a custom plane and count below.
                </p>
              )}
              <details>
                <summary>Exact plane reference</summary>
                <label className="cad-field">
                  Reference plane
                  <select
                    aria-label="Reference plane"
                    value={value.plane || 'XY'}
                    onChange={(e) => update(key, { ...value, plane: e.target.value })}
                  >
                    {['XY', 'XZ', 'YZ'].map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </label>
                <ValueField
                  key="offset"
                  label="Plane offset (mm)"
                  value={value.offset}
                  onChange={(offset) => update(key, { ...value, offset })}
                />
                <ValueField
                  key="expected-count"
                  label={`Expected ${kind}`}
                  value={value.expectedCount}
                  onChange={(expectedCount) => update(key, { ...value, expectedCount })}
                />
              </details>
            </fieldset>
          );
        }
        if (key === 'sections')
          return (
            <fieldset key={key}>
              <legend>Following sections, in order</legend>
              {value.map((id, index) => (
                <div key={index}>
                  <select
                    aria-label={`Loft section ${index + 2}`}
                    value={id}
                    onChange={(e) =>
                      update(
                        key,
                        value.map((v, i) => (i === index ? e.target.value : v)),
                      )
                    }
                  >
                    <option value="">Choose section…</option>
                    {model.sketches
                      .filter((s) => s.id === id || (s.id !== feature.sketchId && !value.includes(s.id)))
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                  </select>
                  <div className="cad-inline">
                    <button
                      type="button"
                      disabled={!index}
                      onClick={() => {
                        const next = [...value];
                        [next[index - 1], next[index]] = [next[index], next[index - 1]];
                        update(key, next);
                      }}
                    >
                      Move up
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        update(
                          key,
                          value.filter((_, i) => i !== index),
                        )
                      }
                    >
                      Remove section
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  update(key, [
                    ...value,
                    model.sketches.find((s) => s.id !== feature.sketchId && !value.includes(s.id))?.id || '',
                  ])
                }
              >
                Add section
              </button>
            </fieldset>
          );
        if (key === 'section')
          return (
            <fieldset key={key} className="cad-section-fields">
              <legend>Stock section (mm)</legend>
              <label className="cad-field">
                Type
                <select
                  value={value.type}
                  onChange={(e) => {
                    const type = e.target.value;
                    update(
                      key,
                      ['pipe', 'round-bar'].includes(type)
                        ? {
                            type,
                            diameter: value.diameter || 40,
                            ...(type === 'pipe' ? { wall: value.wall || 2 } : {}),
                          }
                        : {
                            type,
                            width: value.width || 40,
                            height: value.height || 40,
                            ...(type !== 'bar' ? { wall: value.wall || 2 } : {}),
                          },
                    );
                  }}
                >
                  {[
                    ['tube', 'Square / rectangular tube'],
                    ['pipe', 'Round pipe / tube'],
                    ['bar', 'Solid rectangular bar'],
                    ['round-bar', 'Solid round bar'],
                    ['angle', 'Angle'],
                  ].map(([type, label]) => (
                    <option key={type} value={type}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              {Object.entries(value)
                .filter(([field]) => field !== 'type')
                .map(([field, amount]) => (
                  <ValueField
                    key={field}
                    label={field === 'diameter' ? 'Outside diameter' : field === 'wall' ? 'Wall thickness' : field}
                    value={amount}
                    onChange={(next) => update(key, { ...value, [field]: next })}
                  />
                ))}
            </fieldset>
          );
        if (key === 'sketchId' || key === 'profileId' || key === 'toolPartId')
          return (
            <label className="cad-field" key={key}>
              <span>
                {key === 'toolPartId'
                  ? 'Tool part'
                  : key === 'profileId'
                    ? 'Cross section'
                    : feature.type === 'sweep'
                      ? 'Path sketch'
                      : 'Profile sketch'}
              </span>
              <select
                aria-label={
                  key === 'toolPartId'
                    ? 'Tool part'
                    : key === 'profileId'
                      ? 'Cross section'
                      : feature.type === 'sweep'
                        ? 'Path sketch'
                        : 'Profile sketch'
                }
                value={value}
                onChange={(e) => update(key, e.target.value)}
              >
                <option value="">Choose…</option>
                {(key === 'toolPartId' ? model.parts.filter((p) => p.id !== targetPartId) : model.sketches).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          );
        if (typeof value === 'boolean')
          return (
            <label key={key}>
              <input type="checkbox" checked={value} onChange={(e) => update(key, e.target.checked)} />{' '}
              {labels[key] || key}
            </label>
          );
        if (Array.isArray(value) || (value && typeof value === 'object'))
          return (
            <details key={key} open={['section', 'position', 'start', 'end', 'reference'].includes(key)}>
              <summary>{key}</summary>
              <JsonEditor
                key={JSON.stringify(value)}
                value={value}
                label={`${key} values`}
                onApply={(v) => update(key, v)}
              />
            </details>
          );
        return <ValueField key={key} label={labels[key] || key} value={value} onChange={(v) => update(key, v)} />;
      })}
    </div>
  );
}

// Who can carry a member placement: the enabled members before this cut.
function cutMembers(model, feature) {
  const part = model.parts.find((p) => p.features.some((f) => f.id === feature.id));
  return (
    part?.features
      .slice(
        0,
        part.features.findIndex((f) => f.id === feature.id),
      )
      .filter((f) => f.type === 'member' && !f.suppressed) || []
  );
}

// A cut's size and extent: hole purpose / thread, pocket profile, diameter
// or width × length, extent and depth. `middle` sits after the thread fields
// (the tree editor's lock, Move hole and result lines).
export function CutSizeFields({ feature, model, onChange, middle = null }) {
  const update = (key, value) => onChange({ ...feature, [key]: value });
  const members = cutMembers(model, feature);
  const sketchPocket = feature.type === 'pocket' && feature.shape !== 'rectangle';
  return (
    <>
      {feature.type === 'hole' && (
        <>
          <label className="cad-field">
            Hole purpose
            <select
              value={feature.holeSpec?.mode || 'plain'}
              onChange={(e) => onChange(holePreset(feature, e.target.value, feature.holeSpec?.size || 'M3'))}
            >
              <option value="plain">Plain diameter</option>
              <option value="tap">Tapped hole — cutting-tap drill</option>
              <option value="clearance">Screw clearance — editable allowance</option>
            </select>
          </label>
          {feature.holeSpec && (
            <label className="cad-field">
              Thread size
              <select
                value={feature.holeSpec.size}
                onChange={(e) => onChange(holePreset(feature, feature.holeSpec.mode, e.target.value))}
              >
                {Object.entries(METRIC_THREADS).map(([size, t]) => (
                  <option key={size} value={size}>
                    {size} × {t.pitch}
                  </option>
                ))}
              </select>
            </label>
          )}
          {feature.holeSpec?.mode === 'tap' && (
            <p className="cad-help">
              Cutting-tap pilot bore; thread callout is included in drawings. Helical threads are not modeled. Confirm
              drill and usable thread depth for the material and tap.
            </p>
          )}
        </>
      )}
      {middle}
      {feature.type === 'pocket' && (
        <label className="cad-field">
          Pocket profile
          <select
            aria-label="Pocket profile"
            value={sketchPocket ? 'sketch' : 'rectangle'}
            onChange={(e) => {
              if (e.target.value === 'sketch')
                onChange({
                  id: feature.id,
                  type: 'pocket',
                  sketchId: model.sketches[0]?.id || '',
                  depth: feature.depth,
                });
              else
                onChange({
                  id: feature.id,
                  type: 'pocket',
                  shape: 'rectangle',
                  width: 12,
                  height: 20,
                  depth: feature.depth,
                  throughAll: false,
                  placement: members.length
                    ? { type: 'member', featureId: members[0].id, side: 'front', along: 50, offset: 0 }
                    : { type: 'side', side: 'top', u: 50, v: 50 },
                });
            }}
          >
            <option value="rectangle">Rectangle — no sketch required</option>
            <option value="sketch" disabled={!model.sketches.length}>
              Existing closed sketch{!model.sketches.length ? ' — create a sketch first' : ''}
            </option>
          </select>
        </label>
      )}
      {feature.type === 'hole' ? (
        <ValueField
          key="diameter"
          label="Diameter (mm)"
          value={feature.diameter}
          onChange={(v) => onChange({ ...feature, diameter: v })}
        />
      ) : !sketchPocket ? (
        <>
          <ValueField
            key="width"
            label="Pocket width (mm)"
            value={feature.width}
            onChange={(v) => update('width', v)}
          />
          <ValueField
            key="height"
            label="Pocket length (mm)"
            value={feature.height}
            onChange={(v) => update('height', v)}
          />
        </>
      ) : (
        <label className="cad-field">
          Closed sketch
          <select
            aria-label="Closed sketch"
            value={feature.sketchId || ''}
            onChange={(e) => update('sketchId', e.target.value)}
          >
            <option value="">Choose a sketch…</option>
            {model.sketches.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <span className="cad-help">
            The sketch’s plane and origin place this cut. It extrudes along that plane’s normal.
          </span>
        </label>
      )}
      {!sketchPocket && (
        <label className="cad-field">
          Cut extent
          <select
            aria-label="Cut extent"
            value={feature.throughAll ? 'through' : 'blind'}
            onChange={(e) => update('throughAll', e.target.value === 'through')}
          >
            <option value="through">Through all — both tube walls</option>
            <option value="blind">Specified depth from surface</option>
          </select>
        </label>
      )}
      {(!feature.throughAll || sketchPocket) && (
        <ValueField key="depth" label="Depth (mm)" value={feature.depth} onChange={(v) => update('depth', v)} />
      )}
    </>
  );
}

// Where a cut is: the Hole / pocket location fieldset (member, part side or
// exact part coordinates). Nothing for a sketch pocket (its sketch places it).
export function CutLocationFields({ feature, model, onChange, metrics, bounds }) {
  const update = (key, value) => onChange({ ...feature, [key]: value });
  const placement = feature.placement;
  const members = cutMembers(model, feature);
  const setPlacement = (key, value) => update('placement', { ...placement, [key]: value });
  const sketchPocket = feature.type === 'pocket' && feature.shape !== 'rectangle';
  return (
    <>
      {!sketchPocket && (
        <fieldset className="cad-section-fields" disabled={Boolean(feature.positionLocked)}>
          <legend>Hole / pocket location</legend>
          <label className="cad-field">
            Cut placement
            <select
              aria-label="Cut placement"
              value={placement?.type || 'coordinates'}
              onChange={(e) => {
                const type = e.target.value;
                onChange({
                  ...feature,
                  placement:
                    type === 'coordinates'
                      ? undefined
                      : type === 'member'
                        ? { type, featureId: members[0]?.id, side: 'front', along: 50, offset: 0 }
                        : { type, side: 'top', u: 50, v: 50 },
                  position: metrics?.cut?.position || feature.position || [0, 0, 0],
                  direction: metrics?.cut?.direction || feature.direction || [0, 0, 1],
                });
              }}
            >
              <option value="member" disabled={!members.length}>
                On tube / member
              </option>
              <option value="side">Part side</option>
              <option value="coordinates">Exact part coordinates</option>
            </select>
          </label>
          {placement && (
            <>
              {placement.type === 'member' && members.length > 1 && (
                <label className="cad-field">
                  Member feature
                  <select
                    aria-label="Member feature"
                    value={placement.featureId}
                    onChange={(e) => setPlacement('featureId', e.target.value)}
                  >
                    {members.map((m, i) => (
                      <option key={m.id} value={m.id}>
                        Member {i + 1}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="cad-field">
                Cut side
                <select
                  aria-label="Cut side"
                  value={placement.side}
                  onChange={(e) => setPlacement('side', e.target.value)}
                >
                  {(placement.type === 'member'
                    ? ['front', 'rear', 'left', 'right']
                    : ['top', 'bottom', 'front', 'rear', 'left', 'right']
                  ).map((s) => (
                    <option key={s} value={s}>
                      {s[0].toUpperCase() + s.slice(1)}
                    </option>
                  ))}
                </select>
              </label>
              {placement.type === 'member' ? (
                <>
                  <label className="cad-field">
                    Position along member
                    <select
                      aria-label="Position along member"
                      value={placement.distance == null ? 'percent' : 'distance'}
                      onChange={(e) =>
                        update('placement', {
                          ...placement,
                          along: 50,
                          distance: e.target.value === 'distance' ? 50 : undefined,
                        })
                      }
                    >
                      <option value="percent">Percentage of finished length</option>
                      <option value="distance">Distance from finished start</option>
                    </select>
                  </label>
                  {placement.distance == null ? (
                    <ValueField
                      key="along"
                      label="Along member (%)"
                      value={placement.along}
                      onChange={(v) => setPlacement('along', v)}
                    />
                  ) : (
                    <ValueField
                      key="distance"
                      label="From finished start (mm)"
                      value={placement.distance}
                      onChange={(v) => setPlacement('distance', v)}
                    />
                  )}
                  <ValueField
                    key="offset"
                    label="Across side offset (mm)"
                    value={placement.offset}
                    onChange={(v) => setPlacement('offset', v)}
                  />
                </>
              ) : (
                <>
                  <label className="cad-field">
                    Locate by
                    <select
                      value={placement.units || 'percent'}
                      onChange={(e) => {
                        const units = e.target.value;
                        const axes = [0, 1, 2].filter((a) => a !== CUT_SIDES[placement.side].axis);
                        const coords = axes.map((a) =>
                          metrics?.cut && bounds ? metrics.cut.position[a] - bounds[0][a] : 0,
                        );
                        const values = coords.map((v, i) =>
                          units === 'mm'
                            ? +v.toFixed(4)
                            : bounds
                              ? +((v / (bounds[1][axes[i]] - bounds[0][axes[i]])) * 100).toFixed(4)
                              : 50,
                        );
                        update('placement', { ...placement, units, u: values[0], v: values[1] });
                      }}
                    >
                      <option value="percent">Relative position (%)</option>
                      <option value="mm">Fixed distance from edges (mm)</option>
                    </select>
                  </label>
                  <ValueField
                    key="u"
                    label={
                      placement.units === 'mm'
                        ? `From minimum ${['X', 'Y', 'Z'].filter((_, i) => i !== CUT_SIDES[placement.side].axis)[0]} edge (mm)`
                        : 'First face axis (%)'
                    }
                    value={placement.u}
                    onChange={(v) => setPlacement('u', v)}
                  />
                  <ValueField
                    key="v"
                    label={
                      placement.units === 'mm'
                        ? `From minimum ${['X', 'Y', 'Z'].filter((_, i) => i !== CUT_SIDES[placement.side].axis)[1]} edge (mm)`
                        : 'Second face axis (%)'
                    }
                    value={placement.v}
                    onChange={(v) => setPlacement('v', v)}
                  />
                  <p className="cad-help">
                    Distances start at the smaller coordinate edge. Fixed millimetre offsets stay constant when the part
                    grows; percentages follow its size.
                  </p>
                </>
              )}
            </>
          )}
          {!placement && (
            <>
              <VectorFields
                label="Cut start (part mm)"
                value={feature.position || [0, 0, 0]}
                onChange={(v) => update('position', v)}
              />
              <VectorFields
                label="Cut direction (into material)"
                value={feature.direction || [0, 0, 1]}
                onChange={(v) => update('direction', v)}
              />
            </>
          )}
        </fieldset>
      )}
    </>
  );
}

// A hole row (Phase K, docs/sketch-studio-hole-row.md §6): count, spacing,
// row length and direction, shared by the operation panel (minCount 2) and
// the tree editor (minCount 1: typing 1 removes the row; 2 or more on a
// single hole makes a row from it). `seed`: the operation panel's direction
// stage, where only the count is set ({ count }, changed by onSeedCount).
// `directionText`: the engraved direction ("+X of face · 0°" / "at 30°").
// Live values (Phase L, docs/sketch-studio-live-fields.md §4): a count or
// spacing that is out of range is ignored silently while typing and reported
// on Enter / blur; count 1 removes the row only on Enter / blur, so typing 1
// on the way to 12 keeps it.
export function RowFields({
  feature,
  model,
  onChange,
  minCount = 2,
  metrics = null,
  seed = null,
  onSeedCount = null,
  directionText = '',
}) {
  const [error, setError] = useState('');
  let parameters = {};
  try {
    parameters = resolveParameters(model?.parameters || []);
  } catch {
    parameters = {};
  }
  const value = (v, fallback = null) => {
    try {
      return numeric(v, parameters);
    } catch {
      return fallback;
    }
  };
  const guard = (action) => (input, meta) => {
    try {
      action(input, meta);
      setError('');
    } catch (e) {
      if (!meta?.live) setError(e.message);
    }
  };
  const row = feature.row || null;
  const count = seed ? seed.count : row ? row.count : 1;
  const setCount = guard((input, meta) => {
    const n = numeric(input, parameters, 'Holes in a row');
    if (!Number.isInteger(n) || n < minCount || n > 100)
      throw new Error(`Holes in a row must be a whole number from ${minCount} to 100.`);
    if (seed) return onSeedCount(input);
    if (input === 1) {
      // Structural: removing the row waits for the commit.
      if (meta?.live) return;
      const { row: _row, ...single } = feature;
      return onChange(single);
    }
    if (row) return onChange({ ...feature, row: { ...row, count: input } });
    let direction;
    if (metrics?.cut?.widthDirection) direction = metrics.cut.widthDirection.map((v) => +v.toFixed(9) || 0);
    else {
      const d = vector(feature.direction || [0, 0, 1], parameters);
      const l = Math.hypot(...d);
      direction = cutWidthDirection(d.map((v) => v / l)).map((v) => +v.toFixed(9) || 0);
    }
    onChange({ ...feature, row: { count: input, pitch: defaultPitch(value(feature.diameter, 6)), direction } });
  });
  const pitch = row ? value(row.pitch) : null;
  const n = value(count);
  const length = pitch != null && n > 1 ? +(pitch * (n - 1)).toFixed(4) : null;
  const diameter = value(feature.diameter);
  return (
    <>
      <ValueField key="row-count" label="Holes in row" value={count} onChange={setCount} />
      {!row && !seed && <p className="cad-help">2 or more makes a straight row from this hole.</p>}
      {seed && <p className="cad-help">Click where the last hole goes; ↑ ↓ also change the count.</p>}
      {row && (
        <>
          <ValueField
            key="row-pitch"
            label="Spacing (mm)"
            value={row.pitch}
            onChange={guard((input) => {
              numeric(input, parameters, 'Row spacing');
              if (!(numeric(input, parameters, 'Row spacing') > 0))
                throw new Error('Row spacing must be greater than zero.');
              onChange({ ...feature, row: { ...row, pitch: input } });
            })}
          />
          {length != null && (
            <ValueField
              key="row-length"
              label="Row length (mm)"
              value={length}
              onChange={guard((input) => onChange(setRowLength(feature, input, parameters)))}
            />
          )}
          <div className="cad-field cad-row-direction">
            <span>Direction</span>
            {/* A plain span: an <output> is a status, and the panels keep one status line. */}
            <span aria-label="Row direction">{directionText || 'in the face of the first hole'}</span>
          </div>
          <button type="button" onClick={guard(() => onChange(flipRow(feature, parameters)))}>
            Flip direction
          </button>
          {pitch != null && diameter != null && pitch < diameter && (
            <p className="cad-help" role="note">
              Spacing {+pitch.toFixed(2)} mm is less than the hole diameter {+diameter.toFixed(2)} mm: the holes overlap
              into a slot.
            </p>
          )}
        </>
      )}
      {error && (
        <p className="cad-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

function CutFeatureForm({ feature, model, onChange, metrics, onFocus, onMove, bounds }) {
  const update = (key, value) => onChange({ ...feature, [key]: value });
  return (
    <div className="cad-form">
      <CutSizeFields
        feature={feature}
        model={model}
        onChange={onChange}
        middle={
          <>
            {feature.type === 'hole' && (
              <>
                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(feature.positionLocked)}
                    onChange={(e) => update('positionLocked', e.target.checked)}
                  />{' '}
                  Lock hole position
                </label>
                {onMove && (
                  <button disabled={feature.positionLocked || feature.suppressed} onClick={onMove}>
                    Move hole on surface
                  </button>
                )}
                {/* Phase K: a straight row of identical holes from this one. */}
                <fieldset className="cad-row-fields">
                  <legend>Row of holes</legend>
                  <RowFields feature={feature} model={model} onChange={onChange} minCount={1} metrics={metrics} />
                </fieldset>
              </>
            )}
            {metrics?.removedVolume > 0 && (
              <>
                <p className="cad-help" role="status">
                  Cut applied · {metrics.removedVolume.toFixed(2)} mm³ removed.
                </p>
                {metrics.cut && onFocus && (
                  <button className="cad-primary cad-wide" onClick={onFocus}>
                    View cut close up
                  </button>
                )}
              </>
            )}
            <p className="cad-help">
              Cuts edit the part definition and all its instances. Tube sides follow the member’s own axes, even after
              moving or rotating the assembly.
            </p>
          </>
        }
      />
      <CutLocationFields feature={feature} model={model} onChange={onChange} metrics={metrics} bounds={bounds} />
      <p className="cad-help">
        Zoom in to see small cuts. Specified depth makes a recess; through all also cuts the opposite tube wall.
      </p>
    </div>
  );
}

export function SketchForm({ onCreate }) {
  const [type, setType] = useState('rectangle'),
    [width, setWidth] = useState('100'),
    [height, setHeight] = useState('80'),
    [radius, setRadius] = useState('25'),
    [points, setPoints] = useState([]);
  const [plane, setPlane] = useState('XY'),
    [grid, setGrid] = useState(10);
  const create = () => {
    const profile =
      type === 'rectangle'
        ? { type, width, height, origin: [0, 0] }
        : type === 'circle'
          ? { type, radius, center: [0, 0] }
          : { type: 'polygon', points };
    onCreate({ id: uid('sketch'), name: `${type} sketch`, plane, profile, primitives: [], constrained: false });
  };
  return (
    <div className="cad-form">
      <label className="cad-field">
        Profile
        <select aria-label="Profile" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="rectangle">Rectangle</option>
          <option value="circle">Circle</option>
          <option value="polygon">Closed polyline</option>
        </select>
      </label>
      <label className="cad-field">
        Plane
        <select value={plane} onChange={(e) => setPlane(e.target.value)}>
          {['XY', 'XZ', 'YZ'].map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </label>
      {type === 'rectangle' && (
        <>
          <ValueField label="Width (mm / expression)" value={width} onChange={setWidth} />
          <ValueField label="Height (mm / expression)" value={height} onChange={setHeight} />
        </>
      )}
      {type === 'circle' && <ValueField label="Radius (mm / expression)" value={radius} onChange={setRadius} />}
      {type === 'polygon' && (
        <>
          <label className="cad-field">
            Snap (mm)
            <input
              type="number"
              min="0.1"
              value={grid}
              onChange={(e) => setGrid(Math.max(0.1, Number(e.target.value)))}
            />
          </label>
          <svg
            className="cad-sketch-pad"
            viewBox="0 0 300 200"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setPoints([
                ...points,
                [
                  Math.round(((e.clientX - rect.left) * 300) / rect.width / grid) * grid,
                  Math.round(((e.clientY - rect.top) * 200) / rect.height / grid) * grid,
                ],
              ]);
            }}
          >
            <defs>
              <pattern id="cad-sketch-grid" width={grid} height={grid} patternUnits="userSpaceOnUse">
                <path d={`M${grid} 0H0V${grid}`} fill="none" stroke="#d4dce4" strokeWidth="0.3" />
              </pattern>
            </defs>
            <rect width="300" height="200" fill="url(#cad-sketch-grid)" />
            <polyline points={points.map((p) => p.join(',')).join(' ')} fill="none" stroke="#216d9d" />
            {points.map((p, i) => (
              <circle key={i} cx={p[0]} cy={p[1]} r="2" fill="#216d9d" />
            ))}
          </svg>
          <button onClick={() => setPoints(points.slice(0, -1))}>Undo point</button>
          <JsonEditor key={JSON.stringify(points)} label="Exact points (mm)" value={points} onApply={setPoints} />
        </>
      )}
      <button className="cad-primary" disabled={type === 'polygon' && points.length < 3} onClick={create}>
        Create sketch
      </button>
      <p className="cad-help">
        Values accept named parameters, for example =width / 2. Edit a sketch’s profile for arcs, Bézier splines,
        offsets and holes. Constraint primitives are optional.
      </p>
    </div>
  );
}

export function ConstraintEditor({ sketch, parameters, onChange }) {
  const [type, setType] = useState('horizontal'),
    [refs, setRefs] = useState({}),
    [value, setValue] = useState(100),
    [error, setError] = useState('');
  const spec = CONSTRAINT_TYPES[type];
  const perform = (fn) => {
    try {
      onChange(fn());
      setError('');
    } catch (e) {
      setError(e.message);
    }
  };
  return (
    <details open>
      <summary>Optional sketch constraints</summary>
      {!sketch.constrained ? (
        <button onClick={() => perform(() => enableConstraints(sketch, parameters))}>
          Enable PlaneGCS constraints
        </button>
      ) : (
        <>
          <label className="cad-field">
            Constraint
            <select
              aria-label="Constraint"
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setRefs({});
              }}
            >
              {Object.keys(CONSTRAINT_TYPES).map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
          {spec.fields.map(([field, geometry]) => (
            <label key={field} className="cad-field">
              {field}
              <select
                aria-label={field}
                value={refs[field] || ''}
                onChange={(e) => setRefs({ ...refs, [field]: e.target.value })}
              >
                <option value="">Choose {geometry}…</option>
                {sketch.primitives
                  .filter((p) => p.type === geometry)
                  .map((p, index) => (
                    <option key={p.id} value={p.id}>
                      {geometry} {index + 1} · {p.id.slice(-8)}
                    </option>
                  ))}
              </select>
            </label>
          ))}
          {spec.value && (
            <ValueField
              key={type}
              label={`${spec.value} (${type === 'angle' ? 'degrees' : 'mm'})`}
              value={value}
              onChange={setValue}
            />
          )}
          <button onClick={() => perform(() => addConstraint(sketch, type, refs, value))}>Add constraint</button>
          <button onClick={() => onChange({ ...sketch, constrained: false })}>Disable solving</button>
          <p className="cad-help">
            Point and line numbers follow the profile order. Conflicts retain the last valid model. Remove conflicting
            entries in the sketch definition below.
          </p>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
