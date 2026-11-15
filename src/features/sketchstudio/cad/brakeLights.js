// The press brake, hands on the sheet HO-2 (docs/sketch-studio-brake-hands-on.md
// §6.1): the edge of the sheet the pointer is near, lit as a ribbon along its
// run on the part as posed (brakeHands.js edgeSegments), so the operator sees
// which edge a click puts to the backgauge. THREE objects only: the shop layer
// (shopLayer.js) hosts it, hands it the edge's segments and lays it out each
// render; the rules live in brakeHands.js.
//
// A ribbon of round rods, one per segment, a constant width on screen (mm per
// pixel at each rod's middle), in the shop's accent blue on a pale casing:
// never the punch line's orange nor a collision's red. Drawn over the scene
// (no depth test) so the sheet's own faces never bury it; never raycast (the
// edges are picked in screen space). Built on first use, never with the
// viewport itself (CadViewport.dom.test.jsx counts every geometry at mount).
import * as THREE from 'three';

// The shop accent (cad.css --shop-accent), the card's hover blue.
export const EDGE_LIT = '#287fb3';
// The rod's half-width on screen, px, and its casing's.
const STROKE_PX = 2.2,
  CASING_PX = 3.6;
const RENDER_ORDER = 39;
const Y = new THREE.Vector3(0, 1, 0);

/**
 * The lit edge: `group` (add it to the station's root, machine frame),
 * `edge(segments | null)` (the segments to light, machine mm, or none),
 * `layout(mmPerPixelAt)` (each render: every rod its width on screen;
 * `mmPerPixelAt(point)` in machine mm), `lit()` (an edge is lit).
 */
export function createBrakeLights() {
  const group = new THREE.Group();
  group.name = 'press-brake-lights';
  group.visible = false;
  let parts = null;
  const rods = [];
  let segments = [];
  const build = () => {
    const material = (color, opacity) =>
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false });
    parts = {
      geometry: new THREE.CylinderGeometry(1, 1, 1, 10, 1, true),
      stroke: material(EDGE_LIT, 1),
      casing: material('#ffffff', 0.9),
    };
  };
  const rod = (i) => {
    if (!rods[i]) {
      const pair = [
        [parts.casing, RENDER_ORDER],
        [parts.stroke, RENDER_ORDER + 1],
      ].map(([material, order]) => {
        const mesh = new THREE.Mesh(parts.geometry, material);
        mesh.matrixAutoUpdate = false;
        mesh.frustumCulled = false;
        mesh.renderOrder = order;
        mesh.raycast = () => {};
        group.add(mesh);
        return mesh;
      });
      rods[i] = { casing: pair[0], stroke: pair[1] };
    }
    return rods[i];
  };
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    mid = new THREE.Vector3(),
    dir = new THREE.Vector3(),
    q = new THREE.Quaternion(),
    s = new THREE.Vector3();
  return {
    group,
    edge(next) {
      segments = next || [];
      if (segments.length && !parts) build();
      group.visible = segments.length > 0;
      rods.forEach((r, i) => {
        r.casing.visible = r.stroke.visible = i < segments.length;
      });
      for (let i = 0; i < segments.length; i++) rod(i);
    },
    lit: () => segments.length > 0,
    layout(mmPerPixelAt) {
      if (!segments.length) return;
      segments.forEach(([p, r], i) => {
        a.set(...p);
        b.set(...r);
        mid.addVectors(a, b).multiplyScalar(0.5);
        dir.subVectors(b, a);
        const length = dir.length();
        if (length < 1e-9) return;
        q.setFromUnitVectors(Y, dir.divideScalar(length));
        const scale = mmPerPixelAt(mid.toArray());
        const { casing, stroke } = rod(i);
        for (const [mesh, px] of [
          [casing, CASING_PX],
          [stroke, STROKE_PX],
        ]) {
          // A rod a little longer than its run so the ends read round the corner.
          mesh.matrix.compose(mid, q, s.set(px * scale, length + 2 * px * scale, px * scale));
          mesh.matrixWorldNeedsUpdate = true;
        }
      });
    },
    dispose() {
      if (parts) {
        parts.geometry.dispose();
        parts.stroke.dispose();
        parts.casing.dispose();
      }
      group.removeFromParent();
    },
  };
}
