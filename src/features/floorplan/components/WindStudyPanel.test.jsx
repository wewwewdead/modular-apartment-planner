import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createWindStudyState } from '@/analysis/windState';
import { siteExposure } from '@/analysis/windExposure';
import WindStudyPanel, { parseRose, roseToText } from './WindStudyPanel';
import { SCREENING_CLAIMS, screeningClaims, screeningParagraphs } from './ScreeningDisclaimer';

function render(overrides = {}) {
  return renderToStaticMarkup(
    <WindStudyPanel
      windStudy={createWindStudyState()}
      study={null}
      status="idle"
      progress={null}
      error={null}
      stale={false}
      climate={null}
      onPatch={() => {}}
      onToggle={() => {}}
      {...overrides}
    />,
  );
}

describe('WindStudyPanel', () => {
  it('is a separate discoverable analysis panel', () => {
    const markup = render();
    expect(markup).toContain('data-panel="wind-study"');
    expect(markup).toContain('Pedestrian Wind');
    expect(markup).toContain('run separately from solar studies');
  });

  it('shows directional controls and a visible amplification result', () => {
    const windStudy = createWindStudyState({ enabled: true, directionDeg: 90 });
    const markup = render({
      windStudy,
      status: 'ready',
      study: {
        mode: 'direction',
        summary: {
          peakAmplification: 1.82,
          peakSpeed: 9.1,
          acceleratedFraction: 0.2,
          shelteredFraction: 0.35,
        },
      },
    });
    expect(markup).toContain('Wind from');
    expect(markup).toContain('1.82×');
    expect(markup).toContain('9.1 m/s');
  });

  it('warns when comfort mode still uses an illustrative rose', () => {
    const markup = render({ windStudy: createWindStudyState({ enabled: true, mode: 'comfort' }) });
    expect(markup).toContain('Illustrative uniform wind rose');
    expect(markup).toContain('set a site location');
  });

  it('shows the linked coordinates and location-backed climate provenance', () => {
    const windStudy = createWindStudyState({
      enabled: true,
      mode: 'comfort',
      directionDeg: 22.5,
      referenceSpeed: 4.2,
      windRoseSource: 'site-climate',
      windClimate: { period: '2021–2025', sampleCount: 43824, locationKey: '10.3200|123.8900' },
    });
    const markup = render({
      windStudy,
      climate: {
        status: 'ready',
        site: { latitude: 10.32, longitude: 123.89 },
        sourceUrl: 'https://open-meteo.com',
        offlineReady: true,
        activate: () => {},
        refresh: () => {},
      },
    });
    expect(markup).toContain('10.32°N');
    expect(markup).toContain('123.89°E');
    expect(markup).toContain('2021–2025 reanalysis');
    expect(markup).toContain('prevailing NNE at');
    expect(markup).toContain('4.2 m/s');
    expect(markup).toContain('location-backed Weibull sectors');
    expect(markup).toContain('available offline');
    expect(markup).toContain('Refresh online');
  });

  /**
   * Plan amendment 18. Climate metadata reaches this panel from a project file
   * or from localStorage, both hand-editable. `@/analysis/windClimate`
   * allowlists it on the way in; the panel's side of the contract is that it
   * only ever renders those values as text — asserted in the DOM by
   * `WindStudyPanel.dom.test.jsx`, and at the source level here, where it is
   * cheap enough to be worth pinning.
   */
  it('renders no raw HTML and links only the source URL the hook supplies', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const source = readFileSync(fileURLToPath(new URL('./WindStudyPanel.jsx', import.meta.url)), 'utf8');
    expect(source).not.toContain('dangerouslySetInnerHTML');
    // One href in the whole panel, and it is the module constant the hook
    // passes through — never a string that came out of a project file.
    expect(source.match(/href=\{[^}]*\}/g)).toEqual(['href={climate.sourceUrl}']);
  });

  it('shows the updated-climate notice as a plain status line', () => {
    const markup = render({
      windStudy: createWindStudyState({
        enabled: true,
        windRoseSource: 'site-climate',
        windClimate: { period: '2021–2025', sampleCount: 43824 },
      }),
      climate: { status: 'ready', site: { latitude: 10.32, longitude: 123.89 }, updated: true, sourceUrl: '#' },
    });
    expect(markup).toContain('Climate data updated since this project was saved');
    expect(markup).toContain('data-climate-notice="updated"');
  });

  it('parses and formats wind-rose Weibull sectors', () => {
    const parsed = parseRose('0, 60, 2, 5\n180, 40, 1.8, 6');
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({ directionDeg: 0, frequency: 0.6, weibullK: 2, weibullC: 5 });
    expect(roseToText(parsed)).toContain('180');
    expect(parseRose('north, often, 0, 5')).toBeNull();
  });

  it('leads the room list with the bulk air-speed index and keeps ACH beside it', () => {
    const markup = render({
      windStudy: createWindStudyState({ enabled: true }),
      status: 'ready',
      study: {
        mode: 'direction',
        summary: {
          peakAmplification: 1.2,
          peakSpeed: 6,
          acceleratedFraction: 0.1,
          shelteredFraction: 0.2,
        },
        ventilation: {
          summary: {
            meanAirChangesPerHour: 2.4,
            maxAirChangesPerHour: 3.1,
            crossVentilatedRoomCount: 1,
            stagnantRoomCount: 0,
            openExteriorCount: 2,
          },
          rooms: [
            {
              id: 'living',
              name: 'Living room',
              pressurePa: 1.2,
              crossVentilated: true,
              airChangesPerHour: 2.4,
              airSpeedMs: 0.12,
              airSpeedBand: { lowMs: 0.06, highMs: 0.18, fraction: 0.5 },
            },
          ],
        },
      },
    });
    expect(markup).toContain('Room airflow network');
    expect(markup).toContain('0.12 m/s');
    expect(markup).toContain('0.06–0.18 m/s');
    expect(markup).toContain('2.4 ACH');
    expect(markup).toContain('Cross-flow');
    expect(markup).toContain('not a code pass/fail');
  });
});

/* -------------------------------------------------------------------------- */
/* The screening disclaimer, now generated from flags                          */
/* -------------------------------------------------------------------------- */

/**
 * Direction-mode models shaped exactly as `windRunner.js` / `ventilationNetwork.js`
 * stamp them. The claim assertions below read the GENERATOR's output, not the
 * panel source: the golden-string pin these replace could only ever say the
 * prose had not been retyped, and it went on passing while the prose said "no
 * atmospheric boundary layer" would have stayed true.
 */
function studyModel(overrides = {}) {
  return {
    kind: 'D2Q9-BGK-2D',
    screeningOnly: true,
    exposure: siteExposure({ exposureClass: 'suburban', sliceHeightMm: 1500 }),
    convergence: 'screening-450',
    phaseScope: { activePhaseId: null, phaseViewMode: 'all' },
    ...overrides,
  };
}

function ventilationModel(overrides = {}) {
  return {
    kind: 'wind-pressure-multizone',
    screeningOnly: true,
    pressureHeightModel: 'uniform-from-outdoor-slice',
    includesStackEffect: false,
    includesThermalBuoyancy: false,
    includesIndoorMomentum: false,
    cpFallbackCount: 0,
    cpFallbackModel: 'swami-chandra-1988',
    verticalCoupling: false,
    cpSliceHeightMm: 1500,
    cpSampledFloorIds: ['floor_1'],
    cpExtrapolatedCount: 0,
    includesRoomAirSpeed: true,
    airSpeedMethod: 'bulk-cross-section',
    ...overrides,
  };
}

function disclaimerText(overrides = {}) {
  return screeningParagraphs({ model: studyModel(), ventilationModel: ventilationModel(), ...overrides })
    .map((paragraph) => paragraph.text)
    .join(' ');
}

/**
 * The 24 claims the hand-written paragraph made, each still asserted on its own
 * so the rewrite had to account for every one individually.
 *
 * Twenty-three survive verbatim. The one that changed is marked: T11 applies a
 * power-law boundary-layer transformation, so "no atmospheric boundary layer"
 * became false and had to be reworded rather than deleted.
 */
describe('screening disclaimer — the claims the hand-written paragraph made', () => {
  it('claims the whole thing is a screening model only', () => {
    expect(disclaimerText()).toContain('Screening model only');
  });

  it('claims the location climate is regional 10 m reanalysis', () => {
    expect(disclaimerText()).toContain('location climate is regional 10 m reanalysis');
  });

  it('claims the climate is not an on-site anemometer record', () => {
    expect(disclaimerText()).toContain('not an on-site anemometer record');
  });

  it('claims the flow model is a steady 2D pedestrian slice', () => {
    expect(disclaimerText()).toContain('flow model is a steady 2D pedestrian slice');
  });

  it('claims there is no vertical flow', () => {
    expect(disclaimerText()).toContain('with no vertical flow');
  });

  it('REWORDED: the atmospheric boundary layer is now applied, not excluded', () => {
    // Was: "...with no vertical flow, atmospheric boundary layer, terrain...".
    // T11 makes that false — the 10 m speed is transformed to slice height by a
    // power-law ABL profile. The claim survives as a statement of WHAT is
    // applied and what is still missing, and the negative form must be gone.
    const text = disclaimerText();
    expect(text).toContain('atmospheric boundary layer');
    expect(text).toContain('power-law atmospheric boundary layer profile');
    expect(text).not.toContain('no vertical flow, atmospheric boundary layer');
    expect(text).toContain('the solver itself is fed a uniform inlet');
  });

  it('claims terrain is excluded', () => {
    expect(disclaimerText()).toContain('terrain');
    // Still true of the SOLVER, which is what the original claim was about.
    expect(disclaimerText()).toContain('no sheared profile, terrain height or surface roughness inside the domain');
  });

  it('claims thermal buoyancy is excluded from the flow model', () => {
    expect(disclaimerText()).toContain('thermal buoyancy');
  });

  it('claims transient gusts are excluded', () => {
    expect(disclaimerText()).toContain('transient gusts');
  });

  it('claims there is no RANS/LES turbulence closure', () => {
    expect(disclaimerText()).toContain('RANS/LES turbulence closure');
  });

  it('claims comfort colours use the modified City Lawson criteria', () => {
    expect(disclaimerText()).toContain('Comfort colours use the modified City Lawson');
  });

  it('claims the comfort thresholds are 2.5 / 4 / 6 / 8 m/s', () => {
    expect(disclaimerText()).toContain('2.5 / 4 / 6 / 8 m/s thresholds');
  });

  it('claims the comfort thresholds are evaluated at 5% exceedance', () => {
    expect(disclaimerText()).toContain('at 5% exceedance');
  });

  it('claims safety flags trigger above 15 m/s', () => {
    expect(disclaimerText()).toContain('safety flags exceed 15 m/s');
  });

  it('claims the safety threshold is evaluated at 0.022% exceedance', () => {
    expect(disclaimerText()).toContain('at 0.022% exceedance');
  });

  it('claims room airflow is a steady pressure-network calculation', () => {
    expect(disclaimerText()).toContain('Room airflow is a steady pressure-network calculation');
  });

  it('claims room airflow uses the configured opening fractions', () => {
    expect(disclaimerText()).toContain('using configured opening fractions');
  });

  it('claims the facade pressure is height-uniform and taken from the outdoor slice', () => {
    expect(disclaimerText()).toContain('height-uniform façade pressure from the outdoor slice');
  });

  it('claims room airflow excludes leakage', () => {
    expect(disclaimerText()).toContain('it excludes leakage');
  });

  it('claims room airflow excludes stack effect', () => {
    expect(disclaimerText()).toContain('stack effect');
  });

  it('claims room airflow excludes fans', () => {
    expect(disclaimerText()).toContain('fans');
  });

  it('claims room airflow excludes ducts', () => {
    expect(disclaimerText()).toContain('ducts');
  });

  it('claims room airflow excludes indoor velocity detail', () => {
    // Still true, and now doubly load-bearing: T10 reports a bulk index, which
    // is exactly NOT velocity detail, and the next claim says so.
    expect(disclaimerText()).toContain('indoor velocity detail');
  });

  it('claims the study is not a wind-engineering certification', () => {
    expect(disclaimerText()).toContain('This is not a wind-engineering certification.');
  });
});

describe('screening disclaimer — claims the new flags add', () => {
  it('states the exposure class, exponent and factor it applied', () => {
    const text = disclaimerText({
      model: studyModel({ exposure: siteExposure({ exposureClass: 'dense-urban', sliceHeightMm: 1500 }) }),
    });
    expect(text).toContain('dense-urban power-law atmospheric boundary layer profile');
    expect(text).toContain('α 0.33');
    expect(text).toContain('×0.535');
    expect(text).toContain('1.5 m analysis slice');
  });

  it('states the iteration budget the outdoor field was given', () => {
    expect(disclaimerText()).toContain('fixed screening budget of 450 lattice iterations (screening-450)');
    expect(disclaimerText()).toContain('not necessarily a converged solution');
    expect(disclaimerText({ model: studyModel({ convergence: 'screening-3000' }) })).toContain(
      'budget of 3000 lattice iterations',
    );
  });

  it('says storeys are not vertically coupled', () => {
    expect(disclaimerText()).toContain('Storeys are solved as separate networks');
    expect(disclaimerText()).toContain('stair, shaft and atrium flow is absent');
  });

  it('names the Cp slice and how many floors sampled it', () => {
    expect(disclaimerText()).toContain('one 1.5 m horizontal slice, sampled by 1 floor');
    expect(disclaimerText({ ventilationModel: ventilationModel({ cpSampledFloorIds: ['a', 'b'] }) })).toContain(
      'sampled by 2 floors',
    );
    expect(disclaimerText({ ventilationModel: ventilationModel({ cpSampledFloorIds: [] }) })).toContain(
      'which no opening sampled successfully',
    );
  });

  it('discloses extrapolated openings only when there are some', () => {
    expect(disclaimerText()).not.toContain('extrapolated coefficient');
    const text = disclaimerText({ ventilationModel: ventilationModel({ cpExtrapolatedCount: 3 }) });
    expect(text).toContain('3 openings sit more than a storey from that slice and carry extrapolated coefficients');
    expect(text).toContain('never saw the flow at that height');
    expect(disclaimerText({ ventilationModel: ventilationModel({ cpExtrapolatedCount: 1 }) })).toContain(
      '1 opening sits more than a storey from that slice and carries an extrapolated coefficient',
    );
  });

  it('discloses the correlation fallback only when it was used, and names the model', () => {
    expect(disclaimerText()).not.toContain('failed the solved-field sanity test');
    const text = disclaimerText({ ventilationModel: ventilationModel({ cpFallbackCount: 2 }) });
    expect(text).toContain('2 exterior openings failed the solved-field sanity test');
    expect(text).toContain('swami-chandra-1988 correlation');
  });

  it('says the room air speed is a bulk index with a fixed band, not a felt velocity', () => {
    const text = disclaimerText();
    expect(text).toContain('Room air speed is a bulk movement index');
    expect(text).toContain("through-flow divided by the room's flow-normal cross-section, ±50%");
    expect(text).toContain('not an occupied-zone velocity');
    expect(text).toContain('no inlet jet, no decay, no local velocity field');
  });

  it('names the phase scope only when the view was filtered', () => {
    expect(disclaimerText()).not.toContain('phase view');
    const text = disclaimerText({
      model: studyModel({ phaseScope: { activePhaseId: 'phase_new', phaseViewMode: 'single' } }),
    });
    expect(text).toContain('“single” phase view for phase phase_new only');
    expect(text).toContain('walls and openings alike');
    // A cumulative view with no active phase still hides nothing named, but it
    // is a filtered view and has to say so.
    expect(disclaimerText({ model: studyModel({ phaseScope: { phaseViewMode: 'cumulative' } }) })).toContain(
      '“cumulative” phase view only',
    );
  });
});

describe('screening disclaimer — completeness', () => {
  const NAMESPACES = { study: studyModel(), ventilation: ventilationModel() };

  it('has a sentence for every flag the models carry', () => {
    const covered = new Set(SCREENING_CLAIMS.flatMap((spec) => spec.flags));
    const uncovered = [];
    for (const [namespace, model] of Object.entries(NAMESPACES)) {
      for (const key of Object.keys(model)) {
        if (!covered.has(`${namespace}.${key}`)) uncovered.push(`${namespace}.${key}`);
      }
    }
    expect(uncovered).toEqual([]);
  });

  it('has no orphan sentence claiming a flag the models do not carry', () => {
    const present = new Set(
      Object.entries(NAMESPACES).flatMap(([namespace, model]) =>
        Object.keys(model).map((key) => `${namespace}.${key}`),
      ),
    );
    const orphans = SCREENING_CLAIMS.flatMap((spec) => spec.flags).filter((flag) => !present.has(flag));
    expect(orphans).toEqual([]);
  });

  it('sources the Lawson numbers from windComfort.js rather than retyping them', async () => {
    const { COMFORT_EXCEEDANCE, SAFETY_EXCEEDANCE, WIND_COMFORT_CATEGORIES, WIND_SAFETY_SPEED } =
      await import('@/analysis/windComfort');
    const text = disclaimerText();
    for (const category of WIND_COMFORT_CATEGORIES) {
      if (!Number.isFinite(category.maximumSpeed)) continue;
      expect(text, String(category.maximumSpeed)).toContain(String(category.maximumSpeed));
    }
    expect(text).toContain(`${WIND_SAFETY_SPEED} m/s`);
    expect(text).toContain(`${COMFORT_EXCEEDANCE * 100}% exceedance`);
    // 0.00022 * 100 is 0.022000000000000002 in binary floating point; the
    // generator has to print 0.022 without inventing the digits.
    expect(text).toContain('0.022% exceedance');
    expect(SAFETY_EXCEEDANCE).toBe(0.00022);
  });

  it('is emitted with two claims per flagless permanent property, and no duplicates', () => {
    const ids = screeningClaims({ model: studyModel(), ventilationModel: ventilationModel() }).map((claim) => claim.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('lawson-criteria');
    expect(ids).toContain('not-a-certification');
    expect(SCREENING_CLAIMS.filter((spec) => spec.flags.length === 0).map((spec) => spec.id)).toEqual([
      'lawson-criteria',
      'not-a-certification',
    ]);
  });

  it('still states every permanent caveat before any run has landed', () => {
    // The advanced section renders with `study` null; the model-level claims
    // must survive that, and only the run-specific ones drop out.
    const ids = screeningClaims({}).map((claim) => claim.id);
    expect(ids).toEqual(['screening-only', 'flow-model', 'lawson-criteria', 'network-basis', 'not-a-certification']);
    expect(screeningParagraphs({})[0].text).toMatch(/^Screening model only/);
  });

  it('drops the airflow disclosures in comfort mode, where there is no network', () => {
    const ids = screeningClaims({ model: studyModel() }).map((claim) => claim.id);
    expect(ids).not.toContain('vertical-coupling');
    expect(ids).not.toContain('cp-slice');
    expect(ids).not.toContain('room-air-speed');
    expect(ids).toContain('exposure-transform');
    expect(ids).toContain('convergence-budget');
  });
});

describe('WindStudyPanel disclaimer placement (characterization)', () => {
  it('pins that the disclaimer is not rendered until the advanced section is opened', () => {
    // characterization: pins current behaviour; see T2. Every caveat above is
    // one click deep. The default panel render carries none of it.
    const markup = render({ windStudy: createWindStudyState({ enabled: true }) });
    expect(markup).not.toContain('Screening model only');
    expect(markup).not.toContain('wind-engineering certification');
    expect(markup).toContain('Solver &amp; wind rose');
  });
});
