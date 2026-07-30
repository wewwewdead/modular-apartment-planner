import { describe, it, expect } from 'vitest';
import { createDoor, createProject, createRoom, createWall } from '@/domain/models';
import { generateProjectThumbnailSvg } from '../projectThumbnail';

function makeProject(name = 'Thumbnail Test') {
  const project = createProject(name);
  const floor = project.floors[0];
  const wall = createWall({ x: 0, y: 0 }, { x: 6000, y: 0 }, 200);
  floor.walls.push(wall);
  floor.walls.push(createWall({ x: 6000, y: 0 }, { x: 6000, y: 3000 }, 200));
  floor.doors.push(createDoor(wall.id, 2000, 900));
  floor.rooms.push(
    createRoom('Living', [
      { x: 0, y: 0 },
      { x: 6000, y: 0 },
      { x: 6000, y: 3000 },
      { x: 0, y: 3000 },
    ]),
  );
  return project;
}

function expectNoBadNumbers(svg) {
  expect(svg).not.toMatch(/NaN/);
  expect(svg).not.toMatch(/Infinity/);
  expect(svg).not.toMatch(/undefined/);
}

describe('generateProjectThumbnailSvg', () => {
  it('renders a self-contained svg for a project with geometry', () => {
    const svg = generateProjectThumbnailSvg(makeProject());

    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('width="480"');
    expect(svg).toContain('height="360"');
    expect(svg).toMatch(/viewBox="-?[\d.]+ -?[\d.]+ [\d.]+ [\d.]+"/);
    expectNoBadNumbers(svg);
  });

  it('renders walls as strokes carrying their model thickness', () => {
    const svg = generateProjectThumbnailSvg(makeProject());
    const wallLines = svg.match(/<line [^>]*stroke="#31363b"[^>]*\/>/g) || [];

    expect(wallLines).toHaveLength(2);
    expect(wallLines[0]).toContain('stroke-width="200"');
  });

  it('renders rooms as filled polygons', () => {
    const svg = generateProjectThumbnailSvg(makeProject());
    expect(svg).toContain('<polygon points="0,0 6000,0 6000,3000 0,3000"');
  });

  it('renders door openings over their wall', () => {
    const svg = generateProjectThumbnailSvg(makeProject());
    expect(svg).toContain('<line x1="1550" y1="0" x2="2450" y2="0"');
  });

  it('honours custom dimensions and an explicit floor id', () => {
    const project = makeProject();
    const svg = generateProjectThumbnailSvg(project, {
      width: 240,
      height: 240,
      floorId: project.floors[0].id,
    });

    expect(svg).toContain('width="240"');
    expect(svg).toContain('height="240"');
    expectNoBadNumbers(svg);
  });

  it('returns a placeholder for an empty project', () => {
    const svg = generateProjectThumbnailSvg(createProject('Empty Plan'));

    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('Empty Plan');
    expect(svg).not.toContain('<line');
    expectNoBadNumbers(svg);
  });

  it('escapes the project name in the placeholder', () => {
    const svg = generateProjectThumbnailSvg(createProject('Tom & "Jerry" <plans>'));
    expect(svg).toContain('Tom &amp; &quot;Jerry&quot; &lt;plans&gt;');
  });

  it('returns a placeholder for null, empty and floorless input', () => {
    expect(generateProjectThumbnailSvg(null)).toContain('Untitled Project');
    expect(generateProjectThumbnailSvg({})).toContain('Untitled Project');
    expect(generateProjectThumbnailSvg({ name: 'No Floors', floors: [] })).toContain('No Floors');
  });

  it('survives degenerate geometry without producing bad numbers', () => {
    const project = createProject('Degenerate');
    const floor = project.floors[0];
    floor.walls.push(createWall({ x: 1000, y: 1000 }, { x: 1000, y: 1000 }, 0));
    floor.walls.push({ id: 'wall_bad', start: { x: NaN, y: 0 }, end: { x: 0, y: 0 }, thickness: 200 });
    floor.rooms.push({ id: 'room_bad', points: [{ x: Infinity, y: 0 }] });

    const svg = generateProjectThumbnailSvg(project);
    expect(svg.startsWith('<svg')).toBe(true);
    expectNoBadNumbers(svg);
  });

  it('ignores openings whose wall is missing or malformed', () => {
    const project = makeProject();
    const floor = project.floors[0];
    floor.doors.push(createDoor('wall_missing', 500, 900));
    floor.windows.push({ id: 'win_bad', wallId: floor.walls[0].id, offset: NaN, width: 900 });

    const svg = generateProjectThumbnailSvg(project);
    const openings = svg.match(/stroke="#f6f5f2"/g) || [];
    expect(openings).toHaveLength(1);
    expectNoBadNumbers(svg);
  });
});
