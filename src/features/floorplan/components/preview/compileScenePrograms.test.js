import { describe, expect, it } from 'vitest';
import { compileScenePrograms } from './compileScenePrograms';

/** Just enough renderer for the compile-and-poll contract. */
function fakeRenderer({ parallel = true, materials, programs }) {
  const calls = [];
  let target = 'canvas';
  return {
    calls,
    getRenderTarget: () => target,
    setRenderTarget: (next) => {
      calls.push(['setRenderTarget', next]);
      target = next;
    },
    compile: () => {
      calls.push(['compile', target]);
      return new Set(materials);
    },
    properties: { get: (material) => ({ currentProgram: programs.get(material) }) },
    extensions: { get: (name) => (parallel && name === 'KHR_parallel_shader_compile' ? {} : null) },
  };
}

describe('compileScenePrograms', () => {
  it('compiles against the given target and puts the old one back', async () => {
    const material = {};
    const renderer = fakeRenderer({ materials: [material], programs: new Map([[material, { isReady: () => true }]]) });
    await compileScenePrograms(renderer, 'scene', 'camera', 'offscreen');
    expect(renderer.calls).toEqual([
      ['setRenderTarget', 'offscreen'],
      ['compile', 'offscreen'],
      ['setRenderTarget', 'canvas'],
    ]);
  });

  it('waits for every program to report ready', async () => {
    const material = {};
    let polls = 0;
    const program = { isReady: () => (polls += 1) >= 3 };
    const renderer = fakeRenderer({ materials: [material], programs: new Map([[material, program]]) });
    await compileScenePrograms(renderer, 'scene', 'camera');
    expect(polls).toBe(3);
  });

  it('counts a material whose program went away as done instead of throwing', async () => {
    // A rebuild disposed the fixture's own lens material mid-poll.
    const kept = {};
    const disposed = {};
    const renderer = fakeRenderer({
      parallel: false,
      materials: [kept, disposed],
      programs: new Map([[kept, { isReady: () => true }]]),
    });
    await expect(compileScenePrograms(renderer, 'scene', 'camera')).resolves.toBe('scene');
  });
});
