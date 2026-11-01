import * as cad from 'replicad';
import { exactProjection } from './projection.js';
import { mapPlacement } from './placement.js';
import { resolveCutPlacement, resolveRow } from './cutPlacement.js';
import { hardwareGeometry } from './hardwareGeometry.js';
import {
  normalizeModel,
  resolveParameters,
  numeric,
  positive,
  vector,
  memberMetrics,
  validateReferences,
  isCircularCutFeature,
} from './model.js';

const axes = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
export const VIEW_PLANES = { front: 'front', rear: 'back', top: 'top', bottom: 'bottom', left: 'left', right: 'right' };

// Own every retained native object. Operations consuming sketches can delete them
// early; delete() is idempotent for Replicad wrappers.
export function createKernelSession(input) {
  const model = normalizeModel(input),
    params = resolveParameters(model.parameters);
  const diagnostics = validateReferences(model);
  if (diagnostics.length) throw Object.assign(new Error(diagnostics[0].message), { diagnostics });
  const owned = new Set();
  const own = (shape) => {
    if (shape?.delete) owned.add(shape);
    return shape;
  };
  const n = (v) => numeric(v, params),
    p = (v) => positive(v, params),
    v = (value) => vector(value, params);
  const point2 = (point) => {
    if (!Array.isArray(point) || point.length !== 2) throw new Error('Expected a 2D point.');
    return point.map(n);
  };
  const shapes = new Map(),
    featureShapes = new Map(),
    metrics = new Map(),
    visiting = new Set(),
    placed = new Map(),
    placements = new Map();
  const dispose = () => {
    for (const shape of [...owned].reverse()) {
      try {
        shape.delete();
      } catch {
        /* already consumed by the kernel */
      }
    }
    owned.clear();
  };

  const drawing = (profile) => {
    let d;
    if (profile.type === 'rectangle') {
      const w = p(profile.width),
        h = p(profile.height),
        origin = point2(profile.origin || [0, 0]);
      d = cad.drawRectangle(w, h).translate(origin[0] + w / 2, origin[1] + h / 2);
    } else if (profile.type === 'circle')
      d = cad.drawCircle(p(profile.radius)).translate(point2(profile.center || [0, 0]));
    else if (profile.type === 'polygon') {
      if (profile.points?.length < 3) throw new Error('A polygon needs at least three vertices.');
      const pen = cad.draw(point2(profile.points[0]));
      profile.points.slice(1).forEach((pt) => pen.lineTo(point2(pt)));
      d = pen.close();
    } else if (profile.type === 'path') {
      const pen = cad.draw(point2(profile.start));
      for (const segment of profile.segments || []) {
        if (segment.construction) continue;
        if (segment.type === 'line') pen.lineTo(point2(segment.end));
        else if (segment.type === 'arc') pen.threePointsArcTo(point2(segment.end), point2(segment.mid));
        else if (segment.type === 'spline')
          pen.cubicBezierCurveTo(point2(segment.end), point2(segment.control1), point2(segment.control2));
        else throw new Error(`Unsupported sketch segment: ${segment.type}`);
      }
      d = profile.closed === false ? pen.done() : pen.close();
    } else throw new Error(`Unsupported profile: ${profile.type}`);
    if (profile.offset) d = d.offset(n(profile.offset));
    for (const hole of profile.holes || []) d = d.cut(drawing(hole));
    return d;
  };
  const sketch = (id) => {
    const s = model.sketches.find((item) => item.id === id);
    if (!s) throw new Error(`Broken sketch reference: ${id}`);
    if (s.normal) {
      const normal = v(s.normal),
        xDirection = v(s.xDirection || [1, 0, 0]);
      if (Math.hypot(...normal) < 1e-9 || Math.hypot(...xDirection) < 1e-9)
        throw new Error('Sketch normal and horizontal direction must be nonzero.');
      return own(drawing(s.profile).sketchOnPlane(own(new cad.Plane(v(s.origin || [0, 0, 0]), xDirection, normal))));
    }
    return own(drawing(s.profile).sketchOnPlane(s.plane || 'XY', v(s.origin || [0, 0, 0])));
  };
  const closedSketch = (id) => {
    const s = model.sketches.find((item) => item.id === id);
    if (!s) throw new Error('Choose a closed profile sketch first.');
    if (s.profile.type === 'path' && s.profile.closed === false)
      throw new Error('This operation needs a closed profile. Close the outline or choose another sketch.');
    return sketch(id);
  };
  const transform = (shape, position = [0, 0, 0], rotation = [0, 0, 0]) => {
    let result = shape;
    v(rotation).forEach((angle, index) => {
      if (angle) result = own(result.rotate(angle, [0, 0, 0], axes[index]));
    });
    return own(result.translate(v(position)));
  };
  const selector = (reference, face = false) => {
    if (!reference?.plane || !Number.isInteger(reference.expectedCount) || reference.expectedCount < 1)
      throw new Error('Choose a plane with matching edges/faces, and a positive expected match count.');
    const fn = (finder) => finder.inPlane(reference.plane, n(reference.offset || 0));
    return {
      fn,
      check(shape) {
        const finder = own(face ? new cad.FaceFinder() : new cad.EdgeFinder());
        const matches = fn(finder).find(shape);
        matches.forEach(own);
        if (matches.length !== reference.expectedCount)
          throw new Error(
            `Broken or ambiguous reference: expected ${reference.expectedCount} ${face ? 'faces' : 'edges'}, found ${matches.length}.`,
          );
      },
    };
  };

  const member = (f) => {
    const m = memberMetrics(f, params),
      s = m.section;
    const extent = Math.max(s.width || s.diameter, s.height || s.diameter);
    // Build a longer hollow extrusion, then intersect with the two actual end planes.
    const extra = extent * 8,
      length = m.centerline;
    let shape;
    if (s.type === 'pipe' || s.type === 'round-bar') {
      shape = own(cad.makeCylinder(s.diameter / 2, length + 2 * extra, [0, 0, -extra]));
      if (s.type === 'pipe')
        shape = own(
          shape.cut(own(cad.makeCylinder(s.diameter / 2 - s.wall, length + 2 * extra + 2, [0, 0, -extra - 1]))),
        );
    } else {
      shape = own(cad.makeBox([-s.width / 2, -s.height / 2, -extra], [s.width / 2, s.height / 2, length + extra]));
      if (s.type === 'tube')
        shape = own(
          shape.cut(
            own(
              cad.makeBox(
                [-s.width / 2 + s.wall, -s.height / 2 + s.wall, -extra - 1],
                [s.width / 2 - s.wall, s.height / 2 - s.wall, length + extra + 1],
              ),
            ),
          ),
        );
      if (s.type === 'angle')
        shape = own(
          shape.cut(
            own(
              cad.makeBox(
                [-s.width / 2 + s.wall, -s.height / 2 + s.wall, -extra - 1],
                [s.width, s.height, length + extra + 1],
              ),
            ),
          ),
        );
    }
    for (const [z, angle, side] of [
      [0, m.angleStart, 'positive'],
      [length, m.angleEnd, 'negative'],
    ]) {
      const rad = (angle * Math.PI) / 180;
      const plane = own(
        new cad.Plane([0, 0, z], [Math.cos(rad), 0, -Math.sin(rad)], [Math.sin(rad), 0, Math.cos(rad)]),
      );
      const split = shape.split(plane);
      own(split.positive);
      own(split.negative);
      if (!split[side]) throw new Error('End trim removed the complete member.');
      shape = split[side];
    }
    const delta = m.end.map((x, i) => x - m.start[i]);
    const total = Math.hypot(...delta),
      dir = delta.map((x) => x / total);
    const rotationAxis = [-dir[1], dir[0], 0];
    if (Math.hypot(...rotationAxis) > 1e-9)
      shape = own(
        shape.rotate((Math.acos(Math.max(-1, Math.min(1, dir[2]))) * 180) / Math.PI, [0, 0, 0], rotationAxis),
      );
    else if (dir[2] < 0) shape = own(shape.rotate(180, [0, 0, 0], [1, 0, 0]));
    shape = own(shape.translate(m.start.map((x, i) => x + dir[i] * m.gapStart)));
    return { shape, metrics: m };
  };

  const build = (partId) => {
    if (shapes.has(partId)) return shapes.get(partId);
    if (visiting.has(partId)) throw new Error(`Circular part dependency: ${partId}`);
    const part = model.parts.find((part) => part.id === partId);
    if (!part) throw new Error(`Missing part: ${partId}`);
    visiting.add(partId);
    let shape;
    const featureMetrics = {};
    const history = new Map();
    for (const f of part.features || []) {
      if (f.suppressed) continue;
      try {
        let next;
        switch (f.type) {
          case 'hardware':
            next = hardwareGeometry(f, params, own);
            break;
          case 'box':
            next = own(cad.makeBox([0, 0, 0], [p(f.width), p(f.depth), p(f.height)]));
            break;
          case 'cylinder':
            next = own(cad.makeCylinder(p(f.radius), p(f.length)));
            break;
          case 'member': {
            const result = member(f);
            next = result.shape;
            featureMetrics[f.id] = result.metrics;
            break;
          }
          case 'extrude': {
            // reverse runs against the sketch normal; throughAll reaches past
            // the far side of the current solid in the chosen direction.
            let length;
            if (f.throughAll) {
              if (!shape) throw new Error('Through all needs an earlier solid in this part.');
              const [min, max] = own(shape.boundingBox).bounds;
              const center = min.map((x, i) => (x + max[i]) / 2);
              const origin = v(model.sketches.find((s) => s.id === f.sketchId)?.origin || [0, 0, 0]);
              length =
                Math.hypot(...max.map((x, i) => x - min[i])) / 2 +
                Math.hypot(...origin.map((x, i) => x - center[i])) +
                1;
            } else length = p(f.length);
            next = own(closedSketch(f.sketchId).extrude(f.reverse ? -length : length));
            break;
          }
          case 'revolve':
            if (p(f.angle ?? 360) > 360)
              throw new Error('Revolve angle must be greater than zero and at most 360 degrees.');
            if (Math.hypot(...v(f.axis || [0, 1, 0])) < 1e-9) throw new Error('Choose a nonzero revolve axis.');
            next = own(
              closedSketch(f.sketchId).revolve(v(f.axis || [0, 1, 0]), {
                origin: v(f.origin || [0, 0, 0]),
                angle: p(f.angle ?? 360),
              }),
            );
            break;
          case 'loft':
            if (!f.sections?.length || new Set([f.sketchId, ...f.sections]).size !== f.sections.length + 1)
              throw new Error('Loft needs at least two different closed section sketches, ordered from start to end.');
            next = own(closedSketch(f.sketchId).loftWith(f.sections.map(closedSketch), { ruled: f.ruled === true }));
            break;
          case 'sweep': {
            if (!f.sketchId || f.sketchId === f.profileId)
              throw new Error('Choose a path and a different closed cross-section profile.');
            const profile = model.sketches.find((s) => s.id === f.profileId);
            if (!profile) throw new Error(`Broken sweep profile: ${f.profileId}`);
            if (profile.profile.type === 'path' && profile.profile.closed === false)
              throw new Error('The sweep cross section must be closed. The path may be open.');
            const { holes = [], ...outer } = profile.profile;
            next = own(sketch(f.sketchId).sweepSketch((plane) => own(drawing(outer).sketchOnPlane(plane))));
            for (const hole of holes) {
              const tool = own(sketch(f.sketchId).sweepSketch((plane) => own(drawing(hole).sketchOnPlane(plane))));
              next = own(next.cut(tool));
            }
            break;
          }
          case 'hole':
          case 'pocket': {
            if (!shape) throw new Error('A cut requires an earlier solid.');
            // One tool per hole: a single cut, or every centre of a hole row
            // (Phase K, feature.row), cut one at a time so a hole that misses
            // is named.
            let tools;
            let row = null;
            if (f.type === 'pocket' && f.shape !== 'rectangle') {
              if (!f.sketchId) throw new Error('Choose a closed sketch for this pocket, or use a rectangular pocket.');
              tools = [own(sketch(f.sketchId).extrude(p(f.depth)))];
            } else {
              const cut = resolveCutPlacement(
                f,
                part.features.slice(0, part.features.indexOf(f)),
                own(shape.boundingBox).bounds,
                params,
              );
              row = resolveRow(f, cut, params);
              // Start just outside the nominal surface, while blind depth still
              // ends at the requested distance from that surface.
              const clearance = f.placement || f.throughAll || f.shape === 'rectangle' ? 0.01 : 0;
              tools = (row ? row.centres : [cut.position]).map((centre) => {
                const start = centre.map((x, i) => x - cut.direction[i] * clearance);
                return f.type === 'hole'
                  ? own(cad.makeCylinder(p(f.diameter) / 2, cut.depth + clearance, start, cut.direction))
                  : own(
                      own(
                        drawing({
                          type: 'rectangle',
                          width: p(f.width),
                          height: p(f.height),
                          origin: [-p(f.width) / 2, -p(f.height) / 2],
                        }).sketchOnPlane(own(new cad.Plane(start, cut.widthDirection, cut.direction))),
                      ).extrude(cut.depth + clearance),
                    );
              });
              featureMetrics[f.id] = { cut, ...(row ? { row } : {}) };
            }
            let removedVolume = 0;
            next = shape;
            tools.forEach((tool, k) => {
              const before = cad.measureVolume(next);
              const after = own(next.cut(tool));
              const removed = before - cad.measureVolume(after);
              if (removed <= Math.max(1e-7, before * 1e-12))
                throw new Error(
                  row && row.count > 1
                    ? `Hole ${k + 1} of ${row.count} removes no material. Shorten the spacing or move the row; the tool may miss the part or overlap an existing cut.`
                    : 'Cut removes no material. Change the side, position or depth; the tool may miss the part or overlap an existing cut.',
                );
              removedVolume += removed;
              next = after;
            });
            featureMetrics[f.id] = { ...featureMetrics[f.id], removedVolume };
            break;
          }
          case 'union':
          case 'subtract':
          case 'intersect': {
            if (!shape) throw new Error('A Boolean operation requires an earlier solid.');
            const tool = transform(own(build(f.toolPartId).clone()), f.position, f.rotation);
            next = own(shape[{ union: 'fuse', subtract: 'cut', intersect: 'intersect' }[f.type]](tool));
            break;
          }
          case 'fillet':
          case 'chamfer': {
            if (!shape) throw new Error('Select a solid first.');
            const ref = selector(f.reference);
            ref.check(shape);
            next = own(shape[f.type](p(f.radius), ref.fn));
            break;
          }
          case 'shell': {
            if (!shape) throw new Error('Select a solid first.');
            if (!n(f.thickness)) throw new Error('Shell thickness cannot be zero.');
            const ref = selector(f.reference, true);
            ref.check(shape);
            next = own(shape.shell(n(f.thickness), ref.fn));
            break;
          }
          case 'mirror':
            next = own(shape.mirror(f.plane || 'YZ', v(f.origin || [0, 0, 0])));
            break;
          case 'pattern': {
            const count = p(f.count);
            if (!Number.isInteger(count) || count > 100)
              throw new Error('Pattern count must be an integer from 1 to 100.');
            if (count < 2) throw new Error('Use at least two copies for a pattern.');
            if (f.circular ? Math.abs(n(f.angle || 0) % 360) < 1e-9 : Math.hypot(...v(f.step)) < 1e-9)
              throw new Error('Set a nonzero spacing or circular angle so the copies do not coincide.');
            const copies = [shape];
            for (let index = 1; index < count; index++)
              copies.push(
                f.circular
                  ? own(own(shape.clone()).rotate(n(f.angle) * index, v(f.origin || [0, 0, 0]), v(f.axis || [0, 0, 1])))
                  : own(own(shape.clone()).translate(v(f.step).map((x) => x * index))),
              );
            next = own(cad.makeCompound(copies).asShape3D());
            break;
          }
          case 'trim': {
            const plane = own(new cad.Plane(v(f.origin), undefined, v(f.normal)));
            const split = shape.split(plane);
            own(split.positive);
            own(split.negative);
            next = split[f.side || 'positive'];
            if (!next) throw new Error('Trim removed the complete part.');
            break;
          }
          case 'transform':
            next = transform(shape, f.position, f.rotation);
            break;
          default:
            throw new Error(`Unsupported solid feature: ${f.type}`);
        }
        if (
          shape &&
          ['hardware', 'box', 'cylinder', 'member', 'extrude', 'revolve', 'sweep', 'loft'].includes(f.type)
        ) {
          const operation = f.operation || 'add';
          const method = { add: 'fuse', cut: 'cut', intersect: 'intersect' }[operation];
          if (method) next = own(shape[method](next));
          else if (operation !== 'replace') throw new Error(`Unknown feature operation: ${operation}`);
        }
        if (!next || next.isNull || !(cad.measureVolume(next) > 1e-8))
          throw new Error('Operation produced no solid volume.');
        if (shape && (['subtract', 'trim'].includes(f.type) || f.operation === 'cut')) {
          const removed = cad.measureVolume(shape) - cad.measureVolume(next);
          if (removed <= Math.max(1e-7, cad.measureVolume(shape) * 1e-12))
            throw new Error(
              'Operation removes no material. Check the tool position, sketch plane, direction or retained side.',
            );
        }
        shape = next;
        history.set(f.id, shape);
        const box = own(shape.boundingBox);
        featureMetrics[f.id] = { ...featureMetrics[f.id], bounds: box.bounds, volume: cad.measureVolume(shape) };
      } catch (error) {
        const detail =
          error?.message ||
          (typeof error === 'number'
            ? 'Geometry could not be built. Check profile intersections, tool placement, radius/thickness and selected references.'
            : String(error));
        throw Object.assign(new Error(`${part.name} / ${f.type}: ${detail}`), {
          partId,
          featureId: f.id,
        });
      }
    }
    if (!shape) throw new Error(`${part.name} has no active solid features.`);
    shapes.set(partId, shape);
    metrics.set(partId, featureMetrics);
    featureShapes.set(partId, history);
    visiting.delete(partId);
    return shape;
  };

  try {
    model.parts.forEach((part) => build(part.id));
    const placing = new Set();
    const applyOperations = (shape, operations) => {
      let result = shape;
      for (const op of operations)
        result = own(op.translation ? result.translate(op.translation) : result.rotate(op.angle, op.origin, op.axis));
      return result;
    };
    const place = (id) => {
      if (placed.has(id)) return placed.get(id);
      if (placing.has(id)) throw new Error(`Circular assembly attachment: ${id}`);
      const instance = model.instances.find((i) => i.id === id);
      placing.add(id);
      let shape = transform(own(build(instance.partId).clone()), instance.position, instance.rotation);
      const operations = v(instance.rotation || [0, 0, 0])
        .map((angle, i) => ({ angle, axis: axes[i], origin: [0, 0, 0] }))
        .filter((op) => op.angle);
      operations.push({ translation: v(instance.position || [0, 0, 0]) });
      const attachments = model.connections.filter((c) => c.from === id && c.type !== 'weld');
      if (attachments.length > 1) throw new Error(`Conflicting attachments on ${id}`);
      for (const c of attachments) {
        const target = place(c.to);
        if (c.type === 'fixed') {
          const attachment = [{ translation: v(c.offset || [0, 0, 0]) }, ...placements.get(c.to)];
          shape = applyOperations(shape, attachment);
          operations.push(...attachment);
        } else if (c.type === 'concentric') {
          const targetInstance = model.instances.find((i) => i.id === c.to);
          // holeIndex (Phase K): which hole of a hole row the axis runs through.
          const getAxis = (inst, featureId, holeIndex = 0) => {
            const definition = model.parts.find((p) => p.id === inst.partId);
            const feature = definition.features.find((f) => f.id === featureId && !f.suppressed);
            if (!feature || !['hardware', 'cylinder', 'hole', 'member'].includes(feature.type))
              throw new Error(`Broken cylindrical axis reference: ${featureId}`);
            if (
              definition.features
                .slice(definition.features.indexOf(feature) + 1)
                .some((f) => !f.suppressed && ['transform', 'mirror', 'pattern'].includes(f.type))
            )
              throw new Error(
                'Axis references are ambiguous after transforms or patterns. Use an explicit instance placement.',
              );
            const resolvedCut = metrics.get(inst.partId)?.[feature.id]?.cut;
            const rowCentre = metrics.get(inst.partId)?.[feature.id]?.row?.centres?.[holeIndex];
            const origin =
              feature.type === 'member'
                ? v(feature.start)
                : rowCentre || resolvedCut?.position || v(feature.position || [0, 0, 0]);
            const direction =
              feature.type === 'member'
                ? v(feature.end).map((x, i) => x - origin[i])
                : resolvedCut?.direction ||
                  v(feature.direction || (feature.type === 'hardware' ? [0, 0, -1] : [0, 0, 1]));
            const length = Math.hypot(...direction);
            const pose = inst.id === id ? operations : placements.get(inst.id);
            return {
              origin: mapPlacement(origin, pose),
              direction: mapPlacement(
                direction.map((x) => x / length),
                pose,
                true,
              ),
            };
          };
          const a = getAxis(instance, c.fromFeatureId),
            b = getAxis(targetInstance, c.toFeatureId, Number.isInteger(c.holeIndex) ? c.holeIndex : 0);
          const [ax, ay, az] = a.direction,
            [bx, by, bz] = b.direction;
          let axis = [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
          const dot = ax * bx + ay * by + az * bz,
            angle = (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
          if (Math.hypot(...axis) < 1e-9 && dot < 0) axis = Math.abs(ax) < 0.9 ? [0, az, -ay] : [-az, 0, ax];
          const attachment = [];
          if (angle > 1e-8) attachment.push({ angle, origin: a.origin, axis });
          attachment.push({ translation: b.origin.map((x, i) => x - a.origin[i] + b.direction[i] * n(c.offset || 0)) });
          shape = applyOperations(shape, attachment);
          operations.push(...attachment);
        } else if (c.type === 'face-offset' && c.fromReference && c.toReference) {
          const from = selector(c.fromReference, true),
            to = selector(c.toReference, true);
          from.check(shape);
          to.check(target);
          const a = own(shape.findFace(from.fn)),
            b = own(target.findFace(to.fn));
          const normal = own(a.normalAt()).toTuple(),
            targetNormal = own(b.normalAt()).toTuple();
          const dot = normal.reduce((sum, x, i) => sum + x * targetNormal[i], 0);
          if (Math.abs(dot) < 0.999999) throw new Error('Face-offset references must be parallel planar faces.');
          const ac = own(a.center).toTuple(),
            bc = own(b.center).toTuple();
          const distance = bc.reduce((sum, x, i) => sum + (x - ac[i]) * normal[i], 0) + n(c.offset || 0);
          const translation = normal.map((x) => x * distance);
          shape = own(shape.translate(translation));
          operations.push({ translation });
        } else if (c.type === 'align' || c.type === 'face-offset') {
          const axis = ['X', 'Y', 'Z'].indexOf(c.axis || 'Z');
          const a = own(shape.boundingBox).bounds,
            b = own(target.boundingBox).bounds;
          const translation = [0, 0, 0];
          translation[axis] =
            b[c.targetSide === 'min' ? 0 : 1][axis] - a[c.sourceSide === 'max' ? 1 : 0][axis] + n(c.offset || 0);
          shape = own(shape.translate(translation));
          operations.push({ translation });
        } else throw new Error(`Unsupported attachment: ${c.type}`);
      }
      placing.delete(id);
      placed.set(id, shape);
      placements.set(id, operations);
      return shape;
    };
    model.instances.forEach((i) => place(i.id));
  } catch (error) {
    dispose();
    throw error;
  }

  const bounds = (shape) => own(shape.boundingBox).bounds;
  const projection = (shape, view) => {
    const camera =
      view === 'isometric' || view === 'exploded'
        ? own(new cad.ProjectionCamera([0, 0, 0], [1, -1, 1]))
        : VIEW_PLANES[view]
          ? own(cad.lookFromPlane(VIEW_PLANES[view]))
          : null;
    if (!camera) throw new Error(`Unknown drawing view: ${view}`);
    return exactProjection(shape, camera, own);
  };
  const assemblyShape = () =>
    own(cad.makeCompound([...placed.values()].map((shape) => own(shape.clone()))).asShape3D());
  return {
    model,
    params,
    shapes,
    placed,
    metrics,
    dispose,
    bounds,
    projection,
    assemblyShape,
    referenceOptions(partId, beforeFeatureId) {
      const part = model.parts.find((p) => p.id === partId);
      if (!part) throw new Error('Select a part before choosing edges or faces.');
      const previous = beforeFeatureId
        ? part.features
            .slice(
              0,
              part.features.findIndex((f) => f.id === beforeFeatureId),
            )
            .filter((f) => !f.suppressed)
            .at(-1)
        : null;
      const shape = beforeFeatureId ? featureShapes.get(partId).get(previous?.id) : shapes.get(partId);
      if (!shape) return [];
      const box = bounds(shape),
        result = [];
      for (const [plane, axis, names] of [
        ['XY', 2, ['Bottom', 'Top']],
        ['XZ', 1, ['Front', 'Rear']],
        ['YZ', 0, ['Left', 'Right']],
      ]) {
        for (const index of [0, 1]) {
          const offset = box[index][axis];
          const edges = own(new cad.EdgeFinder()).inPlane(plane, offset).find(shape);
          const faces = own(new cad.FaceFinder()).inPlane(plane, offset).find(shape);
          edges.forEach(own);
          faces.forEach(own);
          result.push({ plane, offset, label: `${names[index]} (${plane})`, edges: edges.length, faces: faces.length });
        }
      }
      return result;
    },
    snapshot() {
      return {
        parameters: params,
        parts: model.parts.map((part) => ({
          id: part.id,
          bounds: bounds(shapes.get(part.id)),
          volume: cad.measureVolume(shapes.get(part.id)),
          features: metrics.get(part.id),
        })),
        instances: model.instances.map((i) => ({
          id: i.id,
          partId: i.partId,
          mesh: placed.get(i.id).mesh({ tolerance: 0.15, angularTolerance: 0.15 }),
          edges: placed.get(i.id).meshEdges({ tolerance: 0.15 }),
          bounds: bounds(placed.get(i.id)),
          placement: placements.get(i.id),
        })),
      };
    },
    inspect() {
      const collisions = [];
      const entries = [...placed];
      for (let a = 0; a < entries.length; a++)
        for (let b = a + 1; b < entries.length; b++) {
          const overlap = own(entries[a][1].intersect(entries[b][1]));
          const volume = overlap.isNull ? 0 : cad.measureVolume(overlap);
          if (volume > 0.001) collisions.push({ first: entries[a][0], second: entries[b][0], volume });
        }
      return collisions;
    },
    drawings({ includeParts = false } = {}) {
      if (!placed.size && !shapes.size) return [];
      const sheets = [...model.sheets];
      if (includeParts)
        for (const part of model.parts) {
          if (sheets.some((sheet) => sheet.partId === part.id)) continue;
          const box = bounds(shapes.get(part.id)),
            maxSize = Math.max(...box[1].map((x, i) => x - box[0][i]));
          const scale = [1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01, 0.005].find((s) => s * maxSize < 55) || 0.001;
          const holes = part.features
            .filter((f) => (!f.suppressed && f.type === 'hole') || isCircularCutFeature(f, model.sketches))
            .map((f) => ({ id: `hole-${f.id}`, type: 'hole', partId: part.id, featureId: f.id }));
          const base = {
            id: `detail-${part.id}`,
            title: part.name,
            partId: part.id,
            size: 'A3',
            units: 'mm',
            scale,
            revision: model.sheets[0].revision,
            tolerance: model.sheets[0].tolerance,
            material: part.material,
            views: ['front', 'top', 'right', 'isometric'],
            annotations: [{ id: `label-${part.id}`, type: 'part-number', partId: part.id }, ...holes.slice(0, 6)],
          };
          sheets.push(base);
          for (let start = 6; start < holes.length; start += 6)
            sheets.push({
              ...base,
              id: `${base.id}-drilling-${start}`,
              title: `${part.name} drilling ${start / 6 + 1}`,
              views: ['top'],
              annotations: holes.slice(start, start + 6),
            });
        }
      return sheets.map((sheet) => {
        let shape = sheet.partId
          ? shapes.get(sheet.partId)
          : sheet.instanceIds?.length
            ? own(cad.makeCompound(sheet.instanceIds.map((id) => own(placed.get(id).clone()))).asShape3D())
            : assemblyShape();
        let sectionPlane = null;
        if (sheet.section) {
          sectionPlane = own(new cad.Plane(v(sheet.section.origin), undefined, v(sheet.section.normal)));
          const split = shape.split(sectionPlane);
          own(split.positive);
          own(split.negative);
          shape = split[sheet.section.side || 'negative'];
          if (!shape) throw new Error(`Section ${sheet.title} does not cross the model.`);
          if (sheet.section.depth != null) {
            const normal = v(sheet.section.normal),
              sign = sheet.section.side === 'positive' ? 1 : -1;
            const length = Math.hypot(...normal),
              depth = p(sheet.section.depth);
            const origin = v(sheet.section.origin).map((x, i) => x + ((sign * normal[i]) / length) * depth);
            const depthSplit = shape.split(own(new cad.Plane(origin, undefined, normal)));
            own(depthSplit.positive);
            own(depthSplit.negative);
            shape = depthSplit[sign > 0 ? 'negative' : 'positive'];
            if (!shape) throw new Error('Section viewing depth contains no geometry.');
          }
        }
        const cutFaces = sectionPlane ? own(new cad.FaceFinder()).inPlane(sectionPlane).find(shape).map(own) : [];
        return {
          ...sheet,
          bounds: bounds(shape),
          views: sheet.views.map((entry) => {
            const config = typeof entry === 'string' ? { name: entry, view: entry } : entry;
            const view = config.view || config.name;
            const viewShape =
              view === 'exploded'
                ? own(
                    cad
                      .makeCompound(
                        [...placed.entries()]
                          .filter(([id]) => !sheet.instanceIds?.length || sheet.instanceIds.includes(id))
                          .map(([, s], index) =>
                            own(own(s.clone()).translateZ(index * n(sheet.explodeDistance ?? 85))),
                          ),
                      )
                      .asShape3D(),
                  )
                : shape;
            const projected = projection(viewShape, view);
            const hatch = cutFaces.map((face) => projection(face, view).visible.join(' ')).filter(Boolean);
            const viewBox = config.crop ? config.crop.map(n) : projected.viewBox;
            if (config.crop && (viewBox.length !== 4 || viewBox[2] <= 0 || viewBox[3] <= 0))
              throw new Error('Detail crop must be [x, y, width, height] in drawing millimetres.');
            return {
              ...projected,
              view,
              name: config.name,
              viewBox,
              hatch,
              detail: Boolean(config.crop),
              scale: config.scale,
            };
          }),
        };
      });
    },
    exportSolids() {
      const files = model.parts.map((part) => ({
        id: part.id,
        step: shapes.get(part.id).blobSTEP(),
        stl: shapes.get(part.id).blobSTL({ binary: true, tolerance: 0.05, angularTolerance: 0.1 }),
      }));
      return {
        files,
        assembly: placed.size
          ? cad.exportSTEP(
              model.instances.map((i) => ({ shape: placed.get(i.id), name: `${i.id} ${i.partId}` })),
              { unit: 'MM', modelUnit: 'MM' },
            )
          : null,
      };
    },
    planarProfiles() {
      // Only constant-section XY extrusions and vertical cuts are valid flat profiles.
      return model.parts.flatMap((part) => {
        const features = part.features.filter((f) => !f.suppressed),
          first = features[0];
        const sketchDef = model.sketches.find((s) => s.id === first?.sketchId);
        const planar = first?.type === 'box' || (first?.type === 'extrude' && (sketchDef?.plane || 'XY') === 'XY');
        const thickness = first?.type === 'box' ? n(first.height) : first?.type === 'extrude' ? n(first.length) : null;
        if (
          !planar ||
          features.slice(1).some((f) => {
            if (f.type !== 'hole') return true;
            const cut = metrics.get(part.id)[f.id]?.cut;
            if (!cut || Math.abs(cut.direction[2]) < 1 - 1e-9) return true;
            const [start, end] = [cut.position[2], cut.position[2] + cut.direction[2] * cut.depth];
            const baseBounds = metrics.get(part.id)[first.id].bounds;
            return Math.min(start, end) > baseBounds[0][2] + 1e-7 || Math.max(start, end) < baseBounds[1][2] - 1e-7;
          })
        )
          return [];
        return [{ partId: part.id, thickness, ...projection(shapes.get(part.id), 'top') }];
      });
    },
  };
}
