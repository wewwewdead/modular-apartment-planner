import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createFloor, createWall, createWindow } from '@/domain/models';
import { buildElevationScene } from '@/elevations/scene';
import ElevationSceneLayer from './ElevationSceneLayer';

describe('ElevationSceneLayer', () => {
  it('renders visible opening details and omits hidden windows', () => {
    const floor = createFloor('Ground', 0);
    const front = createWall({ x: 0, y: 0 }, { x: 6000, y: 0 }, 200);
    const back = createWall({ x: 0, y: 4000 }, { x: 6000, y: 4000 }, 200);
    floor.walls = [front, back];
    floor.windows = [createWindow(front.id, 2000), createWindow(back.id, 4000)];
    const scene = buildElevationScene(floor, 'elevation_front');
    const markup = renderToStaticMarkup(
      <svg>
        <ElevationSceneLayer scene={scene} />
      </svg>,
    );
    expect(markup).toContain(`data-elevation-source="${floor.windows[0].id}"`);
    expect(markup).not.toContain(`data-elevation-source="${floor.windows[1].id}"`);
    expect(markup).toContain('clipPathUnits="userSpaceOnUse"');
    expect(markup).toContain('<rect');
    expect(markup).not.toMatch(/NaN|Infinity/);
  });

  it('gives sheet viewports independent clipping identifiers', () => {
    const floor = createFloor('Ground', 0);
    floor.walls = [createWall({ x: 0, y: 0 }, { x: 6000, y: 0 }, 200)];
    const scene = buildElevationScene(floor, 'elevation_front');
    const markup = renderToStaticMarkup(
      <svg>
        <ElevationSceneLayer scene={scene} />
        <ElevationSceneLayer scene={scene} />
      </svg>,
    );
    const ids = [...markup.matchAll(/<clipPath id="([^"]+)"/g)].map((match) => match[1]);
    expect(ids.length).toBeGreaterThanOrEqual(2);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
