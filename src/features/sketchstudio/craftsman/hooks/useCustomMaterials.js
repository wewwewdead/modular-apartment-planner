import { useCallback, useSyncExternalStore } from 'react';
import {
  addCustomMaterial,
  deleteCustomMaterial,
  duplicateMaterialAsCustom,
  getCustomMaterials,
  subscribeCustomMaterials,
  updateCustomMaterial,
} from '../data/customMaterials';

/**
 * React bindings for the localStorage-backed custom material registry.
 *
 * The registry is a module-level singleton so non-React consumers (BOM adapters,
 * exporters) can resolve materials synchronously. These hooks subscribe to it via
 * `useSyncExternalStore`; `getServerSnapshot` is supplied because several panels
 * are rendered with `react-dom/server` in tests.
 */

/** Current custom material list (stable reference between mutations). */
export function useCustomMaterialList() {
  return useSyncExternalStore(subscribeCustomMaterials, getCustomMaterials, getCustomMaterials);
}

/** List plus memoized mutators, for the material editor UI. */
export default function useCustomMaterials() {
  const customMaterials = useCustomMaterialList();

  const add = useCallback((draft) => addCustomMaterial(draft), []);
  const update = useCallback((id, draft) => updateCustomMaterial(id, draft), []);
  const remove = useCallback((id) => deleteCustomMaterial(id), []);
  const duplicate = useCallback((source, overrides) => duplicateMaterialAsCustom(source, overrides), []);

  return { customMaterials, add, update, remove, duplicate };
}
