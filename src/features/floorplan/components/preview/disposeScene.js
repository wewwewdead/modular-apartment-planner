function materialsOf(node) {
  if (!node.material) return [];
  return Array.isArray(node.material) ? node.material : [node.material];
}

export function disposeScene(root, options = {}) {
  if (!root) return;

  const disposeMaterials = options.disposeMaterials ?? false;

  root.traverse((node) => {
    // Geometry shared by many meshes (ceiling screw heads) outlives any one
    // group: a rebuild that replaces some of them must not free the buffers the
    // ones it carried over are still drawing from.
    if (!node.geometry?.userData?.shared) node.geometry?.dispose?.();

    // A light owns a shadow render target — a framebuffer and a depth texture —
    // and nothing else in the scene will ever free it. Dropping the light from
    // the graph leaks it, however the caller feels about materials.
    if (node.isLight) node.dispose?.();

    // An instanced batch owns a matrix buffer of its own, separate from the
    // unit geometry every batch shares — and the geometry is the one thing here
    // that must NOT be freed, so the batch has to say so itself.
    if (node.isInstancedMesh || node.isBatchedMesh) node.dispose?.();

    for (const material of materialsOf(node)) {
      // The palette's materials are shared by the whole scene and disposed with
      // it; a material built for one object — a luminaire's lens, coloured to
      // its own lamp — dies with that object whatever the caller asked for.
      if (disposeMaterials || material?.userData?.ownedByPreviewObject) material?.dispose?.();
    }
  });
}
