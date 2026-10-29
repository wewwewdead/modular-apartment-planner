import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import SectionSceneLayer from './SectionSceneLayer';

describe('SectionSceneLayer', () => {
  it('uses one visibility pass for cut faces, background surfaces and lines', () => {
    const scene = {
      title: 'Section',
      bounds: { minX: 0, maxX: 3000, minZ: 0, maxZ: 3000 },
      groundLevel: 0,
      rectElements: [
        {
          id: 'wall',
          sourceId: 'wall',
          category: 'wall',
          renderMode: 'cut',
          left: 0,
          right: 3000,
          bottom: 0,
          top: 3000,
          depth: 0,
        },
      ],
      polygonElements: [
        {
          id: 'hidden-roof',
          sourceId: 'hidden-roof',
          category: 'slab',
          renderMode: 'projection',
          depth: 2000,
          points: [
            { x: 100, z: 2000 },
            { x: 2000, z: 2500 },
            { x: 2000, z: 2300 },
            { x: 100, z: 1800 },
          ],
        },
      ],
    };
    const markup = renderToStaticMarkup(
      <svg>
        <SectionSceneLayer scene={scene} />
        <SectionSceneLayer scene={scene} />
      </svg>,
    );
    expect(markup).toContain('data-section-source="wall"');
    expect(markup).not.toContain('hidden-roof');
    const ids = [...markup.matchAll(/<clipPath id="([^"]+)"/g)].map((match) => match[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(ids.length);
    expect(markup).not.toMatch(/NaN|Infinity/);
  });
});
