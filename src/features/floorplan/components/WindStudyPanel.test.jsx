import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createWindStudyState } from '@/analysis/windState';
import WindStudyPanel, { parseRose, roseToText } from './WindStudyPanel';

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
