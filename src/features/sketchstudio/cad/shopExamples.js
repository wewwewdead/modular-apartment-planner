// Shop → Example: pump bracket (docs/sketch-studio-fab-shop.md §9 SM-1 item 8).
// The pump bracket study of pumpBracket.js (a 166 long channel, 52.5 outside,
// 8 mm flanges, t 1.5) made the shop's way: a flat A5052 blank with its
// openings and mounting holes cut in, folded by two 90° bends. The blank is
// sized by the bend deduction so the outside dimensions come out as drawn.
import { Matrix4, Quaternion, Vector3 } from 'three';
import { emptyModel } from './model.js';
import { bendNumbers, blankHoles, distanceFromLeg, foldSheet, profilePolygon, transformPoint } from './sheetMetal.js';
import { DEFAULT_PUNCH, RAL_CLASSIC, defaultDie, stockOf } from './shopCatalog.js';
import { gaugeBendLine, gaugeEdges } from './pressBrake.js';
import { applyFinish } from './paintStation.js';
import { PRINT_DEFAULTS, createPrint } from './printStation.js';
import { uprightAxes } from './sketchPlane.js';
import { groupNodes } from './groups.js';
import { etchBendMarks } from './laserStation.js';
import { controlBoxLogo } from './logoImage.js';
import { flangedPanel } from './panelMaker.js';
import { boughtInItem } from './shopParts.js';
import { lineUpNodes } from './mate.js';
import { seatHardware } from './placementHardware.js';
import { createHardware, hardwareDefaults } from './hardware.js';
import { cleanRotation, instanceMatrix, matrixPose } from './movement.js';

export function sheetMetalPumpBracket() {
  const t = 1.5,
    stock = 'a5052';
  const length = 166,
    web = 52.5,
    flange = 8;
  const numbers = bendNumbers({ thickness: t, stock, angle: 90 });
  const width = web + 2 * flange - 2 * numbers.deduction;
  const y1 = distanceFromLeg(flange, numbers),
    y2 = width - y1;
  // A height on the web, measured from the outside of the first flange (the
  // study's Z), as a flat Y on the blank.
  const flatY = (height) => flange - numbers.deduction + height;
  const openings = Array.from({ length: 5 }, (_, i) => ({
    type: 'circle',
    radius: 12.5,
    center: [23 + 30 * i, flatY(26.5)],
  }));
  const mounting = [
    [38, 8.5],
    [128, 8.5],
    [38, 38.5],
    [128, 38.5],
    [6, 8.5],
    [length - 6, 8.5],
  ].map(([x, height]) => ({ type: 'circle', radius: 2, center: [x, flatY(height)] }));
  const model = emptyModel();
  model.sketches = [
    {
      id: 'shop-pump-blank',
      name: 'Pump bracket blank',
      plane: 'XY',
      profile: { type: 'rectangle', width: length, height: width, origin: [0, 0], holes: [...openings, ...mounting] },
      primitives: [],
      constrained: false,
    },
  ];
  model.parts = [
    {
      id: 'shop-pump-bracket',
      name: 'Pump bracket — sheet metal',
      material: stockOf(stock).name,
      features: [
        {
          id: 'shop-pump-sheet',
          type: 'sheetmetal',
          sketchId: 'shop-pump-blank',
          thickness: t,
          stock,
          kFactor: null,
          base: null,
          marks: [],
          bends: [
            { id: 'shop-pump-bend-1', a: [length, y1], b: [0, y1], angle: 90, direction: 'up', radius: null },
            { id: 'shop-pump-bend-2', a: [0, y2], b: [length, y2], angle: 90, direction: 'up', radius: null },
          ],
        },
      ],
    },
  ];
  model.instances = [
    {
      id: 'shop-pump-instance',
      partId: 'shop-pump-bracket',
      name: 'Pump bracket (sheet metal)',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      visible: true,
    },
  ];
  return model;
}

// ---------------------------------------------------------------- Example: control box (SM-4)
// A small powder-coated enclosure made the shop's way (docs/sketch-studio-
// fab-shop.md §9 SM-4): a body folded from one blank (a base with four
// flanges; the corner reliefs cut in the blank keep the bend zones apart so
// every bend is legal, and the front and rear flanges stop 0.1 mm short of the
// side flanges' inner faces, the fit-up gap at each corner), a lid folded down
// on two edges sitting on the body's walls, both parts powder coated RAL 7035
// and the lid printed with a label and a logo, the two grouped as one
// product. Every record is written by the stations' own functions (the
// brake's gauge and two-point lines with its tooling, applyFinish,
// createPrint, Etch bend lines), only the ids are fixed ones. The box is 25 mm
// deep. With
// the sectional tooling and the 100 mm punch holders (shop floor §6.2) the
// same layout clears up to 81 mm deep; deeper, its last wall swings into the
// holders (before SF-3, with the ram on the punch, anything over 25 mm hit it).
export const CONTROL_BOX = Object.freeze({
  length: 160, // outside X
  width: 100, // outside Y
  height: 25, // outside flange height
  thickness: 1.2,
  stock: 'spcc',
  lidFlange: 15,
  lidClearance: 0.3,
  fitGap: 0.1,
  relief: 0.5,
  name: 'Control box',
});
const BOX_TOOLING = Object.freeze({ punch: 'straight-88', die: 'v8-88' });

/**
 * The body's flat blank for `box` (CONTROL_BOX): its profile (outline and
 * cut-outs: four Ø5.5 mounting holes in the base, a Ø12.5 cable entry in the
 * right wall) and the bend lines of the layout (flat mm).
 */
export function controlBoxBody(box = CONTROL_BOX) {
  const { length, width, height, thickness: t, stock, fitGap: g, relief: e } = box;
  const numbers = bendNumbers({ thickness: t, stock, angle: 90, ...BOX_TOOLING });
  const h = numbers.allowance / 2,
    r = numbers.radius;
  // From a bend line to the folded flange's outside face (toward the flange).
  const c = r + t - h;
  const d = distanceFromLeg(height, numbers);
  const xL = d,
    xR = d + (length - 2 * c),
    yF = d,
    yR = d + (width - 2 * c);
  const X = xR + d,
    Y = yR + d;
  // The front and rear flanges end the fit-up gap short of the side flanges'
  // inner faces; the side flanges reach the front and rear outside faces.
  const xFa = xL + h - r + g,
    xFb = xR - h + r - g,
    yLa = yF - c,
    yLb = yR + c;
  const round = (p) => p.map((v) => Math.round(v * 1e4) / 1e4);
  const points = [
    [xFa, 0],
    [xFb, 0],
    [xFb, yF - h],
    [xR - h - e, yF - h],
    [xR - h - e, yF + h + e],
    [xR + h, yF + h + e],
    [xR + h, yLa],
    [X, yLa],
    [X, yLb],
    [xR + h, yLb],
    [xR + h, yR - h - e],
    [xR - h - e, yR - h - e],
    [xR - h - e, yR + h],
    [xFb, yR + h],
    [xFb, Y],
    [xFa, Y],
    [xFa, yR + h],
    [xL + h + e, yR + h],
    [xL + h + e, yR - h - e],
    [xL - h, yR - h - e],
    [xL - h, yLb],
    [0, yLb],
    [0, yLa],
    [xL - h, yLa],
    [xL - h, yF + h + e],
    [xL + h + e, yF + h + e],
    [xL + h + e, yF - h],
    [xFa, yF - h],
  ].map(round);
  const hole = (x, y, diameter) => ({ type: 'circle', radius: diameter / 2, center: round([x, y]) });
  const inset = 15;
  const holes = [
    hole(xL + inset, yF + inset, 5.5),
    hole(xR - inset, yF + inset, 5.5),
    hole(xR - inset, yR - inset, 5.5),
    hole(xL + inset, yR - inset, 5.5),
    // The cable entry, centred on the right wall's flat.
    hole(xR + h + (d - h) / 2, (yF + yR) / 2, 12.5),
  ];
  return {
    profile: { type: 'polygon', points, holes },
    layout: { xL, xR, yF, yR, X, Y, xFa, xFb, yLa, yLb, d, h, c, r, e },
    numbers,
  };
}

/** The lid's flat blank: a plain rectangle; its two flanges fold down over the body's front and rear walls. */
export function controlBoxLid(box = CONTROL_BOX) {
  const { length, width, thickness: t, stock, lidFlange, lidClearance } = box;
  const numbers = bendNumbers({ thickness: t, stock, angle: 90, ...BOX_TOOLING });
  const h = numbers.allowance / 2,
    c = numbers.radius + t - h;
  const d = distanceFromLeg(lidFlange, numbers);
  const outside = width + 2 * (t + lidClearance);
  const Y = Math.round((2 * d + outside - 2 * c) * 1e4) / 1e4;
  return { profile: { type: 'rectangle', width: length, height: Y, origin: [0, 0] }, layout: { d, c, h, Y, outside } };
}

// A hit as the press brake writes it: the gauge line (Backgauge edge mode) or
// two typed points, 90° up (or Flip sheet: down), the tooling it ran.
const brakeBend = (id, line, direction = 'up') => ({
  id,
  a: line.a,
  b: line.b,
  angle: 90,
  direction,
  radius: null,
  ...BOX_TOOLING,
});
// The gauge edge of a blank's outline lying on x = value (axis 0) or y = value (axis 1).
const edgeOn = (outer, axis, value) =>
  gaugeEdges(outer).find((edge) => Math.abs(edge.a[axis] - value) < 1e-6 && Math.abs(edge.b[axis] - value) < 1e-6);

export function sheetMetalControlBox(box = CONTROL_BOX) {
  const t = box.thickness,
    stock = box.stock;
  const body = controlBoxBody(box),
    lid = controlBoxLid(box);
  const L = body.layout;
  // The press brake's four hits on the body: both side walls gauged off the
  // blank's left and right edges, then the front and rear walls by two typed
  // points (the side flanges are on the gauge line there: a full-length line
  // would fold them too).
  const outer = profilePolygon(body.profile).outer;
  const bodyBends = [
    brakeBend('shop-box-bend-left', gaugeBendLine(outer, edgeOn(outer, 0, 0), L.d)),
    brakeBend('shop-box-bend-right', gaugeBendLine(outer, edgeOn(outer, 0, L.X), L.d)),
    brakeBend('shop-box-bend-front', { a: [L.xL + L.h + L.e, L.yF], b: [L.xR - L.h - L.e, L.yF] }),
    brakeBend('shop-box-bend-rear', { a: [L.xR - L.h - L.e, L.yR], b: [L.xL + L.h + L.e, L.yR] }),
  ];
  const lidOuter = profilePolygon(lid.profile).outer;
  const lidBends = [
    brakeBend('shop-box-lid-bend-front', gaugeBendLine(lidOuter, edgeOn(lidOuter, 1, 0), lid.layout.d), 'down'),
    brakeBend(
      'shop-box-lid-bend-rear',
      gaugeBendLine(lidOuter, edgeOn(lidOuter, 1, lid.layout.Y), lid.layout.d),
      'down',
    ),
  ];
  const feature = (id, sketchId, bends) => ({
    id,
    type: 'sheetmetal',
    sketchId,
    thickness: t,
    stock,
    kFactor: null,
    base: null,
    marks: [],
    bends,
  });
  const bodyFeature = feature('shop-box-body-sheet', 'shop-box-body-blank', bodyBends);
  const lidFeature = feature('shop-box-lid-sheet', 'shop-box-lid-blank', lidBends);
  const bodyFold = foldSheet(bodyFeature, body.profile);
  const lidFold = foldSheet(lidFeature, lid.profile);
  // Laser → Etch bend lines on both blanks.
  const fixMarks = (marks, prefix) => marks.map((m, i) => ({ ...m, id: `${prefix}-${i + 1}` }));
  bodyFeature.marks = fixMarks(etchBendMarks(bodyFold), 'shop-box-body-mark');
  lidFeature.marks = fixMarks(etchBendMarks(lidFold), 'shop-box-lid-mark');
  const material = stockOf(stock).name;
  let model = emptyModel();
  model.sketches = [
    {
      id: 'shop-box-body-blank',
      name: 'Control box body blank',
      plane: 'XY',
      profile: body.profile,
      primitives: [],
      constrained: false,
    },
    {
      id: 'shop-box-lid-blank',
      name: 'Control box lid blank',
      plane: 'XY',
      profile: lid.profile,
      primitives: [],
      constrained: false,
    },
  ];
  model.parts = [
    { id: 'shop-box-body', name: 'Control box body — sheet metal', material, features: [bodyFeature] },
    { id: 'shop-box-lid', name: 'Control box lid — sheet metal', material, features: [lidFeature] },
  ];
  // The lid sits on the walls' top edges, centred over the body, its flanges outside the front and rear walls.
  const bodyOutside = L.d - L.c;
  const bodyId = 'shop-box-body-instance',
    lidId = 'shop-box-lid-instance';
  model.instances = [
    {
      id: bodyId,
      partId: 'shop-box-body',
      name: 'Control box body',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      visible: true,
    },
    {
      id: lidId,
      partId: 'shop-box-lid',
      name: 'Control box lid',
      position: [
        Math.round(bodyOutside * 1e4) / 1e4,
        Math.round((bodyOutside - t - box.lidClearance - (lid.layout.d - lid.layout.c)) * 1e4) / 1e4,
        box.height,
      ],
      rotation: [0, 0, 0],
      visible: true,
    },
  ];
  // Paint: the whole box (the group selected in the booth), RAL 7035 textured powder.
  const ral7035 = RAL_CLASSIC.find((r) => r.code === 7035);
  model = applyFinish(model, [bodyId, lidId], {
    kind: 'powder',
    name: ral7035.name,
    colour: ral7035.colour,
    gloss: 'texture',
    thickness: 70,
  });
  model.finishes = model.finishes.map((f, i) => ({ ...f, id: `shop-box-finish-${i + 1}` }));
  // Print: on the lid's top face (z = t in its own frame), the logo by UV
  // flatbed on the left and the label by silk-screen beside it.
  const top = [0, 0, 1];
  const x = uprightAxes(top).x;
  const middle = lid.layout.Y / 2;
  model.prints = [
    createPrint({
      instanceId: lidId,
      point: [32, middle, t],
      normal: top,
      x,
      artwork: { ...PRINT_DEFAULTS, kind: 'image', image: controlBoxLogo(64), width: 24, height: 24, method: 'uv' },
    }),
    createPrint({
      instanceId: lidId,
      point: [104, middle, t],
      normal: top,
      x,
      artwork: { ...PRINT_DEFAULTS, kind: 'text', text: 'CONTROL BOX', width: 72, height: 9, method: 'silk' },
    }),
  ].map((p, i) => ({ ...p, id: `shop-box-print-${i + 1}` }));
  // The two parts are one product: a group, moved and painted as one.
  const grouped = groupNodes(model, [bodyId, lidId]);
  model = {
    ...grouped.model,
    groups: grouped.model.groups.map((g) =>
      g.id === grouped.groupId ? { ...g, id: 'shop-box-group', name: box.name } : g,
    ),
    instances: grouped.model.instances.map((i) =>
      i.groupId === grouped.groupId ? { ...i, groupId: 'shop-box-group' } : i,
    ),
  };
  // A flat-pattern drawing of the body for the shop floor.
  model.sheets = [
    ...model.sheets,
    {
      id: 'shop-box-flat-sheet',
      title: 'Control box body — flat pattern',
      partId: 'shop-box-body',
      layout: 'engineering',
      size: 'A3',
      units: 'mm',
      scaleMode: 'fit',
      scale: 1,
      revision: 'A',
      tolerance: '±0.2 mm',
      material: `${material} t ${t}`,
      views: ['flat'],
      annotations: [],
      notes: 'Laser cut, etch the bend lines, then bend in the order of the bend table.',
    },
  ];
  return model;
}

// ---------------------------------------------------------------- Example: kiosk (SF-4)
// The user's kiosk (docs/sketch-studio-shop-floor.md §7): a double-sided
// screen kiosk on an A-frame, modelled on the shop's photo of the frame and
// its design proposal and SIZED BY EYE from them (no drawing was sent; swap
// these numbers for the shop's real ones). Two face frames from the flanged
// panel maker (40 mm returns on the sides and the top, a screen window, a
// lower window, a crease that leans the lower face out), a shelf tray and two
// base channels between them, the screen housing's rounded top corners closed
// by four corner pieces set against the flange ends
// (docs/sketch-studio-round-bend.md §13.4) — together the frame, one group,
// powder-coated black — two flanged lower covers behind the lower windows
// (white, a text print each), two bought-in displays behind the screen
// windows. Every record is written by the stations' own functions: the panel
// maker's blanks, bends in brake order (strokes) and etched lines;
// applyFinish; createPrint; Line up holes (lineUpNodes) to put the displays
// and covers in place, seatHardware for every fastener (M4 pan heads from
// outside through the face frame's laser-cut holes, M4 nuts on the covers);
// the frame and the product grouped by groups.js. Only the ids are fixed ones.
export const KIOSK = Object.freeze({
  name: 'Kiosk',
  width: 640, // outside, across a face (X)
  height: 1700, // floor to the top of the face frames
  depth: 110, // outside, front face to rear face across the screen housing
  thickness: 1.5, // face frames, shelf tray, base channels
  stock: 'spcc',
  flange: 40, // the face frames' return flanges (both sides and the top)
  corner: Object.freeze({ radius: 30, leg: 15 }), // the face frames' round top corners: outside radius, the corner pieces' legs
  creaseHeight: 760, // the crease above the floor
  creaseAngle: 15, // the lower face leans out by this
  screen: Object.freeze({ width: 480, height: 620, radius: 12 }), // the screen window, centred on the upper face
  lowerWindow: Object.freeze({ width: 440, height: 420, radius: 12 }), // centred on the lower face
  display: Object.freeze({ width: 520, height: 660, depth: 40, inset: 12 }), // inset: its M4 inserts from its edges
  shelf: Object.freeze({ height: 715, flange: 30, side: 20 }), // height: the tray's top above the floor
  base: Object.freeze({ height: 50, width: 80, inset: 40, overhang: 40 }), // the two base channels (a 50 wide one hits the punch)
  cover: Object.freeze({ thickness: 1.2, flange: 15, margin: 30 }), // margin: past the window on every side
  hole: 4.5, // the M4 clearance holes
  fitGap: 0.1, // the face frames' fit-up gap (the panel maker's `gap`, the least it keeps between folded flange ends)
  text: 'KIOSK',
});
const KIOSK_FIXINGS = Object.freeze({ screw: 'pan-head', nut: 'nut', size: 'M4' });

const r6 = (v) => Math.round(v * 1e6) / 1e6;
const v3 = (p) => new Vector3(...p);
const rect = (w, h) => [
  [0, 0],
  [w, 0],
  [w, h],
  [0, h],
];
// A pose with the part's x, y, z axes along the given world axes (an exact turn), at position 0.
const turned = (x, y, z) => ({
  position: [0, 0, 0],
  rotation: cleanRotation(new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(v3(x), v3(y), v3(z)))),
});
// Part-frame point / direction of a fold piece → world, through an instance pose.
const toWorld = (instance, piece, point) =>
  v3(transformPoint(piece.matrix, point)).applyMatrix4(instanceMatrix(instance)).toArray();
const dirWorld = (instance, piece, direction) => {
  const m = piece.matrix;
  const d = [0, 1, 2].map((k) => m[k] * direction[0] + m[4 + k] * direction[1] + m[8 + k] * direction[2]);
  return v3(d).transformDirection(instanceMatrix(instance)).toArray();
};
const pieceOf = (fold, id) => fold.pieces.find((p) => p.id === id);
const segmentLength = ([p, q]) => Math.hypot(q[0] - p[0], q[1] - p[1]);
const longest = (segments) => segments.reduce((best, s) => (segmentLength(s) > segmentLength(best) ? s : best));
// The outline segment of a piece that `pick` chooses (flat), as a world edge at height z.
const edgeOf = (instance, piece, z, pick) => {
  const ring = piece.outer;
  const [a, b] = pick(ring.map((p, i) => [p, ring[(i + 1) % ring.length]]));
  return { instanceId: instance.id, a: toWorld(instance, piece, [...a, z]), b: toWorld(instance, piece, [...b, z]) };
};
// The segments lying on the line where f(point) is extreme (lowest when `low`).
const extremeSegments =
  (piece, f, low = true) =>
  (segments) => {
    const values = piece.outer.map(f);
    const at = low ? Math.min(...values) : Math.max(...values);
    return longest(segments.filter(([p, q]) => Math.abs(f(p) - at) < 1e-6 && Math.abs(f(q) - at) < 1e-6));
  };
// Both openings of the laser-cut hole `index` (its place in the profile's cut-outs) of a folded blank, world.
function openings(instance, fold, profile, index, featureId) {
  const row = blankHoles(fold, profile).find((h) => h.index === index);
  if (!row) throw new Error(`Kiosk: cut-out ${index + 1} is not a round hole clear of the bends.`);
  const m = instanceMatrix(instance);
  const at = (p) => v3(p).applyMatrix4(m).toArray();
  const drill = v3(row.direction).transformDirection(m).toArray();
  const ref = { instanceId: instance.id, featureId, index };
  return {
    entry: { ...ref, side: 'entry', point: at(row.centre), normal: drill.map((v) => -v || 0) },
    far: {
      ...ref,
      side: 'far',
      point: at(row.centre.map((v, k) => v + row.direction[k] * fold.thickness)),
      normal: drill.map((v) => v || 0),
    },
  };
}

/**
 * The kiosk's face frame (panelMaker.js flangedPanel) for `kiosk` (KIOSK),
 * with the lengths the layout reads: lower (bottom edge to the crease, along
 * the face), upper, length, the display's and the cover's hole offsets and
 * where the holes start in the blank's cut-outs. Its two top corners are
 * round (`panel.cornerPieces`: the corner piece and where each stands). The
 * face is drawn lying down (x up the face, y across it): the laser never
 * turns a blank, and a 1.7 m face only fits a stock sheet along its length.
 */
export function kioskFaceFrame(kiosk = KIOSK) {
  const { width: W, thickness: t, stock, flange, creaseAngle, screen, lowerWindow, display, cover, hole } = kiosk;
  const lower = (kiosk.creaseHeight - kiosk.base.height) / Math.cos((creaseAngle * Math.PI) / 180);
  const upper = kiosk.height - kiosk.creaseHeight;
  const length = lower + upper;
  const screenAt = [lower + upper / 2, W / 2],
    lowerAt = [lower / 2, W / 2];
  // The display's four M4 inserts under its bezel, outside the screen window:
  // [across, up] the display ↔ [up, across] the face.
  const a = display.width / 2 - display.inset,
    b = display.height / 2 - display.inset;
  const displayOffsets = [
    [-a, -b],
    [a, -b],
    [a, b],
    [-a, b],
  ];
  // The cover's four fixings, half its margin out from the lower window: [up, across].
  const u = lowerWindow.height / 2 + cover.margin / 2,
    v = lowerWindow.width / 2 + cover.margin / 2;
  const coverOffsets = [
    [-u, -v],
    [u, -v],
    [u, v],
    [-u, v],
  ];
  const input = {
    face: rect(length, W),
    thickness: t,
    stock,
    gap: kiosk.fitGap,
    flanges: [0, 2, 1].map((edge) => ({ edge, depth: flange, angle: 90, direction: 'up' })),
    // The top corners (face[1], face[2]: the top edge's ends) are round, closed by corner pieces.
    rounds: [1, 2].map((corner) => ({ corner, radius: kiosk.corner.radius, leg: kiosk.corner.leg })),
    creases: [{ a: [lower, 0], b: [lower, W], angle: creaseAngle, direction: 'down' }],
    windows: [
      {
        type: 'rect',
        x: screenAt[0],
        y: screenAt[1],
        width: screen.height,
        height: screen.width,
        radius: screen.radius,
      },
      {
        type: 'rect',
        x: lowerAt[0],
        y: lowerAt[1],
        width: lowerWindow.height,
        height: lowerWindow.width,
        radius: lowerWindow.radius,
      },
    ],
    holes: [
      ...displayOffsets.map(([dx, dz]) => ({ x: screenAt[0] + dz, y: screenAt[1] + dx, diameter: hole })),
      ...coverOffsets.map(([du, dv]) => ({ x: lowerAt[0] + du, y: lowerAt[1] + dv, diameter: hole })),
    ],
  };
  const panel = flangedPanel(input, { idPrefix: 'shop-kiosk-face' });
  return { panel, input, lower, upper, length, displayOffsets, coverOffsets, holesFrom: input.windows.length };
}

/**
 * Shop → More → Example: kiosk. Throws, by name, any record a station would
 * refuse. Built once per set of sizes (≈ 0.3 s, three quarters of it the
 * press brake's sequence checks the panel maker runs on each panel), then
 * handed out as a copy.
 */
export function sheetMetalKiosk(kiosk = KIOSK) {
  const key = JSON.stringify(kiosk);
  if (!KIOSK_BUILT.has(key)) KIOSK_BUILT.set(key, JSON.stringify(buildKiosk(kiosk)));
  return JSON.parse(KIOSK_BUILT.get(key));
}
const KIOSK_BUILT = new Map();

function buildKiosk(kiosk) {
  const { width: W, depth, thickness: t, stock, creaseAngle, display, cover } = kiosk;
  const material = stockOf(stock).name;
  const refuse = (what, panel) => {
    const problem = panel.report.problems[0];
    if (problem) throw new Error(`Kiosk ${what}: ${problem.message}`);
  };
  const counter = (prefix) => {
    let n = 0;
    return () => `${prefix}-${++n}`;
  };
  const bendOf = (fold, id) => fold.bends.find((b) => b.id === id);
  // ------------------------------------------------ Draw → Flanged panel → Cut and bend it for me
  const layout = kioskFaceFrame(kiosk);
  const face = layout.panel;
  refuse('face frame', face);
  const faceFold = face.fold;
  const faceStroke = (kind, edge) =>
    face.strokes.find((s) => s.kind === kind && (kind === 'crease' || s.edge === edge));
  const crease = bendOf(faceFold, faceStroke('crease').bendIds[0]);
  const upperPiece = pieceOf(faceFold, faceFold.rootPiece);
  if (crease.fixedPiece !== upperPiece.id) throw new Error('Kiosk face frame: the upper face must keep its place.');
  const lowerPiece = pieceOf(faceFold, crease.movingPieces[0]);
  const bottomEdge = extremeSegments(lowerPiece, (p) => p[0]);
  // ------------------------------------------------ the two face frames, standing on the base channels
  const facePart = 'shop-kiosk-face';
  const faceInstance = (id, name, across, inward) => ({
    id,
    partId: facePart,
    name,
    ...turned([0, 0, 1], across, inward),
    visible: true,
  });
  const front = faceInstance('shop-kiosk-front', 'Front face frame', [1, 0, 0], [0, 1, 0]);
  const rear = faceInstance('shop-kiosk-rear', 'Rear face frame', [-1, 0, 0], [0, -1, 0]);
  // The face's y = 0 edge at X (front 0, rear W), its outside at Y = ∓depth/2,
  // its lowest bottom corner line (the inner one: the lower face leans out) on the channels.
  const edge0 = face.map.toFlat([layout.length - 1, 0]);
  const place = (instance, x0, y0) => {
    const at = toWorld(instance, upperPiece, [...edge0, 0]);
    const ends = [0, t].map((z) => edgeOf(instance, lowerPiece, z, bottomEdge));
    const low = Math.min(...ends.flatMap((e) => [e.a[2], e.b[2]]));
    instance.position = [r6(x0 - at[0]), r6(y0 - at[1]), r6(kiosk.base.height - low)];
  };
  place(front, 0, -depth / 2);
  place(rear, W, depth / 2);
  // ------------------------------------------------ the corner pieces, in the face frames' round top corners
  // (round-bend spec §13.4): the panel maker's pose, through each face frame's.
  // Corner 1 (the y = 0 edge's top) is the left one as seen from that side.
  const cornerLayout = face.cornerPieces[0].piece;
  if (face.cornerPieces.some((c) => c.piece !== cornerLayout))
    throw new Error('Kiosk face frame: both round corners must be one corner piece.');
  const cornerPart = 'shop-kiosk-corner';
  // [{ instance, corner (the face corner), frame (the face frame's instance) }]
  const corners = [front, rear].flatMap((frame) =>
    face.cornerPieces.map(({ corner, pose }) => {
      const side = corner === 1 ? 'left' : 'right';
      const where = frame === front ? 'front' : 'rear';
      return {
        corner,
        frame,
        instance: {
          id: `shop-kiosk-corner-${where}-${side}`,
          partId: cornerPart,
          name: `${where === 'front' ? 'Front' : 'Rear'} ${side} corner piece`,
          ...matrixPose(instanceMatrix(frame).multiply(new Matrix4().fromArray(pose))),
          visible: true,
        },
      };
    }),
  );
  // ------------------------------------------------ the shelf tray: its front and rear flanges lie on the lower faces
  const innerPlane = (instance) => ({
    point: toWorld(instance, lowerPiece, [...lowerPiece.centroid, t]),
    normal: dirWorld(instance, lowerPiece, [0, 0, 1]),
  });
  const yOn = (plane, z) => plane.point[1] - (plane.normal[2] * (z - plane.point[2])) / plane.normal[1];
  const shelfTop = kiosk.shelf.height;
  const radius = bendNumbers({ thickness: t, stock, angle: 90, punch: DEFAULT_PUNCH, die: defaultDie(t).key }).radius;
  // Clear of the face frames' side bends (their inside radius starts t + r in from the outside).
  const sideClear = t + radius + 0.5;
  const tray = flangedPanel(
    {
      face: rect(W - 2 * sideClear, yOn(innerPlane(rear), shelfTop) - yOn(innerPlane(front), shelfTop)),
      thickness: t,
      stock,
      flanges: [
        { edge: 0, depth: kiosk.shelf.flange, angle: 90 - creaseAngle, direction: 'down' },
        { edge: 2, depth: kiosk.shelf.flange, angle: 90 - creaseAngle, direction: 'down' },
        { edge: 1, depth: kiosk.shelf.side, angle: 90, direction: 'down' },
        { edge: 3, depth: kiosk.shelf.side, angle: 90, direction: 'down' },
      ],
    },
    { idPrefix: 'shop-kiosk-tray' },
  );
  refuse('shelf tray', tray);
  // Down flanges: their outside is the top face, so the face outline lies at z = t.
  const trayCorner = tray.map.toFlat([0, 0]);
  const trayInstance = {
    id: 'shop-kiosk-tray',
    partId: 'shop-kiosk-tray',
    name: 'Shelf tray',
    position: [r6(sideClear - trayCorner[0]), r6(yOn(innerPlane(front), shelfTop) - trayCorner[1]), r6(shelfTop - t)],
    rotation: [0, 0, 0],
    visible: true,
  };
  // ------------------------------------------------ the base channels, under the faces' bottom edges
  const bottomY = (instance) => edgeOf(instance, lowerPiece, 0, bottomEdge).a[1];
  const channelLength = bottomY(rear) - bottomY(front) + 2 * kiosk.base.overhang;
  const channel = flangedPanel(
    {
      face: rect(channelLength, kiosk.base.width),
      thickness: t,
      stock,
      flanges: [0, 2].map((edge) => ({ edge, depth: kiosk.base.height, angle: 90, direction: 'down' })),
    },
    { idPrefix: 'shop-kiosk-channel' },
  );
  refuse('base channel', channel);
  const channelCorner = channel.map.toFlat([0, 0]);
  // Lying along Y, its y = 0 edge at X = x; the top face (z = t) at the base height, the flange tips on the floor.
  const channelInstance = (id, name, x) => ({
    id,
    partId: 'shop-kiosk-channel',
    name,
    ...turned([0, 1, 0], [-1, 0, 0], [0, 0, 1]),
    position: [r6(x + channelCorner[1]), r6(-(channelCorner[0] + channelLength / 2)), r6(kiosk.base.height - t)],
    visible: true,
  });
  const left = channelInstance('shop-kiosk-channel-left', 'Left base channel', kiosk.base.inset + kiosk.base.width);
  const right = channelInstance('shop-kiosk-channel-right', 'Right base channel', W - kiosk.base.inset);
  // ------------------------------------------------ the lower covers (flanged trays behind the lower windows)
  const coverH = kiosk.lowerWindow.height + 2 * cover.margin,
    coverW = kiosk.lowerWindow.width + 2 * cover.margin;
  const coverPanel = flangedPanel(
    {
      face: rect(coverH, coverW),
      thickness: cover.thickness,
      stock,
      flanges: [0, 1, 2, 3].map((edge) => ({ edge, depth: cover.flange, angle: 90, direction: 'up' })),
      holes: layout.coverOffsets.map(([du, dv]) => ({ x: coverH / 2 + du, y: coverW / 2 + dv, diameter: kiosk.hole })),
    },
    { idPrefix: 'shop-kiosk-cover' },
  );
  refuse('lower cover', coverPanel);
  // ------------------------------------------------ the model
  const sketch = (id, name, profile) => ({ id, name, plane: 'XY', profile, primitives: [], constrained: false });
  let model = emptyModel();
  model.sketches = [
    sketch(face.feature.sketchId, 'Kiosk face frame blank', face.profile),
    sketch(tray.feature.sketchId, 'Kiosk shelf tray blank', tray.profile),
    sketch(channel.feature.sketchId, 'Kiosk base channel blank', channel.profile),
    sketch(coverPanel.feature.sketchId, 'Kiosk lower cover blank', coverPanel.profile),
    sketch(cornerLayout.feature.sketchId, 'Kiosk corner piece blank', cornerLayout.profile),
  ];
  // The display: Add bought-in item (W × D × H, its colour), with its four M4
  // inserts as Ø4.5 blind holes in its front (threads are not modelled).
  const bought = boughtInItem({
    name: 'Display',
    width: display.width,
    depth: display.depth,
    height: display.height,
    colour: '#1b1e22',
    reference: 'Open-frame touch display, portrait (sized by eye)',
  });
  const displayPart = {
    ...bought.part,
    id: 'shop-kiosk-display',
    features: [
      { ...bought.part.features[0], id: 'shop-kiosk-display-box' },
      ...layout.displayOffsets.map(([dx, dz], k) => ({
        id: `shop-kiosk-display-insert-${k + 1}`,
        type: 'hole',
        diameter: kiosk.hole,
        depth: 15,
        position: [display.width / 2 + dx, 0, display.height / 2 + dz],
        direction: [0, 1, 0],
      })),
    ],
  };
  const sheetPart = (id, name, panel) => ({ id, name, material, features: [panel.feature] });
  model.parts = [
    sheetPart(facePart, 'Kiosk face frame — sheet metal', face),
    sheetPart('shop-kiosk-tray', 'Kiosk shelf tray — sheet metal', tray),
    sheetPart('shop-kiosk-channel', 'Kiosk base channel — sheet metal', channel),
    sheetPart('shop-kiosk-cover', 'Kiosk lower cover — sheet metal', coverPanel),
    sheetPart(cornerPart, 'Kiosk corner piece — sheet metal', cornerLayout),
    displayPart,
  ];
  // Bought-in items and covers start where Add bought-in item and Cut drop them; Line up holes puts them in place.
  const loose = (id, partId, name) => ({ id, partId, name, position: [0, 0, 0], rotation: [0, 0, 0], visible: true });
  model.instances = [
    front,
    rear,
    trayInstance,
    left,
    right,
    loose('shop-kiosk-display-front', displayPart.id, 'Front display'),
    loose('shop-kiosk-display-rear', displayPart.id, 'Rear display'),
    loose('shop-kiosk-cover-front', 'shop-kiosk-cover', 'Front cover'),
    loose('shop-kiosk-cover-rear', 'shop-kiosk-cover', 'Rear cover'),
    ...corners.map((c) => c.instance),
  ];
  const instanceOf = (id) => model.instances.find((i) => i.id === id);
  // A group of `ids` (top-level nodes) under a fixed id and name.
  const group = (ids, id, name) => {
    const grouped = groupNodes(model, ids);
    model = {
      ...grouped.model,
      groups: grouped.model.groups.map((g) => {
        const parentId = g.parentId === grouped.groupId ? id : g.parentId;
        return g.id === grouped.groupId ? { ...g, id, name, parentId } : { ...g, parentId };
      }),
      instances: grouped.model.instances.map((i) => (i.groupId === grouped.groupId ? { ...i, groupId: id } : i)),
    };
  };
  // ------------------------------------------------ the frame: one group, moved and painted as one
  const frame = 'shop-kiosk-frame';
  group(
    [front.id, rear.id, trayInstance.id, left.id, right.id, ...corners.map((c) => c.instance.id)],
    frame,
    'Kiosk frame',
  );
  // ------------------------------------------------ Paint: the frame black, the covers white
  const ral = (code) => RAL_CLASSIC.find((r) => r.code === code);
  const powder = (code, gloss) => ({
    kind: 'powder',
    name: ral(code).name,
    colour: ral(code).colour,
    gloss,
    thickness: 80,
  });
  model = applyFinish(
    model,
    model.instances.filter((i) => i.groupId === frame).map((i) => i.id),
    powder(9005, 'texture'),
  );
  model = applyFinish(model, ['shop-kiosk-cover-front', 'shop-kiosk-cover-rear'], powder(9003, 'satin'));
  model.finishes = model.finishes.map((f, i) => ({ ...f, id: `shop-kiosk-finish-${i + 1}` }));
  // ------------------------------------------------ Print: a text on each cover's outside (seen through the window)
  const coverRoot = pieceOf(coverPanel.fold, coverPanel.fold.rootPiece);
  const coverCentre = coverPanel.map.toFlat([coverH / 2, coverW / 2]);
  const prints = (instance, i) => {
    const m = instanceMatrix(instance);
    const outward = v3([0, 0, -1]).transformDirection(m).toArray();
    // The station's face pick: upright as seen from the outside, in the part's frame.
    const x = v3(uprightAxes(outward).x).transformDirection(m.clone().invert()).toArray();
    return {
      ...createPrint({
        instanceId: instance.id,
        point: transformPoint(coverRoot.matrix, [...coverCentre, 0]),
        normal: [0, 0, -1],
        x: x.map((v) => (Math.abs(v) < 1e-12 ? 0 : v)),
        artwork: { ...PRINT_DEFAULTS, kind: 'text', text: kiosk.text, width: 180, height: 40, method: 'silk' },
      }),
      id: `shop-kiosk-print-${i + 1}`,
    };
  };
  // ------------------------------------------------ in place: Line up holes, then one fastener per hole
  const frameHoles = (instance, from, count) =>
    Array.from({ length: count }, (_, k) =>
      openings(instance, faceFold, face.profile, layout.holesFrom + from + k, face.feature.id),
    );
  const displayHoles = (instance) => frameHoles(instance, 0, layout.displayOffsets.length);
  const coverFixings = (instance) => frameHoles(instance, layout.displayOffsets.length, layout.coverOffsets.length);
  const coverHoles = (instance) =>
    layout.coverOffsets.map((_, k) =>
      openings(instance, coverPanel.fold, coverPanel.profile, k, coverPanel.feature.id),
    );
  // The display's insert k: its opening on the display's front face, world.
  const insert = (instance, k) => {
    const m = instanceMatrix(instance);
    const [dx, dz] = layout.displayOffsets[k];
    return {
      point: v3([display.width / 2 + dx, 0, display.height / 2 + dz])
        .applyMatrix4(m)
        .toArray(),
      normal: v3([0, -1, 0]).transformDirection(m).toArray(),
    };
  };
  // Line up holes, two pairs: the first makes the axes one and the faces meet, the second takes out the spin.
  const lineUp = (id, pairs) => {
    model = lineUpNodes(model, {
      movers: [id],
      pairs: pairs.map(([moving, target]) => ({
        moving: { point: moving.point, normal: moving.normal },
        target: { point: target.point, normal: target.normal },
      })),
    }).model;
  };
  const screw = { ...hardwareDefaults(KIOSK_FIXINGS.screw, KIOSK_FIXINGS.size), id: 'shop-kiosk-screw-m4' };
  const nut = { ...hardwareDefaults(KIOSK_FIXINGS.nut, KIOSK_FIXINGS.size), id: 'shop-kiosk-nut-m4' };
  const hardwarePart = (feature, id) => ({ ...createHardware(feature).part, id, features: [feature] });
  const kinds = {
    screw: { feature: screw, part: hardwarePart(screw, 'shop-kiosk-screw'), next: counter('shop-kiosk-screw') },
    nut: { feature: nut, part: hardwarePart(nut, 'shop-kiosk-nut'), next: counter('shop-kiosk-nut') },
  };
  const connectionId = counter('shop-kiosk-fixing');
  // One fastener seated in one opening (its head on that side), its hardware part added once.
  const seat = (kind, hole) => {
    const { feature, part, next } = kinds[kind];
    const seated = seatHardware({ feature, holes: [hole], part, firstInstance: { id: next(), visible: true } });
    model = {
      ...model,
      parts: model.parts.some((p) => p.id === seated.part.id) ? model.parts : [...model.parts, seated.part],
      instances: [...model.instances, ...seated.instances],
      connections: [...model.connections, ...seated.connections.map((c) => ({ ...c, id: connectionId() }))],
    };
    return seated.instances[0].id;
  };
  const sides = [
    ['front', front.id],
    ['rear', rear.id],
  ];
  for (const [side, faceId] of sides) {
    const id = `shop-kiosk-display-${side}`;
    const holes = displayHoles(instanceOf(faceId));
    lineUp(id, [
      [insert(instanceOf(id), 0), holes[0].entry],
      [insert(instanceOf(id), 2), holes[2].entry],
    ]);
    holes.forEach((h) => seat('screw', h.far));
  }
  for (const [side, faceId] of sides) {
    const id = `shop-kiosk-cover-${side}`;
    const holes = coverFixings(instanceOf(faceId));
    // The cover's underside goes against the face frame's inside.
    lineUp(id, [
      [coverHoles(instanceOf(id))[0].far, holes[0].entry],
      [coverHoles(instanceOf(id))[2].far, holes[2].entry],
    ]);
    holes.forEach((h) => seat('screw', h.far));
    coverHoles(instanceOf(id)).forEach((h) => seat('nut', h.entry));
  }
  // Printed after paint, as the shop does (the covers' prints are on their outsides).
  model.prints = [instanceOf('shop-kiosk-cover-front'), instanceOf('shop-kiosk-cover-rear')].map(prints);
  // ------------------------------------------------ the product: the frame and everything put on it
  group([frame, ...model.instances.filter((i) => !i.groupId).map((i) => i.id)], 'shop-kiosk-group', kiosk.name);
  model.sheets = [
    ...model.sheets,
    {
      id: 'shop-kiosk-flat-sheet',
      title: 'Kiosk face frame — flat pattern',
      partId: facePart,
      layout: 'engineering',
      size: 'A3',
      units: 'mm',
      scaleMode: 'fit',
      scale: 1,
      revision: 'A',
      tolerance: '±0.2 mm',
      material: `${material} t ${t}`,
      views: ['flat'],
      annotations: [],
      notes: 'Laser cut, etch the bend lines, then bend in the order of the bend table (sides, top, crease).',
    },
  ];
  return model;
}
