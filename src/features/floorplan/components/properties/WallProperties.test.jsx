import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import WallProperties from './WallProperties';

/**
 * Smoke coverage for the T9 prop wiring (floor prop + pre-validate guard).
 * Interaction behavior (invalid length → toast, no dispatch) is covered at the
 * validator layer (modelGraph.test.js) and the authoritative reducer layer
 * (floorplanReducer.test.js rejection tests); this harness is static-markup
 * only, so here we pin that the component renders with the new floor prop.
 */
const u = {
  step: () => 1,
  suffix: 'mm',
  fromDisplay: (value) => Number(value),
  toDisplay: (value) => value,
};

function makeFloor() {
  const wall = { id: 'w1', start: { x: 0, y: 0 }, end: { x: 3000, y: 0 }, thickness: 100 };
  return {
    wall,
    floor: { walls: [wall], doors: [], windows: [], columns: [], rooms: [] },
  };
}

describe('WallProperties', () => {
  it('renders a straight wall with the floor prop wired for pre-validation', () => {
    const { wall, floor } = makeFloor();
    const html = renderToStaticMarkup(
      <WallProperties
        wall={wall}
        floor={floor}
        dispatch={() => {}}
        editorDispatch={() => {}}
        floorId="floor_1"
        u={u}
        phases={[]}
      />,
    );
    expect(html).toContain('Length');
    expect(html).toContain('CHB masonry');
  });

  it('renders framing controls for a board wall assembly', () => {
    const { wall, floor } = makeFloor();
    const framedWall = {
      ...wall,
      assembly: { preset: 'fiber_cement', system: 'framed' },
    };
    const html = renderToStaticMarkup(
      <WallProperties
        wall={framedWall}
        floor={{ ...floor, walls: [framedWall] }}
        dispatch={() => {}}
        editorDispatch={() => {}}
        floorId="floor_1"
        u={u}
        phases={[]}
      />,
    );
    expect(html).toContain('Stud spacing');
    expect(html).toContain('Double-stud wall');
    expect(html).toContain('Inside layers');
    expect(html).toContain('Inside side');
    expect(html).toContain('Flip Inside / Outside');
    expect(html).toContain('Design Inside Face — Fiber cement');
    expect(html).toContain('Design Outside Face — Fiber cement');
  });

  it('renders an arc wall without crashing (fillet path)', () => {
    const { wall, floor } = makeFloor();
    const arcWall = { ...wall, controlPoint: { x: 1500, y: 400 } };
    const html = renderToStaticMarkup(
      <WallProperties
        wall={arcWall}
        floor={{ ...floor, walls: [arcWall] }}
        dispatch={() => {}}
        editorDispatch={() => {}}
        floorId="floor_1"
        u={u}
        phases={[]}
      />,
    );
    expect(html).toContain('Arc Wall');
  });
});
