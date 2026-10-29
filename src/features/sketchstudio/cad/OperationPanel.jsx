import { FeatureForm, ValueField, VectorFields, JsonEditor } from './CadEditors.jsx';
import { clone, uid } from './model.js';
import { OPERATION_HELP, PROFILE_OPERATIONS } from './operations.js';

export default function OperationPanel({
  draft,
  model,
  preview,
  problem,
  stale,
  showPreview,
  onShowPreview,
  onChange,
  onApply,
  onCancel,
  onFit,
}) {
  const f = draft.feature;
  const updateFeature = (feature) => onChange({ ...draft, feature });
  const changeSketch = (s) => {
    if (!s.profile || !['rectangle', 'circle', 'polygon', 'path'].includes(s.profile.type))
      throw new Error('Choose a valid profile type.');
    onChange({ ...draft, sketches: [...draft.sketches.filter((item) => item.id !== s.id), s] });
  };
  const referenceSketch = (id, slot) =>
    slot === 'sections' ? { ...f, sections: [...f.sections, id] } : { ...f, [slot]: id };
  const addProfile = (type, slot = 'sketchId') => {
    const index = draft.sketches.length + 1;
    const s = {
      id: uid('sketch'),
      name: `${type} ${index}`,
      plane: 'XY',
      origin: [0, 0, slot === 'sections' ? 100 * (f.sections.length + 1) : 0],
      primitives: [],
      constrained: false,
      profile:
        type === 'circle'
          ? { type, radius: 20, center: [0, 0] }
          : type === 'path'
            ? { type, start: [0, 0], segments: [{ type: 'line', end: [100, 0] }], closed: false }
            : { type: 'rectangle', width: 40, height: 40, origin: [0, 0] },
    };
    onChange({ ...draft, sketches: [...draft.sketches, s], feature: referenceSketch(s.id, slot) });
  };
  const ids = [...new Set([f.sketchId, f.profileId, ...(f.sections || [])].filter(Boolean))];
  return (
    <div className="cad-operation-panel">
      <h3>
        {draft.editing ? 'Edit' : 'Configure'} {f.type}
      </h3>
      <p className="cad-help">{OPERATION_HELP[f.type]}</p>
      <p className="cad-help">Changes are a preview until you Apply. Cancel keeps the saved model unchanged.</p>
      <div className="cad-operation-actions">
        <button className="cad-primary" disabled={stale || Boolean(problem) || !preview.ready} onClick={onApply}>
          Apply {f.type}
        </button>
        <button onClick={onCancel}>Cancel operation</button>
      </div>
      <p role="status">
        {stale
          ? 'The saved model changed. Cancel and reopen this operation.'
          : problem || (preview.ready ? 'Preview ready' : preview.error ? 'Preview failed' : 'Building preview…')}
      </p>
      {!stale && preview.error && !problem && (
        <p className="cad-error" role="alert">
          {preview.error.message}
        </p>
      )}
      {preview.ready && (
        <div className="cad-inline">
          <label>
            <input type="checkbox" checked={showPreview} onChange={(e) => onShowPreview(e.target.checked)} /> Show
            preview
          </label>
          <button onClick={onFit}>Fit preview</button>
        </div>
      )}
      {!problem && preview.error && <button onClick={preview.retry}>Retry preview</button>}
      <FeatureForm
        feature={f}
        model={model}
        targetPartId={draft.partId}
        referenceOptions={draft.references}
        onChange={updateFeature}
      />
      {PROFILE_OPERATIONS.includes(f.type) && (
        <>
          <h4>Profiles for this operation</h4>
          <div className="cad-inline">
            {f.type === 'sweep' && <button onClick={() => addProfile('path')}>New straight path</button>}
            <button onClick={() => addProfile('rectangle', f.type === 'sweep' ? 'profileId' : 'sketchId')}>
              New rectangle profile
            </button>
            <button onClick={() => addProfile('circle', f.type === 'sweep' ? 'profileId' : 'sketchId')}>
              New circle profile
            </button>
            {f.type === 'loft' && <button onClick={() => addProfile('circle', 'sections')}>New loft section</button>}
          </div>
          {ids.map((id) => {
            const s = model.sketches.find((s) => s.id === id);
            if (!s) return null;
            const editable = draft.sketches.some((s) => s.id === id);
            const profile = s.profile;
            const updateProfile = (key, value) => changeSketch({ ...s, profile: { ...profile, [key]: value } });
            return (
              <details key={id} open={editable}>
                <summary>{s.name}</summary>
                {!editable ? (
                  <button
                    onClick={() => {
                      const copy = {
                        ...clone(s),
                        id: uid('sketch'),
                        name: `${s.name} copy`,
                        constrained: false,
                        primitives: [],
                      };
                      onChange({
                        ...draft,
                        sketches: [...draft.sketches, copy],
                        feature: {
                          ...f,
                          ...(f.sketchId === id ? { sketchId: copy.id } : {}),
                          ...(f.profileId === id ? { profileId: copy.id } : {}),
                          ...(f.sections
                            ? { sections: f.sections.map((value) => (value === id ? copy.id : value)) }
                            : {}),
                        },
                      });
                    }}
                  >
                    Copy as unconstrained profile to edit
                  </button>
                ) : (
                  <>
                    <label className="cad-field">
                      Sketch plane
                      <select
                        aria-label={`${s.name} plane`}
                        value={s.normal ? 'custom' : s.plane || 'XY'}
                        onChange={(e) =>
                          changeSketch({ ...s, plane: e.target.value, normal: undefined, xDirection: undefined })
                        }
                      >
                        {s.normal && <option value="custom">Member section plane</option>}
                        {['XY', 'XZ', 'YZ'].map((plane) => (
                          <option key={plane}>{plane}</option>
                        ))}
                      </select>
                    </label>
                    <VectorFields
                      label={`${s.name} origin (mm)`}
                      value={s.origin || [0, 0, 0]}
                      onChange={(origin) => changeSketch({ ...s, origin })}
                    />
                    {s.normal && (
                      <details>
                        <summary>Section orientation</summary>
                        <VectorFields
                          label="Sketch normal"
                          value={s.normal}
                          onChange={(normal) => changeSketch({ ...s, normal })}
                        />
                        <VectorFields
                          label="Sketch horizontal direction"
                          value={s.xDirection || [1, 0, 0]}
                          onChange={(xDirection) => changeSketch({ ...s, xDirection })}
                        />
                      </details>
                    )}
                    {profile.holes?.length > 0 && (
                      <p className="cad-help">
                        This profile includes {profile.holes.length} inner opening(s), preserving the hollow section.
                        Edit openings in Advanced profile if needed.
                      </p>
                    )}
                    {['width', 'height', 'radius']
                      .filter((key) => key in profile)
                      .map((key) => (
                        <ValueField
                          key={`${key}-${profile[key]}`}
                          label={`${s.name} ${key} (mm)`}
                          value={profile[key]}
                          onChange={(value) => updateProfile(key, value)}
                        />
                      ))}
                    {['origin', 'center', 'start']
                      .filter((key) => Array.isArray(profile[key]))
                      .map((key) => (
                        <fieldset key={key}>
                          <legend>Profile {key} (2D mm)</legend>
                          {profile[key].map((value, index) => (
                            <ValueField
                              key={`${index}-${value}`}
                              label={`${key} ${['X', 'Y'][index]}`}
                              value={value}
                              onChange={(next) =>
                                updateProfile(
                                  key,
                                  profile[key].map((v, i) => (i === index ? next : v)),
                                )
                              }
                            />
                          ))}
                        </fieldset>
                      ))}
                    {profile.type === 'path' &&
                      profile.segments?.length === 1 &&
                      profile.segments[0].type === 'line' && (
                        <fieldset>
                          <legend>Path end (2D mm)</legend>
                          {profile.segments[0].end.map((value, index) => (
                            <ValueField
                              key={`${index}-${value}`}
                              label={`End ${['X', 'Y'][index]}`}
                              value={value}
                              onChange={(next) =>
                                updateProfile('segments', [
                                  {
                                    type: 'line',
                                    end: profile.segments[0].end.map((v, i) => (i === index ? next : v)),
                                  },
                                ])
                              }
                            />
                          ))}
                        </fieldset>
                      )}
                    <details>
                      <summary>Advanced profile</summary>
                      <JsonEditor
                        key={JSON.stringify(profile)}
                        label={`${s.name} profile data`}
                        value={profile}
                        onApply={(profile) => changeSketch({ ...s, profile })}
                      />
                    </details>
                  </>
                )}
              </details>
            );
          })}
        </>
      )}
    </div>
  );
}
