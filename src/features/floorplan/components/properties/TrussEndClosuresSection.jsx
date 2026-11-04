import { useMemo } from 'react';
import { ROOF_COLOUR_CATALOG, ROOF_COLOUR_CATALOGUE_LABELS } from '@/domain/roofCoveringCatalog';
import {
  TRUSS_END_CLOSURE_PRESETS,
  TRUSS_END_CLOSURE_PRESET_LABELS,
  TRUSS_END_CLOSURE_VENT_SHAPES,
  normalizeTrussEndClosures,
} from '@/domain/trussModels';
import { buildEndClosureLayout, endClosureThickness } from '@/truss/endClosures';
import {
  ColourField,
  Field,
  Hint,
  NumberField,
  Readout,
  Section,
  SelectField,
  Status,
  panelKitStyles,
} from './PanelKit';
import styles from '../PropertiesPanel.module.css';

const SWATCH_CATALOGUES = Object.freeze({
  colorbond: { label: ROOF_COLOUR_CATALOGUE_LABELS.colorbond, colours: ROOF_COLOUR_CATALOG.colorbond },
  ral: { label: ROOF_COLOUR_CATALOGUE_LABELS.ral, colours: ROOF_COLOUR_CATALOG.ral },
});

const MODE_LABELS = { infill: 'Infill', open: 'Open' };
const VENT_SHAPE_LABELS = { rect: 'Rectangle', round: 'Round', triangle: 'Triangle' };

function capitalise(text) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

function ClosureSide({ side, entry, closure, settings, setSide, u }) {
  const setVent = (changes) => setSide(side, { vent: { ...settings.vent, ...changes } });
  const lengthField = (field, label, min) => (
    <NumberField
      label={label}
      unit={u.suffix}
      step={u.step(10)}
      value={u.toDisplay(settings.vent[field])}
      onChange={(value) => setVent({ [field]: Math.max(min, u.fromDisplay(value)) })}
    />
  );

  return (
    <div data-closure-side={side}>
      <div className={styles.subtitle}>{entry.label}</div>
      <SelectField label="Mode" value={settings.mode} onChange={(mode) => setSide(side, { mode })}>
        {Object.entries(MODE_LABELS).map(([mode, label]) => (
          <option key={mode} value={mode}>
            {label}
          </option>
        ))}
      </SelectField>
      {settings.mode === 'infill' ? (
        <>
          <SelectField
            label="Assembly"
            value={settings.assemblyPreset}
            onChange={(assemblyPreset) => setSide(side, { assemblyPreset })}
          >
            {TRUSS_END_CLOSURE_PRESETS.map((preset) => (
              <option key={preset} value={preset}>
                {capitalise(TRUSS_END_CLOSURE_PRESET_LABELS[preset])}
              </option>
            ))}
          </SelectField>
          <Readout
            label="Thickness"
            value={u.toDisplay(endClosureThickness(settings.assemblyPreset))}
            unit={u.suffix}
          />
          {closure ? (
            <Readout label="Area" value={(closure.areaMm2 / 1_000_000).toFixed(2)} unit="m²" />
          ) : (
            <Readout label="Area" value="—" muted />
          )}
          <Field label="Vent">
            <input
              type="checkbox"
              checked={settings.vent.enabled}
              onChange={(event) => setVent({ enabled: event.target.checked })}
              aria-label={`${entry.label} vent`}
            />
          </Field>
          {settings.vent.enabled ? (
            <>
              <SelectField label="Vent shape" value={settings.vent.shape} onChange={(shape) => setVent({ shape })}>
                {TRUSS_END_CLOSURE_VENT_SHAPES.map((shape) => (
                  <option key={shape} value={shape}>
                    {VENT_SHAPE_LABELS[shape]}
                  </option>
                ))}
              </SelectField>
              {lengthField('width', 'Vent width', 50)}
              {lengthField('height', 'Vent height', 50)}
              {lengthField('sillOffset', 'Vent sill', 0)}
              {closure?.vent && !closure.vent.fits ? (
                <Status tone="warning">The vent does not fit inside this closure, so it is not cut.</Status>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/**
 * Gable ends (docs/roof-truss-industrial.md §6.3, RT-2): what closes each end
 * of the truss system. End A / End B are the first and last truss copy (the
 * same A/B the supports use); the side strips appear only where the geometry
 * draws one. The whole `endClosures` object is written back through
 * TRUSS_SYSTEM_UPDATE on every change; thickness and area are Readouts.
 */
export default function TrussEndClosuresSection({
  trussSystem,
  systemGeometry,
  roofSystem,
  updateSystem,
  u,
  colourShared = false,
}) {
  const settings = normalizeTrussEndClosures(trussSystem.endClosures);
  const layout = useMemo(
    () => buildEndClosureLayout(trussSystem, systemGeometry, roofSystem),
    [trussSystem, systemGeometry, roofSystem],
  );
  const setClosures = (next) => updateSystem({ endClosures: next });
  const setSide = (side, changes) => setClosures({ ...settings, [side]: { ...settings[side], ...changes } });
  const shownSides = ['start', 'end', 'spanStart', 'spanEnd'].filter(
    (side) => side === 'start' || side === 'end' || layout.sides[side].available,
  );
  const summary = shownSides
    .map((side) => `${layout.sides[side].label} ${MODE_LABELS[settings[side].mode].toLowerCase()}`)
    .join(' · ');

  return (
    <div className={panelKitStyles.gutter}>
      <Section id="truss-end-closures" title="Gable ends" summary={summary}>
        <ColourField
          id="truss-closure-colour"
          label="Cladding colour"
          value={settings.colour}
          catalogues={SWATCH_CATALOGUES}
          onChange={(colour) => setClosures({ ...settings, colour })}
        />
        {colourShared ? (
          <Hint>The 3D preview paints every gable with the first truss system&rsquo;s cladding colour.</Hint>
        ) : null}
        {shownSides.map((side) => (
          <ClosureSide
            key={side}
            side={side}
            entry={layout.sides[side]}
            closure={layout.sides[side].closure}
            settings={settings[side]}
            setSide={setSide}
            u={u}
          />
        ))}
        <Readout label="Closure area" value={layout.totalAreaM2.toFixed(2)} unit="m²" />
        {!layout.attached ? (
          <Hint>Top edge follows the truss top chord; attach a roof for the finished underside.</Hint>
        ) : null}
        {!layout.sides.start.available && !layout.sides.end.available ? (
          <Hint>Hip ends are closed by the hip roof planes, so no gable panel is drawn there.</Hint>
        ) : null}
      </Section>
    </div>
  );
}
