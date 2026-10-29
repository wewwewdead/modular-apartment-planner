import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createWall } from '@/domain/models';
import { createWallDetailing } from '@/domain/wallDetailing';
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

describe('WallRenderer — walls built off their axis', () => {
  function render(walls, columns = []) {
    return renderToStaticMarkup(
      <svg>
        <WallRenderer walls={walls} columns={columns} doors={[]} windows={[]} />
      </svg>,
    );
  }

  it('draws nothing extra for a wall on its axis', () => {
    const wall = createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }, 200);

    expect(render([wall])).not.toContain('wall-drawn-axis');
  });

  /*
   * The offset is the reason the drawn plan does not sit on the grid line it was
   * dimensioned to, and no dimension on the plan says so. The axis goes back as
   * a hidden-weight dashed line — the drafting convention for something that is
   * there but not cut through.
   */
  it('puts the drawn axis back as a dashed hidden line when the body is offset', () => {
    const wall = createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }, 200, { outboardOffset: 300 });
    const html = render([wall]);

    expect(html).toContain('wall-drawn-axis');
    expect(html).toContain('stroke-dasharray="4 3"');
    // On the axis, not on the body — the body is 300 away at y=300.
    expect(html).toContain('y1="0"');
    expect(html).toContain('y2="0"');
    expect(html).toContain('points="0,400 4000,400 4000,200 0,200"');
  });

  it('carries a framed wall’s studs onto the body rather than leaving them on the axis', () => {
    const framed = createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }, undefined, {
      assembly: { preset: 'plywood' },
      outboardOffset: 300,
    });
    const html = render([framed]);

    const studPoints = [...html.matchAll(/data-type="wall-framing-stud"[^>]*points="([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(studPoints.length).toBeGreaterThan(0);
    for (const points of studPoints) {
      for (const pair of points.split(' ')) {
        expect(Math.abs(Number(pair.split(',')[1]) - 300)).toBeLessThanOrEqual(100);
      }
    }
  });
});

/**
 * The corner detail, in plan — which is where it has to read, because plan is
 * where the user saw the open joint in the first place.
 */
describe('WallRenderer — board run past the wall end', () => {
  function render(walls, columns = []) {
    return renderToStaticMarkup(
      <svg>
        <WallRenderer walls={walls} columns={columns} doors={[]} windows={[]} />
      </svg>,
    );
  }

  /** The plan polygon of one skin, as `{x, y}` points. */
  function skinPoints(html, side) {
    const match = new RegExp(`data-assembly-side="${side}"[^>]*points="([^"]+)"`).exec(html);
    return match
      ? match[1].split(' ').map((pair) => ({ x: Number(pair.split(',')[0]), y: Number(pair.split(',')[1]) }))
      : [];
  }

  function corePoints(html) {
    const match = /data-type="wall-framing-core"[^>]*points="([^"]+)"/.exec(html);
    return match ? match[1] : '';
  }

  const extent = (points, axis) => [
    Math.min(...points.map((point) => point[axis])),
    Math.max(...points.map((point) => point[axis])),
  ];

  it('runs the skin polygon past the wall end and leaves the core alone', () => {
    const flush = createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }, undefined, {
      assembly: { preset: 'plywood' },
    });
    const lapped = createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }, undefined, {
      assembly: { preset: 'plywood', exterior: { material: 'plywood', overhangStart: 0, overhangEnd: 137 } },
    });

    expect(extent(skinPoints(render([flush]), 'exterior'), 'x')).toEqual([0, 4000]);
    expect(extent(skinPoints(render([lapped]), 'exterior'), 'x')).toEqual([0, 4137]);
    // Same core polygon, character for character.
    expect(corePoints(render([lapped]))).toBe(corePoints(render([flush])));
    // And the face nobody lapped is still flush.
    expect(extent(skinPoints(render([lapped]), 'interior'), 'x')).toEqual([0, 4000]);
  });

  /*
   * Plan draws the skin from the assembly and nothing else. A wall somebody has
   * opened the detail editor on, drawn boards on, and lapped is still that same
   * skin in plan — one rule, every wall — so the corner reads as closed here
   * whether or not the elevation behind it has been worked on.
   */
  it('runs the skin past the end of a wall whose boards have been detailed too', () => {
    const detailing = createWallDetailing({
      enabled: true,
      sides: {
        exterior: {
          enabled: true,
          layout: { mode: 'custom', customPanels: [{ id: 'one', u: 0, v: 0, width: 4000, height: 2400 }] },
        },
      },
    });
    const detailed = createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }, undefined, {
      assembly: {
        preset: 'plywood',
        detailing,
        exterior: { material: 'plywood', overhangStart: 0, overhangEnd: 137 },
      },
    });

    expect(extent(skinPoints(render([detailed]), 'exterior'), 'x')).toEqual([0, 4137]);
  });

  it('closes the corner between two walls that meet', () => {
    // Wall A runs west→east and dies at the corner; wall B comes up to it from
    // the south. B is built 99 deep (75 of stud, 12 of board each side), and A's
    // outside board is told to run past its own end by exactly that — which is
    // how a builder sizes the lap: by the wall being lapped.
    const buildUp = 99;
    const boardedWall = (start, end, overhangEnd = 0) =>
      createWall(start, end, undefined, {
        assembly: { preset: 'plywood', exterior: { material: 'plywood', overhangEnd } },
      });
    const wallB = boardedWall({ x: 4000, y: -3000 }, { x: 4000, y: 0 });

    /** Every millimetre of X the wall occupies in plan, whatever it is made of. */
    const builtBandX = (html) => {
      const points = [...html.matchAll(/points="([^"]+)"/g)].flatMap((match) =>
        match[1].split(' ').map((pair) => Number(pair.split(',')[0])),
      );
      return [Math.min(...points), Math.max(...points)];
    };

    const [bMinX, bMaxX] = builtBandX(render([wallB]));
    const [, flushMaxX] = extent(skinPoints(render([boardedWall({ x: 0, y: 0 }, { x: 4000, y: 0 })]), 'exterior'), 'x');
    const [, lappedMaxX] = extent(
      skinPoints(render([boardedWall({ x: 0, y: 0 }, { x: 4000, y: 0 }, buildUp)]), 'exterior'),
      'x',
    );

    // B is 99 thick and its centreline is the corner, so it occupies 4000 ± 49.5.
    expect([bMinX, bMaxX]).toEqual([3950.5, 4049.5]);
    // Before: A's board died on B's CENTRELINE — half of B, and the whole cut
    // edge of B's own board, stood out past the end of A's cladding. That is the
    // open corner the user was looking at.
    expect(flushMaxX).toBe(4000);
    expect(flushMaxX).toBeGreaterThan(bMinX);
    expect(flushMaxX).toBeLessThan(bMaxX);
    // After: A's board crosses the whole of B's build-up and comes out the far
    // side, so there is nothing of B's edge left showing.
    expect(lappedMaxX).toBe(4099);
    expect(lappedMaxX).toBeGreaterThanOrEqual(bMaxX);
  });
});
