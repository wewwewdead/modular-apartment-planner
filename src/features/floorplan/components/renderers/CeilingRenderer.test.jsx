import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createBeam, createColumn } from '@/domain/models';
import { createCeiling } from '@/domain/ceilingModels';
import CeilingRenderer from './CeilingRenderer';

const RING_COLUMNS = [
  ['col_sw', 0, 0],
  ['col_se', 6000, 0],
  ['col_ne', 6000, 4000],
  ['col_nw', 0, 4000],
].map(([id, x, y]) => ({ ...createColumn(x, y, 300, 300, { height: 3200 }), id }));

const BEAMS = [
  ['beam_s', 'col_sw', 'col_se'],
  ['beam_n', 'col_nw', 'col_ne'],
].map(([id, startId, endId]) => ({
  ...createBeam({ kind: 'column', id: startId }, { kind: 'column', id: endId }, 250, 450, 3200),
  id,
}));

const DRAWN_AREA = [
  { x: 1000, y: 1000 },
  { x: 3000, y: 1000 },
  { x: 3000, y: 2500 },
  { x: 1000, y: 2500 },
];

function projectWith(ceilings) {
  return {
    floors: [{ id: 'floor_1', elevation: 0, columns: RING_COLUMNS, beams: BEAMS }],
    trussSystems: [],
    ceilings,
  };
}

function render(project, floorId = 'floor_1') {
  return renderToStaticMarkup(
    <svg>
      <CeilingRenderer project={project} floorId={floorId} />
    </svg>,
  );
}

describe('CeilingRenderer', () => {
  it('draws the drawn area of a ceiling on the active floor', () => {
    const ceiling = createCeiling('Living Ceiling', {
      id: 'ceiling_1',
      floorId: 'floor_1',
      boundaryPolygon: DRAWN_AREA,
      boundarySource: 'drawn',
      attachment: { mode: 'beam', beamIds: ['beam_s', 'beam_n'] },
    });

    const markup = render(projectWith([ceiling]));

    expect(markup).toContain('data-type="ceiling"');
    expect(markup).toContain('points="1000,1000 3000,1000 3000,2500 1000,2500"');
    // An annotation about what is overhead, not a target: clicks belong to the
    // walls underneath it.
    expect(markup).toContain('pointer-events:none');
  });

  it('follows the beams for an auto ceiling instead of its stored outline', () => {
    const ceiling = createCeiling('Auto Ceiling', {
      id: 'ceiling_2',
      floorId: 'floor_1',
      boundaryPolygon: DRAWN_AREA,
      attachment: { mode: 'beam', beamIds: ['beam_s', 'beam_n'] },
    });

    const markup = render(projectWith([ceiling]));

    expect(markup).not.toContain('points="1000,1000 3000,1000 3000,2500 1000,2500"');
    expect(markup).toContain('3875');
  });

  it('draws only the ceilings belonging to the floor on screen', () => {
    const here = createCeiling('Here', { id: 'ceiling_here', floorId: 'floor_1', boundaryPolygon: DRAWN_AREA });
    const above = createCeiling('Above', { id: 'ceiling_above', floorId: 'floor_2', boundaryPolygon: DRAWN_AREA });

    const markup = render(projectWith([here, above]));

    expect(markup).toContain('data-id="ceiling_here"');
    expect(markup).not.toContain('data-id="ceiling_above"');
  });

  // Phase filtering happens upstream: SvgCanvas hands this the already-filtered
  // project, so a hidden ceiling is simply not in the array.
  it('renders nothing without a project, a floor, or any ceilings', () => {
    expect(render(projectWith([]))).toBe('<svg></svg>');
    expect(render(null)).toBe('<svg></svg>');
    expect(render(projectWith([createCeiling('X', { floorId: 'floor_1' })]), null)).toBe('<svg></svg>');
  });
});
