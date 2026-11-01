import { useState } from 'react';
import { uid } from './model.js';
import { ValueField, VectorFields } from './CadEditors.jsx';

export default function ConnectionEditor({ model, selectedId, onChange }) {
  const [type, setType] = useState('align');
  const update = (connection) => onChange(model.connections.map((c) => (c.id === connection.id ? connection : c)));
  const name = (i) => i.name || model.parts.find((p) => p.id === i.partId)?.name || i.id;
  const featureOptions = (id) =>
    model.parts
      .find((p) => p.id === model.instances.find((i) => i.id === id)?.partId)
      ?.features.filter((f) => ['hardware', 'cylinder', 'hole', 'member'].includes(f.type)) || [];
  return (
    <div>
      <label className="cad-field">
        New connection
        <select value={type} onChange={(e) => setType(e.target.value)}>
          {[
            ['align', 'Align world bounds'],
            ['face-offset', 'Face offset'],
            ['fixed', 'Fixed attachment'],
            ['concentric', 'Concentric axes'],
            ['weld', 'Weld location and note'],
          ].map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <button
        disabled={model.instances.length < 2}
        onClick={() => {
          const from = selectedId || model.instances[0].id,
            to = model.instances.find((i) => i.id !== from).id;
          const fields =
            type === 'weld'
              ? { location: [0, 0, 0], note: '' }
              : type === 'fixed'
                ? { offset: [0, 0, 0] }
                : type === 'concentric'
                  ? {
                      offset: 0,
                      fromFeatureId: featureOptions(from)[0]?.id || '',
                      toFeatureId: featureOptions(to)[0]?.id || '',
                    }
                  : { axis: 'Z', sourceSide: 'min', targetSide: 'max', offset: 0 };
          onChange([...model.connections, { id: uid('connection'), type, from, to, ...fields }]);
        }}
      >
        Add connection
      </button>
      {model.connections.map((c) => (
        <details key={c.id} open>
          <summary>
            {c.type} · {c.id.slice(-8)}
          </summary>
          {['from', 'to'].map((field) => (
            <label className="cad-field" key={field}>
              {field === 'from' ? 'Moving instance' : 'Target instance'}
              <select value={c[field]} onChange={(e) => update({ ...c, [field]: e.target.value })}>
                {model.instances.map((i) => (
                  <option value={i.id} key={i.id}>
                    {name(i)} · {i.id.slice(-6)}
                  </option>
                ))}
              </select>
            </label>
          ))}
          {c.type === 'concentric' &&
            ['from', 'to'].map((field) => (
              <label key={field} className="cad-field">
                {field} axis feature
                <select
                  value={c[field + 'FeatureId']}
                  onChange={(e) => update({ ...c, [field + 'FeatureId']: e.target.value })}
                >
                  <option value="">Choose a cylindrical feature…</option>
                  {featureOptions(c[field]).map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.type} · {f.id.slice(-8)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          {['align', 'face-offset'].includes(c.type) && (
            <>
              <label className="cad-field">
                Axis
                <select value={c.axis} onChange={(e) => update({ ...c, axis: e.target.value })}>
                  {['X', 'Y', 'Z'].map((axis) => (
                    <option key={axis}>{axis}</option>
                  ))}
                </select>
              </label>
              {['sourceSide', 'targetSide'].map((field) => (
                <label key={field} className="cad-field">
                  {field}
                  <select value={c[field]} onChange={(e) => update({ ...c, [field]: e.target.value })}>
                    <option value="min">Minimum face</option>
                    <option value="max">Maximum face</option>
                  </select>
                </label>
              ))}
            </>
          )}
          {c.type === 'fixed' ? (
            <VectorFields
              label="Local attachment offset"
              value={c.offset}
              onChange={(offset) => update({ ...c, offset })}
            />
          ) : (
            c.type !== 'weld' && (
              <ValueField
                key="offset"
                label="Offset (mm)"
                value={c.offset}
                onChange={(offset) => update({ ...c, offset })}
              />
            )
          )}
          {c.type === 'weld' && (
            <>
              <VectorFields
                label="Weld location (mm)"
                value={c.location || [0, 0, 0]}
                onChange={(location) => update({ ...c, location })}
              />
              <label className="cad-field">
                Weld note
                <textarea value={c.note} onChange={(e) => update({ ...c, note: e.target.value })} />
              </label>
            </>
          )}
          <button onClick={() => onChange(model.connections.filter((item) => item.id !== c.id))}>
            Remove connection
          </button>
        </details>
      ))}
    </div>
  );
}
