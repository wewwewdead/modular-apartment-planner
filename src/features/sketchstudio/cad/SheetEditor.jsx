import { useState } from 'react';
import { ValueField, JsonEditor } from './CadEditors.jsx';
import { PAGE_SIZES } from './drawings.js';
import { isCircularCutFeature, uid } from './model.js';
import { describeManualDimension, isManualDimension } from './sheetAnnotations.js';
import { sheetHasPartsList } from './partsList.js';
import MaterialSelect from './MaterialSelect.jsx';

const directions = ['front', 'top', 'right', 'isometric', 'rear', 'bottom', 'left'];
export default function SheetEditor({
  sheet,
  model,
  onChange,
  onGenerate,
  ready,
  dimensionTool = null,
  onDimensionTool = () => {},
  previewReady = false,
}) {
  const [chosenPart, setAnnotationPart] = useState(model.parts[0]?.id || '');
  const annotationPart = sheet.partId || chosenPart;
  const [annotationView, setAnnotationView] = useState('front');
  const [selectedHoles, setSelectedHoles] = useState([]);
  const [annotationInstance, setAnnotationInstance] = useState('');
  const update = (key, value) => onChange({ ...sheet, [key]: value });
  const field = (key, label) => (
    <ValueField
      key={`${sheet.id}-${key}-${sheet[key]}`}
      label={label}
      value={sheet[key] || ''}
      onChange={(v) => update(key, String(v))}
    />
  );
  // Drilled holes and cut extrusions of a single circle both read as holes.
  const holes =
    model.parts
      .find((p) => p.id === annotationPart)
      ?.features.filter((f) => (f.type === 'hole' && !f.suppressed) || isCircularCutFeature(f, model.sketches)) || [];
  const holeDiameter = (f) => {
    if (f.type === 'hole') return f.diameter;
    const radius = model.sketches.find((s) => s.id === f.sketchId)?.profile.radius;
    return typeof radius === 'number' ? radius * 2 : `2 × ${radius}`;
  };
  const manual = (sheet.annotations || []).filter(isManualDimension);
  const changeAnnotation = (id, patch) =>
    update(
      'annotations',
      sheet.annotations.map((old) => (old.id === id ? { ...old, ...patch } : old)),
    );
  const addAnnotation = (type) => {
    update('annotations', [
      ...(sheet.annotations || []),
      {
        id: uid('annotation'),
        type,
        view: annotationView,
        partId: annotationPart,
        ...(sheet.partId
          ? {}
          : { instanceId: annotationInstance || model.instances.find((i) => i.partId === annotationPart)?.id }),
        featureIds: selectedHoles,
        axis: 'X',
        offset: 12,
        dx: 7,
        dy: -18,
      },
    ]);
  };
  return (
    <div className="cad-sheet-editor">
      <h3>Drawing sheet</h3>
      <label className="cad-field">
        Layout
        <select value={sheet.layout || 'standard'} onChange={(e) => update('layout', e.target.value)}>
          <option
            value="standard"
            disabled={sheet.annotations?.some((a) => ['hole-chain', 'hole-callout'].includes(a.type))}
          >
            Workshop overview
          </option>
          <option value="engineering">Engineering drawing</option>
        </select>
      </label>
      {field('title', 'Drawing title')}
      <label className="cad-field">
        Drawing subject
        <select
          value={sheet.partId || ''}
          onChange={(e) => {
            const partId = e.target.value || undefined;
            onChange({ ...sheet, partId, instanceIds: undefined, annotations: [] });
            setAnnotationPart(partId || model.parts[0]?.id || '');
            setSelectedHoles([]);
            setAnnotationInstance('');
          }}
        >
          <option value="">
            {sheet.instanceIds?.length
              ? `Assembly selection (${sheet.instanceIds.length} instances)`
              : 'Whole assembly'}
          </option>
          {model.parts.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <p className="cad-help">Changing the subject clears this sheet’s annotations. Undo restores them.</p>
      <div className="cad-sheet-fields">
        <label className="cad-field">
          Page
          <select value={sheet.size} onChange={(e) => update('size', e.target.value)}>
            {Object.keys(PAGE_SIZES).map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="cad-field">
          Units
          <select value={sheet.units || 'mm'} onChange={(e) => update('units', e.target.value)}>
            <option value="mm">mm</option>
            <option value="inch">inch</option>
          </select>
        </label>
      </div>
      <ValueField
        key={`scale-${sheet.scale}`}
        label="Sheet scale (1 = full size)"
        value={sheet.scale}
        onChange={(v) => update('scale', v)}
      />
      <details open>
        <summary>Title block & notes</summary>
        {sheet.layout === 'engineering' && field('drawingNumber', 'Drawing number')}
        {field('revision', 'Revision')}
        <MaterialSelect
          key={sheet.id}
          label="Material / finish"
          value={sheet.material || ''}
          projectMaterials={model.parts.map((p) => p.material)}
          onChange={(material) => update('material', material)}
        />
        {field('tolerance', 'Tolerance')}
        {sheet.layout === 'engineering' && field('drawnBy', 'Drawn by')}
        {sheet.layout === 'engineering' && field('date', 'Drawing date')}
        {sheet.layout === 'engineering' && (
          <label className="cad-field">
            Drawing notes
            <textarea
              key={`${sheet.id}-${sheet.notes}`}
              defaultValue={sheet.notes || ''}
              rows={6}
              onBlur={(e) => {
                if (e.target.value !== (sheet.notes || '')) update('notes', e.target.value);
              }}
            />
          </label>
        )}
      </details>
      <details open>
        <summary>Views & linework</summary>
        {sheet.views.map((v, index) => {
          const config = typeof v === 'string' ? { name: v, view: v } : v;
          const changeView = (next) =>
            update(
              'views',
              sheet.views.map((old, i) => (i === index ? next : old)),
            );
          return (
            <fieldset key={`${index}-${config.view}`} className="cad-section-fields">
              <legend>View {index + 1}</legend>
              <label className="cad-field">
                View direction
                <select
                  value={config.view || config.name}
                  onChange={(e) => changeView({ ...config, view: e.target.value, name: e.target.value })}
                >
                  {[...directions, 'exploded'].map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </label>
              <ValueField
                key={config.name}
                label="View label"
                value={config.name}
                onChange={(name) => changeView({ ...config, name: String(name) })}
              />
              <ValueField
                key={config.scale ?? 'sheet'}
                label="View scale (blank = sheet)"
                value={config.scale ?? ''}
                onChange={(scale) => changeView({ ...config, scale: scale === '' ? undefined : scale })}
              />
              <button
                disabled={sheet.views.length === 1}
                onClick={() =>
                  update(
                    'views',
                    sheet.views.filter((_, i) => i !== index),
                  )
                }
              >
                Remove view {index + 1}
              </button>
            </fieldset>
          );
        })}
        <button
          disabled={sheet.layout === 'engineering' && sheet.views.length >= 4}
          onClick={() => update('views', [...sheet.views, 'front'])}
        >
          Add view
        </button>
        {!sheet.partId && !sheet.section && (
          <label className="cad-sheet-check">
            <input
              type="checkbox"
              checked={sheetHasPartsList(sheet)}
              onChange={(e) => update('partsList', e.target.checked)}
            />
            Parts list & balloons
          </label>
        )}
        {['hiddenLines', 'centerlines', 'overallDimensions'].map((key) => (
          <label className="cad-sheet-check" key={key}>
            <input type="checkbox" checked={sheet[key] !== false} onChange={(e) => update(key, e.target.checked)} />
            {
              {
                hiddenLines: 'Hidden lines',
                centerlines: sheet.layout === 'engineering' ? 'Hole center marks' : 'View centerlines',
                overallDimensions: 'Overall dimensions',
              }[key]
            }
          </label>
        ))}
      </details>
      {sheet.section && (
        <details open>
          <summary>Section cut</summary>
          <p className="cad-help">
            The section cuts the solid at this coordinate. Cut faces are hatched. Position is in model millimetres.
          </p>
          <label className="cad-field">
            Cut normal
            <select
              value={Math.max(
                0,
                sheet.section.normal.findIndex((n) => Math.abs(n) > 0.5),
              )}
              onChange={(e) => {
                const axis = Number(e.target.value);
                update('section', { ...sheet.section, normal: [0, 1, 2].map((i) => (i === axis ? 1 : 0)) });
              }}
            >
              {['X', 'Y', 'Z'].map((axis, i) => (
                <option key={axis} value={i}>
                  {axis}
                </option>
              ))}
            </select>
          </label>
          {sheet.section.origin.map((value, i) => (
            <ValueField
              key={`${i}-${value}`}
              label={`Cut position ${['X', 'Y', 'Z'][i]}`}
              value={value}
              onChange={(v) =>
                update('section', {
                  ...sheet.section,
                  origin: sheet.section.origin.map((old, index) => (i === index ? v : old)),
                })
              }
            />
          ))}
          <label className="cad-field">
            Retain side
            <select
              value={sheet.section.side || 'negative'}
              onChange={(e) => update('section', { ...sheet.section, side: e.target.value })}
            >
              <option value="negative">Negative side</option>
              <option value="positive">Positive side</option>
            </select>
          </label>
          <button onClick={() => update('section', undefined)}>Remove section cut</button>
        </details>
      )}
      {sheet.layout === 'engineering' && !sheet.section && (
        <details open>
          <summary>Hole dimensions & callouts</summary>
          <p className="cad-help">
            Choose holes viewed face-on. Dimensions follow their centers when the model changes. Offset values are paper
            millimetres.
          </p>
          {!sheet.partId && (
            <label className="cad-field">
              Annotation part
              <select
                value={annotationPart}
                onChange={(e) => {
                  setAnnotationPart(e.target.value);
                  setSelectedHoles([]);
                  setAnnotationInstance('');
                }}
              >
                {model.parts.map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!sheet.partId && (
            <label className="cad-field">
              Annotation instance
              <select
                value={annotationInstance || model.instances.find((i) => i.partId === annotationPart)?.id || ''}
                onChange={(e) => setAnnotationInstance(e.target.value)}
              >
                {model.instances
                  .filter((i) => i.partId === annotationPart)
                  .map((i) => (
                    <option value={i.id} key={i.id}>
                      {i.name || i.id}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <label className="cad-field">
            Annotation view
            <select value={annotationView} onChange={(e) => setAnnotationView(e.target.value)}>
              {directions
                .filter((d) => d !== 'isometric')
                .map((d) => (
                  <option key={d}>{d}</option>
                ))}
            </select>
          </label>
          {holes.map((f, index) => (
            <label className="cad-sheet-check" key={f.id}>
              <input
                type="checkbox"
                checked={selectedHoles.includes(f.id)}
                onChange={(e) =>
                  setSelectedHoles(
                    e.target.checked ? [...selectedHoles, f.id] : selectedHoles.filter((id) => id !== f.id),
                  )
                }
              />
              {f.type === 'hole' ? 'Hole' : 'Circular cut'} {index + 1} · Ø{holeDiameter(f)}
            </label>
          ))}
          {!holes.length && <p className="cad-help">Add Hole features to the part first.</p>}
          <div className="cad-inline">
            <button disabled={!selectedHoles.length} onClick={() => addAnnotation('hole-chain')}>
              Add chain dimension
            </button>
            <button disabled={!selectedHoles.length} onClick={() => addAnnotation('hole-callout')}>
              Add hole callout
            </button>
          </div>
          {(sheet.annotations || [])
            .filter((a) => !isManualDimension(a))
            .map((a, i) => {
              const change = (key, value) =>
                update(
                  'annotations',
                  sheet.annotations.map((old) => (old.id === a.id ? { ...old, [key]: value } : old)),
                );
              return (
                <fieldset className="cad-section-fields" key={a.id}>
                  <legend>
                    {i + 1}. {a.type} · {a.view || 'note'}
                  </legend>
                  {a.type === 'hole-chain' && (
                    <>
                      <label className="cad-field">
                        Dimension direction
                        <select value={a.axis || 'X'} onChange={(e) => change('axis', e.target.value)}>
                          <option value="X">Horizontal</option>
                          <option value="Y">Vertical</option>
                        </select>
                      </label>
                      <ValueField
                        key={a.offset}
                        label="Dimension offset"
                        value={a.offset ?? 12}
                        onChange={(v) => change('offset', v)}
                      />
                      <label className="cad-sheet-check">
                        <input
                          type="checkbox"
                          checked={a.fromEdge !== false}
                          onChange={(e) => change('fromEdge', e.target.checked)}
                        />
                        Include distance from view edge
                      </label>
                    </>
                  )}
                  {a.type === 'hole-callout' && (
                    <>
                      <ValueField
                        key={`x-${a.dx}`}
                        label="Leader horizontal offset"
                        value={a.dx ?? 7}
                        onChange={(v) => change('dx', v)}
                      />
                      <ValueField
                        key={`y-${a.dy}`}
                        label="Leader vertical offset"
                        value={a.dy ?? -18}
                        onChange={(v) => change('dy', v)}
                      />
                    </>
                  )}
                  <button
                    onClick={() =>
                      update(
                        'annotations',
                        sheet.annotations.filter((old) => old.id !== a.id),
                      )
                    }
                  >
                    Remove annotation {i + 1}
                  </button>
                </fieldset>
              );
            })}
        </details>
      )}
      <details open>
        <summary>Manual dimensions</summary>
        <p className="cad-help">
          Pick points on a generated view: vertices, edge midpoints and hole centres snap. The third click places the
          line; beside the span gives horizontal or vertical, elsewhere aligned. Dimensions are stored in model
          millimetres and follow scale changes.
        </p>
        <div className="cad-inline" role="group" aria-label="Dimension tools">
          {[
            ['linear', 'Linear dimension'],
            ['diameter', 'Diameter'],
            ['radius', 'Radius'],
          ].map(([mode, label]) => (
            <button
              key={mode}
              aria-pressed={dimensionTool === mode}
              disabled={!previewReady && dimensionTool !== mode}
              onClick={() => onDimensionTool(dimensionTool === mode ? null : mode)}
            >
              {label}
            </button>
          ))}
        </div>
        {!previewReady && <p className="cad-help">Generate views first.</p>}
        {manual.map((a, i) => (
          <fieldset className="cad-section-fields" key={a.id}>
            <legend>
              Dimension {i + 1} · {describeManualDimension(a, sheet.units)}
            </legend>
            {a.type === 'linear' && (
              <label className="cad-field">
                Direction
                <select
                  aria-label={`Dimension ${i + 1} direction`}
                  value={a.orientation}
                  onChange={(e) => changeAnnotation(a.id, { orientation: e.target.value })}
                >
                  <option value="horizontal">Horizontal</option>
                  <option value="vertical">Vertical</option>
                  <option value="aligned">Aligned</option>
                </select>
              </label>
            )}
            {a.type === 'linear' && (
              <ValueField
                key={`offset-${a.offset}`}
                label="Line offset (model mm)"
                value={a.offset}
                onChange={(v) => changeAnnotation(a.id, { offset: Number(v) || 0 })}
              />
            )}
            {a.type === 'radial' && (
              <label className="cad-field">
                Show as
                <select value={a.mode} onChange={(e) => changeAnnotation(a.id, { mode: e.target.value })}>
                  <option value="diameter">Diameter</option>
                  <option value="radius">Radius</option>
                </select>
              </label>
            )}
            <button
              onClick={() =>
                update(
                  'annotations',
                  sheet.annotations.filter((old) => old.id !== a.id),
                )
              }
            >
              Remove dimension {i + 1}
            </button>
          </fieldset>
        ))}
      </details>
      <button className="cad-primary cad-wide" disabled={!ready} onClick={onGenerate}>
        Update drawing preview
      </button>
      <details>
        <summary>Advanced sheet definition</summary>
        <JsonEditor
          key={JSON.stringify(sheet)}
          value={sheet}
          label="Sheet, views and feature annotations"
          onApply={onChange}
        />
      </details>
    </div>
  );
}
