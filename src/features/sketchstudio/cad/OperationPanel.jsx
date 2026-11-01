import {
  CutLocationFields,
  CutSizeFields,
  FeatureForm,
  RowFields,
  ValueField,
  VectorFields,
  JsonEditor,
} from './CadEditors.jsx';
import { clone, uid } from './model.js';
import { OPERATION_HELP, PROFILE_OPERATIONS } from './operations.js';
import { bendRadiusOf, placedSketch, stopInference } from './placementTool.js';
import { CUT_TOOLS, cutFeatureChange } from './placementCuts.js';
import { setHardwareOffset } from './placementHardware.js';
import { HardwareFields } from './HardwarePanel.jsx';

const sketchPocket = (feature) => feature.type === 'pocket' && feature.shape !== 'rectangle';
// A size typed into a draft-only placement field: a positive number.
const sizeValue = (value, label, allowZero = false) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || (!allowZero && number === 0))
    throw new Error(`${label} must be a ${allowZero ? 'non-negative' : 'positive'} number of millimetres.`);
  return number;
};

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
  // Direct placement (placementTool.js): the placement line and its actions.
  placementText = '',
  onReplace,
  onFinishPlacement,
  onSweepOptions,
  onChangeAxis,
  // Hole / Pocket (Phase J): commit and reopen the tool with the same sizes.
  onApplyAgain,
  // A hole row (Phase K): the engraved row direction ("+X of face · 0°").
  rowDirection = '',
  // Hardware in chosen holes (Phase M): the Chosen holes rows ({ key, label,
  // removeLabel }) and their Remove.
  chosenHoles = [],
  onRemoveHole = () => {},
  onError = () => {},
}) {
  const p = draft.placement;
  const f = draft.feature || { type: p?.tool || 'extrude', sections: [] };
  // Choosing an Operation by hand stops the drag-direction inference.
  const updateFeature = (feature) => {
    const next = { ...draft, feature };
    onChange(feature.operation !== draft.feature?.operation ? stopInference(next) : next);
  };
  // A live value (Phase L) that fails validation waits silently for Enter / blur.
  const guarded = (action) => (value, meta) => {
    try {
      action(value);
    } catch (e) {
      if (!meta?.live) onError(e.message);
    }
  };
  const placed = placedSketch(draft);
  const inferring = Boolean(p?.inferOperation && draft.feature && !draft.newPart);
  const hostName = draft.newPart
    ? draft.newPart.name
    : model.parts.find((part) => part.id === draft.partId)?.name || 'this part';
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
  // Hole / Pocket: sizes first, the location fieldset under Exact placement,
  // both read against the preview (the resolved cut, the solid before it).
  const cutTool = CUT_TOOLS.includes(f.type);
  const cutPart = cutTool ? preview.snapshot?.parts?.find((part) => part.id === draft.partId) : null;
  const cutPrevious = cutPart
    ? (model.parts.find((part) => part.id === draft.partId)?.features || [])
        .slice(
          0,
          (model.parts.find((part) => part.id === draft.partId)?.features || []).findIndex((x) => x.id === f.id),
        )
        .filter((x) => !x.suppressed)
        .at(-1)
    : null;
  const changeCut = (feature) => onChange(cutFeatureChange(draft, feature));
  // A hole row (Phase K): one feature with a row record, or the Hole tool
  // opened as a row (placement.row) before its feature has one.
  const holeRow = f.type === 'hole' && Boolean(f.row || p?.row);
  const rowSeed = Boolean(p?.row?.seed && p.stage === 'place');
  const changeRow = (feature) => {
    const next = cutFeatureChange(draft, feature);
    onChange(
      next.placement?.row && feature.row
        ? {
            ...next,
            placement: {
              ...next.placement,
              row: { ...next.placement.row, count: feature.row.count, pitch: feature.row.pitch },
            },
          }
        : next,
    );
  };
  const kind = holeRow ? 'hole row' : f.type;
  const hardware = p?.tool === 'hardware';
  const holeCount = p?.holes?.length || 0;
  const seated = hardware && p.stage === 'shape' && draft.connections?.length > 0;
  return (
    <div className="cad-operation-panel">
      <h3>
        {draft.editing ? 'Edit' : p ? 'Place' : 'Configure'} {kind}
      </h3>
      <p className="cad-help">{OPERATION_HELP[holeRow ? 'holeRow' : f.type]}</p>
      <p className="cad-help">Changes are a preview until you Apply. Cancel keeps the saved model unchanged.</p>
      <div className="cad-operation-actions">
        <button className="cad-primary" disabled={stale || Boolean(problem) || !preview.ready} onClick={onApply}>
          Apply {kind}
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
      {p && (
        <section className="cad-placement-line" aria-label="Placement">
          {placementText && <p>{placementText}</p>}
          <div className="cad-inline">
            {p.stage === 'place' && p.tool === 'sweep' && (
              <button className="cad-primary" disabled={p.points.length < 2} onClick={onFinishPlacement}>
                Finish path
              </button>
            )}
            {p.stage === 'place' && p.tool === 'loft' && (
              <button className="cad-primary" disabled={p.sections.length < 2} onClick={onFinishPlacement}>
                Finish sections
              </button>
            )}
            {p.stage === 'place' && hardware && (
              <button className="cad-primary" disabled={!holeCount} onClick={onFinishPlacement}>
                Seat in {holeCount} {holeCount === 1 ? 'hole' : 'holes'}
              </button>
            )}
            {p.stage !== 'place' &&
              (p.mode === 'placed' || p.mode === 'plane' || p.memberEnd || (p.mode === 'cut' && !sketchPocket(f))) && (
                <button onClick={onReplace}>{p.tool === 'sweep' ? 'Redraw path' : 'Re-place'}</button>
              )}
            {cutTool && !draft.editing && p.stage === 'shape' && onApplyAgain && (
              <button
                className="cad-primary"
                disabled={stale || Boolean(problem) || !preview.ready}
                onClick={onApplyAgain}
              >
                Apply and place another
              </button>
            )}
            {p.tool === 'revolve' && p.stage === 'shape' && <button onClick={onChangeAxis}>Change axis</button>}
            {f.type === 'trim' && p.stage === 'shape' && (
              <button onClick={() => updateFeature({ ...f, side: f.side === 'positive' ? 'negative' : 'positive' })}>
                Keep other side
              </button>
            )}
          </div>
          {draft.feature && !draft.newPart && PROFILE_OPERATIONS.includes(f.type) && (
            <p className="cad-help">Shapes the {hostName} definition: every instance of it updates.</p>
          )}
        </section>
      )}
      {hardware && chosenHoles.length > 0 && (
        <section className="cad-chosen-holes">
          <h4>Chosen holes</h4>
          <ul aria-label="Chosen holes">
            {chosenHoles.map((hole) => (
              <li key={hole.key}>
                <span>{hole.label}</span>
                <button aria-label={hole.removeLabel} onClick={() => onRemoveHole(hole.key)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {seated && draft.newPart && (
        <ValueField
          key={`${draft.newPart.id}-offset`}
          label="Axial offset (mm)"
          value={draft.connections[0].offset ?? 0}
          onChange={guarded((offset) => onChange(setHardwareOffset(draft, offset)))}
        />
      )}
      {hardware && !draft.feature && p.hardware && (
        // The sizes while choosing holes: the rings follow them.
        <HardwareFields
          feature={p.hardware}
          onChange={(next) => onChange({ ...draft, placement: { ...p, hardware: next } })}
        />
      )}
      {draft.newPart && draft.feature && (
        <ValueField
          key="part-name"
          label="Part name"
          value={draft.newPart.name}
          asText
          onChange={(name) =>
            onChange({ ...draft, newPart: { ...draft.newPart, name: String(name).trim() || draft.newPart.name } })
          }
        />
      )}
      {placed && (
        <fieldset className="cad-primary-values">
          <legend>Profile size</legend>
          {(placed.profile.type === 'circle' ? ['radius'] : ['width', 'height']).map((key) => (
            <ValueField
              key={key}
              label={`${key[0].toUpperCase()}${key.slice(1)} (mm)`}
              value={placed.profile[key]}
              onChange={(value) => {
                const profile = { ...placed.profile, [key]: value };
                // A placed rectangle stays centred on the point it was placed at.
                if (placed.profile.type === 'rectangle' && f.type === 'extrude') {
                  const w = Number(profile.width),
                    h = Number(profile.height);
                  const [ox, oy] = placed.profile.origin || [0, 0];
                  const centre = [ox + Number(placed.profile.width) / 2, oy + Number(placed.profile.height) / 2];
                  if ([w, h, ...centre].every(Number.isFinite)) profile.origin = [centre[0] - w / 2, centre[1] - h / 2];
                }
                changeSketch({ ...placed, profile });
              }}
            />
          ))}
        </fieldset>
      )}
      {p?.tool === 'sweep' && (
        <fieldset className="cad-primary-values">
          <legend>Cross section</legend>
          <label className="cad-field">
            Section
            <select
              aria-label="Section shape"
              value={p.section.type}
              onChange={(e) => onSweepOptions({ section: { type: e.target.value } })}
            >
              <option value="circle">Circle</option>
              <option value="rectangle">Rectangle</option>
            </select>
          </label>
          {(p.section.type === 'circle' ? ['radius'] : ['width', 'height']).map((key) => (
            <ValueField
              key={key}
              label={`${key[0].toUpperCase()}${key.slice(1)} (mm)`}
              value={p.section[key]}
              onChange={guarded((value) => onSweepOptions({ section: { [key]: sizeValue(value, key) } }))}
            />
          ))}
          <ValueField
            key="wall"
            label="Wall thickness (mm)"
            value={p.section.wall || 0}
            onChange={guarded((value) =>
              onSweepOptions({ section: { wall: sizeValue(value, 'Wall thickness', true) } }),
            )}
          />
          <ValueField
            key="bend"
            label="Bend radius (mm)"
            value={bendRadiusOf(p)}
            onChange={guarded((value) =>
              onSweepOptions({ bendRadius: value === '' ? null : sizeValue(value, 'Bend radius', true) }),
            )}
          />
          <p className="cad-help">
            Wall thickness 0 is solid. Bend radius 0 keeps sharp corners; empty is 2 × the section radius.
          </p>
        </fieldset>
      )}
      {draft.feature && cutTool && (
        <>
          {holeRow && (
            <fieldset className="cad-primary-values">
              <legend>Row</legend>
              <RowFields
                feature={f}
                model={model}
                onChange={changeRow}
                minCount={2}
                seed={rowSeed ? { count: p.row.count } : null}
                onSeedCount={(count) => onChange({ ...draft, placement: { ...p, row: { ...p.row, count } } })}
                directionText={rowDirection}
              />
            </fieldset>
          )}
          <fieldset className="cad-primary-values">
            <legend>{f.type === 'hole' ? 'Hole' : 'Pocket'}</legend>
            <CutSizeFields feature={f} model={model} onChange={changeCut} />
          </fieldset>
          <details className="cad-exact-placement">
            <summary>Exact placement (mm)</summary>
            <CutLocationFields
              feature={f}
              model={model}
              onChange={changeCut}
              metrics={cutPart?.features?.[f.id] || null}
              bounds={cutPart?.features?.[cutPrevious?.id]?.bounds || null}
            />
            {f.type === 'hole' && f.row && (
              <VectorFields
                label="Row direction (part mm)"
                value={f.row.direction || [1, 0, 0]}
                onChange={(direction) => changeRow({ ...f, row: { ...f.row, direction } })}
              />
            )}
          </details>
        </>
      )}
      {draft.feature && !cutTool && (
        <FeatureForm
          feature={f}
          model={model}
          targetPartId={draft.partId}
          referenceOptions={draft.references}
          onChange={updateFeature}
          operationLabel={inferring ? 'Operation (auto)' : 'Operation'}
        />
      )}
      {draft.feature && PROFILE_OPERATIONS.includes(f.type) && (
        <details className="cad-exact-placement" open={!p}>
          <summary>Exact placement (mm)</summary>
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
                          key={key}
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
                              key={index}
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
                              key={index}
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
        </details>
      )}
    </div>
  );
}
