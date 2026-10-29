import { GcsWrapper, SolveStatus } from '@salusoft89/planegcs';
import { clone, numeric, resolveParameters } from './model.js';

// Profile point bindings refer to stable primitive IDs, never array positions.
export function solveSketches(input, module) {
  const model = clone(input),
    parameters = resolveParameters(model.parameters);
  const reports = [];
  for (const sketch of model.sketches) {
    if (!sketch.constrained) continue;
    const wrapper = new GcsWrapper(new module.GcsSystem(), module);
    try {
      const primitives = clone(sketch.primitives || []);
      const ids = new Set();
      for (const primitive of primitives) {
        if (ids.has(primitive.id)) throw new Error(`Duplicate primitive ID: ${primitive.id}`);
        ids.add(primitive.id);
        for (const [key, value] of Object.entries(primitive)) {
          if (typeof value === 'string' && value.startsWith('=')) primitive[key] = numeric(value, parameters);
        }
      }
      wrapper.push_primitives_and_params(primitives);
      const status = wrapper.solve();
      const conflicts = wrapper.get_gcs_conflicting_constraints();
      if (status !== SolveStatus.Success || conflicts.length)
        throw Object.assign(
          new Error(
            `Sketch ${sketch.name}: constraint solve failed (${status}); conflicts: ${conflicts.join(', ') || 'unsatisfied constraints'}.`,
          ),
          { sketchId: sketch.id, constraintIds: conflicts },
        );
      wrapper.apply_solution();
      const solved = wrapper.sketch_index.get_primitives();
      const get = (id) => {
        const item = solved.find((p) => p.id === id);
        if (!item) throw new Error(`Broken sketch binding: ${id}`);
        return item;
      };
      if (sketch.profile.pointIds)
        sketch.profile.points = sketch.profile.pointIds.map((id) => {
          const point = get(id);
          return [point.x, point.y];
        });
      if (sketch.profile.circleId) {
        const circle = get(sketch.profile.circleId),
          center = get(circle.c_id);
        sketch.profile.radius = circle.radius;
        sketch.profile.center = [center.x, center.y];
      }
      reports.push({
        sketchId: sketch.id,
        redundant: wrapper.get_gcs_redundant_constraints(),
        primitives: solved,
        profile: clone(sketch.profile),
      });
    } finally {
      wrapper.destroy_gcs_module();
    }
  }
  return { model, reports };
}
