import { ValueField } from './CadEditors.jsx';
import { describeEntity, describeProfile } from './sketchProfile.js';

// What a sketch is and where it lies, with the way back into it.
export function SketchSummary({ sketch, planeText, onEdit, editProblem, children }) {
  return (
    <section className="cad-sketch-summary" aria-label={`Sketch ${sketch.name}`}>
      <dl>
        <dt>Plane</dt>
        <dd>{planeText}</dd>
        <dt>Profile</dt>
        <dd>{describeProfile(sketch.profile)}</dd>
      </dl>
      {sketch.entities?.length > 0 && (
        <details open={sketch.entities.length <= 8}>
          <summary>Primitives · {sketch.entities.length}</summary>
          <ol className="cad-sketch-primitives">
            {sketch.entities.map((entity) => (
              <li key={entity.id}>{describeEntity(entity)}</li>
            ))}
          </ol>
        </details>
      )}
      <button type="button" className="cad-primary cad-wide" disabled={Boolean(editProblem)} onClick={onEdit}>
        Edit sketch
      </button>
      {editProblem && <p className="cad-help">{editProblem}</p>}
      {children}
    </section>
  );
}

// Read-only facts of an extrude feature, shown above "Edit … with preview".
export function ExtrudeSummary({ feature, sketch, onEditSketch }) {
  return (
    <dl className="cad-feature-summary">
      <dt>Operation</dt>
      <dd>{feature.operation === 'cut' ? 'Cut' : feature.operation || 'add'}</dd>
      <dt>{feature.operation === 'cut' ? 'Depth' : 'Distance'}</dt>
      <dd>{feature.throughAll ? 'Through all' : `${feature.length} mm`}</dd>
      <dt>Direction</dt>
      <dd>{feature.reverse ? 'Flipped (against sketch normal)' : 'Along sketch normal'}</dd>
      <dt>Sketch</dt>
      <dd>
        {sketch ? sketch.name : 'Missing sketch'}{' '}
        {sketch && (
          <button type="button" onClick={onEditSketch}>
            Edit sketch
          </button>
        )}
      </dd>
    </dl>
  );
}

// Extrude / cut a finished sketch with the guided-operation preview.
export function SketchOperationPanel({
  draft,
  model,
  preview,
  problem,
  stale,
  showPreview,
  onShowPreview,
  onSettings,
  onMode,
  onApply,
  onCancel,
  onFit,
  // Direct placement: the placement line and whether a drag picks Extrude / Cut.
  placementText = '',
  inferring = false,
}) {
  const settings = draft.sketchFlow;
  const sketch = model.sketches.find((s) => s.id === settings.sketchId);
  const cut = settings.mode === 'cut';
  const change = (patch) => onSettings({ ...settings, ...patch });
  const instanceName = (instance) =>
    instance.name || model.parts.find((p) => p.id === instance.partId)?.name || instance.id;
  const instances = model.instances.filter((i) => i.id !== draft.newInstance?.id);
  return (
    <div className="cad-operation-panel">
      <h3>
        {cut ? 'Cut' : 'Extrude'} {sketch?.name || 'sketch'}
      </h3>
      <p className="cad-help">
        {cut
          ? 'Remove the profile from a part. Through all cuts to the far side of the part; flip the direction if the preview removes nothing.'
          : 'Extrude the closed profile. A new part is placed so its sketch sits exactly where you drew it; Join adds the material to an existing part definition (all its instances).'}
      </p>
      <div className="cad-operation-actions">
        <button className="cad-primary" disabled={stale || Boolean(problem) || !preview.ready} onClick={onApply}>
          Apply {cut ? 'cut' : 'extrude'}
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
      {placementText && (
        <section className="cad-placement-line" aria-label="Placement">
          <p>{placementText}</p>
          <p className="cad-help">Drag the arrow in the viewport: out of the part extrudes, into it cuts.</p>
        </section>
      )}
      <label className="cad-field">
        {inferring ? 'Operation (auto)' : 'Operation'}
        <select aria-label="Sketch operation" value={settings.mode} onChange={(e) => onMode(e.target.value)}>
          <option value="extrude">Extrude</option>
          <option value="cut">Cut</option>
        </select>
      </label>
      <label className="cad-field">
        {cut ? 'Cut from' : 'Result'}
        <select
          aria-label={cut ? 'Cut target' : 'Extrude result'}
          value={settings.target}
          onChange={(e) => change({ target: e.target.value })}
        >
          {!cut && <option value="new">New part</option>}
          {instances.map((instance) => (
            <option key={instance.id} value={instance.id}>
              {cut ? '' : 'Join: '}
              {instanceName(instance)}
            </option>
          ))}
        </select>
      </label>
      {!cut && settings.target === 'new' && (
        <ValueField
          key="part-name"
          label="Part name"
          value={settings.name || ''}
          asText
          onChange={(name) => change({ name: String(name) })}
        />
      )}
      {cut && (
        <label>
          <input
            type="checkbox"
            checked={Boolean(settings.throughAll)}
            onChange={(e) => change({ throughAll: e.target.checked })}
          />{' '}
          Through all
        </label>
      )}
      {!(cut && settings.throughAll) && (
        <ValueField
          key="distance"
          label={cut ? 'Depth (mm)' : 'Distance (mm)'}
          value={settings.distance}
          onChange={(distance) => change({ distance })}
        />
      )}
      <label>
        <input
          type="checkbox"
          checked={Boolean(settings.reverse)}
          onChange={(e) => change({ reverse: e.target.checked })}
        />{' '}
        Flip direction
      </label>
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
      <p className="cad-help">
        Feature: extrude · {cut ? 'cut' : draft.newPart ? 'new part' : 'join'} · stored on{' '}
        {draft.newPart ? draft.newPart.name : model.parts.find((p) => p.id === draft.partId)?.name}
      </p>
    </div>
  );
}
