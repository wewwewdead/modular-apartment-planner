/**
 * The one place a wind/airflow screening result explains its own limits.
 *
 * ## Why this is generated rather than written
 *
 * The paragraph this replaces was prose. Prose drifts: it went on saying "no
 * atmospheric boundary layer" for as long as nobody remembered to reopen it,
 * and it would have gone on saying so after the exposure transform landed. Here
 * every sentence is bound to a FLAG on the result's model object, and a
 * completeness test walks both directions — a flag with no sentence fails, a
 * sentence claiming a flag the model does not carry fails. Adding a model flag
 * therefore forces someone to say what it means.
 *
 * Where a claim's content already exists in code, the constant is imported
 * rather than retyped: the Lawson thresholds come from `windComfort.js` and the
 * air-speed band from `roomAirSpeed.js`, so the disclaimer cannot state a number
 * the implementation does not use.
 *
 * ## Sentences with no flag
 *
 * A few claims are properties of the tool rather than of a run — the Lawson
 * criteria, and the refusal to be read as a certification. They declare no
 * flags, which is how the completeness test tells them apart from an orphan.
 *
 * ## Before the first result
 *
 * `model` and `ventilationModel` are absent until a run lands, and the caveats
 * still have to be reachable. Specs marked `always` render their permanent
 * prose regardless; the ones that quote a run's own numbers stay quiet until
 * there are numbers to quote.
 */

import { ROOM_AIR_SPEED_BAND_FRACTION } from '@/analysis/roomAirSpeed';
import { CLIMATE_REFERENCE_HEIGHT_M } from '@/analysis/windExposure';
import {
  COMFORT_EXCEEDANCE,
  SAFETY_EXCEEDANCE,
  WIND_COMFORT_CATEGORIES,
  WIND_SAFETY_SPEED,
} from '@/analysis/windComfort';
import styles from './ScreeningDisclaimer.module.css';

/** Trim binary-float noise without inventing precision: 0.00022*100 is not 0.022. */
function decimal(value, significant = 6) {
  return String(Number(Number(value).toPrecision(significant)));
}

function percent(fraction) {
  return `${decimal(fraction * 100)}%`;
}

function plural(count, singular, many = `${singular}s`) {
  return count === 1 ? singular : many;
}

const COMFORT_THRESHOLDS = WIND_COMFORT_CATEGORIES.filter((category) => Number.isFinite(category.maximumSpeed))
  .map((category) => decimal(category.maximumSpeed))
  .join(' / ');

/**
 * Every claim the disclaimer can make.
 *
 * `flags` names the model fields the sentence is accountable to, namespaced by
 * which model they live on. `text` returns the sentence, or null to stay quiet.
 */
export const SCREENING_CLAIMS = Object.freeze([
  {
    id: 'screening-only',
    group: 'provenance',
    flags: ['study.screeningOnly'],
    always: true,
    text: () =>
      `Screening model only: location climate is regional ${CLIMATE_REFERENCE_HEIGHT_M} m reanalysis, not an on-site anemometer record.`,
  },
  {
    id: 'exposure-transform',
    group: 'provenance',
    flags: ['study.exposure'],
    text: ({ model }) => {
      const exposure = model?.exposure;
      if (!exposure) return null;
      return (
        `That ${decimal(exposure.referenceHeightM)} m speed reaches the ${decimal(exposure.sliceHeightM)} m analysis ` +
        `slice through a ${exposure.class} power-law atmospheric boundary layer profile ` +
        `(α ${decimal(exposure.alpha)}, ×${decimal(exposure.factor, 3)}); the solver itself is fed a uniform inlet, ` +
        `with no sheared profile, terrain height or surface roughness inside the domain.`
      );
    },
  },
  {
    id: 'flow-model',
    group: 'flow',
    flags: ['study.kind'],
    always: true,
    text: () =>
      'The flow model is a steady 2D pedestrian slice with no vertical flow, thermal buoyancy, transient gusts, or RANS/LES turbulence closure.',
  },
  {
    id: 'convergence-budget',
    group: 'flow',
    flags: ['study.convergence'],
    text: ({ model }) => {
      const budget = model?.convergence;
      if (!budget) return null;
      const iterations = String(budget).split('-').pop();
      return `The outdoor field runs to a fixed screening budget of ${iterations} lattice iterations (${budget}), so it is not necessarily a converged solution; the residual it reached is reported with the run.`;
    },
  },
  {
    id: 'phase-scope',
    group: 'flow',
    flags: ['study.phaseScope'],
    text: ({ model }) => {
      const scope = model?.phaseScope;
      if (!scope || (scope.phaseViewMode === 'all' && !scope.activePhaseId)) return null;
      const phase = scope.activePhaseId ? ` for phase ${scope.activePhaseId}` : '';
      return `This run covers the “${scope.phaseViewMode}” phase view${phase} only: anything that view hides was absent from the model, walls and openings alike.`;
    },
  },
  {
    id: 'lawson-criteria',
    group: 'comfort',
    flags: [],
    always: true,
    text: () =>
      `Comfort colours use the modified City Lawson ${COMFORT_THRESHOLDS} m/s thresholds at ${percent(COMFORT_EXCEEDANCE)} exceedance; safety flags exceed ${decimal(WIND_SAFETY_SPEED)} m/s at ${percent(SAFETY_EXCEEDANCE)} exceedance.`,
  },
  {
    id: 'network-basis',
    group: 'airflow',
    flags: [
      'ventilation.kind',
      'ventilation.screeningOnly',
      'ventilation.pressureHeightModel',
      'ventilation.includesStackEffect',
      'ventilation.includesThermalBuoyancy',
      'ventilation.includesIndoorMomentum',
    ],
    always: true,
    text: () =>
      'Room airflow is a steady pressure-network calculation using configured opening fractions and a height-uniform façade pressure from the outdoor slice; it excludes leakage, stack effect, fans, ducts, and indoor velocity detail.',
  },
  {
    id: 'vertical-coupling',
    group: 'airflow',
    flags: ['ventilation.verticalCoupling'],
    text: ({ ventilationModel }) =>
      ventilationModel && ventilationModel.verticalCoupling === false
        ? 'Storeys are solved as separate networks: no opening connects two floors, so stair, shaft and atrium flow is absent entirely.'
        : null,
  },
  {
    id: 'cp-slice',
    group: 'airflow',
    flags: ['ventilation.cpSliceHeightMm', 'ventilation.cpSampledFloorIds'],
    text: ({ ventilationModel }) => {
      if (!ventilationModel || ventilationModel.cpSliceHeightMm == null) return null;
      const floors = ventilationModel.cpSampledFloorIds?.length ?? 0;
      const height = decimal(ventilationModel.cpSliceHeightMm / 1000);
      return floors
        ? `Façade pressure coefficients come from that one ${height} m horizontal slice, sampled by ${floors} ${plural(floors, 'floor')}.`
        : `Façade pressure coefficients come from that one ${height} m horizontal slice, which no opening sampled successfully.`;
    },
  },
  {
    id: 'cp-extrapolated',
    group: 'airflow',
    flags: ['ventilation.cpExtrapolatedCount'],
    text: ({ ventilationModel }) => {
      const count = ventilationModel?.cpExtrapolatedCount || 0;
      if (!count) return null;
      const carries = count === 1 ? 'carries an extrapolated coefficient' : 'carry extrapolated coefficients';
      return `${count} ${plural(count, 'opening')} ${count === 1 ? 'sits' : 'sit'} more than a storey from that slice and ${carries}: the solve never saw the flow at that height.`;
    },
  },
  {
    id: 'cp-fallback',
    group: 'airflow',
    flags: ['ventilation.cpFallbackCount', 'ventilation.cpFallbackModel'],
    text: ({ ventilationModel }) => {
      const count = ventilationModel?.cpFallbackCount || 0;
      if (!count) return null;
      const model = ventilationModel?.cpFallbackModel || 'an empirical correlation';
      return `${count} exterior ${plural(count, 'opening')} failed the solved-field sanity test and fell back to the ${model} correlation rather than this building's own field.`;
    },
  },
  {
    id: 'room-air-speed',
    group: 'airflow',
    flags: ['ventilation.airSpeedMethod', 'ventilation.includesRoomAirSpeed'],
    text: ({ ventilationModel }) => {
      if (!ventilationModel?.includesRoomAirSpeed) return null;
      return `Room air speed is a bulk movement index — through-flow divided by the room's flow-normal cross-section, ±${percent(ROOM_AIR_SPEED_BAND_FRACTION)} — and not an occupied-zone velocity: no inlet jet, no decay, no local velocity field.`;
    },
  },
  {
    id: 'not-a-certification',
    group: 'scope',
    flags: [],
    always: true,
    text: () => 'This is not a wind-engineering certification.',
  },
]);

const GROUP_ORDER = ['provenance', 'flow', 'comfort', 'airflow', 'scope'];

/**
 * The claims this pair of models actually supports, in render order.
 *
 * @param {{model?: object|null, ventilationModel?: object|null}} models
 * @returns {Array<{id: string, group: string, text: string}>}
 */
export function screeningClaims({ model = null, ventilationModel = null } = {}) {
  const context = { model, ventilationModel };
  const claims = [];
  for (const spec of SCREENING_CLAIMS) {
    const text = spec.text(context);
    if (!text) continue;
    claims.push({ id: spec.id, group: spec.group, text });
  }
  return claims.sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group));
}

/** One paragraph per group, in `GROUP_ORDER`. */
export function screeningParagraphs(models) {
  const paragraphs = [];
  for (const claim of screeningClaims(models)) {
    const last = paragraphs[paragraphs.length - 1];
    if (last?.group === claim.group) last.sentences.push(claim.text);
    else paragraphs.push({ group: claim.group, sentences: [claim.text] });
  }
  return paragraphs.map((paragraph) => ({ group: paragraph.group, text: paragraph.sentences.join(' ') }));
}

export default function ScreeningDisclaimer({ model = null, ventilationModel = null, className = '' }) {
  const paragraphs = screeningParagraphs({ model, ventilationModel });
  return (
    <div className={`${styles.disclaimer} ${className}`.trim()} data-screening-disclaimer="">
      {paragraphs.map((paragraph) => (
        <p key={paragraph.group} data-claim-group={paragraph.group}>
          {paragraph.text}
        </p>
      ))}
    </div>
  );
}
