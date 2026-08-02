import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createWall } from '@/domain/models';
import WallRenderer from './WallRenderer';

describe('WallRenderer framed assemblies', () => {
  it('renders an opening-aware stud layout for a board wall', () => {
    const wall = createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }, 100, {
      assembly: { preset: 'fiber_cement', framing: { spacing: 400, frameCount: 2, frameGap: 25 } },
    });
    const html = renderToStaticMarkup(
      <svg>
        <WallRenderer
          walls={[wall]}
          columns={[]}
          doors={[{ id: 'door_1', wallId: wall.id, offset: 2000, width: 900, height: 2100 }]}
          windows={[]}
        />
      </svg>,
    );

    expect(html).toContain('data-wall-system="framed"');
    expect(html).toContain('data-wall-preset="fiber_cement"');
    expect(html).toContain('data-type="wall-framing-stud"');
    expect(html).toContain('data-frame-index="1"');
    expect(html).toContain('data-assembly-side="interior"');
    expect(html).toContain('data-assembly-side="exterior"');
  });

  it('renders different materials on the inside and outside skins', () => {
    const wall = createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }, 100, {
      assembly: {
        preset: 'mixed_board',
        interiorSide: 'right',
        interior: { material: 'plywood', thickness: 12, layerCount: 1 },
        exterior: { material: 'fiber_cement', thickness: 6, layerCount: 1 },
      },
    });
    const html = renderToStaticMarkup(
      <svg>
        <WallRenderer walls={[wall]} columns={[]} doors={[]} windows={[]} />
      </svg>,
    );

    expect(html).toContain('data-assembly-side="interior" data-board-material="plywood"');
    expect(html).toContain('data-assembly-side="exterior" data-board-material="fiber_cement"');
  });
});
