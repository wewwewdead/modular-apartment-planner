import { cloneWithProceduralDetail } from './proceduralDetail';

/**
 * The tinted copies of palette materials the selection overlay is drawn with:
 * one per (source material, accent), kept for the life of the palette.
 *
 * They used to be cloned for every overlay and disposed with it. A plain clone
 * compiles a program of its own (see `cloneWithProceduralDetail`), the overlay
 * was that program's only user, and a dragged object rebuilds its overlay on
 * every frame — so every drag frame linked a shader on the main thread, and the
 * renderer's async shader warm-up was left polling materials that had been
 * disposed under it. Kept here, a clone compiles once, shares the detailed
 * palette's program, and is disposed with the palette.
 *
 * A material built for one object (`ownedByPreviewObject`) is not cached: it
 * dies with its object, and `disposeScene` frees its clone the same way.
 */
const registries = new WeakMap();

function registryFor(materialPalette) {
  let registry = registries.get(materialPalette);
  if (!registry) {
    registry = { bySource: new WeakMap(), all: [] };
    registries.set(materialPalette, registry);
  }
  return registry;
}

function colorKey(material) {
  return material?.color?.isColor ? material.color.getHex() : null;
}

/**
 * The overlay material for `source` under `accentName`. `tint` styles a fresh
 * clone exactly once; a cached clone is reused while the source's colour and
 * version (its `needsUpdate` count) are what they were when it was made.
 */
export function selectionMaterialFor(materialPalette, source, accentName, tint) {
  if (!source) return source;
  if (!materialPalette || source.userData?.ownedByPreviewObject) {
    const clone = cloneWithProceduralDetail(source);
    tint(clone);
    return clone;
  }
  const registry = registryFor(materialPalette);
  let perAccent = registry.bySource.get(source);
  if (!perAccent) {
    perAccent = new Map();
    registry.bySource.set(source, perAccent);
  }
  const key = `${accentName}`;
  const cached = perAccent.get(key);
  if (cached && cached.version === source.version && cached.color === colorKey(source)) return cached.material;

  const clone = cloneWithProceduralDetail(source);
  clone.userData = { ...clone.userData, ownedByPalette: true, selectionClone: true };
  delete clone.userData.ownedByPreviewObject;
  tint(clone);
  if (cached) {
    const index = registry.all.indexOf(cached.material);
    if (index >= 0) registry.all.splice(index, 1);
    cached.material.dispose();
  }
  perAccent.set(key, { material: clone, version: source.version, color: colorKey(source) });
  registry.all.push(clone);
  return clone;
}

/** Every cached overlay material of a palette, for style changes and disposal. */
export function selectionMaterialsOf(materialPalette) {
  return registries.get(materialPalette)?.all || [];
}

export function disposeSelectionMaterials(materialPalette) {
  const registry = registries.get(materialPalette);
  if (!registry) return;
  for (const material of registry.all) material.dispose();
  registries.delete(materialPalette);
}
