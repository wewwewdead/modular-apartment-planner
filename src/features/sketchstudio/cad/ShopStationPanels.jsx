// The paint and print stations' panels (docs/sketch-studio-fab-shop.md §9
// SM-3), each in the station shell (docs/sketch-studio-shop-floor.md §4.6).
// Each shows its steps, the picks and settings kept in the workspace's
// shopSession (never saved), what it makes on show and the machine's numbers
// one click away, the shop's refusals as problem cards with their remedies,
// and the records already made. Only the station buttons and a placed print's
// fields edit the model; numbers come from paintStation.js, printStation.js
// and shopCatalog.js.
import { useRef } from 'react';
import { ValueField, useNumber } from './CadEditors.jsx';
import { FINISH_GLOSS_NAMES, POWDER, PRINT_METHOD_NAMES, PRINT_RULES, RAL_CLASSIC, ralOf } from './shopCatalog.js';
import { PRINT_FONTS, textPoints } from './printStation.js';
import { MachineNumbers, PrimaryButton, ProblemCard, Readout, Result, StationShell } from './ShopFloor.jsx';

const fmt = (value, digits = 2) => (Number.isFinite(value) ? Number(value.toFixed(digits)).toString() : '—');
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function Segmented({ label, options, value, onChange, disabled = false }) {
  return (
    <span className="cad-segmented" role="group" aria-label={label}>
      {options.map(([key, text]) => (
        <button key={key} type="button" aria-pressed={value === key} disabled={disabled} onClick={() => onChange(key)}>
          {text}
        </button>
      ))}
    </span>
  );
}
// Refusals (role alert) or warnings (role note) as problem cards.
const Cards = ({ items, tone = 'warning' }) =>
  items.map((item, i) => <ProblemCard key={`${item.code || item.message}-${i}`} tone={tone} message={item.message} />);
const leave = (label, onLeave, disabled = false) => (
  <button type="button" className="cad-shell-leave" disabled={disabled} onClick={onLeave}>
    {label}
  </button>
);

/**
 * The paint booth. `view`: { stage, targets: [{ id, name, finish }], group
 * (the picked part's group: { name, instanceIds }, or null), finish (the
 * draft), numbers, holes, prints }.
 */
export function PaintPanel({
  view,
  problem = '',
  notice = '',
  shell = null,
  onFinish,
  onWhole,
  onPaint,
  onStrip,
  onConfirm,
  onBack,
  onLeave,
}) {
  const number = useNumber();
  const { stage, targets, finish, numbers } = view;
  const ral = ralOf(finish);
  const painted = targets.some((t) => t.finish);
  const confirming = stage === 'confirm';
  return (
    <StationShell
      station="paint"
      region="Paint booth"
      shell={shell}
      leave={leave('Leave paint booth', onLeave)}
      primary={
        <PrimaryButton disabled={!targets.length || confirming} onClick={onPaint}>
          {painted ? 'Repaint' : 'Paint'}
        </PrimaryButton>
      }
    >
      <ol className="cad-mate-steps">
        <li className={stage === 'pick' ? 'is-current' : ''}>Click the part to paint.</li>
        <li className={stage === 'colour' ? 'is-current' : ''}>Choose the powder, gloss and film, then Paint.</li>
      </ol>
      {targets.length > 0 && (
        <p className="cad-part-size" aria-label="Painting">
          {targets.length === 1
            ? targets[0].name
            : `${plural(targets.length, 'part')}: ${targets.map((t) => t.name).join(', ')}`}
          {targets.length === 1 && targets[0].finish ? ` · now ${targets[0].finish.name}` : ''}
        </p>
      )}
      {view.group && view.group.instanceIds.length > targets.length && (
        <button type="button" onClick={onWhole}>
          Paint the whole {view.group.name} ({plural(view.group.instanceIds.length, 'part')})
        </button>
      )}
      <fieldset className="cad-profile-fields" disabled={!targets.length || confirming}>
        <Segmented
          label="Coating"
          options={[
            ['powder', 'Powder'],
            ['wet', 'Wet paint'],
          ]}
          value={finish.kind}
          onChange={(kind) => onFinish({ kind })}
        />
        <div className="cad-ral-swatches" role="group" aria-label="RAL colours">
          {RAL_CLASSIC.map((r) => (
            <button
              key={r.code}
              type="button"
              className="cad-ral-swatch"
              aria-label={r.name}
              aria-pressed={ral?.code === r.code}
              title={r.name}
              style={{ '--swatch': r.colour }}
              onClick={() => onFinish({ name: r.name, colour: r.colour })}
            >
              <span>{r.code}</span>
            </button>
          ))}
        </div>
        <div className="cad-inline">
          <label className="cad-field">
            Custom colour
            <input
              type="color"
              aria-label="Custom colour"
              value={finish.colour}
              onChange={(e) =>
                onFinish({ colour: e.target.value, name: ralOf({ colour: e.target.value })?.name || '' })
              }
            />
          </label>
          <ValueField
            label="Finish name"
            asText
            live={false}
            value={finish.name}
            onChange={(name) => onFinish({ name: String(name) })}
          />
        </div>
        <label className="cad-field">
          Gloss
          <select aria-label="Gloss" value={finish.gloss} onChange={(e) => onFinish({ gloss: e.target.value })}>
            {Object.entries(FINISH_GLOSS_NAMES).map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <ValueField
          label="Film thickness (µm)"
          value={finish.thickness}
          onChange={number((thickness) => onFinish({ thickness }))}
        />
      </fieldset>
      <p className="cad-help">
        RAL colours are shown as screen approximations of the printed RAL cards.
        {ral ? '' : ' A custom colour is stored as its hex value.'}
      </p>
      <Cards items={numbers?.warnings || []} />
      {view.holes.map((h, i) => (
        <ProblemCard
          key={i}
          tone="warning"
          message={`An open hole of ${fmt(h.size)} mm (${h.where}) is likely to fill with powder: mask it or drill after coating.`}
        />
      ))}
      {confirming && (
        <div className="cad-station-confirm" role="group" aria-label="Confirm">
          <p className="cad-shop-error" role="alert">
            {view.pending === 'strip' ? 'Stripping the paint' : 'Painting'} removes{' '}
            {plural(view.prints.length, 'print')} on {view.printParts}: printing comes after paint, so they go on again
            afterwards.
          </p>
          <div className="cad-inline">
            <button type="button" className="cad-primary" onClick={onConfirm}>
              {view.pending === 'strip' ? 'Strip and remove prints' : 'Paint and remove prints'}
            </button>
            <button type="button" onClick={onBack}>
              Back
            </button>
          </div>
        </div>
      )}
      {problem && <ProblemCard message={problem} />}
      {targets.length > 0 && (
        <dl className="cad-shop-results" aria-label="Paint results">
          <Result label="Painted area" title="Every face of the part's mesh">
            {fmt(numbers.area, 4)} m²
          </Result>
          <Result label="Powder" title="The powder to spray for this film">
            {numbers.mass != null ? `${fmt(numbers.mass * 1000, 1)} g` : '—'}
          </Result>
        </dl>
      )}
      {notice && (
        <p className="cad-help cad-shop-notice" role="status">
          {notice}
        </p>
      )}
      <div className="cad-inline">
        <button type="button" disabled={!painted || confirming} onClick={onStrip}>
          Strip paint
        </button>
      </div>
      {targets.length > 0 && (
        <MachineNumbers station="paint">
          <dl className="cad-brake-readouts" aria-label="Paint readouts">
            <Readout
              label="Coverage"
              title={`Coverage 1000 / (SG ${POWDER.gravity} × µm) × ${POWDER.transfer} transfer`}
            >
              {numbers.coverage != null ? `${fmt(numbers.coverage, 2)} m²/kg` : '—'}
            </Readout>
            <Readout label="Cure">{numbers.cure || '—'}</Readout>
          </dl>
        </MachineNumbers>
      )}
    </StationShell>
  );
}

// The artwork fields, for the draft (before placing) or a placed print.
function ArtworkFields({ artwork, keyBase, onChange, onImage, imageInfo }) {
  const number = useNumber();
  const file = useRef(null);
  return (
    <fieldset className="cad-profile-fields">
      <Segmented
        label="Artwork"
        options={[
          ['text', 'Text'],
          ['image', 'Image'],
        ]}
        value={artwork.kind}
        onChange={(kind) => onChange({ kind })}
      />
      {artwork.kind === 'text' ? (
        <>
          <ValueField
            key={`text-${keyBase}`}
            label="Text"
            asText
            value={artwork.text ?? ''}
            onChange={(text) => onChange({ text: String(text) })}
          />
          <label className="cad-field">
            Font
            <select
              aria-label="Font"
              value={artwork.font || 'sans-serif'}
              onChange={(e) => onChange({ font: e.target.value })}
            >
              {PRINT_FONTS.map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : (
        <div className="cad-field">
          <span>Image</span>
          <input
            ref={file}
            type="file"
            accept="image/*"
            aria-label="Upload image"
            onChange={(e) => {
              const chosen = e.target.files?.[0];
              if (chosen) onImage(chosen);
              e.target.value = '';
            }}
          />
          <small aria-label="Image size">
            {artwork.image
              ? `${imageInfo ? `${imageInfo.width} × ${imageInfo.height} px · ` : ''}${fmt(artwork.image.length / 1024, 0)} KB in the model`
              : 'No image yet: at most 1024 px and 512 KB once fitted'}
          </small>
        </div>
      )}
      <div className="cad-inline">
        <ValueField
          key={`width-${keyBase}`}
          label="Width (mm)"
          value={artwork.width}
          onChange={number((width) => width > 0 && onChange({ width }))}
        />
        <ValueField
          key={`height-${keyBase}`}
          label={artwork.kind === 'text' ? 'Text height (mm)' : 'Height (mm)'}
          value={artwork.height}
          onChange={number((height) => height > 0 && onChange({ height }))}
        />
      </div>
      <div className="cad-inline">
        <ValueField
          key={`rotation-${keyBase}`}
          label="Rotation (°)"
          value={artwork.rotation ?? 0}
          onChange={number((rotation) => onChange({ rotation }))}
        />
        {artwork.kind === 'text' && (
          <label className="cad-field">
            Ink
            <input
              type="color"
              aria-label="Ink colour"
              value={artwork.colour || '#111111'}
              onChange={(e) => onChange({ colour: e.target.value })}
            />
          </label>
        )}
      </div>
      <label className="cad-field">
        Method
        <select aria-label="Print method" value={artwork.method} onChange={(e) => onChange({ method: e.target.value })}>
          {Object.entries(PRINT_METHOD_NAMES).map(([key, name]) => (
            <option key={key} value={key}>
              {name}
            </option>
          ))}
        </select>
      </label>
      {artwork.kind === 'text' && (
        <p className="cad-part-size" aria-label="Text size">
          Text {fmt(artwork.height)} mm ≈ {fmt(textPoints(artwork.height), 1)} pt
          {artwork.method === 'silk' ? ` (silk-screen holds ${PRINT_RULES.minPoint} pt and up)` : ''}
        </p>
      )}
    </fieldset>
  );
}

/**
 * The print station. `view`: { stage, draft, selected (the print being
 * edited or null), warnings, notes, prints: [{ id, label, parts }], imageInfo }.
 */
export function PrintPanel({
  view,
  problem = '',
  notice = '',
  shell = null,
  onDraft,
  onChange,
  onImage,
  onNew,
  onSelect,
  onRemove,
  onLeave,
}) {
  const { stage, selected } = view;
  const artwork = selected || view.draft;
  return (
    <StationShell
      station="print"
      region="Print station"
      shell={shell}
      leave={leave('Leave print station', onLeave)}
      primary={
        <PrimaryButton disabled={stage === 'face'} onClick={onNew}>
          New print
        </PrimaryButton>
      }
    >
      <ol className="cad-mate-steps">
        <li className={stage === 'face' ? 'is-current' : ''}>Set the artwork, then click a flat face to place it.</li>
        <li className={stage === 'artwork' ? 'is-current' : ''}>
          Drag it on its face, or change its fields; click another face to move it there.
        </li>
      </ol>
      {selected ? (
        <>
          <p className="cad-part-size" aria-label="Printing on">
            {selected.label} on {view.selectedPart}
          </p>
          <ArtworkFields
            artwork={selected}
            keyBase={selected.id}
            onChange={onChange}
            onImage={onImage}
            imageInfo={view.imageInfo}
          />
        </>
      ) : (
        <ArtworkFields
          artwork={view.draft}
          keyBase="draft"
          onChange={onDraft}
          onImage={onImage}
          imageInfo={view.imageInfo}
        />
      )}
      <Cards items={view.warnings} tone="refusal" />
      <Cards items={view.notes} />
      {problem && <ProblemCard message={problem} />}
      <dl className="cad-shop-results" aria-label="Print results">
        <Result label="Artwork size">
          {fmt(Number(artwork.width))} × {fmt(Number(artwork.height))} mm
        </Result>
      </dl>
      {notice && (
        <p className="cad-help cad-shop-notice" role="status">
          {notice}
        </p>
      )}
      {stage === 'face' ? (
        <p className="cad-shop-lead cad-shop-instruction">Now click a flat face in the view to place the artwork.</p>
      ) : null}
      <h4>Prints</h4>
      {!view.prints.length && <p className="cad-help">No prints yet.</p>}
      <ul className="cad-station-list" aria-label="Prints">
        {view.prints.map((p) => (
          <li key={p.id} className={selected?.id === p.id ? 'is-current' : ''}>
            <button type="button" className="cad-link" onClick={() => onSelect(p.id)}>
              {p.label}
            </button>
            <span> · {p.parts}</span>
            <button type="button" className="cad-danger-inline" onClick={() => onRemove(p.id)}>
              Remove
            </button>
          </li>
        ))}
      </ul>
    </StationShell>
  );
}
