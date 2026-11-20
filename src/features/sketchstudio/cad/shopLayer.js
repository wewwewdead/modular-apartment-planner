// The fabrication shop's viewport layer (docs/sketch-studio-fab-shop.md §7).
// SM-1 hosts the sheet-metal preview: a selected sheet-metal part unfolds to
// its flat blank and folds back (UNFOLD_MS), with "UP 90° R1.6" bend labels
// while it lies flat. SM-2 adds the press brake station (setStation): the
// machine drawn from the catalogue sections, the part posed in the die and
// the stroke. SM-3 adds the print decals (shopDecor.js), drawn in every
// normal view and hidden with their parts, in the unfold view's stand-in and
// while the press brake shows. The laser (SM-4) is an overlay of its own
// (LaserStation.jsx). The replay (docs/sketch-studio-shop-floor.md §8) hides
// the parts not made yet at its point of the film (setHidden: a mask, never
// instance.visible, which would rebuild the kernel). Hands on the sheet
// (docs/sketch-studio-brake-hands-on.md HO-1) adds the grip on the station's
// sheet (brakeGrip.js: Flip sheet and Turn sheet around, picked in screen
// space, never by a ray) and turns the sheet whenever the edge facing the
// backgauge changes as well as the side up (§5.3). HO-2 (§6) lets the
// pointer reach the rest of the set-up after the grip: the backgauge fingers
// (dragged, they set L), the blades and the machine (the one pick that casts
// a ray at the station's meshes) and the sheet's edges (screen space, lit by
// brakeLights.js), in brakeHands.js HAND_ORDER.
//
// Contracts with CadViewport: everything is parented outside `ctx.group` (no
// raycast of the parts ever sees it); while the preview stands in for a part,
// that part's kernel group is hidden (`hides(id)`; the look effect asks); the
// layer runs its own requestAnimationFrame loop only while something
// animates, calls ctx.render() each frame and stops when idle and on dispose.
import * as THREE from 'three';
import { createSheetMetalPreview } from './sheetMetalPreview.js';
import { createShopDecor } from './shopDecor.js';
import { bendArcPoint, pointInRing, poseFold, transformPoint } from './sheetMetal.js';
import { displayedInstanceMatrix, mmPerPixelAt } from './marks.js';
import { createBrakeGrip, GRIP_PICK_PX } from './brakeGrip.js';
import { createBrakeLights } from './brakeLights.js';
import {
  backDirection,
  defaultGripAxis,
  edgeSegments,
  freeRect,
  gripAnchor,
  inRects,
  nearestAxis,
  nearestEdge,
  pickInOrder,
  placementGap,
  polylineDistance,
  reachRect,
  rebaseMatrix,
  relativeTurn,
  slideAnchor,
  turnChanged,
} from './brakeHands.js';
import { EDGE_ALPHA, EDGE_COLOR } from './viewMode.js';
import {
  STROKE_GAP,
  TURN_MS,
  brakeFrame,
  flatFrame,
  hitGauges,
  machineFrom,
  sheetSection,
  sideViewWindow,
  strokeAt,
  trimAtBreaks,
} from './pressBrake.js';
import { HORN_DRAWN_SLICE, partSection, partSurface, toolingSections } from './brakeCollisions.js';
import { FINGER_FACE, SHEET_STOCK, dieOf, hornOf, machineOf, punchOf, suggestedDie } from './shopCatalog.js';

export const UNFOLD_MS = 600;
// The press brake scene (SM-2, SM-2b): one tone per machine part, so each
// reads from the operator's side and from above — painted blue-grey side
// frames and beams (the upper beam lightest, the frames darkest), bright
// ground-steel tooling lighter than the beams (the punch brightest, the die a
// step darker so the sheet on it stands out), a dark backgauge beam with amber
// fingers, and red for a collision.
export const MACHINE_COLORS = Object.freeze({
  frame: '#6d8195',
  bed: '#8798ab',
  ram: '#9aabbd',
  gaugeBeam: '#58636e',
  gauge: '#e0a32a',
  punch: '#e6ebf0',
  die: '#c2ccd5',
  hit: '#e03131',
});
// The pending punch line, marked on the sheet where the punch tip will touch.
const PUNCH_LINE_COLOR = '#d9480f';
// The station's camera: the operator's view, standing in front of the machine
// (−Y), looking toward the backgauge and down 25°, 35° round toward the bed's
// right end so the end faces of the punch and the die (the punch's profile,
// the die's V) show beside the part, clear of the cards on the left.
const VIEW_DOWN = (25 * Math.PI) / 180,
  VIEW_SIDE = (35 * Math.PI) / 180;
export const STATION_VIEW = Object.freeze([
  Math.sin(VIEW_SIDE) * Math.cos(VIEW_DOWN),
  -Math.cos(VIEW_SIDE) * Math.cos(VIEW_DOWN),
  Math.sin(VIEW_DOWN),
]);
// The station's own light, on only while it shows: the viewport's sky light
// leaves faces toward the operator (−Y) in its dark ground colour, so a key
// light from over the operator's shoulder and a weaker one from the other side.
const STATION_LIGHTS = Object.freeze([
  { position: [-600, -1500, 1100], intensity: 1.7 },
  { position: [900, -700, 300], intensity: 0.6 },
]);
// The die is drawn over the part and the punch with this much to spare at each
// end (its collision prism runs the whole bed: only the part can touch it, and
// the part lies within what is drawn), so its end face and V show by the part.
const DIE_MARGIN = 40;
// The die top stands this high above the floor (the viewport's ground at Z 0),
// so the ground never cuts through the die and the bed.
export const WORK_HEIGHT = 1000;
// The flange gap marker (corner gaps §3.3): cad.css --shop-accent, the collision red for an overlap; its end crosses' half length (mm).
const GAP_COLOURS = Object.freeze({ gap: '#287fb3', overlap: MACHINE_COLORS.hit });
const GAP_TICK = 2.5;
const GAP_DOT_PX = 9;
// The stop face's heights are the catalogue's (skin gauge §4.2): the reading's rule and the drawn finger agree.
const FINGER = Object.freeze({ depth: 30, width: 24, below: FINGER_FACE.below, above: FINGER_FACE.above });
// A prism along X from a Y–Z ring (y, z), between x0 and x1.
function prismGeometry(ring, x0, x1) {
  const shape = new THREE.Shape(ring.map(([y, z]) => new THREE.Vector2(y, z)));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: x1 - x0, bevelEnabled: false, curveSegments: 1 });
  geometry.applyMatrix4(
    new THREE.Matrix4()
      .makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0))
      .setPosition(x0, 0, 0),
  );
  return geometry;
}
const boxGeometry = ([x0, y0, z0], [x1, y1, z1]) =>
  new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
const BEND_COLORS = Object.freeze({ up: '#d9480f', down: '#1c7ed6' });
const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
const UNIT_SCALE = new THREE.Vector3(1, 1, 1);

/**
 * @param {{ ctx: object, labels: HTMLElement | null }} options  ctx: the viewport context
 *   (scene, group, materials, camera, renderer, render); labels: the container for bend labels.
 *   onStrokeEnd(token, run): a press brake stroke has run (run.commit: a hit made, not a re-run).
 *   onStationPose(pose): every press brake pose for the side view — { window, sheet
 *   (pressBrake.js sheetSection), context (brakeCollisions.js partSection), tools
 *   (toolingSections at the pose's tip), finger, gaugeDistance, angle, target, tipZ, punch,
 *   die (names), phase, collision } — and null when the station closes.
 */
export function createShopLayer({ ctx, labels, onStrokeEnd = () => {}, onStationPose = () => {} }) {
  const root = new THREE.Group();
  root.name = 'shop-layer';
  root.matrixAutoUpdate = false;
  ctx.scene.add(root);
  // { instanceId, fold, handle, marks: THREE.Group, label nodes }
  let preview = null;
  // 0 = folded … 1 = flat; target is where the animation heads.
  let flatness = 0,
    target = 0;
  let animation = null,
    frame = 0;
  const markMaterials = {
    up: new THREE.LineBasicMaterial({ color: BEND_COLORS.up }),
    down: new THREE.LineBasicMaterial({ color: BEND_COLORS.down }),
  };
  const kernelGroup = (id) => ctx.group.children.find((g) => g.userData.instanceId === id);
  // Print decals (SM-3): re-drawn from the last model handed over whenever a
  // part's visibility changes here (the unfold view, the station, the replay's mask).
  const decor = createShopDecor({ ctx, onChange: () => ctx.render() });
  let records = null;
  const refreshRecords = () => {
    if (records) decor.sync(records, { hidden: Boolean(station) });
  };
  const materialsFor = (id) => {
    const look = kernelGroup(id)?.userData.look;
    return {
      body: ctx.materials.body(look?.color || '#8795a4', 1, { depthWrite: true, roughness: look?.roughness }),
      edge: ctx.materials.edge(EDGE_COLOR, EDGE_ALPHA.solid),
    };
  };
  const showKernel = (id) => {
    const group = kernelGroup(id);
    if (group) group.visible = ctx.groupShown ? ctx.groupShown(group) : true;
  };
  const place = () => {
    const group = preview && kernelGroup(preview.instanceId);
    if (!group) return;
    group.updateMatrix();
    root.matrix.copy(displayedInstanceMatrix(group.matrix, group.userData.placement));
    root.matrixWorldNeedsUpdate = true;
  };
  // Bend lines on both faces of the flat blank and one label per bend.
  const buildMarks = (fold) => {
    const marks = new THREE.Group();
    marks.name = 'sheet-bend-lines';
    const nodes = [];
    for (const bend of fold.bends) {
      const points = [];
      for (const [s0, s1] of bend.intervals)
        for (const z of [fold.thickness + 0.05, -0.05])
          points.push(
            new THREE.Vector3(bend.a[0] + bend.u[0] * s0, bend.a[1] + bend.u[1] * s0, z),
            new THREE.Vector3(bend.a[0] + bend.u[0] * s1, bend.a[1] + bend.u[1] * s1, z),
          );
      const line = new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(points),
        markMaterials[bend.direction],
      );
      line.raycast = () => {};
      marks.add(line);
      const [s0, s1] = bend.intervals.reduce((best, i) => (i[1] - i[0] > best[1] - best[0] ? i : best));
      const s = (s0 + s1) / 2;
      const at = [bend.a[0] + bend.u[0] * s, bend.a[1] + bend.u[1] * s, fold.thickness];
      if (labels) {
        const node = document.createElement('span');
        node.className = `cad-shop-label is-${bend.direction}`;
        node.textContent = bend.label;
        node.hidden = true;
        labels.append(node);
        nodes.push({ node, at });
      }
    }
    marks.visible = false;
    root.add(marks);
    return { marks, nodes };
  };
  const dropMarks = () => {
    if (!preview?.marks) return;
    preview.marks.traverse((obj) => obj.geometry?.dispose());
    root.remove(preview.marks);
    for (const { node } of preview.nodes) node.remove();
  };
  const poseAt = (value) => {
    const angles = Object.fromEntries(preview.fold.bends.map((b) => [b.id, b.angle * (1 - value)]));
    preview.handle.pose(poseFold(preview.fold, angles));
    preview.marks.visible = value === 1;
  };
  const remove = () => {
    if (!preview) return;
    dropMarks();
    root.remove(preview.handle.group);
    preview.handle.dispose();
    const id = preview.instanceId;
    preview = null;
    flatness = target = 0;
    showKernel(id);
    refreshRecords();
  };
  const stop = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    animation = null;
  };
  const tick = (now) => {
    frame = 0;
    if (!animation || !preview) return;
    const span = Math.max(1e-6, Math.abs(animation.to - animation.from));
    const progress = Math.min(1, (now - animation.start) / (UNFOLD_MS * span));
    flatness = animation.from + (animation.to - animation.from) * ease(progress);
    if (progress >= 1) {
      flatness = animation.to;
      animation = null;
    }
    if (!animation && flatness === 0) remove();
    else poseAt(flatness);
    ctx.render();
    if (animation) frame = requestAnimationFrame(tick);
  };
  const animate = () => {
    stop();
    if (flatness === target) return;
    animation = { from: flatness, to: target, start: performance.now() };
    frame = requestAnimationFrame(tick);
  };
  const hideKernel = () => {
    const group = preview && kernelGroup(preview.instanceId);
    if (group) group.visible = false;
  };

  // ------------------------------------------------ the press brake station (SM-2)
  // The machine in its own frame (pressBrake.js: X along the bed, the
  // backgauge at +Y, the die top at Z 0), placed at the world origin, every
  // part's kernel group hidden while it shows. { key, machineKey, machine,
  // tooling (the key the punch and die were built for), parts: machine
  // meshes, ram (the punch and ram, moved by the tip height), gauge, part:
  // { fold, handle, group }, view, pose, stroke, hit }.
  let station = null,
    stationLoop = 0,
    prepared = false;
  const stationRoot = new THREE.Group();
  stationRoot.name = 'press-brake';
  stationRoot.visible = false;
  stationRoot.position.set(0, 0, WORK_HEIGHT);
  ctx.scene.add(stationRoot);
  for (const [index, { position, intensity }] of STATION_LIGHTS.entries()) {
    const light = new THREE.DirectionalLight(0xffffff, intensity);
    light.name = `press-brake-light-${index + 1}`;
    light.position.set(...position);
    light.target.name = `press-brake-light-${index + 1}-target`;
    stationRoot.add(light, light.target);
  }
  // The pending punch line on the sheet (two points per interval, rewritten each pose).
  const punchLine = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: PUNCH_LINE_COLOR }),
  );
  punchLine.name = 'press-brake-punch-line';
  punchLine.raycast = () => {};
  punchLine.renderOrder = 4;
  punchLine.visible = false;
  stationRoot.add(punchLine);
  const machineMaterial = (key) => ctx.materials.body(MACHINE_COLORS[key], 1, { depthWrite: true, roughness: 0.6 });
  const solid = (geometry, colour, name) => {
    const mesh = new THREE.Mesh(geometry, machineMaterial(colour));
    mesh.name = name;
    mesh.userData.colour = colour;
    mesh.raycast = () => {};
    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry, 30),
      ctx.materials.edge(EDGE_COLOR, EDGE_ALPHA.solid),
    );
    outline.raycast = () => {};
    mesh.add(outline);
    return mesh;
  };
  const dropGroup = (group) => {
    if (!group) return;
    group.traverse((o) => o.geometry?.dispose());
    group.removeFromParent();
  };
  const hideAll = () => {
    for (const group of ctx.group.children) group.visible = false;
  };
  const stopStroke = () => {
    if (stationLoop) cancelAnimationFrame(stationLoop);
    stationLoop = 0;
  };
  // The fixed machine: side frames (C-frames, the throat open to the front),
  // the bed, the backgauge.
  const buildMachine = (machine) => {
    dropGroup(station.parts);
    const parts = new THREE.Group();
    parts.name = 'press-brake-machine';
    const half = machine.bed / 2,
      beam = machine.beam / 2;
    const frame = [
      [-160, -WORK_HEIGHT],
      [machine.throat + 120, -WORK_HEIGHT],
      [machine.throat + 120, 840],
      [-160, 840],
      [-160, 470],
      [machine.throat, 470],
      [machine.throat, -170],
      [-160, -170],
    ];
    for (const x of [-half - 70, half + 30])
      parts.add(solid(prismGeometry(frame, x, x + 40), 'frame', 'press-brake-frame'));
    parts.add(solid(boxGeometry([-half, -beam, -480], [half, beam, -80]), 'bed', 'press-brake-bed'));
    stationRoot.add(parts);
    // The backgauge beam and two fingers, built with their stop face at Y 0.
    dropGroup(station.gauge);
    const gauge = new THREE.Group();
    gauge.name = 'press-brake-backgauge';
    gauge.add(
      solid(
        boxGeometry([-half * 0.8, FINGER.depth + 30, -60], [half * 0.8, FINGER.depth + 70, -20]),
        'gaugeBeam',
        'press-brake-gauge-beam',
      ),
    );
    for (const name of ['left', 'right']) {
      const finger = solid(
        boxGeometry([-FINGER.width / 2, 0, -FINGER.below], [FINGER.width / 2, FINGER.depth + 30, FINGER.above]),
        'gauge',
        `press-brake-finger-${name}`,
      );
      gauge.add(finger);
    }
    gauge.visible = false;
    stationRoot.add(gauge);
    Object.assign(station, { parts, gauge, machineKey: machine.key, machine, tooling: null });
  };
  // The tooling for this hit, set up as brakeCollisions checks it (shop floor
  // §6.2): the punch, its holders and the die in sections over the stroke's
  // runs (`ranges`), the full-length ram above the holders. With no bend in
  // the die (the flat blank) the die is drawn over `dieX` (the part with
  // DIE_MARGIN to spare). `dieX` also frames the camera. `reverse`: the punch
  // turned round in its clamps (brake blades §4.2), drawn mirrored. The die
  // stands over its own runs (`dieRanges`, brake tool length §3.2: trimmed
  // apart from the punch). `horns` (docs/sketch-studio-punch-library.md
  // §4.4): horn sections at the punch's ends, each horn part's ring drawn
  // over its ranges as the body is, the body and holders standing back.
  const buildTooling = (punch, dieEntry, ranges, dieRanges, dieX, sectional, reverse = false, horns = false) => {
    const runs = sectional ? ranges : [dieX];
    const dieRuns = sectional ? dieRanges || ranges : [dieX];
    const horn = sectional ? hornOf(horns) : null;
    const text = (list) => list.map((r) => r.map((v) => v.toFixed(1)).join(',')).join(';');
    const key = `${punch.key}${reverse ? ':reversed' : ''}${horn ? (horn.reach === 20 ? ':horns' : `:horns-${horn.reach}`) : ''}|${dieEntry.key}|${text(runs)}|${dieX.join(',')}|${text(dieRuns)}`;
    if (station.tooling === key) return;
    dropGroup(station.die);
    dropGroup(station.ram);
    const tools = toolingSections({
      machine: station.machine,
      punch,
      die: dieEntry,
      tipZ: 0,
      ranges: runs,
      dieRanges: dieRuns,
      reverse,
      horns: horn ? horns : false,
      // Drawn to its profile in 1 mm slices (punch library §4.8); the check keeps its coarser ones.
      hornSlice: HORN_DRAWN_SLICE,
    });
    const die = new THREE.Group();
    die.name = 'press-brake-die';
    for (const range of tools.die.ranges)
      die.add(solid(prismGeometry(tools.die.ring, ...range), 'die', 'press-brake-die-section'));
    const ram = new THREE.Group();
    ram.name = 'press-brake-ram';
    const punchGroup = new THREE.Group();
    punchGroup.name = 'press-brake-punch';
    for (const range of tools.punch.ranges)
      punchGroup.add(solid(prismGeometry(tools.punch.ring, ...range), 'punch', 'press-brake-punch-section'));
    for (const part of tools.punch.parts || [])
      for (const range of part.ranges)
        punchGroup.add(solid(prismGeometry(part.ring, ...range), 'punch', 'press-brake-punch-horn'));
    ram.add(punchGroup);
    if (tools.holder) {
      const holders = new THREE.Group();
      holders.name = 'press-brake-holders';
      for (const range of tools.holder.ranges)
        holders.add(solid(prismGeometry(tools.holder.ring, ...range), 'ram', 'press-brake-holder'));
      ram.add(holders);
    }
    ram.add(solid(prismGeometry(tools.ram.ring, ...tools.ram.x), 'ram', 'press-brake-upper-beam'));
    stationRoot.add(die, ram);
    Object.assign(station, { die, ram, tooling: key, dieX });
  };
  // The part's extent along the bed as posed (every piece corner, both faces).
  const partReach = (posed, frame) => {
    let x0 = Infinity,
      x1 = -Infinity;
    for (const piece of posed.pieces)
      for (const [x, y] of piece.outer)
        for (const z of [0, posed.thickness]) {
          const [px] = transformPoint(frame.matrix, transformPoint(piece.matrix, [x, y, z]));
          if (px < x0) x0 = px;
          if (px > x1) x1 = px;
        }
    return [x0, x1];
  };
  // Where the die is drawn: over the part and the punch with DIE_MARGIN to
  // spare, on the bed, in 10 mm steps; kept while it still covers them and is
  // not much longer (so a stroke never rebuilds it).
  const dieExtent = (reach, span) => {
    const bed = station.machine.bed / 2;
    const need = [Math.min(reach[0], span[0]) - DIE_MARGIN, Math.max(reach[1], span[1]) + DIE_MARGIN];
    const held = station.dieX;
    if (held && held[0] <= need[0] && held[1] >= need[1] && need[0] - held[0] < 30 && held[1] - need[1] < 30)
      return held;
    return [Math.max(-bed, Math.floor(need[0] / 10) * 10), Math.min(bed, Math.ceil(need[1] / 10) * 10)];
  };
  // The pending punch line on the inside of the bend, a hair toward the punch.
  const markPunchLine = (posed, bendIds, frame) => {
    const bends = bendIds.map((id) => posed.bends.find((b) => b.id === id)).filter(Boolean);
    punchLine.visible = bends.length > 0;
    if (!bends.length) return;
    const t = posed.thickness;
    const points = bends.flatMap((bend) => {
      const inner = bend.direction === 'up' ? t : 0;
      // A round bend: the line of the hit in the die.
      const index =
        bend.steps && frame.hit ? (bend.transform.from === 'moving' ? bend.steps + 1 - frame.hit : frame.hit) : 0;
      const fraction = index ? (index - 0.5) / bend.steps : 0.5;
      return bend.intervals.flatMap(([s0, s1]) =>
        [s0, s1].map((s) => {
          const p = transformPoint(
            frame.matrix,
            transformPoint(bend.fixedMatrix, bendArcPoint(bend, t, bend.transform, s, fraction, inner)),
          );
          return new THREE.Vector3(p[0], p[1], p[2] + 0.15);
        }),
      );
    });
    punchLine.geometry.dispose();
    punchLine.geometry = new THREE.BufferGeometry().setFromPoints(points);
  };
  // Red: the part's triangles that hit, and the tool they hit.
  const showHit = (collision) => {
    dropGroup(station.hit);
    station.hit = null;
    const meshesOf = (object) => {
      const found = [];
      object?.traverse((o) => o.isMesh && o.userData.colour && found.push(o));
      return found;
    };
    const paint = (object, colour) =>
      meshesOf(object).forEach((m) => (m.material = machineMaterial(colour || m.userData.colour)));
    for (const object of [station.die, station.ram, station.parts?.getObjectByName('press-brake-bed')]) paint(object);
    if (!collision) return;
    const positions = new Float32Array(collision.triangles.flatMap((tri) => tri.flat()));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const hit = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color: MACHINE_COLORS.hit,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.75,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
    hit.name = 'press-brake-collision';
    hit.raycast = () => {};
    hit.renderOrder = 5;
    stationRoot.add(hit);
    station.hit = hit;
    const tool =
      collision.tool === 'punch'
        ? station.ram.getObjectByName('press-brake-punch')
        : collision.tool === 'holder'
          ? station.ram.getObjectByName('press-brake-holders')
          : collision.tool === 'ram'
            ? station.ram.getObjectByName('press-brake-upper-beam')
            : collision.tool === 'die'
              ? station.die
              : collision.tool === 'bed'
                ? station.parts.getObjectByName('press-brake-bed')
                : null;
    if (tool) paint(tool, 'hit');
  };
  // A flange gap hovered in the press brake's card (docs/sketch-studio-corner-
  // gaps.md §3.3): a line between the row's two points with a cross and a dot
  // at each end, drawn through everything (depthTest off), never picked. Its points are
  // kept in flat millimetres and placed on whichever piece of the pose shown
  // holds them, in the part's own group: the marker follows the part through
  // every pose and turn. A stroke clears it (the workspace hands it again on
  // a new hover); so does closing the station.
  let gapWanted = null,
    gapPoints = null;
  const gapLine = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: GAP_COLOURS.gap, depthTest: false, transparent: true }),
  );
  gapLine.name = 'press-brake-gap';
  gapLine.raycast = () => {};
  gapLine.renderOrder = 6;
  gapLine.visible = false;
  // Its two ends as dots a constant size on screen: a gap of a millimetre is a few pixels at the brake's view.
  const gapEnds = new THREE.Points(
    new THREE.BufferGeometry(),
    new THREE.PointsMaterial({
      color: GAP_COLOURS.gap,
      size: GAP_DOT_PX,
      sizeAttenuation: false,
      depthTest: false,
      transparent: true,
    }),
  );
  gapEnds.name = 'press-brake-gap-ends';
  gapEnds.raycast = () => {};
  gapEnds.renderOrder = 6;
  gapLine.add(gapEnds);
  // The posed piece holding a flat point: the one whose outline holds it, else the nearest (a point on a cut edge).
  const pieceAt = (posed, [x, y]) => {
    let best = null,
      nearest = Infinity;
    for (const piece of posed.pieces) {
      if (pointInRing([x, y], piece.outer) && !(piece.holes || []).some((h) => pointInRing([x, y], h))) return piece;
      for (const ring of [piece.outer, ...(piece.holes || [])])
        ring.forEach((a, i) => {
          const b = ring[(i + 1) % ring.length];
          const d = [b[0] - a[0], b[1] - a[1]];
          const f = Math.max(
            0,
            Math.min(1, ((x - a[0]) * d[0] + (y - a[1]) * d[1]) / (d[0] * d[0] + d[1] * d[1] || 1)),
          );
          const off = Math.hypot(x - a[0] - d[0] * f, y - a[1] - d[1] * f);
          if (off < nearest) [best, nearest] = [piece, off];
        });
    }
    return nearest < 0.01 ? best : null;
  };
  const hideGap = () => {
    gapLine.visible = false;
    gapPoints = null;
  };
  const placeGap = () => {
    if (!station?.part || !station.pose) return hideGap();
    // Re-posed mid-stroke: the marker is cleared, not carried through the stroke.
    if (station.stroke && !station.stroke.done) gapWanted = null;
    if (!gapWanted) return hideGap();
    const posed = station.pose.posed;
    const [P, Q] = gapWanted.flat.map((p) => {
      const piece = pieceAt(posed, p);
      return piece ? transformPoint(piece.matrix, p) : null;
    });
    if (!P || !Q) return hideGap();
    const d = [Q[0] - P[0], Q[1] - P[1], Q[2] - P[2]];
    const length = Math.hypot(...d);
    const along = length > 1e-6 ? d.map((v) => v / length) : [0, 0, 1];
    // Two directions square to the line for each end's cross.
    const helper = Math.abs(along[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const unit = (v) => v.map((c) => c / Math.hypot(...v));
    const side = unit(cross(along, helper)),
      up = cross(along, side);
    const points = [P, Q];
    for (const end of [P, Q])
      for (const dir of [side, up])
        points.push(
          end.map((v, i) => v - dir[i] * GAP_TICK),
          end.map((v, i) => v + dir[i] * GAP_TICK),
        );
    gapLine.geometry.dispose();
    gapLine.geometry = new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(...p)));
    gapEnds.geometry.dispose();
    gapEnds.geometry = new THREE.BufferGeometry().setFromPoints([P, Q].map((p) => new THREE.Vector3(...p)));
    for (const object of [gapLine, gapEnds])
      object.material.color.set(gapWanted.overlap ? GAP_COLOURS.overlap : GAP_COLOURS.gap);
    if (gapLine.parent !== station.part.group) station.part.group.add(gapLine);
    gapLine.visible = true;
    gapPoints = { P, Q, length, overlap: Boolean(gapWanted.overlap) };
  };
  // Pose the part, the tooling and the ram: `angle` overrides the bend in the
  // die; `tip` is the punch tip height, 'follow' (on the part, bending) or
  // absent (parked above the sheet, or where a shown collision happens).
  // `bumpHit`: a round bend's hit in the die (round-bend spec §5.3; absent, the
  // one the pose is in, or the view's: a collision is shown in its own hit).
  // A view's pose without drawing it: the posed fold and its frame in the
  // machine (the pose the grip turns toward is worked out the same way).
  const framePose = (view, angle = null, bumpHit = undefined, stroking = false) => {
    const t = view.fold.thickness;
    // A stroke's bends (shop floor §6.1) move through the angle together.
    const members = view.bendIds?.length ? view.bendIds : view.bendId ? [view.bendId] : [];
    const angles =
      angle == null || !members.length
        ? view.angles || {}
        : { ...(view.angles || {}), ...Object.fromEntries(members.map((id) => [id, angle])) };
    // A round bend fills from the side away from the backgauge; `turned`
    // (brake flip tooling §5.2) puts the other side back.
    const side = { gaugePoint: view.gaugePoint || null, turned: Boolean(view.turned) };
    const from = members.length ? machineFrom(view.fold, members, side) : {};
    const posed = poseFold(view.fold, angles, from);
    const dieEntry = view.die ? dieOf(view.die) : suggestedDie(t, view.punch).die;
    const frame = view.bendId
      ? brakeFrame(posed, view.bendId, {
          die: dieEntry,
          ...side,
          members,
          hit: bumpHit ?? (angle == null && !stroking ? view.hit : null) ?? null,
          bed: station.machine.bed,
        })
      : flatFrame(posed, { flipped: Boolean(view.flipped) });
    return { t, members, posed, dieEntry, frame };
  };
  const poseStation = (angle = null, tip = undefined, bumpHit = undefined) => {
    const view = station.view;
    const { t, members, posed, dieEntry, frame } = framePose(view, angle, bumpHit, Boolean(station.stroke));
    // A round bend's hits gauge one pitch nearer each (the station's L is its centre line's).
    const round = frame.hit ? posed.bends.find((b) => b.id === view.bendId) : null;
    const gaugeDistance =
      view.gaugeDistance != null && round
        ? hitGauges(view.gaugeDistance, round.allowance, round).at(frame.hit)
        : view.gaugeDistance;
    station.part.handle.pose(posed);
    station.part.group.matrix.fromArray(frame.matrix);
    station.part.group.matrixWorldNeedsUpdate = true;
    const punch = punchOf(view.punch);
    const reverse = Boolean(view.reverse);
    buildTooling(
      punch,
      dieEntry,
      frame.ranges,
      frame.dieRanges,
      dieExtent(partReach(posed, frame), frame.span),
      Boolean(view.bendId),
      reverse,
      // Horn sections (punch library §4.4): the bend's record says, through the frame.
      frame.horns || false,
    );
    markPunchLine(posed, members, frame);
    const tipZ = tip === 'follow' || (tip === undefined && view.collision) ? frame.tipZ : (tip ?? t + STROKE_GAP);
    station.ram.position.set(0, 0, tipZ);
    station.ram.updateMatrixWorld(true);
    const width = frame.span[1] - frame.span[0];
    station.gauge.visible = gaugeDistance != null;
    if (station.gauge.visible) {
      station.gauge.position.set(0, gaugeDistance, 0);
      const spread = Math.max(FINGER.width, Math.min(width * 0.3, station.machine.bed * 0.35));
      station.gauge.getObjectByName('press-brake-finger-left').position.x = -spread;
      station.gauge.getObjectByName('press-brake-finger-right').position.x = spread;
      station.gauge.updateMatrixWorld(true);
    }
    const bend = view.bendId ? posed.bends.find((b) => b.id === view.bendId) : null;
    // Which side is up (§5.1): a bend down is made with the sheet turned over.
    const flipped = bend ? bend.direction === 'down' : Boolean(view.flipped);
    station.pose = {
      angle: bend ? bend.posedAngle : 0,
      tipZ,
      frame,
      gaugeDistance,
      flipped,
      bounds: partBounds(posed),
      dieHalf: dieEntry.width / 2,
      // Hands on the sheet: the edge facing the backgauge (§5.3), the pieces as posed (§5.2).
      back: backDirection(bend, frame.back, flipped),
      posed,
    };
    // The side view of the same pose (pressBrake.js sheetSection), in the machine's Y–Z mm.
    const window = sideViewWindow({ punch, die: dieEntry });
    // The rest of the part (what earlier bends made of it) cut where a
    // collision is shown, else through the middle of the bend.
    const hit = !station.stroke && view.collision?.triangles?.length ? view.collision.triangles.flat() : null;
    const cutX = hit ? hit.reduce((sum, p) => sum + p[0], 0) / hit.length : 0;
    station.part.surface ||= partSurface(view.fold);
    const sheet = sheetSection(posed, view.bendId, frame, window);
    station.section = {
      window,
      sheet,
      context: trimAtBreaks(
        partSection({ surface: station.part.surface, posed, frame, bendIds: members, x: cutX }),
        sheet.breaks,
      ),
      tools: toolingSections({
        machine: station.machine,
        punch,
        die: dieEntry,
        tipZ,
        span: frame.span,
        ranges: frame.ranges,
        dieRanges: frame.dieRanges,
        reverse,
        horns: frame.horns || false,
      }),
      finger:
        gaugeDistance != null
          ? {
              y0: gaugeDistance,
              y1: gaugeDistance + FINGER.depth + 30,
              z0: -FINGER.below,
              z1: FINGER.above,
            }
          : null,
      gaugeDistance: gaugeDistance ?? null,
      angle: station.pose.angle,
      target: bend ? bend.angle : 0,
      tipZ,
      punch: punch.name,
      // Reverse punch (brake blades §4.2): the side view says so; horn sections too (punch library §4.4).
      reverse,
      horns: frame.horns || false,
      die: dieEntry.name,
      // A round bend: the hit in the die (round-bend spec §6).
      bump: frame.hit ? { hit: frame.hit, hits: frame.hits } : null,
      // The sheet's side up (brake flip tooling §5.1).
      flipped,
    };
    placeGap();
    return frame;
  };
  // The posed part's bounding-box centre (posed part mm) and the radius of the sphere round it.
  const partBounds = (posed) => {
    const min = [Infinity, Infinity, Infinity],
      max = [-Infinity, -Infinity, -Infinity];
    for (const piece of posed.pieces)
      for (const [x, y] of piece.outer)
        for (const z of [0, posed.thickness]) {
          const p = transformPoint(piece.matrix, [x, y, z]);
          for (let i = 0; i < 3; i++) {
            min[i] = Math.min(min[i], p[i]);
            max[i] = Math.max(max[i], p[i]);
          }
        }
    return {
      centre: min.map((v, i) => (v + max[i]) / 2),
      radius: Math.hypot(...min.map((v, i) => max[i] - v)) / 2,
    };
  };
  // ------------------------------------------------ turning the sheet over (brake flip tooling §5.1)
  // View only: from one machine-frame pose of the posed part to another (the
  // side up changed), about the part's own centre, drawn out toward the
  // operator and lifted clear of the punch and the die on the way, and back.
  // `station.turn` while one runs on its own (a Flip sheet, a stroke starting
  // the other way up); an offset's stroke runs its turn on the stroke's clock.
  let turnLoop = 0,
    lastTurn = null;
  // Hands on the sheet (§5.2): a handle being dragged { kind, plan, fraction,
  // frames … }, and one let go past 90° whose act the workspace is applying
  // { kind, plan, fraction, pieces, view }. HO-2: the backgauge fingers in
  // the hand (§6.2; the viewport drives the drag, every L a session patch).
  let gripDrag = null,
    handover = null,
    fingerHeld = false;
  const planTurn = (fromArray, toArray) => {
    const from = new THREE.Matrix4().fromArray(fromArray),
      to = new THREE.Matrix4().fromArray(toArray);
    const qa = new THREE.Quaternion(),
      qb = new THREE.Quaternion(),
      p = new THREE.Vector3(),
      s = new THREE.Vector3();
    from.decompose(p, qa, s);
    to.decompose(p, qb, s);
    const { centre, radius } = station.pose.bounds;
    return {
      from,
      to,
      qa,
      qb,
      centre: new THREE.Vector3(...centre),
      out: radius + Math.max(30, station.pose.dieHalf) + 15,
      rise: radius * 0.35 + 20,
    };
  };
  // The part `e` of the way along a turn (0 … 1, eased already): slerped,
  // drawn out toward the operator and lifted on the way. `turn.post` (hands
  // on the sheet §5.2): the same body re-posed on the station's new fold, so a
  // turn carries on over a hand-over without a jump.
  const turnMatrixAtFraction = (turn, e) => {
    let m;
    if (e >= 1) m = turn.to.clone();
    else if (e <= 0) m = turn.from.clone();
    else {
      const q = new THREE.Quaternion().slerpQuaternions(turn.qa, turn.qb, e);
      const c = turn.centre.clone().applyMatrix4(turn.from).lerp(turn.centre.clone().applyMatrix4(turn.to), e);
      const swing = Math.sin(Math.PI * e);
      c.y -= turn.out * swing;
      c.z += turn.rise * swing;
      m = new THREE.Matrix4()
        .compose(c, q, UNIT_SCALE)
        .multiply(new THREE.Matrix4().makeTranslation(-turn.centre.x, -turn.centre.y, -turn.centre.z));
    }
    return turn.post ? m.multiply(turn.post) : m;
  };
  // Where `s` (0 … 1 of the turn's time) puts it: eased over the turn's own
  // stretch (`range`, whole by default; a drag let go runs on from where it is).
  const turnFraction = (turn, s) => {
    const [a, b] = turn.range || [0, 1];
    return a + (b - a) * ease(Math.min(1, Math.max(0, s)));
  };
  // With prefers-reduced-motion: reduce every turn lands at once (§4.8).
  const reducedMotion = () => {
    try {
      return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
    } catch {
      return false;
    }
  };
  // The part at `s` of a turn; the punch line and a shown collision wait for it to land.
  const showTurn = (turn, s) => {
    station.part.group.matrix.copy(turnMatrixAtFraction(turn, turnFraction(turn, s)));
    station.part.group.matrixWorldNeedsUpdate = true;
    punchLine.visible = false;
    if (station.hit) station.hit.visible = false;
  };
  const stopTurn = () => {
    if (turnLoop) cancelAnimationFrame(turnLoop);
    turnLoop = 0;
    if (station) station.turn = null;
  };
  const turnTick = (now) => {
    turnLoop = 0;
    const turn = station?.turn;
    if (!turn) return;
    const begin = performance.now();
    const ms = turn.ms ?? TURN_MS;
    const s = ms > 0 && !reducedMotion() ? (now - turn.start) / ms : 1;
    showTurn(turn, s);
    if (s >= 1) {
      station.turn = null;
      // Landed: the pose the station computes (a collision shown at its angle,
      // which waited flat for the landing), the punch line and the red paint back.
      if (turn.repose) poseStation();
      else punchLine.visible = turn.lineShown;
      if (station.hit) station.hit.visible = true;
    }
    emitPose();
    ctx.render();
    const spent = performance.now() - begin;
    turn.frames += 1;
    turn.total += spent;
    turn.worst = Math.max(turn.worst, spent);
    if (s < 1) {
      turnLoop = requestAnimationFrame(turnTick);
      return;
    }
    lastTurn = {
      frames: turn.frames,
      meanMs: Number((turn.total / turn.frames).toFixed(2)),
      worstMs: Number(turn.worst.toFixed(2)),
      ms: Math.round(performance.now() - turn.start),
    };
    turn.onDone?.();
  };
  // Turn the part over from `fromMatrix` (a THREE.Matrix4: where it is drawn
  // now) to the current pose; `onDone` once it lands. A turn already running
  // starts again from where it has got to.
  // `options`: { plan (a turn planned already, run on from `range[0]`), range,
  // ms, repose (pose the station again on landing: a collision waited flat),
  // around (the side up stays: the side view says turning around) }.
  const startTurn = (fromMatrix, onDone = null, options = {}) => {
    // Called just after the new pose: the punch line shows again as that pose has it.
    const lineShown = punchLine.visible;
    stopTurn();
    const turn = options.plan || planTurn(fromMatrix.toArray(), station.pose.frame.matrix);
    Object.assign(turn, {
      start: performance.now(),
      frames: 0,
      total: 0,
      worst: 0,
      onDone,
      lineShown,
      range: options.range || null,
      ms: options.ms ?? null,
      repose: Boolean(options.repose),
      around: Boolean(options.around),
    });
    station.turn = turn;
    showTurn(turn, 0);
    if (reducedMotion()) turnTick(performance.now());
    else turnLoop = requestAnimationFrame(turnTick);
  };
  // The side view hears every pose: the stroke's frames, a pick, a shown collision.
  // The sheet turning on its own or in the operator's hands (hands on the
  // sheet §5.2): 'turn' (over, §5.1) or 'around' (the side up stays), else null.
  const turnPhase = () => {
    if (gripDrag) return gripDrag.kind === 'turn' ? 'around' : 'turn';
    if (station?.turn) return station.turn.around ? 'around' : 'turn';
    return null;
  };
  const emitPose = () => {
    if (!station?.section) return;
    const stroking = Boolean(station.stroke && !station.stroke.done);
    const turning = turnPhase();
    const collision = !stroking && !turning && station.view.collision;
    onStationPose({
      ...station.section,
      // 'turn': the sheet turning over (§5.1), on its own or between an offset's two hits.
      phase: stroking ? station.stroke.phase : turning,
      collision: collision ? { tool: collision.tool, angle: collision.angle } : null,
    });
  };
  const strokeTick = (now) => {
    stationLoop = 0;
    const run = station?.stroke;
    if (!run || run.done) return;
    // A replay's stroke (shop floor §8) keeps the film's time: paused, the
    // pose stands and nothing is drawn again until the clock moves.
    const elapsed = run.clock ? run.clock() : now - run.start;
    if (run.clock && elapsed === run.lastElapsed) {
      stationLoop = requestAnimationFrame(strokeTick);
      return;
    }
    run.lastElapsed = elapsed;
    const begin = performance.now();
    // A bend bent on (tight bends §4.4) starts from the angle it stands at.
    const at = strokeAt(run.timeline, elapsed, run.target, run.from || 0);
    // An offset bend (brake flip tooling §5.3): the hit under way poses from its own view.
    const part = at.part ?? 0;
    if (run.views) station.view = run.views[part];
    const bottom = run.bottoms ? run.bottoms[part] : run.bottom;
    const t = station.view.fold.thickness,
      park = t + STROKE_GAP;
    run.phase = at.phase;
    run.part = part;
    run.hit = at.hit ?? null;
    // The part taken off the punch along a slant (docs/sketch-studio-shop-punches.md
    // §5.3): during the return it slides along machine Y by tan s × the ram's
    // lift so far, so the drawn punch never passes through it. View only.
    const takeOff = (run.hits ? run.hits[part]?.takeOff : run.takeOff) ?? null;
    if (at.phase === 'turn') {
      // Between the two hits the sheet turns over: from the first hit made to
      // the second line on the die, the ram parked (planned once, on entering).
      if (!run.turn) {
        station.view = run.views[0];
        const made = poseStation(run.target, park).matrix;
        station.view = run.views[1];
        run.turn = planTurn(made, poseStation(0, park).matrix);
      }
      station.view = run.views[1];
      // Reduced motion (hands on the sheet §4.8): turned over at once, the hit's clock kept.
      showTurn(run.turn, reducedMotion() ? 1 : at.turn);
    } else if (at.hit) {
      // A round bend (round-bend spec §6): hit by hit, each in its own frame,
      // the ram lifting `at.gap` (BUMP_GAP between hits) and the fingers stepping on.
      if (at.phase === 'approach') poseStation(at.angle, t + at.gap * at.ram, at.hit);
      else if (at.phase === 'bend') poseStation(at.angle, 'follow', at.hit);
      else if (at.phase === 'return') {
        poseStation(at.angle, bottom + (t + at.gap - bottom) * at.ram, at.hit);
        // Taken off after the last hit only (between hits the part stays on the punch).
        if (at.hit === run.timeline.steps) slidePart(takeOff, bottom);
      } else poseStation(run.target, park, at.hit);
    } else if (at.phase === 'approach') poseStation(at.angle, t + STROKE_GAP * at.ram);
    else if (at.phase === 'bend') poseStation(at.angle, 'follow');
    else if (at.phase === 'return') {
      poseStation(run.target, bottom + (park - bottom) * at.ram);
      slidePart(takeOff, bottom);
    } else poseStation(run.target, park);
    if (at.phase === 'done') {
      // The hit is made: the part stays where the stroke left it, the ram parked.
      run.done = true;
      emitPose();
      ctx.render();
      strokeFrame(run, begin);
      lastStroke = { token: run.token, ...run.frames };
      onStrokeEnd(run.token, run);
      return;
    }
    emitPose();
    ctx.render();
    strokeFrame(run, begin);
    stationLoop = requestAnimationFrame(strokeTick);
  };
  // The return's take-off (shop punches §5.3): the posed part moved along
  // machine Y by tan(slant) × (the tip's height now − `bottom`, where the
  // stroke bottomed out), the side view's sheet with it.
  const slidePart = (slant, bottom) => {
    if (!slant || !station.pose) return;
    const dy = Math.tan((slant * Math.PI) / 180) * Math.max(0, station.pose.tipZ - bottom);
    station.pose.slide = dy;
    station.part.group.matrix.premultiply(new THREE.Matrix4().makeTranslation(0, dy, 0));
    station.part.group.matrixWorldNeedsUpdate = true;
    if (station.section) station.section = { ...station.section, slide: dy };
  };
  // The work of each stroke frame (pose, side view, render); an offset's turn
  // between its hits is also counted apart.
  let lastStroke = null;
  const strokeFrame = (run, begin) => {
    const spent = performance.now() - begin;
    run.frames ||= { frames: 0, total: 0, worst: 0 };
    run.frames.frames += 1;
    run.frames.total += spent;
    run.frames.worst = Math.max(run.frames.worst, spent);
    if (run.phase === 'turn') {
      run.frames.turn ||= { frames: 0, total: 0, worst: 0 };
      run.frames.turn.frames += 1;
      run.frames.turn.total += spent;
      run.frames.turn.worst = Math.max(run.frames.turn.worst, spent);
    }
  };
  // `before`: where the part was drawn and which side was up, when the stroke
  // starts on a sheet lying the other way up (a re-run): it turns over first.
  const startStroke = (run, before = null) => {
    stopStroke();
    stopTurn();
    // An offset bend (brake flip tooling §5.3): each hit's view, the first's posed first.
    const views = run.hits ? run.hits.map((hit) => ({ ...station.view, ...hit })) : null;
    if (views) station.view = views[0];
    // A round bend bottoms out alike in every hit: its first, fully made.
    const steps = run.timeline.steps || null;
    const bottoms = (views || [station.view]).map((view) => {
      const members = view.bendIds?.length ? view.bendIds : [view.bendId];
      const side = { gaugePoint: view.gaugePoint || null, turned: Boolean(view.turned) };
      const posed = poseFold(
        view.fold,
        {
          ...(view.angles || {}),
          ...Object.fromEntries(members.map((id) => [id, steps ? run.target / steps : run.target])),
        },
        machineFrom(view.fold, members, side),
      );
      const dieEntry = view.die ? dieOf(view.die) : suggestedDie(view.fold.thickness, view.punch).die;
      return brakeFrame(posed, view.bendId, { die: dieEntry, ...side, members, hit: steps ? 1 : null }).tipZ;
    });
    const stroke = {
      ...run,
      views,
      bottoms,
      bottom: bottoms[0],
      start: performance.now(),
      phase: 'approach',
      done: false,
    };
    station.stroke = stroke;
    poseStation(run.from || 0, station.view.fold.thickness + STROKE_GAP);
    // The sheet was lying the other way up (not on a replay's clock): it turns over, then the ram comes down.
    if (before && before.flipped !== station.pose.flipped && !run.clock) {
      stroke.phase = 'turn';
      emitPose();
      startTurn(before.matrix, () => {
        if (station?.stroke !== stroke) return;
        stroke.phase = 'approach';
        stroke.start = performance.now();
        stationLoop = requestAnimationFrame(strokeTick);
      });
      return;
    }
    emitPose();
    stationLoop = requestAnimationFrame(strokeTick);
  };
  // ------------------------------------------------ the grip (hands on the sheet, HO-1)
  // Two handles on the station's sheet (brakeGrip.js), a constant size on
  // screen, where the operator's hands would be (§5.2). The workspace says
  // when the station is being set up and hands over both acts' outcomes
  // (setGrip, never inside the view: a new view re-poses the station); the
  // viewport asks what is under the pointer and drives a drag (gripPick,
  // gripStart, gripTo, gripRelease, gripCancel). A drag only moves the drawn
  // sheet along the turn its act would make; the act itself is one ordinary
  // session patch the workspace applies, after which the turn carries on
  // from where the hand left it (`handover`, see setStation).
  const grip = createBrakeGrip();
  stationRoot.add(grip.group);
  const KINDS = ['flip', 'turn'];
  const NO_HANDS = { shown: false, lined: false, flip: null, turn: null, ms: null };
  let hands = NO_HANDS,
    lastGripDrag = null,
    // Per drawn pose: the anchor, the pose lying flat (a collision's waits), each act's placement.
    gripCache = { pose: null, anchor: null, flat: null, targets: {} },
    // The free part of the view, read from the cards' boxes once per station change or size.
    freeCache = null;
  const freshCache = () => {
    if (gripCache.pose !== station.pose) gripCache = { pose: station.pose, anchor: null, flat: null, targets: {} };
    return gripCache;
  };
  // The rest pose lying flat on the die: the pose itself, or with a collision
  // shown the same view with the hit at 0° (its red pose waits for a landing).
  const flatNow = () => {
    const cache = freshCache();
    if (!cache.flat) {
      const pose = station.pose;
      const flat = station.view.collision ? framePose(station.view, 0) : { posed: pose.posed, frame: pose.frame };
      cache.flat = { matrix: new THREE.Matrix4().fromArray(flat.frame.matrix), posed: flat.posed };
    }
    return cache.flat;
  };
  // Where an act would leave the sheet, as a placement of the pieces on the
  // die now (rebased through a matched piece: the act's fold may be rooted
  // differently), with the turn's axis; null without an outcome or a turn.
  const gripTarget = (kind) => {
    const outcome = hands[kind];
    if (!station?.pose || !outcome?.view?.fold) return null;
    const cache = freshCache();
    if (cache.targets[kind] !== undefined) return cache.targets[kind];
    let target = null;
    try {
      const now = flatNow();
      const after = framePose(outcome.view, outcome.view.collision ? 0 : null);
      const matrix = rebaseMatrix(
        { matrix: new THREE.Matrix4().fromArray(after.frame.matrix), pieces: after.posed.pieces },
        { pieces: now.posed.pieces },
      );
      const turn = matrix && relativeTurn(now.matrix.toArray(), matrix.toArray());
      target = turn && turn.degrees > 1 ? { matrix, axis: turn.axis, degrees: turn.degrees } : null;
    } catch {
      target = null;
    }
    cache.targets[kind] = target;
    return target;
  };
  // The anchor on the part as drawn (brakeHands.js gripAnchor), machine mm.
  const anchorNow = () => {
    const cache = freshCache();
    if (!cache.anchor) {
      const { posed, frame } = station.pose;
      const points = [];
      for (const piece of posed.pieces)
        for (const [x, y] of piece.outer)
          for (const z of [0, posed.thickness])
            points.push(transformPoint(frame.matrix, transformPoint(piece.matrix, [x, y, z])));
      cache.anchor = gripAnchor(points);
    }
    return cache.anchor;
  };
  // The free part of the view (§4.9), canvas px.
  const freeNow = (width, height) => {
    if (freeCache?.width === width && freeCache.height === height) return freeCache.rect;
    const canvas = ctx.renderer.domElement;
    const bounds = canvas.getBoundingClientRect();
    const view = canvas.closest?.('.cad-model-view') || canvas.parentElement;
    const local = (el) => {
      const r = el?.getBoundingClientRect();
      return r && (r.width || r.height)
        ? {
            left: r.left - bounds.left,
            top: r.top - bounds.top,
            right: r.right - bounds.left,
            bottom: r.bottom - bounds.top,
          }
        : null;
    };
    const rect = freeRect({
      width,
      height,
      cards: [...(view?.querySelectorAll('.cad-brake-side, .cad-brake-map') || [])].map(local),
      cube: local(view?.querySelector('.cad-view-cube')),
      hint: local(view?.querySelector('.cad-viewport-hint')),
    });
    freeCache = { width, height, rect };
    return rect;
  };
  const canvasSize = () => {
    const canvas = ctx.renderer.domElement;
    return [canvas.clientWidth || 1, canvas.clientHeight || 1];
  };
  // A machine-frame point on the canvas: [x, y (px), behind].
  const toScreen = (p, width, height) => {
    const v = new THREE.Vector3(p[0], p[1], p[2] + WORK_HEIGHT).project(ctx.camera);
    return [((v.x + 1) / 2) * width, ((1 - v.y) / 2) * height, v.z > 1];
  };
  // A handle's axis, drawn the same way whichever way its turn goes.
  const gripAxis = (kind) => {
    const axis = gripTarget(kind)?.axis || defaultGripAxis(kind, hands.lined);
    const ref = defaultGripAxis(kind, hands.lined);
    return axis[0] * ref[0] + axis[1] * ref[1] + axis[2] * ref[2] < 0 ? axis.map((v) => -v) : axis;
  };
  const gripVisible = () =>
    Boolean(
      station?.pose && station.part && hands.shown && !station.stroke && !station.turn && !handover && !fingerHeld,
    );
  const hideGrip = () => KINDS.forEach((kind) => grip.show(kind, false));
  // Each render (CadViewport render): the handles at the anchor, a constant
  // size on screen; the lit edge too (HO-2), or nothing lit once the station
  // is no longer being set up.
  const layoutGrip = () => {
    if (!station) return;
    layoutReach();
    if (gripDrag) return;
    if (!gripVisible()) return hideGrip();
    const anchor = anchorNow();
    if (!anchor) return hideGrip();
    const [width, height] = canvasSize();
    ctx.camera.updateMatrixWorld();
    const [x0, x1] = anchor.edge;
    // Along the front edge from its middle out, until a spot lies in the free part of the view.
    const spots = [0, 1, -1, 2, -2, 3, -3]
      .map((k) => anchor.point[0] + (k * (x1 - x0)) / 8)
      .map((x) => ({ x, screen: toScreen([x, anchor.y, anchor.z], width, height) }))
      .filter((s) => !s.screen[2]);
    const spot = slideAnchor(spots, freeNow(width, height));
    const [sx, sy] = spot?.screen || [-1, -1];
    // Hidden when the anchor leaves the canvas.
    if (!spot || sx < 0 || sy < 0 || sx > width || sy > height) return hideGrip();
    const point = [spot.x, anchor.y, anchor.z];
    const scale = mmPerPixelAt(ctx.camera, [point[0], point[1], point[2] + WORK_HEIGHT], height);
    for (const kind of KINDS) {
      // Turn sheet around only with a punch line (with none, picking the edge is the turn: HO-2).
      const shown = kind === 'flip' || hands.lined;
      grip.show(kind, shown);
      if (!shown) continue;
      const axis = gripAxis(kind);
      grip.colour(kind, nearestAxis(axis));
      grip.place(kind, { anchor: point, axis, up: kind === 'turn' ? [0, 1, 0] : [0, 0, 1], scale });
    }
  };
  // A handle's arc on the canvas (px), front of the camera only.
  const screenArc = (kind, width, height) =>
    grip
      .arc(kind)
      .map((p) => toScreen(p.toArray(), width, height))
      .filter((p) => !p[2]);
  // The sheet lies flat again (a collision's pose and paint back) once a drag is let go.
  const settleBack = (drag) => {
    if (!station) return;
    const rest = () => {
      if (!station) return;
      if (drag.flattened) {
        poseStation();
        showHit(station.view.collision || null);
      }
      emitPose();
      ctx.render();
    };
    if (drag.fraction <= 1e-6) {
      station.part.group.matrix.copy(drag.plan.from);
      station.part.group.matrixWorldNeedsUpdate = true;
      if (!drag.flattened) {
        punchLine.visible = drag.lineShown;
        if (station.hit) station.hit.visible = true;
      }
      return rest();
    }
    startTurn(null, rest, {
      plan: drag.plan,
      range: [drag.fraction, 0],
      ms: drag.fraction * TURN_MS,
      repose: !drag.flattened,
      around: drag.kind === 'turn',
    });
  };
  // A drag let go past 90° whose act the workspace applies: carried on by the
  // new view (setStation); one the session never took (nothing changed) goes back.
  const awaitHandover = (held, frames = 3) => {
    requestAnimationFrame(() => {
      if (handover !== held) return;
      if (frames > 1) return awaitHandover(held, frames - 1);
      handover = null;
      settleBack(held);
    });
  };
  // The turn a hand let go carries on over the new pose, from where it is
  // (§5.2): the same plan, the new pieces rebased onto the old, when it lands
  // within 0.5 mm and 0.5° of the pose the station computes. False otherwise.
  const continueHandover = (held) => {
    const post = rebaseMatrix(
      { matrix: new THREE.Matrix4(), pieces: held.pieces },
      { pieces: station.pose.posed.pieces },
    );
    if (!post) return false;
    const landing = held.plan.to.clone().multiply(post);
    const gap = placementGap(
      landing,
      new THREE.Matrix4().fromArray(station.pose.frame.matrix),
      station.pose.posed.pieces,
    );
    if (gap.mm > 0.5 || gap.degrees > 0.5) return false;
    startTurn(null, null, {
      plan: { ...held.plan, post },
      range: [held.fraction, 1],
      ms: (1 - held.fraction) * TURN_MS,
      repose: true,
      around: held.kind === 'turn',
    });
    return true;
  };
  const gripStats = (drag) =>
    drag.frames
      ? {
          kind: drag.kind,
          frames: drag.frames,
          meanMs: Number((drag.total / drag.frames).toFixed(2)),
          worstMs: Number(drag.worst.toFixed(2)),
        }
      : lastGripDrag;
  // The handles for browser checks: each shown one's centre, a point on its arc to press, the arc (client px).
  const gripState = () => {
    const [width, height] = canvasSize();
    const rect = ctx.renderer.domElement.getBoundingClientRect();
    const client = ([x, y]) => [rect.left + x, rect.top + y];
    const shown = gripVisible() || Boolean(gripDrag);
    const handle = (kind) => {
      if (!shown || !grip.shown(kind)) return null;
      const arc = screenArc(kind, width, height);
      const centre = toScreen(grip.centre(kind).toArray(), width, height);
      return {
        centre: client(centre),
        press: arc.length ? client(arc[Math.floor(arc.length / 2)]) : null,
        arc: arc.map(client),
        axis: nearestAxis(gripAxis(kind)),
      };
    };
    const outcome = (o) => (o ? { hit: o.hit, ok: o.ok, fact: o.fact } : null);
    return {
      shown,
      lined: hands.lined,
      hot: grip.hotKind(),
      dragging: gripDrag ? gripDrag.kind : null,
      fraction: gripDrag ? gripDrag.fraction : null,
      handover: Boolean(handover),
      handles: { flip: handle('flip'), turn: handle('turn') },
      outcomes: { flip: outcome(hands.flip), turn: outcome(hands.turn) },
      outcomesMs: hands.ms ?? null,
      // The pair would pass the budget: each is worked out on its handle's first approach (§5.4).
      lazy: Boolean(hands.lazy),
      // The grip's own work per drag frame (pose, side view, render), as lastTurn is.
      lastDrag: lastGripDrag,
    };
  };

  // ------------------------------------------------ the rest of the set-up in reach (hands on the sheet, HO-2)
  // After the grip, what the pointer reaches on the station (§6, brakeHands.js
  // HAND_ORDER): the backgauge fingers (a handle where a millimetre of drag
  // is a millimetre of L, else scenery that says why), the blades and the
  // machine (the one pick that casts a ray at the station's meshes: the first
  // thing under the pointer, so the sheet in front hides the die behind it),
  // and the sheet's edges in gauge mode (screen space, within EDGE_PICK_PX).
  // One thing lit at a time (`reach`): the fingers a brighter amber, a blade
  // tinted (never the collision red), an edge a ribbon along its run on the
  // sheet (brakeLights.js). The workspace says what is offered (setGrip:
  // `edges`, `fingers`); the layer never guesses from the view.
  const lights = createBrakeLights();
  stationRoot.add(lights.group);
  const FINGER_LIT = '#f7b52f',
    BLADE_TINT = '#a9cbe3';
  const litMaterial = (colour) => ctx.materials.body(colour, 1, { depthWrite: true, roughness: 0.6 });
  let reach = null,
    // Per drawn pose and offered edges: each edge's run on the sheet (machine mm).
    edgeCache = { pose: null, edges: null, lines: [] };
  const edgeLines = () => {
    if (!hands.edges?.length || !station?.pose) return [];
    if (edgeCache.pose !== station.pose || edgeCache.edges !== hands.edges) {
      const { posed, frame } = station.pose;
      edgeCache = {
        pose: station.pose,
        edges: hands.edges,
        lines: hands.edges.map((edge) => ({ index: edge.index, segments: edgeSegments(posed, edge, frame.matrix) })),
      };
    }
    return edgeCache.lines;
  };
  // An edge's runs on the canvas (px), the parts in front of the camera only.
  const screenRuns = (segments, width, height) =>
    segments
      .map(([p, q]) => [toScreen(p, width, height), toScreen(q, width, height)])
      .filter(([p, q]) => !p[2] && !q[2]);
  const fingerOf = (name) => station?.gauge?.getObjectByName(`press-brake-finger-${name}`) || null;
  // The two fingers on the canvas: each box's projected corners' extent, a 24 px target at least.
  const fingerRects = (width, height) => {
    if (!station?.gauge?.visible) return [];
    const y = station.gauge.position.y;
    return ['left', 'right']
      .map((name) => {
        const x = fingerOf(name)?.position.x ?? 0;
        const xs = [],
          ys = [];
        for (const dx of [-FINGER.width / 2, FINGER.width / 2])
          for (const dy of [0, FINGER.depth + 30])
            for (const z of [-FINGER.below, FINGER.above]) {
              const [sx, sy, behind] = toScreen([x + dx, y + dy, z], width, height);
              if (behind) continue;
              xs.push(sx);
              ys.push(sy);
            }
        return xs.length
          ? reachRect({ left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) })
          : null;
      })
      .filter(Boolean);
  };
  // The die as drawn: the view's, or the one the station chose for the thickness.
  const dieNow = () => {
    const view = station.view;
    return view.die ? dieOf(view.die) : suggestedDie(view.fold.thickness, view.punch).die;
  };
  // The station's meshes by name: what each is to the operator.
  const RAY_PARTS = Object.freeze({
    'press-brake-punch-section': 'punch',
    'press-brake-die-section': 'die',
    'press-brake-holder': 'holder',
    'press-brake-upper-beam': 'ram',
    'press-brake-bed': 'bed',
    'press-brake-frame': 'frame',
    'press-brake-gauge-beam': 'beam',
    'press-brake-finger-left': 'fingers',
    'press-brake-finger-right': 'fingers',
  });
  // The first thing under the pointer (§6.3): the station's meshes and the
  // sheet, through the meshes' own ray test (each has `raycast` switched off
  // so no other pick ever sees them; this one asks THREE.Mesh's directly).
  // The sheet first: nothing (its edges are picked next).
  const machinePick = (raycaster) => {
    if (!raycaster) return null;
    stationRoot.updateMatrixWorld(true);
    const hits = [];
    for (const object of [station.part?.group, station.parts, station.die, station.ram, station.gauge])
      object?.traverseVisible((o) => {
        if (o.isMesh) THREE.Mesh.prototype.raycast.call(o, raycaster, hits);
      });
    if (!hits.length) return null;
    hits.sort((a, b) => a.distance - b.distance);
    const part = RAY_PARTS[hits[0].object.name];
    if (!part) return null;
    if (part === 'fingers') return { kind: 'fingers', offered: Boolean(hands.fingers?.offered) };
    if (part === 'punch') return { blade: 'punch', name: punchOf(station.view.punch).name };
    if (part === 'die') return { blade: 'die', name: dieNow().name };
    return { kind: 'machine', part };
  };
  const sameReach = (a, b) =>
    (a?.kind ?? null) === (b?.kind ?? null) &&
    a?.index === b?.index &&
    a?.blade === b?.blade &&
    a?.part === b?.part &&
    Boolean(a?.offered) === Boolean(b?.offered);
  // Light (or put out) one thing in reach: the materials are the station's
  // own, swapped back only when nothing else (a collision's red) swapped them.
  const paintReach = (target, on) => {
    if (!target || !station) return;
    if (target.kind === 'fingers' && target.offered)
      for (const name of ['left', 'right']) {
        const finger = fingerOf(name);
        if (finger) finger.material = on ? litMaterial(FINGER_LIT) : machineMaterial('gauge');
      }
    if (target.kind === 'blade') {
      const group = target.blade === 'punch' ? station.ram?.getObjectByName('press-brake-punch') : station.die;
      const tint = litMaterial(BLADE_TINT),
        red = machineMaterial('hit');
      group?.traverse((mesh) => {
        if (!mesh.isMesh || !mesh.userData.colour) return;
        if (on && mesh.material !== red) mesh.material = tint;
        else if (!on && mesh.material === tint) mesh.material = machineMaterial(mesh.userData.colour);
      });
    }
    if (target.kind === 'edge') lights.edge(on ? edgeLines().find((l) => l.index === target.index)?.segments : null);
  };
  // Returns whether what is lit changed.
  const setReach = (target) => {
    if (sameReach(target, reach)) return false;
    paintReach(reach, false);
    reach = target || null;
    paintReach(reach, true);
    return true;
  };
  // Each render: nothing lit once the station is not being set up (a
  // stroke, a turn, a hand-over), the fingers kept lit while in the hand;
  // the lit edge follows its pose and keeps its width on screen.
  const layoutReach = () => {
    if (reach && !gripVisible() && !fingerHeld) setReach(null);
    if (reach?.kind !== 'edge') return;
    const line = edgeLines().find((l) => l.index === reach.index);
    if (!line) return setReach(null);
    lights.edge(line.segments);
    const [, height] = canvasSize();
    lights.layout((p) => mmPerPixelAt(ctx.camera, [p[0], p[1], p[2] + WORK_HEIGHT], height));
  };
  // Browser checks: what is lit, the fingers and the edges on the canvas (client px).
  const reachState = () => {
    const [width, height] = canvasSize();
    const rect = ctx.renderer.domElement.getBoundingClientRect();
    const client = ([x, y]) => [rect.left + x, rect.top + y];
    const open = gripVisible();
    return {
      lit: reach
        ? { kind: reach.kind, index: reach.index ?? null, blade: reach.blade || null, part: reach.part || null }
        : null,
      held: fingerHeld,
      edgeLit: lights.lit(),
      fingersOffered: Boolean(hands.fingers?.offered),
      fingers:
        open || fingerHeld
          ? fingerRects(width, height).map((r) => client([(r.left + r.right) / 2, (r.top + r.bottom) / 2]))
          : [],
      // Each offered edge: points along its longest run on the canvas, to press.
      edges: open
        ? edgeLines().map((line) => {
            const span = ([p, q]) => Math.hypot(q[0] - p[0], q[1] - p[1]);
            const run = screenRuns(line.segments, width, height).reduce(
              (best, r) => (!best || span(r) > span(best) ? r : best),
              null,
            );
            return {
              index: line.index,
              runs: line.segments.length,
              points: run
                ? [0.5, 0.35, 0.65, 0.2, 0.8].map((f) =>
                    client([run[0][0] + (run[1][0] - run[0][0]) * f, run[0][1] + (run[1][1] - run[0][1]) * f]),
                  )
                : [],
            };
          })
        : [],
    };
  };

  // ------------------------------------------------ the replay's mask (shop floor §8)
  // The instance ids the film has not made yet (a Set): hidden whatever else would show them.
  let hidden = new Set();
  const maskHides = (id) => hidden.has(id);

  const gapState = () => {
    // The machine frame (the part's group on the die: X along the bed, Z 0 the die top).
    const placed = (p) => transformPoint(station.part.group.matrix.elements, p).map((v) => Number(v.toFixed(4)));
    return {
      overlap: gapPoints.overlap,
      length: Number(gapPoints.length.toFixed(4)),
      points: [placed(gapPoints.P), placed(gapPoints.Q)],
      inPartGroup: gapLine.parent === station.part.group,
    };
  };
  const closeStation = () => {
    stopStroke();
    stopTurn();
    gripDrag = handover = null;
    hideGrip();
    grip.hot(null);
    // HO-2: nothing lit, the fingers out of the hand (the meshes go with the machine).
    reach = null;
    fingerHeld = false;
    lights.edge(null);
    gapWanted = null;
    gapLine.removeFromParent();
    hideGap();
    if (!station) return;
    for (const key of ['parts', 'gauge', 'die', 'ram', 'hit']) dropGroup(station[key]);
    if (ctx.grid && station.gridShown != null) ctx.grid.visible = station.gridShown;
    if (station.part) {
      station.part.group.removeFromParent();
      station.part.handle.dispose();
    }
    station = null;
    stationRoot.visible = false;
    punchLine.visible = false;
    onStationPose(null);
    for (const group of ctx.group.children)
      group.visible = (ctx.groupShown ? ctx.groupShown(group) : true) && !maskHides(group.userData.instanceId);
    refreshRecords();
  };
  return {
    /**
     * The replay's mask (shop floor §8): the instance ids hidden at this point
     * of the film ([] or null: none). Their prints hide with them.
     */
    setHidden(ids) {
      const next = new Set(ids || []);
      if (next.size === hidden.size && [...next].every((id) => hidden.has(id))) return;
      hidden = next;
      for (const group of ctx.group.children)
        group.visible =
          (ctx.groupShown ? ctx.groupShown(group) : true) &&
          !station &&
          !(preview && preview.instanceId === group.userData.instanceId) &&
          !maskHides(group.userData.instanceId);
      refreshRecords();
      ctx.render();
    },
    /**
     * The press brake station (SM-2): null closes it, else { key, instanceId,
     * machine, punch, die, fold, bendId (the bend in the die, or null: the
     * flat blank), angles, gaugePoint, gaugeDistance, collision, stroke }
     * (brakeStation.js stationView). A stroke `{ token, bendId, target,
     * timeline }` runs once per token in its own animation loop; at its end
     * the part stays posed and `onStrokeEnd(token)` reports it.
     */
    setStation(view) {
      if (!view) {
        if (!station) return;
        closeStation();
        ctx.render();
        return;
      }
      // The unfold view gives way to the machine.
      if (preview) {
        stop();
        remove();
      }
      if (station && station.key !== view.key) closeStation();
      // Where the part is drawn now, which side is up (brake flip tooling
      // §5.1) and which edge of the blank faces the backgauge (hands on the
      // sheet §5.3): when either changes, the sheet turns from there.
      const before =
        station?.pose && station.part
          ? {
              flipped: station.pose.flipped,
              back: station.pose.back,
              scrub: Boolean(station.view?.scrub),
              film: Boolean(ctx.filmKey),
              matrix: station.part.group.matrix.clone(),
              pieces: station.pose.posed.pieces,
            }
          : null;
      // The cards may have changed: the free part of the view is read again.
      freeCache = null;
      if (!station) {
        station = {
          key: view.key,
          parts: null,
          gauge: null,
          die: null,
          ram: null,
          hit: null,
          part: null,
          stroke: null,
        };
        stationRoot.visible = true;
        // The floor grid lies a metre under the die: seen through the machine's
        // throat its lines read as drafting, not a shop. Back on leaving.
        if (ctx.grid) {
          station.gridShown = ctx.grid.visible;
          ctx.grid.visible = false;
        }
      }
      if (station.machineKey !== view.machine) buildMachine(machineOf(view.machine));
      if (!station.part || station.part.fold !== view.fold) {
        // Bare stock on the machine (the selection colour belongs to the model view).
        const stock = SHEET_STOCK[view.fold.stock];
        const handle = createSheetMetalPreview(view.fold, {
          body: ctx.materials.body(stock?.colour || '#8f979e', 1, { depthWrite: true, roughness: 0.45 }),
          edge: ctx.materials.edge(EDGE_COLOR, EDGE_ALPHA.solid),
        });
        const group = new THREE.Group();
        group.name = 'press-brake-part';
        group.matrixAutoUpdate = false;
        group.add(handle.group);
        if (station.part) {
          station.part.group.removeFromParent();
          station.part.handle.dispose();
        }
        stationRoot.add(group);
        station.part = { fold: view.fold, handle, group };
      }
      station.view = view;
      // A new view under a drag (the model moved): the drag ends where it is.
      gripDrag = null;
      const held = handover;
      handover = null;
      const run = view.stroke;
      if (run && station.stroke?.token !== run.token) {
        showHit(null);
        startStroke(run, before);
      } else if (!run && station.stroke) {
        stopStroke();
        station.stroke = null;
      }
      if (!station.stroke) {
        const turning = station.turn;
        poseStation();
        const after = {
          flipped: station.pose.flipped,
          back: station.pose.back,
          scrub: Boolean(view.scrub),
          film: Boolean(ctx.filmKey),
        };
        const turnNow = Boolean(before) && (Boolean(held) || turnChanged(before, after));
        // A collision is shown once the sheet lands: it turns lying flat on the die.
        if (turnNow && view.collision) poseStation(0, view.fold.thickness + STROKE_GAP);
        showHit(view.collision || null);
        const options = { repose: Boolean(view.collision), around: before?.flipped === after.flipped };
        // A drag let go past 90° carries on from where the hand left it (§5.2).
        const carried = Boolean(held) && continueHandover(held);
        if (!carried && turnNow)
          // From where the part is drawn, its pieces matched onto the new fold's.
          startTurn(
            rebaseMatrix({ matrix: before.matrix, pieces: before.pieces }, { pieces: station.pose.posed.pieces }) ||
              before.matrix,
            null,
            options,
          );
        else if (!carried && turning) {
          // A pick while the sheet turns: it lands on the new pose.
          const { start, frames, total, worst, onDone, range, ms, around } = turning;
          const from = turning.post ? turning.from.clone().multiply(turning.post) : turning.from;
          station.turn = Object.assign(planTurn(from.toArray(), station.pose.frame.matrix), {
            start,
            frames,
            total,
            worst,
            onDone,
            range,
            ms,
            around,
            repose: turning.repose,
            lineShown: punchLine.visible,
          });
          showTurn(station.turn, (performance.now() - start) / (ms ?? TURN_MS));
        }
        emitPose();
      }
      hideAll();
      refreshRecords();
      ctx.render();
    },
    stationOpen: () => Boolean(station),
    /**
     * A flange gap to mark (docs/sketch-studio-corner-gaps.md §3.3): { flat
     * ([P, Q], each [x, y, z] in its piece's flat frame), overlap }, or null.
     * Never inside the view (a new view re-poses the station).
     */
    setGap(gap) {
      gapWanted = gap && gap.flat ? { flat: gap.flat, overlap: Boolean(gap.overlap) } : null;
      if (!station) return;
      if (station.pose) placeGap();
      ctx.render();
    },
    /**
     * The grip (hands on the sheet §5.2 – §5.4): { shown (the station is
     * being set up: the workspace says so, the layer never guesses from the
     * view), lined (a punch line is picked: Turn sheet around is drawn), flip,
     * turn (brakeHands.js brakeOutcome, or null until worked out), ms }.
     */
    setGrip(next) {
      hands = next || NO_HANDS;
      gripCache.targets = {};
      if (!station) return;
      if (!hands.shown && gripDrag) this.gripCancel();
      // HO-2: not being set up, nothing is in reach (rule 2: every way out clears what the mode owns).
      if (!hands.shown) {
        fingerHeld = false;
        setReach(null);
      }
      ctx.render();
    },
    /** Before each render: the handles where the hands go, a constant size on screen. */
    layoutGrip,
    /** The handle under a canvas point (px), nearest first within GRIP_PICK_PX, or null. */
    gripPick(px) {
      if (!gripVisible()) return null;
      const [width, height] = canvasSize();
      let best = null,
        nearest = GRIP_PICK_PX;
      for (const kind of KINDS) {
        if (!grip.shown(kind)) continue;
        const distance = polylineDistance(screenArc(kind, width, height), px);
        if (distance <= nearest) {
          best = kind;
          nearest = distance;
        }
      }
      return best;
    },
    /** Light one handle at full strength (hover, a toolbar button's focus), or none. */
    gripLight(kind) {
      const next = kind && gripVisible() && grip.shown(kind) ? kind : null;
      if (grip.hotKind() === next) return next;
      grip.hot(next);
      ctx.render();
      return next;
    },
    /** Where a handle stands on the canvas: { x, y (its centre), radius (px) }, or null. */
    gripSpot(kind) {
      if (!grip.shown(kind)) return null;
      const [width, height] = canvasSize();
      const arc = screenArc(kind, width, height);
      if (!arc.length) return null;
      const [x, y] = toScreen(grip.centre(kind).toArray(), width, height);
      return { x, y, radius: Math.max(...arc.map((p) => Math.hypot(p[0] - x, p[1] - y))) };
    },
    /** The outcome a handle's chip says (brakeHands.js brakeOutcome), or null. */
    gripOutcome: (kind) => hands[kind] || null,
    /**
     * Start dragging a handle (past the dead zone): the sheet follows along
     * the turn its act would make (§5.2). Null when that turn is not known yet
     * (the press then acts as a click), else what the dial needs: { pivot,
     * axis (world), radius (world mm) }.
     */
    gripStart(kind) {
      if (!gripVisible() || !grip.shown(kind)) return null;
      const target = gripTarget(kind);
      if (!target) return null;
      const now = flatNow();
      const view = station.view;
      const lineShown = punchLine.visible;
      // In the operator's hands the sheet lies flat on the die: a collision's pose waits.
      if (view.collision) {
        poseStation(0, view.fold.thickness + STROKE_GAP);
        showHit(null);
      }
      const plan = planTurn(now.matrix.toArray(), target.matrix.toArray());
      const centre = grip.centre(kind);
      gripDrag = {
        kind,
        plan,
        fraction: 0,
        pieces: now.posed.pieces,
        flattened: Boolean(view.collision),
        lineShown,
        frames: 0,
        total: 0,
        worst: 0,
      };
      punchLine.visible = false;
      if (station.hit) station.hit.visible = false;
      for (const other of KINDS) if (other !== kind) grip.show(other, false);
      grip.hot(kind);
      emitPose();
      ctx.render();
      return {
        pivot: [centre.x, centre.y, centre.z + WORK_HEIGHT],
        axis: gripAxis(kind),
        radius: grip.radius(kind),
      };
    },
    /** The sheet `fraction` (0 … 1) of the way along the dragged handle's turn; its frame work counted. */
    gripTo(fraction) {
      const drag = gripDrag;
      if (!drag || !station) return;
      const begin = performance.now();
      drag.fraction = Math.min(1, Math.max(0, fraction));
      station.part.group.matrix.copy(turnMatrixAtFraction(drag.plan, drag.fraction));
      station.part.group.matrixWorldNeedsUpdate = true;
      emitPose();
      ctx.render();
      const spent = performance.now() - begin;
      drag.frames += 1;
      drag.total += spent;
      drag.worst = Math.max(drag.worst, spent);
    },
    /**
     * Let the dragged handle go: `commit` (90° or more) keeps the sheet where
     * it is for the act the workspace now applies (its view carries the turn
     * on); otherwise it eases back and nothing changes. Returns whether it
     * committed.
     */
    gripRelease(commit) {
      const drag = gripDrag;
      if (!drag) return false;
      gripDrag = null;
      lastGripDrag = gripStats(drag);
      grip.hot(null);
      if (commit && station) {
        handover = { ...drag };
        awaitHandover(handover);
        return true;
      }
      settleBack(drag);
      return false;
    },
    /** Esc, a right press, a lost pointer: the sheet eases back, nothing changes. */
    gripCancel() {
      this.gripRelease(false);
    },
    gripDragging: () => Boolean(gripDrag),
    /**
     * What is under a canvas point (px) while the station is being set up
     * (HO-2 §6.3), asked in brakeHands.js HAND_ORDER: { kind: 'grip', handle }
     * | { kind: 'fingers', offered } | { kind: 'blade', blade: 'punch' |
     * 'die', name } | { kind: 'machine', part } | { kind: 'edge', index } |
     * null. `ray`: a THREE.Raycaster through the point, or a function giving
     * one (only cast when nothing nearer in the order is found).
     */
    handPick(px, ray = null) {
      if (!gripVisible()) return null;
      const [width, height] = canvasSize();
      ctx.camera.updateMatrixWorld();
      return pickInOrder({
        grip: () => {
          const handle = this.gripPick(px);
          return handle && { handle };
        },
        fingers: () => (inRects(fingerRects(width, height), px) ? { offered: Boolean(hands.fingers?.offered) } : null),
        blade: () => machinePick(typeof ray === 'function' ? ray() : ray),
        edge: () => {
          const lines = edgeLines().map((line) => ({
            index: line.index,
            segments: screenRuns(line.segments, width, height),
          }));
          const index = nearestEdge(lines, px);
          return index == null ? null : { index };
        },
      });
    },
    /** Light one thing in reach (handPick's target, never a grip handle), or none. */
    reachLight(target) {
      const next = target && target.kind !== 'grip' && (gripVisible() || fingerHeld) ? target : null;
      if (setReach(next)) ctx.render();
      return reach;
    },
    /**
     * The fingers taken in the hand (§6.2): null unless they are a handle,
     * else where L is measured: { z (world Z of the horizontal plane through
     * the fingers), axis (the machine's +Y on the canvas, px per mm, for a
     * plane seen edge on) }.
     */
    fingerStart() {
      if (!gripVisible() || !hands.fingers?.offered || !station.gauge?.visible) return null;
      const [width, height] = canvasSize();
      ctx.camera.updateMatrixWorld();
      const y = station.gauge.position.y + (FINGER.depth + 30) / 2,
        z = (FINGER.above - FINGER.below) / 2;
      const a = toScreen([0, y, z], width, height),
        b = toScreen([0, y + 1, z], width, height);
      return { z: z + WORK_HEIGHT, axis: [b[0] - a[0], b[1] - a[1]] };
    },
    /** The fingers in the hand or let go: the grip and every other pick wait, the fingers stay lit. */
    fingerHold(on) {
      fingerHeld = Boolean(on) && Boolean(station);
      if (fingerHeld) {
        hideGrip();
        grip.hot(null);
      }
      setReach(fingerHeld ? { kind: 'fingers', offered: true } : null);
      ctx.render();
    },
    fingerHeld: () => fingerHeld,
    /**
     * Browser checks: a client point on the punch and on the die where the
     * ray's first hit is that blade (sampled over each one's box), or null.
     */
    bladeSpots() {
      if (!station || !gripVisible()) return { punch: null, die: null };
      const [width, height] = canvasSize();
      const rect = ctx.renderer.domElement.getBoundingClientRect();
      ctx.camera.updateMatrixWorld();
      stationRoot.updateMatrixWorld(true);
      const caster = new THREE.Raycaster();
      const spot = (object, blade) => {
        if (!object) return null;
        const box = new THREE.Box3().setFromObject(object);
        for (const fy of [0.02, 0.5, 0.98])
          for (const fz of [0.5, 0.25, 0.75, 0.1, 0.9, 0.98])
            for (const fx of [0.5, 0.3, 0.7, 0.05, 0.95, 0.995, 0.005]) {
              const p = new THREE.Vector3(
                box.min.x + (box.max.x - box.min.x) * fx,
                box.min.y + (box.max.y - box.min.y) * fy,
                box.min.z + (box.max.z - box.min.z) * fz,
              );
              const v = p.clone().project(ctx.camera);
              if (Math.abs(v.x) > 0.98 || Math.abs(v.y) > 0.98 || v.z > 1) continue;
              caster.setFromCamera(new THREE.Vector2(v.x, v.y), ctx.camera);
              if (machinePick(caster)?.blade === blade)
                return [rect.left + ((v.x + 1) / 2) * width, rect.top + ((1 - v.y) / 2) * height];
            }
        return null;
      };
      return { punch: spot(station.ram?.getObjectByName('press-brake-punch'), 'punch'), die: spot(station.die, 'die') };
    },
    /**
     * The station's two lights change the lighting of every lit material, so
     * the first time it shows the GPU links new shader programs (≈ 50 ms in
     * one frame, measured on the replay's first hit, shop floor §8.1). The
     * replay asks for them ahead, while its first scenes play: compiled with
     * the station's lights on (compileAsync, in the background where the GPU
     * links in parallel), then everything is as it was.
     */
    prepareStation() {
      if (station || prepared || !ctx.renderer?.compileAsync) return;
      prepared = true;
      // A stand-in with the machine's own materials, compiled against the
      // scene's lights with the station's on (only its materials: the scene's
      // others come and go while the replay plays).
      const probe = solid(new THREE.BoxGeometry(1, 1, 1), 'frame', 'press-brake-warm-up');
      stationRoot.visible = true;
      let pending = null;
      try {
        pending = ctx.renderer.compileAsync(probe, ctx.camera, ctx.scene);
      } catch {
        pending = null;
      } finally {
        stationRoot.visible = Boolean(station);
      }
      const drop = () => dropGroup(probe);
      if (pending) pending.then(drop, drop);
      else drop();
    },
    /**
     * Where the station's camera looks: the part as posed and the tooling
     * round it (the die's upper half, the punch parked above the sheet), never
     * the whole bed. { centre (world), span (mm the view holds), box: [min, max] }.
     */
    stationFocus() {
      if (!station) return null;
      stationRoot.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(station.part.group);
      const view = station.view;
      const t = view.fold.thickness;
      const punch = punchOf(view.punch);
      const dieEntry = view.die ? dieOf(view.die) : suggestedDie(t, view.punch).die;
      // Along the bed: the die as drawn (the part and DIE_MARGIN each side);
      // across: the die body to the backgauge fingers; up: most of the die to
      // the blade of the parked punch (the sheet near the middle of the view).
      const [x0, x1] = station.dieX || [box.min.x, box.max.x];
      const back = view.gaugeDistance != null ? view.gaugeDistance + FINGER.depth + 30 : 60;
      box.union(
        new THREE.Box3(
          new THREE.Vector3(x0, -60, WORK_HEIGHT - dieEntry.height * 0.75),
          new THREE.Vector3(x1, Math.max(60, back), WORK_HEIGHT + t + STROKE_GAP + punch.height * 0.5),
        ),
      );
      const centre = box.getCenter(new THREE.Vector3()),
        size = box.getSize(new THREE.Vector3());
      return {
        centre: centre.toArray(),
        span: Math.max(size.x, size.y, size.z, 120) * 1.3,
        box: [box.min.toArray(), box.max.toArray()],
      };
    },
    /**
     * view: null, or { instanceId, fold, flat }. Unfold (flat true) builds the
     * preview and animates it flat; flat false animates back and then drops it;
     * null drops it at once. The same view again only re-syncs the pose.
     */
    setView(view) {
      // The press brake has the part (it is a tool: the workspace never unfolds meanwhile).
      if (station) return;
      // Rendering only when something changed: this runs on every model edit.
      const had = Boolean(preview);
      if (!view || (preview && preview.instanceId !== view.instanceId)) {
        stop();
        remove();
      }
      if (!view) return had && ctx.render();
      if (!preview && !view.flat) return;
      if (!preview || preview.fold !== view.fold) {
        const handle = createSheetMetalPreview(view.fold, materialsFor(view.instanceId));
        if (preview) {
          dropMarks();
          root.remove(preview.handle.group);
          preview.handle.dispose();
        }
        root.add(handle.group);
        preview = { instanceId: view.instanceId, fold: view.fold, handle, ...buildMarks(view.fold) };
        poseAt(flatness);
      } else preview.handle.setMaterials(materialsFor(view.instanceId));
      hideKernel();
      place();
      refreshRecords();
      if (target !== (view.flat ? 1 : 0)) {
        target = view.flat ? 1 : 0;
        animate();
      }
      ctx.render();
    },
    /** The viewport replaced its groups or poses: hide the stand-in's part again and follow it. */
    sync() {
      if (station) return hideAll();
      if (!preview) return;
      hideKernel();
      place();
    },
    // The station hides every part; the unfold view its own; the replay the parts not made yet.
    hides: (id) => Boolean(station) || (Boolean(preview) && preview.instanceId === id) || maskHides(id),
    /** The prints to draw (SM-3): `model`'s prints on the displayed parts. Hidden while the press brake shows. */
    setRecords(model) {
      records = model;
      refreshRecords();
    },
    /** The parts moved on screen (a gizmo drag): the prints follow. */
    syncPoses: () => decor.syncPoses(),
    pickPrint: (raycaster) => decor.pickPrint(raycaster),
    printWorld: (id) => decor.printWorld(id),
    previewPrint: (id, origin) => decor.previewPrint(id, origin),
    resetPrint: (id) => decor.resetPrint(id),
    /** The instance whose preview the ray hits, or null (clicks on an unfolded part keep it selected). */
    pick(raycaster) {
      if (!preview || station) return null;
      root.updateMatrixWorld(true);
      return raycaster.intersectObjects(preview.handle.group.children, true).some((hit) => hit.object.isMesh)
        ? preview.instanceId
        : null;
    },
    placeLabels() {
      if (!preview?.nodes.length) return;
      const shown = flatness === 1 && !animation;
      const rect = ctx.renderer.domElement.getBoundingClientRect();
      ctx.camera.updateMatrixWorld();
      for (const { node, at } of preview.nodes) {
        const world = new THREE.Vector3(...transformPoint(root.matrix.elements, at)).project(ctx.camera);
        const x = ((world.x + 1) / 2) * rect.width,
          y = ((1 - world.y) / 2) * rect.height;
        node.hidden = !shown || world.z > 1;
        node.style.left = `${x}px`;
        node.style.top = `${y}px`;
      }
    },
    state: () => ({
      instanceId: preview?.instanceId || null,
      flat: Boolean(preview) && flatness === 1 && !animation,
      flatness,
      animating: Boolean(animation),
      pieces: preview?.fold.pieces.length || 0,
      bends:
        preview && flatness === 1 && !animation
          ? preview.fold.bends.map((b) => ({ id: b.id, label: b.label, direction: b.direction, angle: b.angle }))
          : [],
      records: decor.state(),
      // The replay's mask (shop floor §8).
      hidden: [...hidden],
      station: station
        ? {
            key: station.key,
            machine: station.machineKey,
            punch: station.view.punch,
            // Reverse punch (brake blades §4.2), and the punch as the scene drew it.
            reverse: Boolean(station.view.reverse),
            punchDrawn: station.tooling ? station.tooling.split('|')[0] : null,
            dieDrawn: station.tooling ? station.tooling.split('|')[1] : null,
            die: station.view.die || null,
            bendId: station.view.bendId,
            bendIds: station.view.bendIds || (station.view.bendId ? [station.view.bendId] : []),
            ranges: station.pose?.frame?.ranges || null,
            // Brake tool length (§3.2): the die's runs, trimmed apart from the punch's.
            dieRanges: station.pose?.frame?.dieRanges || null,
            // Horn sections (punch library §4.4): the horn parts the scene drew.
            horns: Boolean(station.pose?.frame?.horns),
            hornReach: hornOf(station.pose?.frame?.horns)?.reach ?? null,
            hornParts:
              station.ram
                ?.getObjectByName('press-brake-punch')
                ?.children.filter((o) => o.name === 'press-brake-punch-horn').length ?? 0,
            angle: station.pose?.angle ?? 0,
            // The other bends as the view poses them (tight bends §5.2: an armed try shows the
            // sheet as it is then, the later steps flat or a step part-way).
            angles: station.view.angles || {},
            // Where the backgauge fingers stand (a round bend's hit gauges one pitch nearer each).
            fingerDistance: station.pose?.gaugeDistance ?? null,
            tipZ: station.pose?.tipZ ?? null,
            // The return's take-off (shop punches §5.3): the stroke's slant and how far the part has slid (mm, machine Y).
            takeOff: station.stroke?.takeOff ?? null,
            slide: station.pose?.slide ?? 0,
            gaugeDistance: station.view.gaugeDistance ?? null,
            stroking: Boolean(station.stroke && !station.stroke.done),
            // 'around': turning the sheet around, its side up kept (hands on the sheet §5.3).
            phase: station.stroke?.phase || turnPhase(),
            // Brake flip tooling (§5.1 – §5.3): the side up as posed, the
            // other side to the backgauge, the sheet turning over (on its own
            // or between an offset's hits), the offset hit under way (0, 1)
            // and the last turn's frame work.
            flipped: Boolean(station.pose?.flipped),
            turned: Boolean(station.view.turned),
            turning: Boolean(station.turn) || station.stroke?.phase === 'turn',
            part: station.stroke?.views ? (station.stroke.part ?? 0) : null,
            lastTurn,
            // A round bend's hit in the die (round-bend spec §6), and the last stroke's frame work.
            hit: station.pose?.frame?.hit ?? null,
            hits: station.pose?.frame?.hits ?? null,
            lastStroke: lastStroke?.frames
              ? {
                  token: lastStroke.token,
                  frames: lastStroke.frames,
                  meanMs: Number((lastStroke.total / lastStroke.frames).toFixed(2)),
                  worstMs: Number(lastStroke.worst.toFixed(2)),
                  // An offset bend's turn between its hits.
                  ...(lastStroke.turn
                    ? {
                        turn: {
                          frames: lastStroke.turn.frames,
                          meanMs: Number((lastStroke.turn.total / lastStroke.turn.frames).toFixed(2)),
                          worstMs: Number(lastStroke.turn.worst.toFixed(2)),
                        },
                      }
                    : {}),
                }
              : null,
            collision: station.view.collision
              ? {
                  tool: station.view.collision.tool,
                  angle: station.view.collision.angle,
                  // The red triangles showHit drew (corner gaps §5: a thickness hit marks its two pieces).
                  marked: station.hit ? station.hit.geometry.getAttribute('position').count / 3 : 0,
                }
              : null,
            // Hands on the sheet (§5.6): the handles' client points, what is hot, the drag.
            grip: gripState(),
            // HO-2 (§6.4): what is lit, the fingers and the offered edges on the canvas.
            reach: reachState(),
            // The flange gap marked (corner gaps §3.3): its two points in the machine frame, mm apart.
            gap: gapPoints && gapLine.visible ? gapState() : null,
          }
        : null,
    }),
    dispose() {
      stop();
      remove();
      closeStation();
      records = null;
      decor.dispose();
      grip.dispose();
      lights.dispose();
      punchLine.geometry.dispose();
      punchLine.material.dispose();
      for (const object of [gapLine, gapEnds]) {
        object.geometry.dispose();
        object.material.dispose();
      }
      ctx.scene.remove(stationRoot);
      ctx.scene.remove(root);
      markMaterials.up.dispose();
      markMaterials.down.dispose();
    },
  };
}
