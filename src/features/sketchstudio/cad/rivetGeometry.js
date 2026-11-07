import { hardwareDimensions } from './hardware.js';
import { box, crossPrism, cylinder, domeArc, hexPrism, panRim, revolveProfile } from './screwGeometry.js';

// Phase O (docs/sketch-studio-rivet-library.md §4): the 15 rivet kinds as
// schematic solids on the Phase N seating-plane contract. Z = 0 is the
// near-side sheet face: protruding heads above it, flush heads with their rim
// at Z = 0 and the cone below, the body into −Z. The grip is measured from
// Z = 0 down; a set (installed) rivet's blind-side upset starts at Z = −grip.
// An unset (as supplied) rivet is the plain body with its mandrel / pin.
//
// Cost: every rivet is ONE closed (r, z) half profile revolved once — head,
// body, upset, the broken-mandrel recess and the as-supplied mandrel are all
// drawn into that profile (they are coaxial). The extras are the peel petals
// (one fuse), the split legs (one fuse when set, one slot cut when unset) and
// the hexagon rivet-nut / stud body (one fuse, plus one bore cut for the nut).
// No torus arcs: bulbs and lips are polylines, domes are spherical caps.
// Every intermediate shape goes through own() (the kernel deletes them).

const EPS = 0.01;
const CAP_HEADS = ['dome', 'large-flange', 'universal', 'round', 'truss'];
const FLAT_HEADS = ['flat', 'reduced'];
const CONE_HEADS = ['countersunk', 'countersunk-120', 'countersunk-100'];
// The blind kinds whose head carries the broken-mandrel recess when set, and
// whose as-supplied mandrel has its head under the body end.
const RECESSED = ['blind-open', 'blind-closed', 'blind-multigrip', 'blind-peel', 'blind-structural'];

// The sphere of a cap of base Ø base and height h standing on z0.
function sphere(base, h, z0 = 0) {
  const radius = ((base * base) / 4 + h * h) / (2 * h);
  const zc = z0 + h - radius;
  return { radius, zc, z: (r) => zc + Math.sqrt(Math.max(0, radius * radius - r * r)) };
}
// The cap's arc from (r, z(r)) down to its rim (base/2, z0); from the apex
// when r = 0 (the Phase N domeArc).
function capArcFrom(base, h, r, z0 = 0) {
  if (r <= 0) return domeArc(base, h, z0);
  const s = sphere(base, h, z0);
  const a0 = Math.atan2(s.z(r) - s.zc, r);
  const a1 = Math.atan2(z0 - s.zc, base / 2);
  const mid = (a0 + a1) / 2;
  return { to: [base / 2, z0], via: [s.radius * Math.cos(mid), s.zc + s.radius * Math.sin(mid)] };
}

// The head outline (spec §4.1): top Z, where the body starts (zStart), the
// head's top surface Z at a radius, and the steps from that radius outward
// and down to (r0, zStart).
function headOutline(v, r0) {
  const dk = v.headDiameter,
    k = v.headHeight,
    R = dk / 2;
  if (CAP_HEADS.includes(v.head)) {
    const s = sphere(dk, k);
    return { top: k, zStart: 0, at: (r) => (r > 0 ? s.z(r) : k), steps: (r) => [capArcFrom(dk, k, r), [r0, 0]] };
  }
  if (FLAT_HEADS.includes(v.head))
    return {
      top: k,
      zStart: 0,
      at: () => k,
      steps: () => [
        [R, k],
        [R, 0],
        [r0, 0],
      ],
    };
  if (CONE_HEADS.includes(v.head))
    return {
      top: 0,
      zStart: -k,
      at: () => 0,
      steps: () => [
        [R, 0],
        [r0, -k],
      ],
    };
  if (v.head === 'raised-countersunk') {
    // DIN 662 oval head: the cone k below the plane, the dome f above it.
    const f = v.domeHeight;
    const s = sphere(dk, f);
    return { top: f, zStart: -k, at: (r) => (r > 0 ? s.z(r) : f), steps: (r) => [capArcFrom(dk, f, r), [r0, -k]] };
  }
  if (v.head === 'pan')
    return { top: k, zStart: 0, at: () => k, steps: () => [[0.4 * dk, k], ...panRim(dk, k), [R, 0], [r0, 0]] };
  throw new Error(`Unknown head style: ${v.head}`);
}

// The head's points, starting on the axis at the top, or at a bore's inner
// edge (a ring profile), or at a pin / recess of radius pin.r whose end is at
// Z = pin.z (a mandrel standing above the head, or the recess floor).
function headPoints(head, { bore = 0, pin = null } = {}) {
  if (bore > 0) return [[bore, head.at(bore)], ...head.steps(bore)];
  if (pin && pin.r > 0 && Math.abs(pin.z - head.at(pin.r)) > 1e-6)
    return [[0, pin.z], [pin.r, pin.z], [pin.r, head.at(pin.r)], ...head.steps(pin.r)];
  return [[0, head.top], ...head.steps(0)];
}

// One revolve of the closed profile; consecutive duplicate points (a zero
// grip−head section, for one) are dropped.
function revolve(own, points) {
  const same = (a, b) => Array.isArray(a) && Array.isArray(b) && Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-9;
  const end = (p) => (Array.isArray(p) ? p : p.to);
  const clean = [];
  for (const p of points) if (!clean.length || !same(end(clean.at(-1)), p)) clean.push(p);
  while (clean.length > 1 && same(end(clean.at(-1)), clean[0])) clean.pop();
  return revolveProfile(own, clean[0], clean.slice(1));
}

// A spherical cap of base Ø base and height h hanging below its rim at
// (base/2, z0): the domeArc mirrored downward (the closed-end rivet's cup).
function capDown(base, h, z0) {
  const { via } = domeArc(base, h, 0);
  return { to: [0, z0 - h], via: [via[0], z0 - via[1]] };
}

// The blind-side barrel bulb (spec §4.2): four lines, not a torus.
const barrel = (r, B, z, h) => [
  [r, z],
  [B / 2, z - 0.3 * h],
  [B / 2, z - 0.7 * h],
  [r, z - h],
];

function blindRivet(own, v) {
  const d = v.diameter,
    r = d / 2,
    L = v.length,
    g = v.grip,
    B = v.bulbDiameter,
    h = v.bulbHeight,
    dm = v.mandrelDiameter;
  const head = headOutline(v, r);
  if (v.state === 'unset') {
    // The plain body with its mandrel: the stem stands ml above the head; the
    // mandrel head sits under the body end (inside the closed cup for the
    // sealed rivet, so only its stem shows).
    const top = headPoints(head, { pin: { r: dm / 2, z: head.top + v.mandrelLength } });
    if (v.kind === 'blind-closed') {
      const c = 0.3 * d;
      return revolve(own, [...top, [r, -L + c], capDown(d, c, -L + c)]);
    }
    const mh = Math.min(d - 0.2, 1.3 * dm);
    return revolve(own, [...top, [r, -L], [mh / 2, -L], [mh / 2, -L - 0.6 * dm], [0, -L - 0.6 * dm]]);
  }
  // Set: the broken mandrel leaves a recess Ø dm in the head top (structural:
  // the locked pin sits only 0.15·k down), drawn into the profile.
  // No recess when its floor would not lie below the head surface at r = dm/2
  // (a dome nearly as narrow as the mandrel).
  const floor = head.top - (v.kind === 'blind-structural' ? 0.15 : 0.4) * v.headHeight;
  const top = headPoints(head, floor < head.at(dm / 2) ? { pin: { r: dm / 2, z: floor } } : {});
  switch (v.kind) {
    case 'blind-closed': {
      // The bulb with a closed spherical cup at its bottom (cap height 0.3·d,
      // at most half the upset), the whole upset still g … g + h.
      const c = Math.min(0.3 * d, 0.5 * h);
      const zr = -g - (h - c);
      return revolve(own, [...top, ...barrel(r, B, -g, h - c), capDown(d, c, zr)]);
    }
    case 'blind-multigrip':
      return revolve(own, [
        ...top,
        [r, -g],
        [B / 2, -g - 0.25 * h],
        [0.55 * d, -g - 0.5 * h],
        [B / 2, -g - 0.75 * h],
        [r, -g - h],
        [0, -g - h],
      ]);
    case 'blind-peel': {
      // The stub to −(g + h) and four petals folded flat against the blind
      // face: one 4-arm prism (half width 0.25·d, span B), fused.
      const stub = revolve(own, [...top, [r, -g - h], [0, -g - h]]);
      return own(stub.fuse(crossPrism(own, B, 0.25 * d, -g - h, h)));
    }
    default:
      // Open end and structural: the barrel bulb, flat end.
      return revolve(own, [...top, ...barrel(r, B, -g, h), [0, -g - h]]);
  }
}

function rivetSolid(own, v) {
  const d = v.diameter,
    r = d / 2,
    L = v.length,
    g = v.grip,
    B = v.bulbDiameter,
    h = v.bulbHeight;
  const set = v.state !== 'unset';
  if (RECESSED.includes(v.kind)) return blindRivet(own, v);
  switch (v.kind) {
    case 'blind-drive': {
      // The pin: a disc Ø dm 0.1 mm proud of the head when set, ml proud as
      // supplied; set, the tail flares from −g to Ø B at −L.
      const head = headOutline(v, r);
      const pin = { r: v.mandrelDiameter / 2, z: head.top + (set ? 0.1 : v.mandrelLength) };
      const body = set
        ? [
            [r, -g],
            [B / 2, -L],
            [0, -L],
          ]
        : [
            [r, -L],
            [0, -L],
          ];
      return revolve(own, [...headPoints(head, { pin }), ...body]);
    }
    case 'solid': {
      const head = headOutline(v, r);
      const body = set
        ? [
            [r, -g],
            [B / 2, -g],
            [B / 2, -g - 0.6 * h],
            [0.6 * d, -g - h],
            [0, -g - h],
          ]
        : [
            [r, -L],
            [0, -L],
          ];
      return revolve(own, [...headPoints(head), ...body]);
    }
    case 'semi-tubular': {
      const head = headOutline(v, r);
      const b = v.boreDiameter / 2;
      // Set: the rolled lip is a ring and the bore stops inside it; as
      // supplied: the bore boreDepth deep from the tail.
      const body = set
        ? [
            [r, -g],
            [B / 2, -g],
            [B / 2, -g - h],
            [b, -g - h],
            [b, -g - 0.5 * h],
            [0, -g - 0.5 * h],
          ]
        : [
            [r, -L],
            [b, -L],
            [b, -L + v.boreDepth],
            [0, -L + v.boreDepth],
          ];
      return revolve(own, [...headPoints(head), ...body]);
    }
    case 'tubular': {
      // A ring profile: the through bore runs from the head top to the tail.
      const head = headOutline(v, r);
      const b = v.boreDiameter / 2;
      const body = set
        ? [
            [r, -g],
            [B / 2, -g],
            [B / 2, -g - h],
            [b, -g - h],
          ]
        : [
            [r, -L],
            [b, -L],
          ];
      return revolve(own, [...headPoints(head, { bore: b }), ...body]);
    }
    case 'split': {
      const head = headOutline(v, r);
      if (set) {
        // Two legs bent flat: one box d wide, spanning B, h thick, fused.
        const shank = revolve(own, [...headPoints(head), [r, -g], [0, -g]]);
        return own(shank.fuse(box(own, [-B / 2, -r, -g - h], [B / 2, r, -g])));
      }
      const shank = revolve(own, [...headPoints(head), [r, -L], [0, -L]]);
      return own(shank.cut(box(own, [-d, -0.1 * d, -L - EPS], [d, 0.1 * d, -0.25 * L])));
    }
    case 'self-piercing': {
      const head = headOutline(v, r);
      const b = v.boreDiameter / 2;
      // Set: the tail flares from −0.75·g to Ø B at −L (the flare fills the
      // bore); as supplied: the bore boreDepth deep from the tail.
      const body = set
        ? [
            [r, -0.75 * g],
            [B / 2, -L],
            [0, -L],
          ]
        : [
            [r, -L],
            [b, -L],
            [b, -L + v.boreDepth],
            [0, -L + v.boreDepth],
          ];
      return revolve(own, [...headPoints(head), ...body]);
    }
    case 'blind-rivet-nut':
    case 'blind-rivet-stud':
      return threadedInsert(own, v);
    case 'lockbolt': {
      // The pin, and when set the swaged collar: a flange Ø 2.1·d, 0.3·d thick
      // (at most half the collar) against the blind sheet, then the collar
      // Ø B down to −(g + h), the pintail broken flush with it.
      const head = headOutline(v, r);
      if (!set) return revolve(own, [...headPoints(head), [r, -L], [0, -L]]);
      const F = 2.1 * d,
        t = Math.min(0.3 * d, 0.5 * h);
      return revolve(own, [
        ...headPoints(head),
        [r, -g],
        [F / 2, -g],
        [F / 2, -g - t],
        [B / 2, -g - t],
        [B / 2, -g - h],
        [0, -g - h],
      ]);
    }
    case 'push-rivet': {
      // The pin head Ø 1.5·d × 0.35·d on the flat head; as supplied it stands
      // ml higher on its stem Ø dm and the legs are straight.
      const k = v.headHeight,
        R = v.headDiameter / 2,
        p = 0.75 * d,
        ph = 0.35 * d;
      const pinHead = set
        ? [
            [0, k + ph],
            [p, k + ph],
            [p, k],
          ]
        : [
            [0, k + ph + v.mandrelLength],
            [p, k + ph + v.mandrelLength],
            [p, k + v.mandrelLength],
            [v.mandrelDiameter / 2, k + v.mandrelLength],
            [v.mandrelDiameter / 2, k],
          ];
      const legs = set
        ? [
            [r, -g],
            [B / 2, -g - 0.3 * (L - g)],
            [B / 2, -L + 0.2 * (L - g)],
            [r, -L],
          ]
        : [[r, -L]];
      return revolve(own, [...pinHead, [R, k], [R, 0], [r, 0], ...legs, [0, -L]]);
    }
    default:
      throw new Error('Choose a hardware type.');
  }
}

// The blind rivet nut (a ring round the thread bore) and the blind rivet stud
// (the stud standing T above the flange). Set, the body bulges below the
// grip. Hexagon body: the hex prism (across flats = bodyDiameter) is fused
// over the grip (set) or the whole body (as supplied) round a thinner round
// core, and the nut's bore is cut through everything.
function threadedInsert(own, v) {
  const d = v.diameter,
    L = v.length,
    g = v.grip,
    B = v.bulbDiameter,
    h = v.bulbHeight;
  const bb = v.bodyDiameter / 2;
  const set = v.state !== 'unset';
  const nut = v.kind === 'blind-rivet-nut';
  const hex = v.body === 'hex';
  const head = headOutline(v, bb);
  const bore = nut ? v.boreDiameter / 2 : 0;
  // Nut: a ring profile when round; solid round a core when hex (the bore is
  // cut after the fuse). Stud: the stud Ø d stands T above the flange.
  const top = nut
    ? headPoints(head, hex ? {} : { bore })
    : headPoints(head, { pin: { r: d / 2, z: head.top + v.threadLength } });
  const tail = hex || !nut ? [0, -L] : [bore, -L];
  const bulge = set ? barrel(bb, B, -g, h) : [];
  if (!hex) return revolve(own, [...top, ...bulge, [bb, -L], tail]);
  const core = ((nut ? bore : d / 2) + bb) / 2;
  const zStart = head.zStart;
  // The core runs under the head down to where the hex ends; the bulge (set)
  // starts at the body radius below it.
  const coreSteps = set
    ? -g < zStart - 1e-6
      ? [
          [core, zStart],
          [core, -g],
          [bb, -g],
        ]
      : []
    : [
        [core, zStart],
        [core, -L],
      ];
  const body = set ? [...coreSteps, ...bulge, [bb, -L], tail] : [...coreSteps, tail];
  const solid = own(revolve(own, [...top, ...body]).fuse(hexPrism(own, v.bodyDiameter, set ? g : L, set ? -g : -L)));
  if (!nut) return solid;
  return own(solid.cut(cylinder(own, v.boreDiameter, head.top + L + 2 * EPS, -L - EPS)));
}

export function rivetGeometry(f, parameters, own) {
  return rivetSolid(own, hardwareDimensions(f, parameters));
}
