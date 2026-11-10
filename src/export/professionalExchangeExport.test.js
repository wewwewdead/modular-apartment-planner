// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createDoor, createProject, createWall } from '@/domain/models';
import { buildArchitecturalSheetDxf, buildRenderedSheetDxf } from './professionalExchangeExport';

// Each entity's group-code pairs, from DXF text.
function entities(dxf, type, layer) {
  const lines = dxf.split('\n');
  const found = [];
  for (let index = 0; index < lines.length - 1; index += 2) {
    if (lines[index].trim() !== '0' || lines[index + 1] !== type) continue;
    const codes = {};
    for (let next = index + 2; next < lines.length - 1 && lines[next].trim() !== '0'; next += 2) {
      codes[lines[next].trim()] = lines[next + 1];
    }
    if (!layer || codes['8'] === layer) found.push(codes);
  }
  return found;
}

describe('professional exchange DXF orientation', () => {
  it('keeps the plan the right way up: a door near the top of the plan lands above one near the bottom', () => {
    const top = createWall({ x: 0, y: 0 }, { x: 8000, y: 0 });
    const bottom = createWall({ x: 0, y: 6000 }, { x: 8000, y: 6000 });
    const project = createProject('Orientation');
    const floor = {
      ...project.floors[0],
      walls: [top, bottom],
      doors: [createDoor(top.id, 1000, 900), createDoor(bottom.id, 1000, 900)],
    };
    const sheet = {
      id: 'sheet_1',
      number: 'A-101',
      title: 'Plan',
      viewports: [{ id: 'vp', sourceFloorId: floor.id, sourceView: 'plan' }],
    };

    const dxf = buildArchitecturalSheetDxf({ ...project, floors: [floor] }, sheet);
    const doors = entities(dxf, 'LINE', 'A-DOOR').map((codes) => Number(codes['20']));

    expect(doors).toHaveLength(2);
    const [nearTop, nearBottom] = doors;
    expect(nearTop).toBeGreaterThan(nearBottom);
    expect(nearBottom).toBe(-6000);
  });

  it('flips a rendered sheet about its height and leaves out defs and clip paths', () => {
    const SVG = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 420 297');
    svg.setAttribute('width', '420');
    svg.setAttribute('height', '297');
    const line = document.createElementNS(SVG, 'line');
    for (const [name, value] of Object.entries({ x1: 10, y1: 10, x2: 50, y2: 10 })) line.setAttribute(name, value);
    const defs = document.createElementNS(SVG, 'defs');
    const clipPath = document.createElementNS(SVG, 'clipPath');
    const clipRect = document.createElementNS(SVG, 'rect');
    clipRect.setAttribute('width', '999');
    clipPath.appendChild(clipRect);
    defs.appendChild(clipPath);
    svg.append(defs, line);

    const dxf = buildRenderedSheetDxf(svg, { number: 'A-101', title: 'Plan' });
    const lines = entities(dxf, 'LINE');

    expect(lines).toHaveLength(1);
    expect(Number(lines[0]['20'])).toBe(287);
    expect(Number(lines[0]['21'])).toBe(287);
  });
});
