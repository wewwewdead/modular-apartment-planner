import * as cad from 'replicad';
import { exactProjection } from './projection.js';
import { mapPlacement } from './placement.js';
import { resolveCutPlacement, resolveRow } from './cutPlacement.js';
import { hardwareGeometry } from './hardwareGeometry.js';
import { angleSectionProfile } from './stockSections.js';
import {
  CHORD_ERROR,
  blankHoles,
  foldSheet,
  pointInRing,
  polygonBounds,
  profilePolygon,
  roundTangents,
} from './sheetMetal.js';
import { dieOf, punchOf } from './shopCatalog.js';
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
/*
 * A snapshot's tessellation as typed arrays: the worker hands their buffers
 * over (`snapshotTransferables`) instead of structured-cloning tens of
 * thousands of plain numbers per part on every rebuild. Only what the viewport
 * draws is kept — the face and edge groups had no reader.
 */
function typedMesh(mesh) {
  return {
    vertices: Float32Array.from(mesh.vertices),
    normals: Float32Array.from(mesh.normals),
    triangles: Uint32Array.from(mesh.triangles),
  };
}

function typedEdges(edges) {
  return { lines: Float32Array.from(edges.lines) };
}

/** The buffers of a snapshot's tessellation, for `postMessage`'s transfer list. */
export function snapshotTransferables(snapshot) {
  const buffers = [];
  for (const instance of snapshot?.instances || []) {
    for (const view of [
      instance.mesh?.vertices,
      instance.mesh?.normals,
      instance.mesh?.triangles,
      instance.edges?.lines,
    ]) {
      if (ArrayBuffer.isView(view) && !buffers.includes(view.buffer)) buffers.push(view.buffer);
    }
  }
  return buffers;
}

// The rings are profilePolygon's, chords of the true curves (each within
// CHORD_ERROR of its arc), so two rings this far apart are apart in truth.
const CUT_OUT_CLEARANCE = 2 * CHORD_ERROR + 0.01;
const turn = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const pointGap = (p, a, b) => {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
const segmentGap = ([a, b], [c, d]) =>
  turn(a, b, c) * turn(a, b, d) < 0 && turn(c, d, a) * turn(c, d, b) < 0
    ? 0
    : Math.min(pointGap(a, c, d), pointGap(b, c, d), pointGap(c, a, b), pointGap(d, a, b));
const boxesMeet = ([[x0, y0], [x1, y1]], [[u0, v0], [u1, v1]], gap) =>
  x0 <= u1 + gap && u0 <= x1 + gap && y0 <= v1 + gap && v0 <= y1 + gap;

/**
 * The cut-outs that can go into ONE compound face with the outline
 * (docs/sketch-studio-drawing-table.md §3.2 item 2): `{ free, rest }`, indexes
 * into `profile.holes`. A hole is free when its ring keeps CUT_OUT_CLEARANCE
 * from the outline's and from every other hole's, lies inside the outline and
 * neither it nor another hole holds the other (boxes first, then segment
 * against segment, then one point of each ring inside the other). Each loop
 * is sampled alone (profilePolygon of the loop), so a hole across the outline
 * is one of the rest. null (today's one-by-one cut, whole) for fewer than two
 * holes, an offset, a spline (its samples have no chord bound), or a loop
 * that cannot be sampled (a hole with holes or an offset, an open path).
 */
export function separateCutOuts(profile, params = {}) {
  const holes = profile?.holes || [];
  if (holes.length < 2 || profile.offset) return null;
  if ([profile, ...holes].some((loop) => loop?.segments?.some((s) => s.type === 'spline'))) return null;
  let rings;
  try {
    rings = [{ ...profile, holes: undefined }, ...holes].map((loop) => {
      if (loop.holes?.length) throw new Error('A cut-out must be a single closed outline.');
      return profilePolygon(loop, params).outer;
    });
  } catch {
    return null;
  }
  const C = CUT_OUT_CLEARANCE;
  const loops = rings.map((ring) => {
    const segments = ring.map((p, i) => {
      const q = ring[(i + 1) % ring.length];
      return {
        s: [p, q],
        box: [
          [Math.min(p[0], q[0]), Math.min(p[1], q[1])],
          [Math.max(p[0], q[0]), Math.max(p[1], q[1])],
        ],
      };
    });
    return { ring, segments, box: polygonBounds(ring) };
  });
  const near = (a, b) => {
    for (const s of a.segments) {
      if (!boxesMeet(s.box, b.box, C)) continue;
      for (const t of b.segments) if (boxesMeet(s.box, t.box, C) && segmentGap(s.s, t.s) < C) return true;
    }
    return false;
  };
  const [outer, ...cuts] = loops;
  const free = cuts.map((cut) => !near(outer, cut) && pointInRing(cut.ring[0], outer.ring));
  const order = cuts.map((_, i) => i).sort((i, j) => cuts[i].box[0][0] - cuts[j].box[0][0]);
  for (let x = 0; x < order.length; x++) {
    const a = cuts[order[x]];
    for (let y = x + 1; y < order.length; y++) {
      const b = cuts[order[y]];
      if (b.box[0][0] > a.box[1][0] + C) break;
      if (!boxesMeet(a.box, b.box, C)) continue;
      if (near(a, b) || pointInRing(a.ring[0], b.ring) || pointInRing(b.ring[0], a.ring))
        free[order[x]] = free[order[y]] = false;
    }
  }
  const indexes = (want) => free.flatMap((ok, i) => (ok === want ? [i] : []));
  return { free: indexes(true), rest: indexes(false) };
}

/**
 * `options.cutOuts`: 'compound' (default) puts the separate cut-outs into one
 * compound face with the outline; 'each' cuts every one in turn (the path
 * before the compound; kept for tests to compare against).
 */
export function createKernelSession(input, { cutOuts = 'compound' } = {}) {
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
    placements = new Map(),
    // Sheet-metal parts: partId → { shape: the flat blank solid, fold } (planarProfiles).
    blanks = new Map();
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
    const holes = profile.holes || [];
    // Separate cut-outs as one compound face with the outline (one cut each
    // took 3 s for 68 and ran out of memory at 368); the rest one by one.
    const split = cutOuts === 'compound' ? separateCutOuts(profile, params) : null;
    if (split?.free.length) {
      let compound = null;
      try {
        compound = new cad.Drawing(
          new cad.CompoundBlueprint([d.blueprint, ...split.free.map((i) => drawing(holes[i]).blueprint)]),
        );
      } catch {
        // A loop that is not one blueprint: today's path, whole.
      }
      if (compound) {
        for (const i of split.rest) compound = compound.cut(drawing(holes[i]));
        return compound;
      }
    }
    for (const hole of holes) d = d.cut(drawing(hole));
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
    } else if (s.type === 'angle' && (s.rootRadius > 0 || s.toeRadius > 0)) {
      // A hot-rolled angle (Phase P): its L outline with the root and toe
      // radii, extruded over the same overlong span. A radius-free angle keeps
      // the box-minus-box construction below.
      shape = own(own(drawing(angleSectionProfile(s)).sketchOnPlane('XY', [0, 0, -extra])).extrude(length + 2 * extra));
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

  // Phase Q (docs/sketch-studio-hardware-seat-side.md 4.1): where each hole's
  // axis last leaves the solid it is cut from, as the distance from its
  // centre along the drill direction: the far opening a fastener seats on
  // from the other side. A through-all cut's depth runs to the bounding box,
  // so only the real solid knows (an angle leg is 5 mm, not the 50 mm box).
  // The Common of the solid and the axes (edges) keeps the axis segments
  // inside the material; ONE Common for every centre of a row (20 separate
  // ones cost 2.5 times as much), each segment end assigned to the axis it
  // lies on. null: the hole stops in the material, or the measurement
  // failed (never a build error).
  const farOpenings = (solid, centres, direction, depth) => {
    try {
      const length = Math.hypot(...direction),
        dir = direction.map((x) => x / length);
      const at = (centre, t) => centre.map((x, i) => x + dir[i] * t);
      const axes = centres.map((centre) => own(cad.makeLine(at(centre, -0.02), at(centre, depth + 0.02))));
      const tool = axes.length === 1 ? axes[0] : own(cad.makeCompound(axes));
      const inside = own(solid.intersect(tool, { simplify: false }));
      const exits = centres.map(() => null);
      for (const edge of inside.edges) {
        own(edge);
        for (const point of [own(edge.startPoint), own(edge.endPoint)]) {
          const p = point.toTuple();
          let k = -1,
            off = Infinity,
            t = 0;
          centres.forEach((centre, j) => {
            const d = p.map((x, i) => x - centre[i]);
            const along = d.reduce((sum, x, i) => sum + x * dir[i], 0);
            const away = Math.hypot(...d.map((x, i) => x - dir[i] * along));
            if (away < off) [k, off, t] = [j, away, along];
          });
          if (off < 1e-3 && (exits[k] === null || t > exits[k])) exits[k] = t;
        }
      }
      // Up to the tool's end: a hole exactly as deep as the material is through.
      return exits.map((exit) => (exit !== null && exit > 1e-6 && exit <= depth + 1e-6 ? exit : null));
    } catch {
      return centres.map(() => null);
    }
  };

  // A sheet-metal blank folded by its bends (docs/sketch-studio-fab-shop.md
  // §6): the exact flat extrusion, cut at every bend zone into rigid pieces,
  // each piece posed by the bends between it and the root, one revolved sector
  // per zone interval on its fixed side's pose, all fused. sheetMetal.js
  // decides the topology and poses; this only replays them on exact solids.
  const sheetMetal = (f, partId) => {
    const s = model.sketches.find((item) => item.id === f.sketchId);
    if (!s) throw new Error('Choose a closed blank sketch first.');
    if ((s.plane || 'XY') !== 'XY' || s.normal || v(s.origin || [0, 0, 0]).some((x) => Math.abs(x) > 1e-9))
      throw new Error('A sheet-metal blank must be sketched on the XY plane at the origin.');
    const fold = foldSheet(f, s.profile, params);
    const t = fold.thickness;
    const flat = own(own(drawing(s.profile).sketchOnPlane('XY')).extrude(t));
    blanks.set(partId, { shape: flat, fold });
    const warnings = [...fold.warnings];
    const sheet = () => ({
      flat: fold.flat,
      bends: fold.bends.map((b) => ({
        id: b.id,
        index: b.index,
        a: b.a,
        b: b.b,
        angle: b.angle,
        direction: b.direction,
        radius: b.radius,
        kFactor: b.kFactor,
        allowance: b.allowance,
        setback: b.setback,
        deduction: b.deduction,
        legs: b.legs,
        length: b.length,
        intervals: b.intervals,
        die: b.die,
        punch: b.punch,
      })),
      warnings,
    });
    if (!fold.bends.length) return { shape: flat, metrics: sheet() };
    // Rigid pieces: the flat cut at every zone (overshooting 0.01 mm at the
    // interval ends, full thickness ± 1).
    const boxes = fold.bends.flatMap((bend) =>
      bend.intervals.map(([s0, s1]) => {
        const length = s1 - s0 + 0.02;
        const start = [bend.a[0] + bend.u[0] * (s0 - 0.01), bend.a[1] + bend.u[1] * (s0 - 0.01), -1];
        const plane = own(new cad.Plane(start, [bend.u[0], bend.u[1], 0], [0, 0, 1]));
        return own(
          own(
            cad
              .drawRectangle(length, bend.allowance)
              .translate(length / 2, 0)
              .sketchOnPlane(plane),
          ).extrude(t + 2),
        );
      }),
    );
    // One cut with every zone (strips never overlap: foldSheet refuses that).
    const cut = own(flat.cut(boxes.length === 1 ? boxes[0] : own(cad.makeCompound(boxes))));
    const solids = [...cad.iterTopo(cut.wrapped, 'solid')].map((solid) => {
      const shape = own(cad.cast(cad.downcast(solid)));
      const properties = own(cad.measureShapeVolumeProperties(shape));
      return { shape, centre: properties.centerOfMass, area: properties.volume / t };
    });
    const pieces = solids.filter((solid) => solid.area > 1e-3);
    if (pieces.length !== fold.pieces.length)
      throw new Error(
        `Internal sheet-metal error: the zones cut ${pieces.length} pieces, the fold expects ${fold.pieces.length}.`,
      );
    const bendById = new Map(fold.bends.map((b) => [b.id, b]));
    // Flat → folded: the bends on the path, the one farthest from the root first.
    const posed = (shape, path) => {
      let result = shape;
      for (const id of [...path].reverse()) {
        const { translate, origin, axis, angle } = bendById.get(id).transform;
        result = own(own(result.translate(translate)).rotate(angle, origin, axis));
      }
      return result;
    };
    const taken = new Set();
    const parts = fold.pieces.map((piece) => {
      let best = null,
        distance = Infinity;
      for (const solid of pieces) {
        if (taken.has(solid)) continue;
        const d = Math.hypot(solid.centre[0] - piece.centroid[0], solid.centre[1] - piece.centroid[1]);
        if (d < distance) [best, distance] = [solid, d];
      }
      if (
        !best ||
        distance > Math.max(0.5, Math.sqrt(piece.area) * 0.01) ||
        Math.abs(best.area - piece.area) > piece.area * 0.02 + 1
      )
        throw new Error(`Internal sheet-metal error: no exact solid matches flat ${piece.id}.`);
      taken.add(best);
      return posed(best.shape, piece.path);
    });
    const fixedPath = new Map(fold.pieces.map((piece) => [piece.id, piece.path]));
    for (const bend of fold.bends) {
      const h = bend.allowance / 2;
      const foot = [bend.a[0] - bend.n[0] * h, bend.a[1] - bend.n[1] * h, 0];
      // x along u, y = (−n) × u = +Z: the zone's cross-section at v = −BA/2.
      const plane = own(new cad.Plane(foot, [bend.u[0], bend.u[1], 0], [-bend.n[0], -bend.n[1], 0]));
      const { origin, angle } = bend.transform;
      const axis = angle > 0 ? [bend.u[0], bend.u[1], 0] : [-bend.u[0], -bend.u[1], 0];
      for (const [s0, s1] of bend.intervals) {
        const face = own(
          cad
            .drawRectangle(s1 - s0, t)
            .translate((s0 + s1) / 2, t / 2)
            .sketchOnPlane(plane),
        );
        parts.push(posed(own(face.revolve(axis, { origin, angle: Math.abs(angle) })), fixedPath.get(bend.fixedPiece)));
      }
    }
    let shape;
    try {
      // One general fuse of every piece and sector (12 pairwise fuses of a
      // 6-bend part cost ~100 ms); they meet on shared faces, which the glue
      // option resolves fast.
      const oc = cad.getOC();
      const builder = own(new oc.BRepAlgoAPI_Fuse());
      const first = own(new oc.NCollection_List_TopoDS_Shape()),
        rest = own(new oc.NCollection_List_TopoDS_Shape());
      first.Append(parts[0].wrapped);
      for (const part of parts.slice(1)) rest.Append(part.wrapped);
      builder.SetArguments(first);
      builder.SetTools(rest);
      builder.SetGlue(oc.BOPAlgo_GlueEnum.BOPAlgo_GlueShift);
      builder.Build();
      if (builder.HasErrors()) throw new Error('fuse failed');
      builder.SimplifyResult(true, true, 0.001);
      shape = own(cad.cast(builder.Shape()));
      if (!cad.isShape3D(shape)) throw new Error('fuse produced no solid');
    } catch {
      shape = own(cad.makeCompound(parts).asShape3D());
      warnings.push({
        code: 'not-fused',
        bendId: null,
        message: 'The pieces could not be fused into one solid; they are kept as a compound.',
      });
    }
    return { shape, metrics: sheet() };
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
          case 'sheetmetal': {
            // The blank is the part (§4.1): later features machine the folded solid.
            if (shape) throw new Error('A sheet-metal blank must be the first feature of its part.');
            const result = sheetMetal(f, partId);
            next = result.shape;
            // The blank's round cut-outs (shop floor §5.3): fastener seats in
            // the folded frame, each through the sheet's thickness.
            const holes = blankHoles(
              blanks.get(partId).fold,
              model.sketches.find((s) => s.id === f.sketchId)?.profile,
              params,
            );
            featureMetrics[f.id] = {
              sheet: result.metrics,
              holes,
              exits: holes.map(() => blanks.get(partId).fold.thickness),
            };
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
              // One far opening per centre (Phase Q), measured before the cut.
              const exits =
                f.type === 'hole'
                  ? farOpenings(shape, row ? row.centres : [cut.position], cut.direction, cut.depth)
                  : null;
              featureMetrics[f.id] = { cut, ...(row ? { row } : {}), ...(exits ? { exits } : {}) };
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
          ['hardware', 'box', 'cylinder', 'member', 'sheetmetal', 'extrude', 'revolve', 'sweep', 'loft'].includes(
            f.type,
          )
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
          // side 'far' (Phase Q): seated on the hole's far opening, facing back
          // up the hole; absent = the drill side.
          const getAxis = (inst, featureId, holeIndex = 0, side = null) => {
            const definition = model.parts.find((p) => p.id === inst.partId);
            const feature = definition.features.find((f) => f.id === featureId && !f.suppressed);
            if (!feature || !['hardware', 'cylinder', 'hole', 'member', 'sheetmetal'].includes(feature.type))
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
            // A laser-cut hole of a sheet-metal blank (shop floor §5.3): its
            // seat on the top face, into the sheet; holeIndex is its place in
            // the blank's cut-outs.
            const blankHole =
              feature.type === 'sheetmetal'
                ? metrics.get(inst.partId)?.[feature.id]?.holes?.find((h) => h.index === holeIndex)
                : null;
            if (feature.type === 'sheetmetal' && !blankHole)
              throw new Error(
                `Cut-out ${holeIndex + 1} of ${definition.name} is not a round hole clear of the bends: the hardware has nothing to seat in.`,
              );
            let origin = blankHole
              ? [...blankHole.centre]
              : feature.type === 'member'
                ? v(feature.start)
                : rowCentre || resolvedCut?.position || v(feature.position || [0, 0, 0]);
            let direction = blankHole
              ? [...blankHole.direction]
              : feature.type === 'member'
                ? v(feature.end).map((x, i) => x - origin[i])
                : resolvedCut?.direction ||
                  v(feature.direction || (feature.type === 'hardware' ? [0, 0, -1] : [0, 0, 1]));
            const length = Math.hypot(...direction);
            if (side === 'far') {
              if (feature.type !== 'hole' && !blankHole)
                throw new Error(`Only a hole has a far side to seat on: ${featureId}`);
              const metric = metrics.get(inst.partId)?.[feature.id];
              const t = blankHole ? metric?.exits?.[metric.holes.indexOf(blankHole)] : metric?.exits?.[holeIndex];
              if (t == null) {
                const hardware = model.parts.find((p) => p.id === instance.partId)?.name || 'the hardware';
                const hole = feature.row ? `Hole ${holeIndex + 1} of the row` : 'The hole';
                throw new Error(
                  `${hole} on ${definition.name} has no far opening for ${hardware}: seat it on the drill side or make the hole go through.`,
                );
              }
              origin = origin.map((x, i) => x + (direction[i] / length) * t);
              direction = direction.map((x) => (x ? -x : 0));
            }
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
            b = getAxis(
              targetInstance,
              c.toFeatureId,
              Number.isInteger(c.holeIndex) ? c.holeIndex : 0,
              c.side === 'far' ? 'far' : null,
            );
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
  // A sheet-metal part's flat blank seen from its top face (+Z toward the
  // viewer) in the sketch's own X, Y: the XY camera (svg y = −Y, so +Y is up;
  // the drawing 'top' camera looks with Y down and would mirror it).
  // `drawn` maps a flat point into the drawing frame of `visible`.
  const flatProjection = (partId) => {
    const blank = blanks.get(partId);
    if (!blank) return null;
    const projected = exactProjection(blank.shape, own(cad.lookFromPlane('XY')), own);
    const [bx, by] = projected.basis;
    const drawn = (p) => [p[0] * bx[0] + p[1] * bx[1], p[0] * by[0] + p[1] * by[1]];
    return { ...blank, projected, drawn };
  };
  // The drawing view kind 'flat' (docs/sketch-studio-fab-shop.md §9 SM-4):
  // the blank's outline and cut-outs, every bend-zone interval's bend line
  // with its "UP 90° R1.6" label, and the bend table in the order made.
  const flatView = (sheet, config) => {
    const flat = sheet.partId ? flatProjection(sheet.partId) : null;
    if (!flat)
      throw new Error(
        "The flat view draws a sheet-metal part's blank: choose a sheet-metal part as this sheet's Drawing subject.",
      );
    const { fold, projected, drawn } = flat;
    const viewBox = config.crop ? config.crop.map(n) : projected.viewBox;
    if (config.crop && (viewBox.length !== 4 || viewBox[2] <= 0 || viewBox[3] <= 0))
      throw new Error('Detail crop must be [x, y, width, height] in drawing millimetres.');
    const along = (b, s, v = 0) =>
      drawn(
        v
          ? [b.a[0] + b.u[0] * s + b.n[0] * v, b.a[1] + b.u[1] * s + b.n[1] * v]
          : [b.a[0] + b.u[0] * s, b.a[1] + b.u[1] * s],
      );
    return {
      ...projected,
      // A flat plate seen square on: its bottom edges lie under its top edges.
      hidden: [],
      view: 'flat',
      name: config.name,
      viewBox,
      hatch: [],
      detail: Boolean(config.crop),
      scale: config.scale,
      bendLines: fold.bends.flatMap((b) => [
        ...b.intervals.map(([s0, s1]) => ({
          a: along(b, s0),
          b: along(b, s1),
          bend: b.index + 1,
          direction: b.direction,
          label: b.label,
        })),
        // A round bend (docs/sketch-studio-round-bend.md §7): its zone's two tangent lines, unlabelled.
        ...roundTangents(b).map(([s0, s1, v]) => ({
          a: along(b, s0, v),
          b: along(b, s1, v),
          bend: b.index + 1,
          direction: b.direction,
          tangent: true,
        })),
      ]),
      bendTable: fold.bends.map((b) => ({
        bend: b.index + 1,
        angle: b.angle,
        direction: b.direction,
        radius: b.radius,
        allowance: b.allowance,
        deduction: b.deduction,
        tooling: `${punchOf(b.punch).name} / ${dieOf(b.die).name}`,
        ...(b.steps ? { steps: b.steps } : {}),
      })),
    };
  };
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
          mesh: typedMesh(placed.get(i.id).mesh({ tolerance: 0.15, angularTolerance: 0.15 })),
          edges: typedEdges(placed.get(i.id).meshEdges({ tolerance: 0.15 })),
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
    // `sheetIds` (Phase S): project only those sheets, so a preview builds
    // the sheet on show and one broken sheet cannot fail another's request.
    // `includeParts` adds an automatic detail sheet for each part that has no
    // sheet of its own, whatever `sheetIds` names (so `{ sheetIds: [],
    // includeParts: true }` is those part sheets alone). `collectErrors`
    // (Phase T, the PDF preflight) returns a sheet the kernel refuses as
    // `{ id, title, error }` in its place instead of failing the request.
    drawings({ includeParts = false, sheetIds = null, collectErrors = false } = {}) {
      if (!placed.size && !shapes.size) return [];
      const wanted = sheetIds ? new Set(sheetIds) : null;
      const sheets = wanted ? model.sheets.filter((sheet) => wanted.has(sheet.id)) : [...model.sheets];
      if (includeParts)
        for (const part of model.parts) {
          if (model.sheets.some((sheet) => sheet.partId === part.id)) continue;
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
            // Fit to page; the guessed scale stays as the fixed fallback.
            scaleMode: 'fit',
            scale,
            revision: model.sheets[0]?.revision ?? 'A',
            tolerance: model.sheets[0]?.tolerance ?? 'Not specified',
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
      const draw = (sheet) => {
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
            if (view === 'flat') return flatView(sheet, config);
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
      };
      if (!collectErrors) return sheets.map(draw);
      return sheets.map((sheet) => {
        try {
          return draw(sheet);
        } catch (error) {
          return { id: sheet.id, title: sheet.title, error: error.message || String(error) };
        }
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
      // Only constant-section XY extrusions and vertical cuts are valid flat
      // profiles. A sheet-metal part is cut flat by construction: its blank,
      // with a bend line per zone interval, whatever is machined after bending.
      return model.parts.flatMap((part) => {
        const features = part.features.filter((f) => !f.suppressed),
          first = features[0];
        // A bought-in item (shop floor §5.4) is not cut: no profile, never nested.
        if (part.purchased) return [];
        if (first?.type === 'sheetmetal') {
          // Not the drawing 'top' camera: its y axis is −Y, so the DXF (which
          // writes −svg y) came out as (X, −Y) and cut a bent blank's mirror
          // image. The XY camera (y = +Y) gives svg (X, −Y): DXF = the blank
          // sketch's own (X, Y), and the profile SVG shows +Y up.
          const { fold, projected, drawn: toDrawing } = flatProjection(part.id);
          // Bend lines in the drawing frame of `visible` (the projection basis).
          const drawn = (s, b) => toDrawing([b.a[0] + b.u[0] * s, b.a[1] + b.u[1] * s]);
          // Etched marks (SM-4, feature.marks): only when the blank has any, so
          // a profile without them stays as it was.
          const marks = (first.marks || []).filter((m) => Array.isArray(m?.a) && Array.isArray(m?.b));
          return [
            {
              partId: part.id,
              thickness: fold.thickness,
              ...projected,
              bendLines: fold.bends.flatMap((b) => [
                ...b.intervals.map(([s0, s1]) => ({
                  a: drawn(s0, b),
                  b: drawn(s1, b),
                  angle: b.angle,
                  direction: b.direction,
                  radius: b.radius,
                })),
                // A round bend's two tangent lines (docs/sketch-studio-round-bend.md §7), on the BEND layer too.
                ...roundTangents(b).map(([s0, s1, v]) => ({
                  a: toDrawing([b.a[0] + b.u[0] * s0 + b.n[0] * v, b.a[1] + b.u[1] * s0 + b.n[1] * v]),
                  b: toDrawing([b.a[0] + b.u[0] * s1 + b.n[0] * v, b.a[1] + b.u[1] * s1 + b.n[1] * v]),
                  angle: b.angle,
                  direction: b.direction,
                  radius: b.radius,
                  tangent: true,
                })),
              ]),
              ...(marks.length
                ? { etchLines: marks.map((m) => ({ a: toDrawing(m.a.map(n)), b: toDrawing(m.b.map(n)) })) }
                : {}),
            },
          ];
        }
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
