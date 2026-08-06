import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createWindStudyState } from '@/analysis/windState';
import WindStudyPanel, { parseRose, roseToText } from './WindStudyPanel';

/**
 * The disclaimer lives behind the "Solver & wind rose" toggle, which is local
 * `useState` — `renderToStaticMarkup` never runs the click that opens it, so
 * the paragraph is not in the rendered markup.
 *
 * deferred to T18 (jsdom harness): assert the paragraph is REACHABLE — click
 * "Solver & wind rose" and read the rendered <p className={styles.disclaimer}>.
 * Until then the claims are pinned from source, with whitespace collapsed so a
 * Prettier re-wrap cannot break the pin.
 */
function disclaimerText() {
  const source = readFileSync(fileURLToPath(new URL('./WindStudyPanel.jsx', import.meta.url)), 'utf8');
  const match = source.match(/<p className={styles\.disclaimer}>([\s\S]*?)<\/p>/);
  if (!match) throw new Error('WindStudyPanel no longer has a styles.disclaimer paragraph.');
  return match[1].replace(/\s+/g, ' ').trim();
}

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

  it('parses and formats wind-rose Weibull sectors', () => {
    const parsed = parseRose('0, 60, 2, 5\n180, 40, 1.8, 6');
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({ directionDeg: 0, frequency: 0.6, weibullK: 2, weibullC: 5 });
    expect(roseToText(parsed)).toContain('180');
    expect(parseRose('north, often, 0, 5')).toBeNull();
  });

  it('shows the opening-network ACH and cross-flow result', () => {
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
            },
          ],
        },
      },
    });
    expect(markup).toContain('Room airflow network');
    expect(markup).toContain('2.4 ACH');
    expect(markup).toContain('Cross-flow');
    expect(markup).toContain('not a code pass/fail');
  });
});

/**
 * Characterization suite for the hand-written screening disclaimer. A later
 * task replaces this paragraph with text generated from the result's `model`
 * object; each claim below is asserted separately so that rewrite has to
 * account for every one of them individually rather than swapping the block
 * wholesale and losing a caveat by accident.
 */
describe('WindStudyPanel disclaimer claims (characterization)', () => {
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

  it('claims there is no atmospheric boundary layer', () => {
    expect(disclaimerText()).toContain('atmospheric boundary layer');
  });

  it('claims terrain is excluded', () => {
    expect(disclaimerText()).toContain('terrain');
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
    expect(disclaimerText()).toContain('indoor velocity detail');
  });

  it('claims the study is not a wind-engineering certification', () => {
    expect(disclaimerText()).toContain('This is not a wind-engineering certification.');
  });

  it('pins the exact disclaimer paragraph as one golden string', () => {
    expect(disclaimerText()).toBe(
      'Screening model only: location climate is regional 10 m reanalysis, not an on-site anemometer record. ' +
        'The flow model is a steady 2D pedestrian slice with no vertical flow, atmospheric boundary layer, ' +
        'terrain, thermal buoyancy, transient gusts, or RANS/LES turbulence closure. Comfort colours use the ' +
        'modified City Lawson 2.5 / 4 / 6 / 8 m/s thresholds at 5% exceedance; safety flags exceed 15 m/s at ' +
        '0.022% exceedance. Room airflow is a steady pressure-network calculation using configured opening ' +
        'fractions and a height-uniform façade pressure from the outdoor slice; it excludes leakage, stack ' +
        'effect, fans, ducts, and indoor velocity detail. This is not a wind-engineering certification.',
    );
  });

  it('pins that the disclaimer is not rendered until the advanced section is opened', () => {
    // characterization: pins current behaviour; see T2. Every caveat above is
    // one click deep. The default panel render carries none of it.
    const markup = render({ windStudy: createWindStudyState({ enabled: true }) });
    expect(markup).not.toContain('Screening model only');
    expect(markup).not.toContain('wind-engineering certification');
    expect(markup).toContain('Solver &amp; wind rose');
  });
});
