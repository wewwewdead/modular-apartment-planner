export function disposeScene(root, options = {}) {
  if (!root) return;

  const disposeMaterials = options.disposeMaterials ?? false;

  root.traverse((node) => {
    node.geometry?.dispose?.();

    if (!disposeMaterials) return;

    if (Array.isArray(node.material)) {
      node.material.forEach((material) => material?.dispose?.());
      return;
    }

    node.material?.dispose?.();
  });
}
