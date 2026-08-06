import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createProject } from '@/domain/models';
import { BUILDING_COMMANDS, executeBuildingCommand } from '@/domain/buildingCommands';
import { createSunStudyState } from '@/analysis/sunStudyState';
import SunStudyPanel from './SunStudyPanel';

const MANILA = { latitude: 14.5995, longitude: 120.9842, timeZone: 'Asia/Manila' };

function locatedProject(overrides = {}) {
  const result = executeBuildingCommand(createProject('Sun'), {
    type: BUILDING_COMMANDS.CONFIGURE_SITE_LOCATION,
    ...MANILA,
    ...overrides,
  });
  expect(result.ok).toBe(true);
  return result.project;
}

function render(props) {
  return renderToStaticMarkup(
    <SunStudyPanel
      project={createProject('Sun')}
      sunStudy={createSunStudyState()}
      lastCommand={null}
      onExecuteCommand={() => {}}
      onPatch={() => {}}
      onToggle={() => {}}
      {...props}
    />,
  );
}

describe('SunStudyPanel discoverability', () => {
  it('is findable by the toolbar, which scrolls to this marker', () => {
    expect(render({})).toContain('data-panel="sun-study"');
  });
});

describe('state 1: no location yet', () => {
  const markup = render({});

  it('asks for one thing only', () => {
    expect(markup).toContain('Set site location');
    expect(markup).toContain('Shadows need to know where on Earth the site is.');
  });

  it('does not show a dead on/off toggle', () => {
    // A disabled toggle reads as broken. Until there is a location, the only
    // affordance is the button that supplies one.
    expect(markup).not.toContain('aria-pressed');
  });

  it('keeps the coordinate form out of the way until asked for', () => {
    expect(markup).not.toContain('placeholder="14.5995"');
  });
});

describe('location picker', () => {
  const markup = render({ lastCommand: null, project: locatedProject() });

  // Rendered via the rejection path, which forces the form open without
  // needing to simulate a click.
  const openMarkup = render({
    project: createProject('Sun'),
    lastCommand: {
      ok: false,
      commandType: BUILDING_COMMANDS.CONFIGURE_SITE_LOCATION,
      error: { code: 'invalid-latitude', message: 'bad' },
    },
  });

  it('leads with a city search rather than coordinate boxes', () => {
    expect(openMarkup).toContain('Search a city');
    expect(openMarkup).toContain('click to place the site');
  });

  it('folds raw coordinate entry behind a disclosure', () => {
    expect(openMarkup).toContain('Type coordinates');
    expect(openMarkup).toContain('placeholder="14.5995"');
  });

  it('asks for an IANA civil timezone instead of a fixed UTC offset', () => {
    expect(openMarkup).toContain('Civil timezone');
    expect(openMarkup).toContain('Asia/Manila');
    expect(openMarkup).not.toContain('UTC offset');
  });

  it('still asks for the north angle, which coordinates cannot supply', () => {
    expect(openMarkup).toContain('North angle');
  });

  it('does not show the picker when the location is settled', () => {
    expect(markup).not.toContain('Search a city');
  });
});

describe('state 2: located, study off', () => {
  const markup = render({ project: locatedProject({ northAngle: 27 }) });

  it('collapses the location to a single readable line', () => {
    expect(markup).toContain('14.60°N');
    expect(markup).toContain('120.98°E');
    expect(markup).toContain('N 27°');
  });

  it('shows the civil timezone in the settled summary', () => {
    expect(markup).toContain('Asia/Manila');
  });

  it('offers the toggle and an edit affordance', () => {
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).toContain('>Edit<');
  });

  it('hides the study controls until the study is on', () => {
    expect(markup).not.toContain('Sun hours');
    expect(markup).not.toContain('Accuracy &amp; sampling');
  });
});

describe('state 3: running', () => {
  const project = locatedProject();
  const markup = render({
    project,
    sunStudy: createSunStudyState({ enabled: true, date: '2026-12-21', minutes: 720 }),
  });

  it('shows mode, date and time', () => {
    expect(markup).toContain('Moment');
    expect(markup).toContain('All day');
    expect(markup).toContain('Sun hours');
    expect(markup).toContain('2026-12-21');
    expect(markup).toContain('12:00');
  });

  it('offers the solstices and equinox as one-click presets', () => {
    expect(markup).toContain('21 Jun');
    expect(markup).toContain('20 Mar');
    expect(markup).toContain('21 Dec');
  });

  it('reports the sun angle and compass point next to the clock', () => {
    // Manila, December solstice, local noon: 52 degrees up, just past due south.
    expect(markup).toContain('52° up');
    expect(markup).toContain('S');
  });

  it('paints the daylight window onto the time slider', () => {
    // Manila at the December solstice: about 11h15m of daylight, centred on
    // solar noon, so the lit band runs from roughly 26% to 73% of the day.
    const start = Number(/--daylight-start:\s*([\d.]+)%/.exec(markup)[1]);
    const end = Number(/--daylight-end:\s*([\d.]+)%/.exec(markup)[1]);

    expect(start).toBeGreaterThan(24);
    expect(start).toBeLessThan(28);
    expect(end).toBeGreaterThan(70);
    expect(end).toBeLessThan(75);
    // The band must straddle midday and be about eleven and a quarter hours.
    expect(start).toBeLessThan(50);
    expect(end).toBeGreaterThan(50);
    expect(((end - start) / 100) * 24).toBeCloseTo(11.25, 0);
  });

  it('labels the clock as site civil time', () => {
    expect(markup).toContain('Asia/Manila civil time');
  });

  it('carries a recompute indicator that stays idle until work is pending', () => {
    // The track is always in the DOM so switching modes cannot reflow the
    // panel; `data-busy` is what turns it on, and CSS delays the reveal so a
    // fast switch never flashes it.
    expect(markup).toContain('progressTrack');
    expect(markup).not.toContain('data-busy');
  });

  it('shows the selected mask compliance result without opening advanced settings', () => {
    const resultMarkup = render({
      project,
      sunStudy: createSunStudyState({ enabled: true, mode: 'sunHours', targetId: 'neighbor' }),
      study: {
        mode: 'sunHours',
        target: { id: 'neighbor', name: 'North neighbor garden', kind: 'neighbor', polygon: [] },
        grid: {
          compliantFraction: 0.625,
          assessedAreaMm2: 80_000_000,
          thresholdHours: 2,
          meanSunHours: 3.4,
        },
      },
    });

    expect(resultMarkup).toContain('63% compliant');
    expect(resultMarkup).toContain('North neighbor garden');
    expect(resultMarkup).toContain('80 m²');
  });

  it('folds sampling settings away instead of stacking them', () => {
    expect(markup).toContain('Accuracy &amp; sampling');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).not.toContain('Sample every');
    expect(markup).not.toContain('Grid cell');
  });

  it('says the sun is down when it is', () => {
    const night = render({ project, sunStudy: createSunStudyState({ enabled: true, minutes: 0 }) });
    expect(night).toContain('Below horizon');
  });
});

describe('polar sites', () => {
  const tromso = locatedProject({ latitude: 69.6496, longitude: 18.956, timeZone: 'Europe/Oslo' });

  it('names polar night rather than showing a broken clock', () => {
    const markup = render({
      project: tromso,
      sunStudy: createSunStudyState({ enabled: true, date: '2026-12-21', minutes: 720 }),
    });
    expect(markup).toContain('Polar night');
  });

  it('names midnight sun and lights the whole track', () => {
    const markup = render({
      project: tromso,
      sunStudy: createSunStudyState({ enabled: true, date: '2026-06-21', minutes: 720 }),
    });
    expect(markup).toContain('Midnight sun');
    expect(markup).toContain('--daylight-start:0%');
  });
});

describe('command rejection', () => {
  it('surfaces the command message rather than restating the rules', () => {
    const markup = render({
      lastCommand: {
        ok: false,
        commandType: BUILDING_COMMANDS.CONFIGURE_SITE_LOCATION,
        error: { code: 'invalid-latitude', message: 'Latitude must be between -90 and 90 degrees.' },
      },
    });
    expect(markup).toContain('Latitude must be between -90 and 90 degrees.');
  });
});
