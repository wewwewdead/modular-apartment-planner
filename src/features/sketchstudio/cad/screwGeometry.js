import * as cad from 'replicad';
import { hardwareDimensions } from './hardware.js';
import { round1, round2 } from './hardwareCatalog.js';

// Phase N (docs/sketch-studio-screw-library.md §4): the 22 screw kinds as
// schematic solids. Seating plane Z = 0: heads above, the shank into −Z; flush
// heads have their rim at Z = 0 and the cone below; a set screw has its socket
// end at Z = 0. The tip is at Z = −length (−(length + threadLength) for a
// shoulder screw). No helical threads, knurls or flutes; drives are schematic
// prism recesses cut after the head and shank are one solid. Every
// intermediate shape goes through own() (the kernel deletes them).
//
// Cost: every head is drawn in ONE (r, z) half profile with its shank and
// point and revolved once; the hexagon, mushroom, wing and eye heads add one
// fused solid, and the drive is one cut.

const EPS = 0.01;

// A closed (r, z) half profile in the XZ plane revolved about Z. Each step is
// [r, z] (a line) or { to: [r, z], via: [r, z] } (a three-point arc).
export function revolveProfile(own, start, steps) {
  const pen = cad.draw(start);
  for (const step of steps) {
    if (Array.isArray(step)) pen.lineTo(step);
    else pen.threePointsArcTo(step.to, step.via);
  }
  const drawing = own(pen.close());
  return own(own(drawing.sketchOnPlane('XZ')).revolve());
}

// Torus arcs are kept out of revolved profiles: OpenCascade cuts a drive
// recess into a torus (the pan rim, the concave bugle flank: arcs whose centre
// is off the axis) about 3× slower than into cones, and the Phase J hardware
// test builds every kind in one session. Those two arcs are sampled into short
// cone segments (ARC_SEGMENTS) on the same circle. A dome's arc has its centre
// on the axis and revolves into an analytic sphere, which cuts fast: it stays
// an arc.
const ARC_SEGMENTS = 4;

// The arc of a spherical cap of base Ø base and height h on z0, from the
// apex (0, z0 + h) down to the rim (base/2, z0): sphere radius
// R = (base²/4 + h²)/(2h), centre on the axis.
export function domeArc(base, h, z0 = 0) {
  const radius = ((base * base) / 4 + h * h) / (2 * h);
  const zc = z0 + h - radius;
  const mid = (Math.atan2(z0 - zc, base / 2) + Math.PI / 2) / 2;
  return { to: [base / 2, z0], via: [radius * Math.cos(mid), zc + radius * Math.sin(mid)] };
}
// A spherical cap standing on z0.
export const dome = (own, base, h, z0 = 0) => revolveProfile(own, [0, z0 + h], [domeArc(base, h, z0), [0, z0]]);

// Points on the circle through a, m and b, from a (excluded) to b
// (included) the way that passes m.
export function arcPoints(a, m, b, segments = ARC_SEGMENTS) {
  const [ax, ay] = a,
    [mx, my] = m,
    [bx, by] = b;
  const det = 2 * (ax * (my - by) + mx * (by - ay) + bx * (ay - my));
  const sq = (x, y) => x * x + y * y;
  const cx = (sq(ax, ay) * (my - by) + sq(mx, my) * (by - ay) + sq(bx, by) * (ay - my)) / det;
  const cy = (sq(ax, ay) * (bx - mx) + sq(mx, my) * (ax - bx) + sq(bx, by) * (mx - ax)) / det;
  const radius = Math.hypot(ax - cx, ay - cy);
  const angle = (x, y) => Math.atan2(y - cy, x - cx);
  const turn = (t) => ((t % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const t0 = angle(ax, ay);
  let sweep = turn(angle(bx, by) - t0);
  // The short way round misses m: go the other way.
  if (turn(angle(mx, my) - t0) > sweep) sweep -= 2 * Math.PI;
  return Array.from({ length: segments }, (_, i) =>
    i === segments - 1
      ? [bx, by]
      : [
          cx + radius * Math.cos(t0 + (sweep * (i + 1)) / segments),
          cy + radius * Math.sin(t0 + (sweep * (i + 1)) / segments),
        ],
  );
}

// The pan head's rounded rim, from (0.4·dk, k) down to (dk/2, k/2): the arc
// of spec §4.1, made tangent to the vertical side so the head never bulges
// past Ø dk (the three-point arc through (0.475·dk, 0.8·k) did by ~0.07 %).
export function panRim(dk, k) {
  const radius = (0.01 * dk * dk + 0.25 * k * k) / (0.2 * dk);
  const end = Math.asin(Math.min(1, (0.5 * k) / radius));
  const at = (t) => [dk / 2 - radius + radius * Math.cos(t), 0.5 * k + radius * Math.sin(t)];
  return arcPoints(at(end), at(end / 2), at(0));
}

// A closed polygon in the XY plane extruded from z0 by height.
function prism(own, points, z0, height) {
  const pen = cad.draw(points[0]);
  points.slice(1).forEach((p) => pen.lineTo(p));
  const drawing = own(pen.close());
  return own(own(own(drawing.sketchOnPlane('XY')).extrude(height)).translate([0, 0, z0]));
}
const polygon = (count, radius, phase = 0) =>
  Array.from({ length: count }, (_, i) => [
    radius * Math.cos(phase + (i * 2 * Math.PI) / count),
    radius * Math.sin(phase + (i * 2 * Math.PI) / count),
  ]);
// A hexagon prism across flats s (the Phase J bolt head's orientation).
export const hexPrism = (own, s, height, z0 = 0) => prism(own, polygon(6, s / Math.sqrt(3)), z0, height);
// The hexalobular recess, schematic: 12 vertices alternating A/2 and 0.72·A/2.
export const starPrism = (own, a, z0, height) =>
  prism(
    own,
    Array.from({ length: 12 }, (_, i) => {
      const r = i % 2 ? (0.72 * a) / 2 : a / 2;
      return [r * Math.cos((i * Math.PI) / 6), r * Math.sin((i * Math.PI) / 6)];
    }),
    z0,
    height,
  );
// A cross recess: two arms of half width w, span s, as one 12-vertex prism.
const crossPrism = (own, s, w, z0, height) => {
  const h = s / 2;
  return prism(
    own,
    [
      [h, w],
      [w, w],
      [w, h],
      [-w, h],
      [-w, w],
      [-h, w],
      [-h, -w],
      [-w, -w],
      [-w, -h],
      [w, -h],
      [w, -w],
      [h, -w],
    ],
    z0,
    height,
  );
};
const cylinder = (own, diameter, height, z0 = 0) => own(cad.makeCylinder(diameter / 2, height, [0, 0, z0]));
const box = (own, [x0, y0, z0], [x1, y1, z1]) => own(cad.makeBox([x0, y0, z0], [x1, y1, z1]));

// The radius the shank starts at under the head (a shoulder screw's shoulder).
const shankTop = (v) => (v.kind === 'shoulder' ? v.bodyDiameter : v.diameter) / 2;

// Every head as the start of ONE revolved half profile — from the axis at the
// head top outward and down to (shankTop, zStart), the shank and point follow
// — plus, for the heads that are not solids of revolution, one `extra` solid
// fused to it (hexagon prism, carriage neck, wing plate, eye ring).
function headProfile(own, v) {
  const { headDiameter: dk, headHeight: k } = v;
  const R = dk / 2,
    r0 = shankTop(v);
  const flat = (top, steps, zStart = 0, extra = null) => ({ start: [0, top], steps, top, zStart, extra });
  switch (v.head) {
    case 'socket-cap': {
      // A 45° chamfer of 0.1·dk on the top edge.
      const c = Math.min(0.1 * dk, 0.5 * k);
      return flat(k, [
        [R - c, k],
        [R, k - c],
        [R, 0],
        [r0, 0],
      ]);
    }
    case 'cheese':
    case 'knurled-low':
      return flat(k, [
        [R, k],
        [R, 0],
        [r0, 0],
      ]);
    case 'fillister':
      return flat(k + v.domeHeight, [domeArc(dk, v.domeHeight, k), [R, 0], [r0, 0]]);
    case 'pan':
      return flat(k, [[0.4 * dk, k], ...panRim(dk, k), [R, 0], [r0, 0]]);
    case 'button':
    case 'truss':
    case 'round':
      return flat(k, [domeArc(dk, k), [r0, 0]]);
    case 'countersunk':
      return flat(
        0,
        [
          [R, 0],
          [r0, -k],
        ],
        -k,
      );
    case 'raised-countersunk':
      return flat(v.domeHeight, [domeArc(dk, v.domeHeight), [r0, -k]], -k);
    case 'bugle':
      // Concave flank: inside the straight cone of the same dk, k.
      return flat(0, [[R, 0], ...arcPoints([R, 0], [r0 + (0.12 * (dk - v.diameter)) / 2, -0.7 * k], [r0, -k])], -k);
    case 'knurled-high': {
      const c = v.collarHeight,
        ds = v.bodyDiameter / 2;
      return flat(c + k, [
        [R, c + k],
        [R, c],
        [ds, c],
        [ds, 0],
        [r0, 0],
      ]);
    }
    case 'none':
      return flat(0, [[r0, 0]]);
    case 'hex':
      return flat(0, [[r0, 0]], 0, hexPrism(own, dk, k));
    case 'hex-flange':
    case 'hex-washer': {
      // Flange: s = bodyDiameter, Ø dc = headDiameter, c = 0.15·k (min 0.6).
      // Washer: self-drilling s = bodyDiameter, Ø dc = headDiameter, 0.2·k
      // thick; lag s = headDiameter, Ø 1.6·s, 0.15·k thick (spec §3.3).
      const lag = v.kind === 'lag';
      const s = lag ? dk : v.bodyDiameter;
      const dc = (lag ? 1.6 * dk : dk) / 2;
      const c = v.head === 'hex-flange' ? Math.max(0.6, round2(0.15 * k)) : (lag ? 0.15 : 0.2) * k;
      return {
        ...flat(c, [
          [dc, c],
          [dc, 0],
          [r0, 0],
        ]),
        top: k,
        extra: hexPrism(own, s, k),
      };
    }
    case 'mushroom': {
      // The dome, and the square neck v × v × f under it (the shank inside it).
      const half = v.bodyDiameter / 2;
      return flat(k, [domeArc(dk, k), [r0, 0]], 0, box(own, [-half, -half, -v.neckHeight], [half, half, 0]));
    }
    case 'wing': {
      // Collar Ø d2 × a, hub Ø 0.9·d2 up to h, one plate e × g2 from a to h
      // with rounded tips (spec §4.1).
      const h = k,
        e = dk,
        a = 0.2 * h,
        g = v.wingThickness,
        d2 = v.bodyDiameter / 2;
      const rr = Math.min(0.35 * (h - a), 0.1 * e);
      const q = Math.SQRT1_2;
      const pen = cad
        .draw([-e / 2, a])
        .lineTo([e / 2, a])
        .lineTo([e / 2, h - rr])
        .threePointsArcTo([e / 2 - rr, h], [e / 2 - rr + rr * q, h - rr + rr * q])
        .lineTo([-e / 2 + rr, h])
        .threePointsArcTo([-e / 2, h - rr], [-e / 2 + rr - rr * q, h - rr + rr * q]);
      // The XZ plane's normal is −Y: extrude g, then centre it on Y = 0.
      const plate = own(own(own(own(pen.close()).sketchOnPlane('XZ')).extrude(g)).translate([0, g / 2, 0]));
      return flat(
        h,
        [
          [0.9 * d2, h],
          [0.9 * d2, a],
          [d2, a],
          [d2, 0],
          [r0, 0],
        ],
        0,
        plate,
      );
    }
    case 'eye': {
      // A ring standing in the XZ plane, s thick along Y, centre at Z = d2/2
      // (a 2D annulus extruded: no 3D Boolean); the shank runs up into the
      // ring wall so the two overlap.
      const s = k,
        d2 = dk,
        d1 = v.boreDiameter;
      const annulus = own(own(own(cad.drawCircle(d2 / 2)).cut(own(cad.drawCircle(d1 / 2)))).translate(0, d2 / 2));
      const ring = own(own(own(annulus.sketchOnPlane('XZ')).extrude(s)).translate([0, s / 2, 0]));
      const zStart = (d2 - d1) / 4;
      return { ...flat(zStart, [[r0, zStart]], zStart, ring), top: d2 };
    }
    default:
      throw new Error(`Unknown head style: ${v.head}`);
  }
}

// The rest of the half profile after (shankTop, zStart): the shank, the
// point (spec §4.3) and back to the axis at the tip.
function shankSteps(v, zStart) {
  const d = v.diameter,
    L = v.length,
    r = d / 2;
  // The length the point may take: never above where the shank starts.
  const room = 0.95 * (L + Math.min(0, zStart));
  if (v.kind === 'shoulder') {
    const T = v.threadLength;
    return [
      [shankTop(v), -L],
      [r, -L],
      [r, -L - T],
      [0, -L - T],
    ];
  }
  switch (v.point) {
    case 'sharp':
      return [
        [r, -L + Math.min(1.2 * d, room)],
        [0, -L],
      ];
    case 'drill': {
      const dp = v.pointDiameter;
      return [
        [r, -L + 1.6 * dp],
        [dp / 2, -L + 1.6 * dp],
        [dp / 2, -L + 0.3 * dp],
        [0, -L],
      ];
    }
    case 'flat': {
      const dp = v.bodyDiameter / 2;
      return [
        [r, -L + Math.min(r - dp, room)],
        [dp, -L],
        [0, -L],
      ];
    }
    case 'cone':
      return [
        [r, -L + Math.min(r, room)],
        [0, -L],
      ];
    case 'dog': {
      const dp = v.bodyDiameter / 2,
        z = v.neckHeight;
      return [
        [r, -L + z],
        [dp, -L + z],
        [dp, -L],
        [0, -L],
      ];
    }
    case 'cup': {
      // As flat with Ø dz, plus a conical recess Ø dz, 0.12·d deep.
      const dz = v.bodyDiameter / 2;
      return [
        [r, -L + Math.min(r - dz, room)],
        [dz, -L],
        [0, -L + 0.12 * d],
      ];
    }
    default:
      return [
        [r, -L],
        [0, -L],
      ];
  }
}

// The drive recess cut into the head top (spec §4.2).
function cutDrive(own, solid, v, top) {
  if (v.drive === 'none') return solid;
  const d = v.diameter,
    s = v.driveSize;
  const setScrew = v.head === 'none';
  const depth = setScrew
    ? Math.min(0.5 * d, 0.7 * v.length)
    : v.drive === 'hex-socket'
      ? Math.min(0.5 * d, 0.7 * v.headHeight)
      : 0.45 * v.headHeight;
  const z0 = top - depth,
    height = depth + EPS * 5;
  const width = setScrew ? d : v.headDiameter;
  let tool;
  switch (v.drive) {
    case 'slot':
    case 'one-way':
      tool = box(own, [-width / 2 - EPS, -s / 2, z0], [width / 2 + EPS, s / 2, z0 + height]);
      break;
    case 'phillips':
    case 'pozidriv':
      tool = crossPrism(own, s, Math.max(0.3, round1(0.2 * d)) / 2, z0, height);
      break;
    case 'torx':
    case 'pin-torx':
      tool = starPrism(own, s, z0, height);
      break;
    case 'hex-socket':
      tool = hexPrism(own, s, height, z0);
      break;
    case 'square':
      tool = box(own, [-s / 2, -s / 2, z0], [s / 2, s / 2, z0 + height]);
      break;
    case 'spanner': {
      const hole = (x) => own(cad.makeCylinder(0.075 * v.headDiameter, height, [x, 0, z0]));
      tool = own(hole(-s / 2).fuse(hole(s / 2)));
      break;
    }
    default:
      return solid;
  }
  // No topology clean-up pass: a recess leaves no same-domain faces to merge,
  // and the pass costs ~10–25 % of the cut.
  let result = own(solid.cut(tool, { simplify: false }));
  // Security Torx: the pin stands back up in the middle of the star.
  if (v.drive === 'pin-torx') result = own(result.fuse(cylinder(own, 0.3 * s, depth, z0)));
  return result;
}

export function screwGeometry(f, parameters, own) {
  const v = hardwareDimensions(f, parameters);
  const head = headProfile(own, v);
  let solid = revolveProfile(own, head.start, [...head.steps, ...shankSteps(v, head.zStart)]);
  if (head.extra) solid = own(head.extra.fuse(solid));
  return cutDrive(own, solid, v, head.top);
}
