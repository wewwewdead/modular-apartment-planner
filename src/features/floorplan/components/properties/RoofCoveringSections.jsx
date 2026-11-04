import { useMemo } from 'react';
import {
  ROOF_COLOUR_CATALOG,
  ROOF_COLOUR_CATALOGUE_LABELS,
  ROOF_COVERING_FINISHES,
  ROOF_COVERING_FINISH_LABELS,
  ROOF_COVERING_KINDS,
  ROOF_COVERING_KIND_LABELS,
  ROOF_COVERING_SUPPORTS,
  ROOF_GUTTER_PROFILES,
  ROOF_SOFFIT_MODES,
  coveringForKind,
  coveringForProduct,
  formatSlopeReadout,
  getRoofCoveringProducts,
  normalizeRoofCovering,
  normalizeRoofTrims,
  resolveRoofCoveringProduct,
  slopePercentToDegrees,
  solarAbsorptanceClass,
  suggestRoofBuildUp,
} from '@/domain/roofCoveringCatalog';
import { getProjectTrussSystem } from '@/domain/trussModels';
import { buildRoofPlaneGeometry } from '@/geometry/roofPlaneGeometry';
import { buildRoofScheduleSummary } from '@/roof/roofSchedule';
import { describeRoofTrims } from '@/roof/roofEdgeKit';
import {
  ColourField,
  Field,
  Hint,
  NumberField,
  Readout,
  Section,
  SelectField,
  Stack,
  Status,
  panelKitStyles,
} from './PanelKit';
import styles from '../PropertiesPanel.module.css';

const SWATCH_CATALOGUES = Object.freeze({
  colorbond: { label: ROOF_COLOUR_CATALOGUE_LABELS.colorbond, colours: ROOF_COLOUR_CATALOG.colorbond },
  ral: { label: ROOF_COLOUR_CATALOGUE_LABELS.ral, colours: ROOF_COLOUR_CATALOG.ral },
});

const SOFFIT_MODE_LABELS = {
  boxed: 'Boxed (level lining)',
  raked: 'Raked (follows the slope)',
  open: 'Open (no lining)',
};

function approx(product, text) {
  return product.approx ? `≈ ${text}` : text;
}

/** The slope the covering has to cope with: the roof pitch, or a flat roof's fall. */
function governingSlopePercent(roofSystem, roofGeometry) {
  const roofType = roofSystem.roofType || 'flat';
  if (roofType === 'flat') return Number(roofSystem.finishSlope) || 0;
  if (roofType === 'custom') {
    const slopes = (roofGeometry.planes || []).map((plane) => Number(plane.slope) || 0);
    return slopes.length ? Math.min(...slopes) : 0;
  }
  return Number(roofSystem.pitch?.slope) || 0;
}

/**
 * Sheets of the cover width, one full slope long: per plane, the plane's true
 * area over (cover width × its eave-to-ridge length on the slope).
 */
function estimateSheets(roofGeometry, coverWidth) {
  if (!(coverWidth > 0)) return null;
  let count = 0;
  let longest = 0;
  for (const plane of roofGeometry.planes || []) {
    const outline = plane.outline || [];
    if (outline.length < 3) continue;
    const direction = plane.slopeDirection || { x: 0, y: 1 };
    const values = outline.map((point) => point.x * direction.x + point.y * direction.y);
    const ratio = Math.max(0, Number(plane.slope) || 0) / 100;
    const factor = plane.surfaceFactor || Math.sqrt(1 + ratio * ratio);
    const run = Math.max(...values) - Math.min(...values);
    const sheetLength = run * factor;
    if (sheetLength <= 0) continue;
    let area = 0;
    for (let index = 0; index < outline.length; index += 1) {
      const a = outline[index];
      const b = outline[(index + 1) % outline.length];
      area += a.x * b.y - b.x * a.y;
    }
    count += Math.ceil(((Math.abs(area) / 2) * factor) / (coverWidth * sheetLength));
    longest = Math.max(longest, sheetLength);
  }
  return count ? { count, longest } : null;
}

function coveringWarnings({ product, slopePercent, trussSystem }) {
  const warnings = [];
  const pitchDeg = slopePercentToDegrees(slopePercent);
  if (pitchDeg + 1e-6 < product.minPitchDeg) {
    warnings.push(
      `${formatSlopeReadout(slopePercent)} is below the ${product.minPitchDeg.toFixed(1)}° minimum for ${product.label.toLowerCase()}${product.approx ? ' (approximate)' : ''}.`,
    );
  }
  const supportsPurlins =
    product.support === ROOF_COVERING_SUPPORTS.PURLINS || product.support === ROOF_COVERING_SUPPORTS.BATTENS;
  const purlins = trussSystem?.purlinSystem;
  if (supportsPurlins && purlins?.enabled && Number(purlins.spacing) > product.maxSupportSpacing.internal) {
    warnings.push(
      `Purlins at ${Math.round(purlins.spacing)} mm exceed the ${product.maxSupportSpacing.internal} mm internal span this covering allows.`,
    );
  }
  // Frame spacing is a tile-roof rule (spec §5.4): tiles and slate hang their
  // battens straight off the trusses, while a sheet roof spans purlins and the
  // purlin check above already covers it.
  if (trussSystem && product.support === ROOF_COVERING_SUPPORTS.BATTENS) {
    const spacing = Math.max(0, ...(trussSystem.trussInstances || []).map((instance) => Number(instance.spacing) || 0));
    if (spacing > product.maxTrussSpacing) {
      warnings.push(
        `Trusses at ${Math.round(spacing)} mm exceed the ${product.maxTrussSpacing} mm this covering allows.`,
      );
    }
  }
  return warnings;
}

/**
 * The roof's covering: what it is clad in, in which colour, and what the
 * catalogue says about it. Editable fields write the whole `covering` object
 * through ROOF_UPDATE; everything the catalogue or the geometry decides is a
 * Readout.
 */
export function RoofCoveringSection({ project, roofSystem, updateRoof, u }) {
  const roofType = roofSystem.roofType || 'flat';
  const covering = normalizeRoofCovering(roofSystem.covering, roofType, roofSystem.slabThickness);
  const product = resolveRoofCoveringProduct(covering);
  const roofGeometry = useMemo(() => buildRoofPlaneGeometry(roofSystem), [roofSystem]);
  const schedule = useMemo(() => buildRoofScheduleSummary(roofSystem), [roofSystem]);
  const trussSystem = roofSystem.trussAttachmentId
    ? getProjectTrussSystem(project, roofSystem.trussAttachmentId)
    : null;
  const slopePercent = governingSlopePercent(roofSystem, roofGeometry);
  const suggested = suggestRoofBuildUp(covering, roofSystem.slabThickness);
  const sa = covering.colour.solarAbsorptance;
  const saClass = solarAbsorptanceClass(sa);
  const massPerM2 = covering.kind === 'concrete_slab' ? 2.4 * (roofSystem.slabThickness || 0) : product.massKgM2;
  const areaM2 = schedule.netSurfaceArea / 1_000_000;
  const sheets = covering.kind.startsWith('metal_') ? estimateSheets(roofGeometry, covering.coverWidth) : null;
  const warnings = coveringWarnings({ product, slopePercent, trussSystem });
  const setCovering = (next) => updateRoof({ covering: next });

  return (
    <Section
      id="roof-covering"
      title="Covering"
      summary={`${ROOF_COVERING_KIND_LABELS[covering.kind]} · ${covering.colour.name}`}
    >
      <SelectField label="Kind" value={covering.kind} onChange={(kind) => setCovering(coveringForKind(covering, kind))}>
        {ROOF_COVERING_KINDS.map((kind) => (
          <option key={kind} value={kind}>
            {ROOF_COVERING_KIND_LABELS[kind]}
          </option>
        ))}
      </SelectField>
      <SelectField
        label="Product"
        value={covering.productId}
        onChange={(productId) => setCovering(coveringForProduct(covering, productId))}
      >
        <option value="">Generic</option>
        {getRoofCoveringProducts(covering.kind).map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.approx ? `${entry.label} (≈)` : entry.label}
          </option>
        ))}
      </SelectField>
      {covering.kind !== 'concrete_slab' && covering.kind !== 'membrane' ? (
        <>
          <NumberField
            label={covering.kind.startsWith('metal_') ? 'Cover width' : 'Gauge'}
            unit={u.suffix}
            step={u.step(1)}
            value={u.toDisplay(covering.coverWidth)}
            onChange={(value) => setCovering({ ...covering, coverWidth: Math.max(1, u.fromDisplay(value)) })}
          />
          <NumberField
            label={covering.kind.startsWith('metal_') ? 'Rib height' : 'Tile thickness'}
            unit={u.suffix}
            step={u.step(1)}
            value={u.toDisplay(covering.ribHeight)}
            onChange={(value) => setCovering({ ...covering, ribHeight: Math.max(0, u.fromDisplay(value)) })}
          />
        </>
      ) : null}
      <NumberField
        label="Build-up"
        unit={u.suffix}
        step={u.step(1)}
        value={u.toDisplay(covering.thickness)}
        onChange={(value) => setCovering({ ...covering, thickness: Math.max(0, u.fromDisplay(value)) })}
      />
      <Readout label="Suggested body" value={u.toDisplay(suggested)} unit={u.suffix} />
      <Stack>
        <button
          type="button"
          className={styles.actionBtn}
          disabled={Math.abs((roofSystem.slabThickness || 0) - suggested) < 0.5}
          onClick={() => updateRoof({ slabThickness: suggested })}
          title="Set the roof body thickness drawn in 3D and cut in section to the build-up this covering suggests"
        >
          Use suggested
        </button>
      </Stack>
      <SelectField label="Finish" value={covering.finish} onChange={(finish) => setCovering({ ...covering, finish })}>
        {ROOF_COVERING_FINISHES.filter((finish) => finish !== 'unpainted' || covering.kind.startsWith('metal_')).map(
          (finish) => (
            <option key={finish} value={finish}>
              {ROOF_COVERING_FINISH_LABELS[finish]}
            </option>
          ),
        )}
      </SelectField>
      <ColourField
        id="roof-covering-colour"
        label="Colour"
        value={covering.colour}
        catalogues={SWATCH_CATALOGUES}
        onChange={(colour) => setCovering({ ...covering, colour })}
      />
      <Readout label={roofType === 'flat' ? 'Fall' : 'Pitch'} value={formatSlopeReadout(slopePercent)} />
      <Readout
        label="Solar abs."
        value={Number.isFinite(sa) ? `${sa.toFixed(2)} · ${saClass}` : '—'}
        muted={!Number.isFinite(sa)}
      />
      <Readout
        label="Mass"
        value={approx(
          product,
          `${Math.round(massPerM2 * 10) / 10} kg/m² · ${((massPerM2 * areaM2) / 1000).toFixed(2)} t`,
        )}
      />
      {sheets ? (
        <Readout label="Sheets" value={`≈ ${sheets.count} sheets · ${(sheets.longest / 1000).toFixed(2)} m`} />
      ) : null}
      <Readout
        label="Min pitch"
        value={approx(
          product,
          `${product.minPitchDeg.toFixed(1)}°${
            Number.isFinite(product.minPitchDegAlt)
              ? ` (${product.minPitchDegAlt.toFixed(1)}° ${product.minPitchAltNote})`
              : ''
          }`,
        )}
      />
      {product.support !== ROOF_COVERING_SUPPORTS.STRUCTURE && product.support !== ROOF_COVERING_SUPPORTS.DECK ? (
        <Readout
          label={product.support === ROOF_COVERING_SUPPORTS.BATTENS ? 'Batten gauge' : 'Max purlin'}
          value={approx(product, `${product.maxSupportSpacing.internal}`)}
          unit="mm"
        />
      ) : null}
      {warnings.map((warning) => (
        <Status key={warning} tone="warning">
          {warning}
        </Status>
      ))}
    </Section>
  );
}

function TrimToggle({ label, checked, onChange }) {
  return (
    <Field label={label}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        aria-label={label}
      />
    </Field>
  );
}

/**
 * The roof-edge kit. Each trim is a switch with its sizes shown while it is
 * on; the whole `trims` object is written back on every change.
 */
export function RoofTrimsSection({ roofSystem, updateRoof, u }) {
  const roofType = roofSystem.roofType || 'flat';
  const trims = normalizeRoofTrims(roofSystem.trims, roofType);
  const setTrims = (next) => updateRoof({ trims: next });
  const setPart = (key, changes) => setTrims({ ...trims, [key]: { ...trims[key], ...changes } });
  const lengthField = (key, field, label, min = 0) => (
    <NumberField
      key={`${key}-${field}`}
      label={label}
      unit={u.suffix}
      step={u.step(5)}
      value={u.toDisplay(trims[key][field])}
      onChange={(value) => setPart(key, { [field]: Math.max(min, u.fromDisplay(value)) })}
    />
  );

  return (
    <Section id="roof-trims" title="Edges & trims" summary={describeRoofTrims(roofSystem)} defaultOpen={false}>
      {roofType === 'flat' ? (
        <Hint>Flat roofs finish at their parapets, so the edge kit is not drawn on them.</Hint>
      ) : null}
      <ColourField
        id="roof-trim-colour"
        label="Trim colour"
        value={trims.colour}
        catalogues={SWATCH_CATALOGUES}
        onChange={(colour) => setTrims({ ...trims, colour })}
      />
      <TrimToggle
        label="Fascia"
        checked={trims.fascia.enabled}
        onChange={(enabled) => setPart('fascia', { enabled })}
      />
      {trims.fascia.enabled ? (
        <>
          {lengthField('fascia', 'depth', 'Depth', 1)}
          {lengthField('fascia', 'thickness', 'Thickness', 1)}
          {lengthField('fascia', 'drop', 'Drop')}
        </>
      ) : null}
      <TrimToggle label="Barge" checked={trims.barge.enabled} onChange={(enabled) => setPart('barge', { enabled })} />
      {trims.barge.enabled ? (
        <>
          {lengthField('barge', 'depth', 'Depth', 1)}
          {lengthField('barge', 'thickness', 'Thickness', 1)}
        </>
      ) : null}
      <TrimToggle
        label="Gutter"
        checked={trims.gutter.enabled}
        onChange={(enabled) => setPart('gutter', { enabled })}
      />
      {trims.gutter.enabled ? (
        <>
          <SelectField
            label="Profile"
            value={trims.gutter.profile}
            onChange={(profile) => {
              const preset = ROOF_GUTTER_PROFILES[profile];
              setPart('gutter', {
                profile,
                ...(preset && preset.width > 0 ? { width: preset.width, depth: preset.depth } : {}),
              });
            }}
          >
            {Object.entries(ROOF_GUTTER_PROFILES).map(([key, preset]) => (
              <option key={key} value={key}>
                {preset.label}
              </option>
            ))}
          </SelectField>
          {lengthField('gutter', 'width', 'Width', 1)}
          {lengthField('gutter', 'depth', 'Depth', 1)}
        </>
      ) : null}
      <TrimToggle
        label="Downpipes"
        checked={trims.downpipes.enabled}
        onChange={(enabled) => setPart('downpipes', { enabled })}
      />
      {trims.downpipes.enabled ? (
        <>
          {lengthField('downpipes', 'diameter', 'Diameter', 1)}
          {lengthField('downpipes', 'maxSpacing', 'Max spacing', 1000)}
        </>
      ) : null}
      <TrimToggle
        label="Ridge cap"
        checked={trims.ridgeCap.enabled}
        onChange={(enabled) => setPart('ridgeCap', { enabled })}
      />
      {trims.ridgeCap.enabled ? lengthField('ridgeCap', 'girth', 'Girth', 1) : null}
      <TrimToggle
        label="Barge cap"
        checked={trims.bargeCap.enabled}
        onChange={(enabled) => setPart('bargeCap', { enabled })}
      />
      {trims.bargeCap.enabled ? lengthField('bargeCap', 'girth', 'Girth', 1) : null}
      <SelectField label="Soffit" value={trims.soffit.mode} onChange={(mode) => setPart('soffit', { mode })}>
        {ROOF_SOFFIT_MODES.map((mode) => (
          <option key={mode} value={mode}>
            {SOFFIT_MODE_LABELS[mode]}
          </option>
        ))}
      </SelectField>
      {trims.soffit.mode !== 'open' ? (
        <>
          {lengthField('soffit', 'thickness', 'Lining', 1)}
          <ColourField
            id="roof-soffit-colour"
            label="Soffit colour"
            value={trims.soffit.colour}
            catalogues={SWATCH_CATALOGUES}
            onChange={(colour) => setPart('soffit', { colour })}
          />
        </>
      ) : null}
      <Hint>
        Ridge and barge capping take the covering colour; fascia, barge, gutter and downpipes share the trim colour.
      </Hint>
    </Section>
  );
}

/** Both sections on the shared gutter, for RoofSystemProperties to drop in. */
export default function RoofCoveringSections(props) {
  return (
    <div className={panelKitStyles.gutter}>
      <RoofCoveringSection {...props} />
      <RoofTrimsSection {...props} />
    </div>
  );
}
