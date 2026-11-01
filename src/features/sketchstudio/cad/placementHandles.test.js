// Direct-placement handle maths: axis and plane drags for orthographic and
// perspective rays, snapping, the handle picker and the edge picker.
import { describe, expect, it } from 'vitest';
import { OrthographicCamera, PerspectiveCamera, Raycaster, Vector2 } from 'three';
import {
  ARROW_HEAD_PX,
  axisDragValue,
  clampMagnitude,
  gridPoint,
  nearestSegment,
  pickHandle,
  planeDragPoint,
  projectToPlane,
  screenAxisValue,
  segmentDistance2,
  snapValue,
} from './placementHandles.js';

const close = (actual, expected, digits = 6) => expected.forEach((v, i) => expect(actual[i]).toBeCloseTo(v, digits));
const unit = (v) => {
  const l = Math.hypot(...v);
  return v.map((x) => x / l);
};
// A real three.js pick ray through a canvas point (NDC).
function rayFrom(camera, ndc) {
  camera.updateMatrixWorld();
  const caster = new Raycaster();
  caster.setFromCamera(new Vector2(...ndc), camera);
  return { origin: caster.ray.origin.toArray(), direction: caster.ray.direction.toArray() };
}

describe('axisDragValue', () => {
  it('reads the distance along an arrow under an orthographic ray', () => {
    // Looking straight down: the ray through x = 5 meets the X axis at t = 5.
    const ray = { origin: [5, 3, 100], direction: [0, 0, -1] };
    expect(axisDragValue(ray, [0, 0, 0], [1, 0, 0])).toBeCloseTo(5, 9);
    // An arrow along +Z from (2, 0, 18), seen from the front (ray along +Y).
    const front = { origin: [2, -500, 48], direction: [0, 1, 0] };
    expect(axisDragValue(front, [2, 0, 18], [0, 0, 1])).toBeCloseTo(30, 9);
    // Against the arrow: negative.
    const below = { origin: [2, -500, 6], direction: [0, 1, 0] };
    expect(axisDragValue(below, [2, 0, 18], [0, 0, 1])).toBeCloseTo(-12, 9);
  });

  it('works for perspective rays from a real camera, and for orthographic cameras with zoom', () => {
    const perspective = new PerspectiveCamera(40, 1, 0.1, 1e6);
    perspective.up.set(0, 0, 1);
    perspective.position.set(400, -600, 300);
    perspective.lookAt(0, 0, 0);
    perspective.updateProjectionMatrix();
    perspective.updateMatrixWorld();
    // Project a point on the arrow and cast back through it: the same t.
    for (const t of [0, 25, -40, 120]) {
      const point = [10, 20, 18 + t];
      const ndc = perspective.position
        .clone()
        .set(...point)
        .project(perspective);
      expect(axisDragValue(rayFrom(perspective, [ndc.x, ndc.y]), [10, 20, 18], [0, 0, 1])).toBeCloseTo(t, 4);
    }
    const ortho = new OrthographicCamera(-500, 500, 500, -500, 0.1, 1e6);
    ortho.up.set(0, 0, 1);
    ortho.position.set(1000, -1000, 800);
    ortho.lookAt(0, 0, 0);
    ortho.zoom = 2.5;
    ortho.updateProjectionMatrix();
    ortho.updateMatrixWorld();
    for (const t of [0, 7.5, -3]) {
      const point = [100, 50, t];
      const ndc = ortho.position
        .clone()
        .set(...point)
        .project(ortho);
      expect(axisDragValue(rayFrom(ortho, [ndc.x, ndc.y]), [100, 50, 0], [0, 0, 1])).toBeCloseTo(t, 4);
    }
  });

  it('is null for an arrow that points at the viewer, where screen travel takes over', () => {
    expect(axisDragValue({ origin: [0, 0, 100], direction: [0, 0, -1] }, [0, 0, 0], [0, 0, 1])).toBeNull();
    // Pointer up the screen (negative dy) grows an arrow that points at the viewer.
    expect(screenAxisValue(18, -20, 0.5, 1)).toBe(28);
    expect(screenAxisValue(18, -20, 0.5, -1)).toBe(8);
  });
});

describe('planeDragPoint and grids', () => {
  it('meets the plane, or returns null when parallel or behind', () => {
    close(planeDragPoint({ origin: [3, 4, 50], direction: [0, 0, -1] }, [0, 0, 18], [0, 0, 1]), [3, 4, 18]);
    expect(planeDragPoint({ origin: [0, 0, 50], direction: [1, 0, 0] }, [0, 0, 18], [0, 0, 1])).toBeNull();
    expect(planeDragPoint({ origin: [0, 0, 50], direction: [0, 0, 1] }, [0, 0, 18], [0, 0, 1])).toBeNull();
  });

  it('rounds to the grid of a turned plane frame and keeps the point on it', () => {
    const c = Math.cos(Math.PI / 6),
      s = Math.sin(Math.PI / 6);
    const frame = { origin: [10, 0, 5], x: [c, s, 0], y: [-s, c, 0], normal: [0, 0, 1] };
    const raw = [10 + 12.4 * c - 7.6 * s, 12.4 * s + 7.6 * c, 5];
    close(gridPoint(raw, frame, 5), [10 + 10 * c - 10 * s, 10 * s + 10 * c, 5]);
    expect(gridPoint(raw, frame, 0)).toEqual(raw);
    close(projectToPlane([3, 4, 40], [0, 0, 18], [0, 0, 1]), [3, 4, 18]);
  });

  it('snaps values, cleans -0 and keeps an extrude length off zero', () => {
    expect(snapValue(47.6, 1)).toBe(48);
    expect(snapValue(47.6, 0)).toBe(47.6);
    expect(snapValue(47.6, 5, true)).toBe(47.6);
    expect(Object.is(snapValue(-0.2, 1), 0)).toBe(true);
    expect(clampMagnitude(0.02)).toBe(0.1);
    expect(clampMagnitude(-0.02)).toBe(-0.1);
    expect(clampMagnitude(0)).toBe(0.1);
    expect(clampMagnitude(-6)).toBe(-6);
  });
});

describe('pickHandle', () => {
  // Screen = world x, y (a top view at 1 px / mm).
  const project = (p) => [p[0], p[1]];
  const handles = [
    { id: 'distance', kind: 'arrow', origin: [100, 100, 0], direction: [1, 0, 0], value: 40 },
    { id: 'slide', kind: 'square', at: [100, 100, 0] },
    { id: 'corner', kind: 'grip', at: [120, 120, 0] },
  ];
  it('prefers grips, then arrow heads, then squares, then shafts', () => {
    expect(pickHandle(handles, [121, 119], project, () => ARROW_HEAD_PX).id).toBe('corner');
    // The head runs from the tip (140) to 140 + 18.
    expect(pickHandle(handles, [150, 101], project, () => ARROW_HEAD_PX).id).toBe('distance');
    expect(pickHandle(handles, [103, 102], project, () => ARROW_HEAD_PX).id).toBe('slide');
    // The shaft away from the square.
    expect(pickHandle(handles, [125, 102], project, () => ARROW_HEAD_PX).id).toBe('distance');
    expect(pickHandle(handles, [300, 300], project, () => ARROW_HEAD_PX)).toBeNull();
  });
  it('lets the square win under an arrow seen end-on', () => {
    const endOn = [
      { id: 'distance', kind: 'arrow', origin: [100, 100, 0], direction: [0, 0, 1], value: 40 },
      { id: 'slide', kind: 'square', at: [100, 100, 0] },
    ];
    expect(pickHandle(endOn, [101, 100], project, () => ARROW_HEAD_PX).id).toBe('slide');
    expect(pickHandle(endOn.slice(0, 1), [101, 100], project, () => ARROW_HEAD_PX).id).toBe('distance');
  });
  it('picks a negative (cut) arrow on its own side', () => {
    const cut = [{ id: 'distance', kind: 'arrow', origin: [100, 100, 0], direction: [1, 0, 0], value: -30 }];
    expect(pickHandle(cut, [62, 100], project, () => ARROW_HEAD_PX)?.id).toBe('distance');
    expect(pickHandle(cut, [150, 100], project, () => ARROW_HEAD_PX)).toBeNull();
  });
  it('finds the edge segment under the pointer', () => {
    const segments = [
      [
        [0, 0, 0],
        [100, 0, 0],
      ],
      [
        [0, 50, 0],
        [100, 50, 0],
      ],
    ];
    expect(nearestSegment(segments, [40, 46], project).a).toEqual([0, 50, 0]);
    expect(nearestSegment(segments, [40, 25], project)).toBeNull();
    expect(segmentDistance2([5, 5], [0, 0], [10, 0])).toBe(5);
    expect(unit([3, 4, 0])).toEqual([0.6, 0.8, 0]);
  });
});
