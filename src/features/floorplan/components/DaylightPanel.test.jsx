import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createProject, createRoom, createWall, createWindow } from '@/domain/models';
import { createDaylightState } from '@/analysis/daylightState';
import { computeDaylightStudy } from '@/analysis/daylightRunner';
import DaylightPanel from './DaylightPanel';

function projectWithRooms({ windowWidth = 2000 } = {}) {
  const corners = [
    { x: 0, y: 0 },
    { x: 5000, y: 0 },
    { x: 5000, y: 4000 },
    { x: 0, y: 4000 },
  ];
  const walls = corners.map((corner, index) =>
    createWall(corner, corners[(index + 1) % corners.length], 200, { height: 2500 }),
  );
  const window_ = createWindow(walls[0].id, 2500, windowWidth);
  const living = { ...createRoom('Living', corners), spaceType: 'living' };

  const project = createProject('Daylight');
  return {
    ...project,
    floors: [{ ...project.floors[0], walls, windows: [window_], rooms: [living] }],
  };
}

function render(props) {
  return renderToStaticMarkup(
    <DaylightPanel
      project={createProject('Daylight')}
      daylight={createDaylightState()}
      study={null}
      onPatch={() => {}}
      onToggle={() => {}}
      {...props}
    />,
  );
}

describe('before there is anything to measure', () => {
  it('asks for rooms rather than showing an empty table', () => {
    const markup = render({});
    expect(markup).toContain('Draw rooms');
    // No toggle either: switching on a study of nothing would be a dead end.
    expect(markup).not.toContain('aria-pressed');
  });

  it('offers the toggle once rooms exist', () => {
    const markup = render({ project: projectWithRooms() });
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).toContain('Off');
  });

  it('says what the study is before it is switched on', () => {
    const markup = render({ project: projectWithRooms() });
    expect(markup).toContain('overcast sky');
  });
});

describe('with a study running', () => {
  const project = projectWithRooms();
  const daylight = createDaylightState({ enabled: true });
  const study = computeDaylightStudy({ project, daylight });
  const markup = render({ project, daylight, study });

  it('leads with the floor average and the target count', () => {
    expect(markup).toContain('area-weighted');
    expect(markup).toContain('meet their target');
  });

  it('lists each room with its daylight factor and target', () => {
    expect(markup).toContain('Living');
    expect(markup).toContain(`of ${study.rooms[0].target}%`);
  });

  it('marks a room that misses its target', () => {
    const dark = projectWithRooms({ windowWidth: 400 });
    const darkStudy = computeDaylightStudy({ project: dark, daylight });
    expect(darkStudy.rooms[0].meetsTarget).toBe(false);
    expect(render({ project: dark, daylight, study: darkStudy })).toContain('✕');
  });

  it('offers both methods', () => {
    expect(markup).toContain('Room average');
    expect(markup).toContain('Daylight map');
  });
});

describe('the daylight map', () => {
  const project = projectWithRooms();
  const daylight = createDaylightState({ enabled: true, mode: 'grid' });
  const study = computeDaylightStudy({ project, daylight });

  it('reports progress while it samples', () => {
    const markup = render({
      project,
      daylight,
      study,
      gridStatus: 'running',
      gridProgress: { done: 1, total: 3, roomName: 'Living' },
    });
    expect(markup).toContain('Sampling Living');
    expect(markup).toContain('1 of 3');
  });

  it('says when it is showing a superseded map', () => {
    const markup = render({ project, daylight, study, gridStatus: 'running', gridStale: true });
    expect(markup).toContain('previous map');
  });

  it('surfaces a failure rather than spinning forever', () => {
    const markup = render({ project, daylight, study, gridStatus: 'error', gridError: 'Worker died.' });
    expect(markup).toContain('Worker died.');
  });

  it('does not mention sampling at all in average mode', () => {
    const average = createDaylightState({ enabled: true });
    const markup = render({ project, daylight: average, study, gridStatus: 'running' });
    expect(markup).not.toContain('Sampling');
  });
});

describe('rooms with no window', () => {
  it('are counted in the summary rather than quietly dropped', () => {
    const project = projectWithRooms();
    const windowless = { ...project, floors: [{ ...project.floors[0], windows: [] }] };
    const daylight = createDaylightState({ enabled: true });
    const study = computeDaylightStudy({ project: windowless, daylight });

    const markup = render({ project: windowless, daylight, study });
    expect(markup).toContain('room with no window');
  });
});
