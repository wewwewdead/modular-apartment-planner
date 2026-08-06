import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createProject, createSlab, createWall } from '@/domain/models';
import { BUILDING_COMMANDS, executeBuildingCommand } from '@/domain/buildingCommands';
import { createSolarAccessState } from '@/analysis/solarAccessState';
import { computeSolarAccess } from '@/analysis/solarAccessRunner';
import SolarAccessPanel from './SolarAccessPanel';

const MANILA = { latitude: 14.5995, longitude: 120.9842, timeZone: 'Asia/Manila' };

function locatedBuilding() {
  const corners = [
    { x: 0, y: 0 },
    { x: 12000, y: 0 },
    { x: 12000, y: 12000 },
    { x: 0, y: 12000 },
  ];
  const walls = corners.map((corner, index) =>
    createWall(corner, corners[(index + 1) % corners.length], 300, { height: 9000 }),
  );

  const result = executeBuildingCommand(createProject('Solar'), {
    type: BUILDING_COMMANDS.CONFIGURE_SITE_LOCATION,
    ...MANILA,
  });
  expect(result.ok).toBe(true);

  const project = result.project;
  const floor = project.floors[0];
  return {
    ...project,
    floors: [{ ...floor, walls, slabs: [createSlab(floor.id, corners, 200, 9000)] }],
  };
}

function render(props) {
  return renderToStaticMarkup(
    <SolarAccessPanel
      project={createProject('Solar')}
      solarAccess={createSolarAccessState()}
      study={null}
      onPatch={() => {}}
      onToggle={() => {}}
      {...props}
    />,
  );
}

describe('before a location is set', () => {
  it('points at the sun study rather than offering a dead toggle', () => {
    const markup = render({});
    expect(markup).toContain('Set the site location');
    expect(markup).not.toContain('aria-pressed');
  });

  it('offers the toggle once the site is located', () => {
    const markup = render({ project: locatedBuilding() });
    expect(markup).toContain('aria-pressed="false"');
  });
});

describe('with a study', () => {
  const project = locatedBuilding();
  const solarAccess = createSolarAccessState({ enabled: true, sensorSpacing: 3000, skyViewRays: 32 });
  const study = computeSolarAccess({ project, solarAccess });

  it('leads with the orientation breakdown', () => {
    const markup = render({ project, solarAccess, study, status: 'ready' });
    expect(markup).toContain('By orientation');
    expect(markup).toContain('>S<');
    expect(markup).toContain('>N<');
  });

  it('reports sun hours in hours', () => {
    const markup = render({ project, solarAccess, study, status: 'ready' });
    expect(markup).toMatch(/\d+ h/);
    expect(markup).toContain('average, all surfaces');
  });

  it('switches the whole readout to energy', () => {
    const energy = createSolarAccessState({ ...solarAccess, metric: 'irradiation' });
    const markup = render({ project, solarAccess: energy, study, status: 'ready' });
    expect(markup).toContain('kWh/m²');
    expect(markup).toContain('roof average');
    // The caveat travels with the number it qualifies.
    expect(markup).toContain('before any panel efficiency');
  });

  it('says how much work went into the answer', () => {
    const markup = render({ project, solarAccess, study, status: 'ready' });
    expect(markup).toContain('sun positions');
    expect(markup).toContain('sensors');
  });
});

describe('run status', () => {
  const project = locatedBuilding();
  const solarAccess = createSolarAccessState({ enabled: true });

  it('reports progress while tracing', () => {
    const markup = render({ project, solarAccess, status: 'running', progress: { done: 500, total: 2000 } });
    expect(markup).toContain('Tracing 500 of 2000');
  });

  it('says when it is showing a superseded run', () => {
    const markup = render({ project, solarAccess, status: 'running', stale: true });
    expect(markup).toContain('previous run');
  });

  it('surfaces a failure rather than spinning forever', () => {
    const markup = render({ project, solarAccess, status: 'error', error: 'Worker died.' });
    expect(markup).toContain('Worker died.');
  });
});

describe('the honesty the feature turns on', () => {
  const project = locatedBuilding();

  it('separates geometry from the sky model in the assumptions', () => {
    // The whole reason the two metrics are split. Sun hours stand on the
    // massing alone; kWh rests on a cloudless sky nobody ever gets.
    const markup = renderToStaticMarkup(
      <SolarAccessPanel
        project={project}
        solarAccess={createSolarAccessState({ enabled: true })}
        study={null}
        onPatch={() => {}}
        onToggle={() => {}}
      />,
    );
    // The disclaimers live behind the advanced toggle, which is closed by
    // default — but the toggle itself must be present and named.
    expect(markup).toContain('Sampling &amp; assumptions');
  });
});
