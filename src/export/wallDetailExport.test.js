import { describe, expect, it } from 'vitest';
import { createFloor, createWall } from '@/domain/models';
import { createWallDimension, createWallDetailing } from '@/domain/wallDetailing';
import { createWallDetailCsv, createWallDetailSvg } from './wallDetailExport';

function fixture() {
  const floor = createFloor('Ground', 0);
  const wall = createWall({ x: 0, y: 0 }, { x: 3000, y: 0 }, 100, {
    assembly: { preset: 'fiber_cement', framing: { spacing: 400, nogginRows: 1 } },
  });
  wall.assembly.detailing = createWallDetailing({
    enabled: true,
    sides: {
      interior: {
        enabled: true,
        fasteners: {
          guides: [
            {
              id: 'guide-1',
              name: 'Stud A set-out',
              direction: 'vertical',
              coordinate: 400,
              start: 50,
              end: 1000,
              spacing: 200,
            },
          ],
        },
        dimensions: {
          manual: [
            createWallDimension({
              mode: 'horizontal',
              start: { u: 0, v: 1200 },
              end: { u: 1219, v: 1200 },
              tolerance: 3,
              note: 'First board set-out',
            }),
          ],
        },
      },
    },
  });
  floor.walls = [wall];
  return { floor, wall };
}

describe('wall detail export', () => {
  it('creates a self-contained construction-detail SVG', () => {
    const { floor, wall } = fixture();
    const svg = createWallDetailSvg(wall, floor, 'interior');

    expect(svg).toContain('<svg');
    expect(svg).toContain('WALL ASSEMBLY DETAIL');
    expect(svg).toContain('class="panel"');
    expect(svg).toContain('class="framing"');
    expect(svg).toContain('class="fastener"');
    expect(svg).toContain('data-appearance="tonal" data-head-diameter-mm="8"');
    expect(svg).toContain('data-guide="guide-1" data-spacing-mm="200"');
    expect(svg).toContain('Stud A set-out · perimeter · 200.00 mm O.C.');
    expect(svg).toContain('end remainder 150.00 mm');
    expect(svg).toContain('class="dimension-group"');
    expect(svg).toContain('data-measurement-mm="1219" data-precision-mm="0.01"');
    expect(svg).toContain('1219.00 mm ±3.00 mm');
    expect(svg).toContain('express joint · V 6 / H 6 mm reveal');
    expect(svg).toContain('22.0 / 22.0 mm panel landing per side');
  });

  it('exports a traced cut panel as a manufacturing path', () => {
    const { floor, wall } = fixture();
    wall.assembly.detailing.sides.interior.layout = {
      ...wall.assembly.detailing.sides.interior.layout,
      mode: 'custom',
      customPanels: [
        {
          id: 'cut-panel',
          outlinePoints: [
            { u: 0, v: 0 },
            { u: 1000, v: 0 },
            { u: 1000, v: 1200 },
            { u: 500, v: 900 },
            { u: 0, v: 1200 },
          ],
        },
      ],
    };

    const svg = createWallDetailSvg(wall, floor, 'interior');

    expect(svg).toContain('<path d="M');
    expect(svg).toContain('data-panel="P1"');
    expect(svg).toContain('fill-rule="evenodd"');
  });

  it('exports an associative panel-perimeter screw trace and its guided screws', () => {
    const { floor, wall } = fixture();
    const face = wall.assembly.detailing.sides.interior;
    face.layout = {
      ...face.layout,
      mode: 'custom',
      customPanels: [{ id: 'panel-a', u: 0, v: 0, width: 1000, height: 1200 }],
    };
    face.fasteners = {
      ...face.fasteners,
      mode: 'custom',
      guides: [
        {
          id: 'panel-guide-a',
          name: 'P1 perimeter',
          mode: 'panel_perimeter',
          panelId: 'panel-a',
          spacing: 200,
          edgeClearance: 12,
          cornerClearance: 50,
        },
      ],
    };

    const svg = createWallDetailSvg(wall, floor, 'interior');
    const csv = createWallDetailCsv(wall, floor, 'interior');

    expect(svg).toContain('data-mode="panel_perimeter" data-panel="panel-a"');
    expect(svg).toContain('P1 perimeter · panel-edge trace · 200.00 mm O.C.');
    expect(svg).toContain('data-guide="panel-guide-a" data-guide-station=');
    expect(csv).toContain('fastener_guide,panel-guide-a,panel_perimeter');
    expect(csv).toContain('12 mm edge setback; 50 mm corner setback');
  });

  it('exports panel, framing, and fastener records to CSV', () => {
    const { floor, wall } = fixture();
    const csv = createWallDetailCsv(wall, floor, 'interior');

    expect(csv).toContain('record_type,id');
    expect(csv).toContain('panel,');
    expect(csv).toContain('panel_layout,');
    expect(csv).toContain('vertical-joint reveal mm');
    expect(csv).toContain('intent = aesthetic_shadow_line');
    expect(csv).toContain('22.0 / 22.0 mm panel landing per side on 50 mm support');
    expect(csv).toContain('framing,');
    expect(csv).toContain('fastener,');
    expect(csv).toContain('fastener_guide,guide-1,vertical');
    expect(csv).toContain('perimeter; 200 mm O.C.; 150 mm end remainder');
    expect(csv).toContain('dimension,');
    expect(csv).toContain('First board set-out: 1219.00 mm ±3.00 mm');
  });
});
