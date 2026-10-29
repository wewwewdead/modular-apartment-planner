import { isCircularCutFeature, numeric } from './model.js';
import { sketchLocalFrame, toWorld } from './sketchPlane.js';

// Geometry of a circular cut in part coordinates, shaped like a resolved hole
// cut (kernel `metrics[feature].cut`): position on the sketch plane, the
// direction the cut runs (sketch normal, flipped by `reverse`), diameter.
export function circularCut(feature, model, parameters = {}) {
  if (!isCircularCutFeature(feature, model.sketches)) return null;
  const sketch = model.sketches.find((s) => s.id === feature.sketchId);
  const frame = sketchLocalFrame(sketch, parameters);
  const center = (sketch.profile.center || [0, 0]).map((v) => numeric(v, parameters));
  return {
    position: toWorld(frame, center),
    direction: frame.normal.map((v) => (feature.reverse ? -v : v)),
    diameter: numeric(sketch.profile.radius, parameters) * 2,
    throughAll: feature.throughAll === true,
    depth: feature.throughAll ? null : numeric(feature.length, parameters),
  };
}
