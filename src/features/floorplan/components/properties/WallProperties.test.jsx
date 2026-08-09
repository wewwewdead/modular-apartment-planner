import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import WallProperties from './WallProperties';

/**
 * Smoke coverage for the T9 prop wiring (floor prop + pre-validate guard) and
 * for the panel's section layout.
 *
 * The panel opens Size and Assembly and collapses Framing, 3D view, Position
 * and Continue, so a collapsed section's controls are genuinely absent from the
 * markup — that is the point of the disclosure, and the reason the framing
 * controls are asserted in the jsdom test below instead of here. Interaction
 * behavior (invalid length → toast, no dispatch) is covered at the validator
 * layer (modelGraph.test.js) and the authoritative reducer layer
 * (floorplanReducer.test.js rejection tests).
 */
const u = {
  step: () => 1,
  suffix: 'mm',
  fromDisplay: (value) => Number(value),
  toDisplay: (value) => value,
};

function makeFloor() {
  const wall = { id: 'w1', start: { x: 0, y: 0 }, end: { x: 3000, y: 0 }, thickness: 100, height: 2400 };
  return {
    wall,
    floor: { walls: [wall], doors: [], windows: [], columns: [], rooms: [] },
  };
}

function render(wall, floor) {
  return renderToStaticMarkup(
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
}

describe('WallProperties', () => {
  it('renders a straight wall with the floor prop wired for pre-validation', () => {
    const { wall, floor } = makeFloor();
    const html = render(wall, floor);

    expect(html).toContain('Length');
    expect(html).toContain('CHB masonry');
  });

  it('opens Size and Assembly and defers the rest behind labelled sections', () => {
    const { wall, floor } = makeFloor();
    const html = render(wall, floor);

    // Open: what you read and change most.
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('>Size<');
    expect(html).toContain('>Assembly<');
    // Deferred, but each says what it holds rather than hiding it silently.
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('>Position<');
    expect(html).toContain('>Continue from end<');
  });

  it('renders board controls and face actions for a framed assembly', () => {
    const { wall, floor } = makeFloor();
    const framedWall = { ...wall, assembly: { preset: 'fiber_cement', system: 'framed' } };
    const html = render(framedWall, { ...floor, walls: [framedWall] });

    expect(html).toContain('Inside side');
    expect(html).toContain('Inside layers');
    expect(html).toContain('Flip Inside / Outside');
    expect(html).toContain('Design Inside Face — Fiber cement');
    expect(html).toContain('Design Outside Face — Fiber cement');
    // Framing is collapsed, and its summary reports the layout it is holding.
    expect(html).toContain('>Framing<');
    expect(html).toMatch(/\d+ studs @ /);
  });

  it('offers no framing or 3D section for a masonry wall', () => {
    const { wall, floor } = makeFloor();
    const html = render(wall, floor);

    expect(html).not.toContain('>Framing<');
    expect(html).not.toContain('>3D view<');
  });

  it('renders an arc wall without crashing (fillet path)', () => {
    const { wall, floor } = makeFloor();
    const arcWall = { ...wall, controlPoint: { x: 1500, y: 400 } };
    const html = render(arcWall, { ...floor, walls: [arcWall] });

    expect(html).toContain('Arc Wall');
  });
});
