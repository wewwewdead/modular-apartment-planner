// The shop's records in the viewport (docs/sketch-studio-fab-shop.md §7, §9
// SM-3): print decals, owned by the shop layer (shopLayer.js). Real three.js
// geometry outside `ctx.group`, so no part pick ever sees it.
//
// A print is a textured quad on its face (CanvasTexture for text, the image
// itself for an image), lifted a hair off the face and drawn with a polygon
// offset, following its part. Every geometry, material and texture is this
// module's and is disposed when its record goes, changes shape, or the layer
// is disposed.
import * as THREE from 'three';
import { displayedInstanceMatrix } from './marks.js';
import { printMatrix } from './printStation.js';

// A print sits this far (mm) off its face.
const PRINT_LIFT = 0.04;
// Texture height (px) of a text print; the width follows the artwork's aspect.
const TEXT_PX = 128;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const unit = (a) => {
  const n = Math.hypot(a[0], a[1], a[2]);
  return n > 1e-12 ? scale(a, 1 / n) : null;
};

/** A text print's canvas: the text centred and fitted in the artwork's aspect, on transparent. */
export function textCanvas({ text, font, colour, width, height }) {
  const canvas = document.createElement('canvas');
  canvas.height = TEXT_PX;
  canvas.width = Math.max(8, Math.min(2048, Math.round((TEXT_PX * width) / Math.max(1e-6, height))));
  const g = canvas.getContext?.('2d');
  if (!g) return canvas;
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = colour || '#111111';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let size = TEXT_PX * 0.8;
  g.font = `600 ${size}px ${font || 'sans-serif'}`;
  const measured = g.measureText(String(text)).width;
  if (measured > canvas.width * 0.96) {
    size *= (canvas.width * 0.96) / measured;
    g.font = `600 ${size}px ${font || 'sans-serif'}`;
  }
  g.fillText(String(text), canvas.width / 2, canvas.height / 2 + size * 0.04);
  return canvas;
}

/**
 * @param {{ ctx: object, onChange?: () => void }} options  ctx: the viewport context;
 *   onChange: an image texture has loaded (render again).
 */
export function createShopDecor({ ctx, onChange = () => {} }) {
  const root = new THREE.Group();
  root.name = 'shop-records';
  ctx.scene.add(root);
  // print id → { geometryKey, textureKey, mesh, texture, instanceId, ready, base }
  const prints = new Map();
  let model = null;
  const groupOf = (id) => ctx.group.children.find((g) => g.userData.instanceId === id) || null;
  const displayed = (group) => {
    group.updateMatrix();
    return displayedInstanceMatrix(group.matrix, group.userData.placement);
  };
  const dropPrint = (id) => {
    const entry = prints.get(id);
    if (!entry) return;
    entry.mesh.geometry.dispose();
    entry.mesh.material.dispose();
    entry.texture?.dispose();
    entry.mesh.removeFromParent();
    prints.delete(id);
  };
  const placePrint = (entry, print, group) => {
    const matrix = displayed(group).multiply(new THREE.Matrix4().fromArray(printMatrix(print)));
    matrix.multiply(new THREE.Matrix4().makeTranslation(0, 0, PRINT_LIFT));
    entry.mesh.matrix.copy(matrix);
    entry.mesh.matrixWorldNeedsUpdate = true;
    entry.base = matrix.clone();
  };
  const textureFor = (print, entry) => {
    if (print.kind === 'image') {
      const image = new Image();
      const texture = new THREE.Texture(image);
      texture.colorSpace = THREE.SRGBColorSpace;
      image.onload = () => {
        if (prints.get(print.id) !== entry || entry.texture !== texture) return;
        texture.needsUpdate = true;
        entry.ready = true;
        entry.mesh.visible = entry.shown;
        onChange();
      };
      image.src = print.image;
      return { texture, ready: false };
    }
    const texture = new THREE.CanvasTexture(textCanvas(print));
    texture.colorSpace = THREE.SRGBColorSpace;
    return { texture, ready: true };
  };
  const syncPrint = (print, group) => {
    let entry = prints.get(print.id);
    const geometryKey = `${print.width}|${print.height}`;
    const textureKey =
      print.kind === 'image'
        ? `image|${print.image}`
        : `text|${print.text}|${print.font}|${print.colour}|${print.width}|${print.height}`;
    if (!entry) {
      const material = new THREE.MeshBasicMaterial({
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(print.width, print.height), material);
      mesh.name = 'print-decal';
      mesh.userData.printId = print.id;
      mesh.matrixAutoUpdate = false;
      mesh.renderOrder = 3;
      root.add(mesh);
      entry = { geometryKey, textureKey: null, mesh, texture: null, instanceId: print.instanceId, ready: false };
      prints.set(print.id, entry);
    }
    if (entry.geometryKey !== geometryKey) {
      entry.mesh.geometry.dispose();
      entry.mesh.geometry = new THREE.PlaneGeometry(print.width, print.height);
      entry.geometryKey = geometryKey;
    }
    if (entry.textureKey !== textureKey) {
      entry.texture?.dispose();
      const { texture, ready } = textureFor(print, entry);
      entry.texture = texture;
      entry.ready = ready;
      entry.mesh.material.map = texture;
      entry.mesh.material.needsUpdate = true;
      entry.textureKey = textureKey;
    }
    entry.instanceId = print.instanceId;
    entry.mesh.material.clippingPlanes = ctx.materials.clipping?.() || [];
    entry.shown = group.visible;
    entry.mesh.visible = group.visible && entry.ready;
    placePrint(entry, print, group);
  };
  return {
    /** Draw `next`'s prints on the displayed parts. options: { hidden (nothing shows: the press brake) }. */
    sync(next, options = {}) {
      model = next;
      root.visible = !options.hidden;
      const list = model?.prints || [];
      for (const id of [...prints.keys()]) if (!list.some((p) => p.id === id)) dropPrint(id);
      for (const print of list) {
        const group = groupOf(print.instanceId);
        if (!group) {
          dropPrint(print.id);
          continue;
        }
        syncPrint(print, group);
      }
    },
    /** The parts moved on screen (a gizmo drag): the prints follow, nothing is rebuilt. */
    syncPoses() {
      for (const print of model?.prints || []) {
        const entry = prints.get(print.id),
          group = groupOf(print.instanceId);
        if (entry && group) placePrint(entry, print, group);
      }
    },
    /** The print under a ray ({ id, point } world), or null. */
    pickPrint(raycaster) {
      if (!root.visible) return null;
      root.updateMatrixWorld(true);
      const shown = [...prints.values()].filter((e) => e.mesh.visible).map((e) => e.mesh);
      const hit = raycaster.intersectObjects(shown, false)[0];
      return hit ? { id: hit.object.userData.printId, point: hit.point.toArray() } : null;
    },
    /** A print's frame in world: { origin (its centre, on the face), x, normal }, or null. */
    printWorld(id) {
      const entry = prints.get(id);
      if (!entry?.base) return null;
      const e = entry.base.elements;
      const normal = unit([e[8], e[9], e[10]]);
      return { origin: sub([e[12], e[13], e[14]], scale(normal, PRINT_LIFT)), x: unit([e[0], e[1], e[2]]), normal };
    },
    /** Show a print dragged to `origin` (world, its centre on the face) until the model says where it is. */
    previewPrint(id, origin) {
      const entry = prints.get(id);
      if (!entry?.base) return;
      const e = entry.base.elements;
      const n = unit([e[8], e[9], e[10]]);
      entry.mesh.matrix.copy(entry.base).setPosition(...add(origin, scale(n, PRINT_LIFT)));
      entry.mesh.matrixWorldNeedsUpdate = true;
    },
    /** Put a previewed print back where its record says. */
    resetPrint(id) {
      const entry = prints.get(id);
      if (!entry?.base) return;
      entry.mesh.matrix.copy(entry.base);
      entry.mesh.matrixWorldNeedsUpdate = true;
    },
    state() {
      root.updateMatrixWorld(true);
      return {
        shown: root.visible,
        prints: [...prints.entries()].map(([id, entry]) => {
          const [w, h] = entry.geometryKey.split('|').map(Number);
          const corners = [
            [-0.5, -0.5],
            [0.5, -0.5],
            [0.5, 0.5],
            [-0.5, 0.5],
          ].map(([u, v]) => new THREE.Vector3(u * w, v * h, 0).applyMatrix4(entry.mesh.matrix).toArray());
          const e = entry.mesh.matrix.elements;
          return {
            id,
            instanceId: entry.instanceId,
            visible: entry.mesh.visible && root.visible,
            ready: entry.ready,
            centre: [e[12], e[13], e[14]],
            corners,
          };
        }),
      };
    },
    dispose() {
      for (const id of [...prints.keys()]) dropPrint(id);
      ctx.scene.remove(root);
    },
  };
}
