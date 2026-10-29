import {
  CEILING_FASTENER_HEAD_DEPTH,
  CEILING_FASTENER_HEAD_DIAMETER,
  CEILING_HANGER_PLAN_SIZE,
  CEILING_OPENING_HOUSING_DEPTH,
  CEILING_OPENING_TRIM_DEPTH,
  CEILING_OPENING_TRIM_LAP,
  CEILING_WALL_ANGLE_LEG,
} from '@/domain/defaults';
import {
  CEILING_OPENING_TYPES,
  deriveCeilingDetail,
  getCeilingLocalSpace,
  resolveCeilingBoundary,
} from '@/domain/ceilingModels';
import { CEILING_BOARD_MATERIALS, CEILING_FRAME_MATERIALS } from '@/domain/ceilingProductProfiles';
import { getBulbType, getFixtureType, resolveFixtureBulbId } from '@/domain/lightingCatalog';
import { aimDirectionWorld, fixtureBounceIntensity, fixtureLightIntensity, kelvinToRgb } from './lightingMath';

// Square footprint for a suspension rod/wire — thin enough to read as a hanger,
// thick enough to survive the preview's 1 mm minimum box dimension. Hanger
// placement keeps half of this clear of every ceiling edge, so the box drawn
// here is exactly the space the domain reserved for it.
const HANGER_PLAN_SIZE = CEILING_HANGER_PLAN_SIZE;
// Manual-mode ceilings sit directly on their attachment plane, so the grid has
// nothing to hang from; anything shorter than this is a modelling artefact.
const MIN_HANGER_LENGTH = 5;
// A can shallower than this is not a can; a ceiling with less plenum than this
// gets the fitting's face and nothing behind it, which is the truth.
const MIN_HOUSING_DEPTH = 20;

/**
 * What sits inside the trim, per kind of opening.
 *
 * A hatch is a lid: the same board as the ceiling, filling the cut flush. A
 * downlight is a lens in the same plane. A diffuser hangs a few millimetres
 * proud, the way a pressed face plate does. A custom cut-out gets nothing —
 * it is a hole made for something this model does not know about, and inventing
 * a fitting for it would be drawing something that is not there. Its trim still
 * makes it a finished, pickable opening.
 */
const OPENING_FACES = Object.freeze({
  [CEILING_OPENING_TYPES.ACCESS_HATCH]: { materialKey: 'ceilingHatch', drop: 0, extraThickness: 0 },
  [CEILING_OPENING_TYPES.DOWNLIGHT]: { materialKey: 'ceilingLuminaire', drop: 0, extraThickness: 0 },
  [CEILING_OPENING_TYPES.DIFFUSER]: { materialKey: 'ceilingDiffuser', drop: 2, extraThickness: 2 },
});

/** Openings whose fitting continues above the boards, into the plenum. */
const OPENING_HOUSINGS = new Set([CEILING_OPENING_TYPES.DOWNLIGHT, CEILING_OPENING_TYPES.DIFFUSER]);

/**
 * The light leaves this far below the lamp it belongs to.
 *
 * A source placed exactly where its own lens is spends its first millimetres
 * inside the meshes that carry it, and what comes back is shadow acne on the
 * ceiling around every fixture — the one artefact that reads as "the renderer is
 * broken" rather than "the lamp is dim". Clearing the housing costs nothing that
 * can be seen from the floor.
 */
const FIXTURE_LIGHT_CLEARANCE = 25;

/** A cone this wide has stopped being a cone a spot light can express. */
const MAX_SPOT_HALF_ANGLE = Math.PI / 2 - 0.01;

/**
 * How far a luminaire reaches past the boards, by mounting — an envelope for
 * its bounds rather than a model of it. The meshes are the renderer's business;
 * the bounds only have to contain them, and one figure per mounting is enough
 * for that without the two files having to agree on millimetres.
 */
const FIXTURE_ENVELOPE = Object.freeze({
  recessed: Object.freeze({ above: 240, below: 30 }),
  surface: Object.freeze({ above: 0, below: 300 }),
  pendant: Object.freeze({ above: 0, below: 260 }),
  track: Object.freeze({ above: 0, below: 260 }),
});

/**
 * How wide a patch of ceiling one aggregated bounce light stands in for.
 *
 * The indirect field is uniform by construction — that is the whole argument in
 * `fixtureBounceIntensity` — so thirty downlights over one room are thirty
 * copies of the same fiction, and every one of them is another iteration of the
 * fragment loop on every lit surface in the building. Summing them into a single
 * lamp carrying the whole flux is the same fiction stated once, for a thirtieth
 * of the cost.
 *
 * Six metres because the stand-in is only exact at `r* = √(A/4π)` — 1.8 to 2.8 m
 * for ordinary rooms — and a cell that size keeps every point in it within reach
 * of its own bounce rather than borrowing one from the far end of an open plan.
 * Measured in the ceiling's own U/V and anchored at its origin, so a single-room
 * ceiling is one cell wherever in the plan it happens to sit.
 */
const BOUNCE_CELL_MM = 6000;

/** The aggregate has no one aim to inherit; a fill arrives from everywhere. */
const BOUNCE_AIM = Object.freeze({ x: 0, y: -1, z: 0 });

function uvRectOutline(rect) {
  return [
    { u: rect.u0, v: rect.v0 },
    { u: rect.u1, v: rect.v0 },
    { u: rect.u1, v: rect.v1 },
    { u: rect.u0, v: rect.v1 },
  ];
}

/** Grow a UV rectangle by `lap` on every side, stopping at the ceiling's edges. */
function lappedRect(rect, lap, length, depth) {
  return {
    u0: Math.max(0, rect.u0 - lap),
    u1: Math.min(length, rect.u1 + lap),
    v0: Math.max(0, rect.v0 - lap),
    v1: Math.min(depth, rect.v1 + lap),
  };
}

/**
 * One opening as the things you would actually see: a trim ring lapping onto
 * the boards around the cut, whatever fitting sits in the cut, and the housing
 * that fitting needs above the ceiling. All three answer to the opening's id, so
 * selecting it in the RCP editor lights the whole fitting at once.
 */
function buildCeilingOpeningObjects(opening, context) {
  const { toPlan, elevations, boardThickness, rotation, length, depth, shared } = context;
  const rect = { u0: opening.u0, u1: opening.u1, v0: opening.v0, v1: opening.v1 };
  if (rect.u1 - rect.u0 <= 0 || rect.v1 - rect.v0 <= 0) return [];

  const metadata = (extra) => ({
    ...shared,
    ceilingDetailKind: 'opening',
    ceilingDetailElementId: opening.id,
    openingType: opening.type,
    ...extra,
  });
  const cut = uvRectOutline(rect).map(toPlan);
  const objects = [
    createPrismDescriptor(
      `${opening.id}:trim`,
      'ceiling',
      uvRectOutline(lappedRect(rect, CEILING_OPENING_TRIM_LAP, length, depth)).map(toPlan),
      elevations.boardUnderside - CEILING_OPENING_TRIM_DEPTH,
      CEILING_OPENING_TRIM_DEPTH,
      metadata({ materialKey: 'ceilingOpeningTrim', holes: [cut] }),
    ),
  ];

  const face = OPENING_FACES[opening.type];
  if (face) {
    objects.push(
      createPrismDescriptor(
        `${opening.id}:face`,
        'ceiling',
        cut,
        elevations.boardUnderside - face.drop,
        boardThickness + face.extraThickness,
        metadata({ materialKey: face.materialKey }),
      ),
    );
  }

  // Clipped to the plenum the ceiling really has: a ceiling hung 40 mm below a
  // beam has nowhere to put a 120 mm can, and drawing one would push it through
  // the structure above.
  const housingDepth = Math.min(CEILING_OPENING_HOUSING_DEPTH, elevations.attachment - elevations.boardTop);
  if (OPENING_HOUSINGS.has(opening.type) && housingDepth >= MIN_HOUSING_DEPTH) {
    objects.push(
      createBoxDescriptor(
        `${opening.id}:housing`,
        'ceiling',
        toPlan({ u: (rect.u0 + rect.u1) / 2, v: (rect.v0 + rect.v1) / 2 }),
        { x: rect.u1 - rect.u0, y: housingDepth, z: rect.v1 - rect.v0 },
        elevations.boardTop,
        rotation,
        metadata({ materialKey: 'ceilingOpeningHousing' }),
      ),
    );
  }

  return objects;
}

function createBoundsFromPoints(points, baseElevation, topElevation) {
  if (!points?.length) {
    return {
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0,
      minElevation: baseElevation,
      maxElevation: topElevation,
    };
  }

  return {
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxY: Math.max(...points.map((point) => point.y)),
    minElevation: baseElevation,
    maxElevation: topElevation,
  };
}

function createPrismDescriptor(id, kind, outline, baseElevation, height, metadata = {}) {
  return {
    id,
    kind,
    geometry: 'prism',
    // Winding is not normalised here: the ceiling's V axis is flipped relative
    // to plan Y, so every local→plan conversion reverses the loop. ExtrudeGeometry
    // forces the shape clockwise and its holes counter-clockwise regardless.
    outline: outline.map((point) => ({ x: point.x, y: point.y })),
    holes: (metadata.holes || []).map((hole) => hole.map((point) => ({ x: point.x, y: point.y }))),
    baseElevation,
    height,
    materialKey: metadata.materialKey || kind,
    metadata,
    bounds: createBoundsFromPoints(outline, baseElevation, baseElevation + height),
  };
}

/** The four plan corners of a centred rectangle spun to the ceiling's angle. */
function rotatedFootprint(center, halfX, halfZ, rotation) {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return [
    { x: -halfX, z: -halfZ },
    { x: halfX, z: -halfZ },
    { x: halfX, z: halfZ },
    { x: -halfX, z: halfZ },
  ].map((corner) => ({
    x: center.x + corner.x * cos - corner.z * sin,
    y: center.y + corner.x * sin + corner.z * cos,
  }));
}

function createBoxDescriptor(id, kind, center, size, baseElevation, rotation, metadata = {}) {
  const corners = rotatedFootprint(center, size.x / 2, size.z / 2, rotation);

  return {
    id,
    kind,
    geometry: 'box',
    center: { x: center.x, y: center.y },
    size,
    rotation,
    baseElevation,
    materialKey: metadata.materialKey || kind,
    metadata,
    bounds: createBoundsFromPoints(corners, baseElevation, baseElevation + size.y),
  };
}

function createSegmentDescriptor(id, kind, startPlan, endPlan, elevation, leg, metadata = {}) {
  return {
    id,
    kind,
    geometry: 'segment3d',
    // World space: x = plan x, y = elevation, z = plan y (see planPointToWorld).
    start: { x: startPlan.x, y: elevation, z: startPlan.y },
    end: { x: endPlan.x, y: elevation, z: endPlan.y },
    thickness: leg,
    crossSection: { width: leg, height: leg },
    materialKey: metadata.materialKey || kind,
    metadata,
    bounds: {
      minX: Math.min(startPlan.x, endPlan.x),
      maxX: Math.max(startPlan.x, endPlan.x),
      minY: Math.min(startPlan.y, endPlan.y),
      maxY: Math.max(startPlan.y, endPlan.y),
      minElevation: elevation - leg / 2,
      maxElevation: elevation + leg / 2,
    },
  };
}

/**
 * Which aggregated bounce light a fixture's flux belongs to — its cell in the
 * ceiling's own U/V grid. A pure function of the fixture's position, so the
 * lamp descriptor and the bounce descriptor derive the same id without having to
 * be built together.
 */
function bounceCellKey(fixture) {
  return `${Math.floor(fixture.u / BOUNCE_CELL_MM)}.${Math.floor(fixture.v / BOUNCE_CELL_MM)}`;
}

function bounceLightId(ceilingId, fixture) {
  return `${ceilingId}:bounce:${bounceCellKey(fixture)}`;
}

/**
 * One luminaire as the two things the renderer needs from it: a fitting to draw
 * and the beam it throws. The light the room throws back is a third thing, but
 * it belongs to the room rather than to the lamp — see `buildCeilingBounceLights`.
 *
 * They are separate descriptors because they are separate objects in the scene
 * — a mesh group and a THREE light — but they answer to the same fixture id,
 * so picking either of them in the RCP editor lights the whole thing. Everything
 * here is data: the aperture the fitting is built around, the lamp inside it,
 * the direction it is aimed, and photometry already converted into what a
 * renderer takes. Nothing in this file knows what a SpotLight is.
 *
 * Multi-lamp fixtures get ONE beam. A chandelier's five candles are five shadow
 * maps and five shading passes for a source the eye reads as one glowing thing
 * hanging in one place; `photometrics.lumens` is already the whole luminaire's
 * output, and the five bulbs still glow individually because they are meshes
 * with an emissive material.
 */
function buildCeilingLightFixtureObjects(fixture, context) {
  const { space, shared, ceilingId } = context;
  const type = getFixtureType(fixture.fixtureType);
  const bulb = getBulbType(resolveFixtureBulbId(type.id, fixture.bulbType));
  const photometrics = fixture.photometrics;
  const metadata = {
    ...shared,
    ceilingDetailKind: 'fixture',
    ceilingDetailElementId: fixture.id,
    fixtureType: type.id,
  };

  // The drop is read back off the resolved elevations rather than off the
  // stored field: the domain has already decided whether this kind of fixture
  // hangs at all, and a can that stored a drop must not grow a stem here.
  const dropMm = fixture.elevations.mountPlane - fixture.elevations.bulb;
  const rectangular = type.apertureLengthMm != null;
  const aperture = rectangular
    ? { widthMm: type.apertureMm, lengthMm: type.apertureLengthMm }
    : { radiusMm: type.apertureMm / 2 };
  const halfU = rectangular ? aperture.widthMm / 2 : aperture.radiusMm;
  const halfV = rectangular ? aperture.lengthMm / 2 : aperture.radiusMm;
  const aim = aimDirectionWorld(fixture.aim, space.axisU, space.axisV);
  const color = kelvinToRgb(photometrics.colorTempK);
  const envelope = FIXTURE_ENVELOPE[type.mount] || FIXTURE_ENVELOPE.recessed;

  const housing = {
    id: `${fixture.id}:fixture`,
    kind: 'ceiling',
    geometry: 'ceilingLightFixture',
    fixtureType: type.id,
    aperture,
    bulb: {
      diameterMm: bulb.bulbDiameterMm,
      lengthMm: bulb.bulbLengthMm,
      count: type.bulbCount,
      flat: Boolean(bulb.flat),
    },
    dropMm,
    aim,
    emissive: { color },
    center: { x: fixture.plan.x, y: fixture.plan.y },
    baseElevation: fixture.elevations.mountPlane,
    // The same angle the framing boxes carry, so a 2×4 troffer lies along the
    // ceiling's own grid rather than across it.
    rotation: space.rotation,
    materialKey: 'ceilingLuminaire',
    metadata: { ...metadata, materialKey: 'ceilingLuminaire' },
    bounds: createBoundsFromPoints(
      rotatedFootprint(fixture.plan, halfU, halfV, space.rotation),
      fixture.elevations.bulb - envelope.below,
      fixture.elevations.mountPlane + envelope.above,
    ),
  };

  // An omnidirectional lamp throws in every direction, which is a point light;
  // anything with a beam angle — a reflector lamp, or a panel that is a beam
  // angle and nothing else — is a cone, which is a spot.
  const beamAngleDeg = photometrics.beamAngleDeg;
  const isSpot = Number.isFinite(beamAngleDeg) && beamAngleDeg > 0;
  const position = {
    x: fixture.plan.x,
    y: fixture.elevations.bulb - FIXTURE_LIGHT_CLEARANCE,
    z: fixture.plan.y,
  };

  const light = {
    id: `${fixture.id}:light`,
    kind: 'ceiling',
    geometry: 'ceilingLightSource',
    role: 'lamp',
    lightType: isSpot ? 'spot' : 'point',
    position,
    aim,
    color,
    intensity: fixtureLightIntensity(photometrics.lumens, beamAngleDeg),
    // Where this lamp's flux goes when the scene-wide light budget cannot afford
    // to run it as a light of its own: the same flux, spread over the sphere
    // instead of through the beam, added to the bounce fill for its cell. A room
    // past the budget loses the pool under the lamp, not the lamp's lumens.
    bounceLightId: bounceLightId(ceilingId, fixture),
    fillIntensity: fixtureLightIntensity(photometrics.lumens, null),
    // Half the beam, because a spot's angle is measured from its axis to the
    // edge of the cone rather than across it.
    angleRad: isSpot ? Math.min(MAX_SPOT_HALF_ANGLE, ((beamAngleDeg / 2) * Math.PI) / 180) : null,
    penumbra: 0.35,
    castShadow: Boolean(fixture.castShadow),
    // No falloff distance: a lamp's reach is decided by the inverse square, not
    // by a cut-off sphere that would leave a visible edge on the floor.
    distanceMm: 0,
    metadata,
    bounds: {
      minX: position.x,
      maxX: position.x,
      minY: position.z,
      maxY: position.z,
      minElevation: position.y,
      maxElevation: position.y,
    },
  };

  return [housing, light];
}

/**
 * The light a ceiling's lamps put into the room by way of the room itself, as
 * one lamp per patch of ceiling rather than one per fixture.
 *
 * `fixtureBounceIntensity` carries the argument for the figure; this is the
 * argument for where it hangs and how many of it there are. The indirect field
 * has no source position at all, so any point is a fiction — but not every
 * fiction costs the same. Set exactly in the mounting plane, the fittings' own
 * ceiling is edge-on to it and receives nothing, which is both free (`N·L` is
 * zero by coplanarity, so there is no ring of light to tune away) and right: a
 * room lit by recessed downlights has a dark ceiling, and that cave effect is
 * the most recognisable thing about it. A pendant's ceiling is still lit — by
 * the pendant's own lamp hanging below it, which is where that light really
 * comes from.
 *
 * Shadowless, for the same reason the viewport's fill light is: this is standing
 * in for light that has already bounced off everything in the room, and bounce
 * does not cast a shadow. It is also what keeps it out of the eight-caster
 * budget, which belongs to the beams that make legible shadows.
 *
 * Aggregated because the field is uniform and a sum of uniform fields is a
 * uniform field: the cell's intensity is exactly the sum of the fixtures'
 * bounces, so a ceiling emits the same total flux into its indirect term
 * whichever way it is counted. What is lost is *where* inside a cell the fill
 * comes from, which is a property the stand-in never had — and what is bought is
 * that a thirty-can flat carries thirty-one lights instead of sixty.
 */
function buildCeilingBounceLights(fixtures, context) {
  const { shared, ceilingId } = context;
  const cells = new Map();

  for (const fixture of fixtures) {
    const intensity = fixtureBounceIntensity(fixture.photometrics.lumens);
    if (!(intensity > 0)) continue;

    const key = bounceCellKey(fixture);
    let cell = cells.get(key);
    if (!cell) {
      cell = { key, intensity: 0, x: 0, y: 0, elevation: 0, r: 0, g: 0, b: 0 };
      cells.set(key, cell);
    }

    // Flux-weighted throughout: the aggregate stands where the light in the cell
    // actually is, not where the fittings happen to average out — one 3000 lm
    // panel beside three 400 lm cans is a fill that comes from the panel.
    const color = kelvinToRgb(fixture.photometrics.colorTempK);
    cell.intensity += intensity;
    cell.x += fixture.plan.x * intensity;
    cell.y += fixture.plan.y * intensity;
    cell.elevation += fixture.elevations.mountPlane * intensity;
    cell.r += color.r * intensity;
    cell.g += color.g * intensity;
    cell.b += color.b * intensity;
  }

  // Sorted by cell so the descriptors come out in the same order every build —
  // the scene cache compares them positionally, and an order that depended on
  // which fixture was edited last would rebuild lights that had not changed.
  return [...cells.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((cell) => {
      const weight = cell.intensity;
      const position = { x: cell.x / weight, y: cell.elevation / weight, z: cell.y / weight };
      return {
        id: `${ceilingId}:bounce:${cell.key}`,
        kind: 'ceiling',
        geometry: 'ceilingLightSource',
        role: 'bounce',
        lightType: 'point',
        position,
        aim: BOUNCE_AIM,
        // The room has filtered this light but not tinted it: without knowing
        // what the walls are finished in, the lamps' own colour is the only one
        // that is not invented. Mixed colour temperatures average by flux, which
        // is what a room lit by both of them looks like.
        color: { r: cell.r / weight, g: cell.g / weight, b: cell.b / weight },
        intensity: cell.intensity,
        angleRad: null,
        penumbra: 0,
        castShadow: false,
        distanceMm: 0,
        // No `ceilingDetailElementId`: an aggregate belongs to no one fixture, so
        // there is nothing here for the RCP editor to select. It still answers to
        // the ceiling, which is what the plan selects.
        metadata: { ...shared, ceilingDetailKind: 'bounce' },
        bounds: {
          minX: position.x,
          maxX: position.x,
          minY: position.z,
          maxY: position.z,
          minElevation: position.y,
          maxElevation: position.y,
        },
      };
    });
}

/**
 * Ceiling → 3D preview descriptors (pure; no three.js).
 *
 * Boards extrude as prisms from the board underside, the furring/carrier grid
 * stacks above them, wall angles ring the boundary, hangers bridge the carrier
 * tops up to the attachment plane, and every opening gets its trim and fitting.
 *
 * `options.fasteners` draws the screws as well. It is off by default and the
 * RCP editor's own pane is the only thing that turns it on: a room's worth of
 * screws is hundreds of tiny meshes, which is a fair price for the drawing you
 * are working in and a poor one for a whole building seen from outside.
 *
 * `options.hideBoards` leaves the boards out so the grid above them can be
 * looked at — the same "take the cladding off and check the frame" move the wall
 * builder offers per face, except a ceiling has one board plane and so one
 * answer. Everything the boards were hiding stays: furring, carriers, wall
 * angles, hangers, the trim and housing of every opening, and the luminaires.
 * The screws go with the boards, because a screw head hanging in the air where
 * a board used to be is a drawing of nothing.
 */
export function buildCeilingPreviewObjects(ceiling, project, options = {}) {
  if (!ceiling) return [];

  const detail = deriveCeilingDetail(ceiling, project);
  const { configuration, elevations } = detail;
  if (!configuration.enabled || !configuration.face.enabled) return [];
  if (detail.length <= 0 || detail.depth <= 0) return [];

  const space = getCeilingLocalSpace(resolveCeilingBoundary(project, ceiling));
  const toPlan = (point) => space.toPlan(point);
  const shared = { ceilingId: ceiling.id, floorId: ceiling.floorId, sourceId: ceiling.id };

  // Per board, not per ceiling: a board carries the material it is cut from,
  // which is the profile's unless that board was overridden.
  const boardMaterialKey = (panel) =>
    panel.material === CEILING_BOARD_MATERIALS.PLYWOOD ? 'ceilingBoardPlywood' : 'ceilingBoard';
  const framingMaterialKey = (member) =>
    member.material === CEILING_FRAME_MATERIALS.TIMBER ? 'ceilingFramingTimber' : 'ceilingFraming';

  // Not built at all rather than built and filtered: the boards are the one part
  // of this assembly that costs a polygon clip per region, and the whole point
  // of asking for them to be hidden is to look past them.
  const hideBoards = Boolean(options.hideBoards);
  const boards = hideBoards
    ? []
    : detail.panels.flatMap((panel) =>
        panel.regions
          .filter((region) => (region.outline || []).length >= 3)
          .map((region, regionIndex) =>
            createPrismDescriptor(
              `${panel.id}:region:${regionIndex}`,
              'ceiling',
              region.outline.map(toPlan),
              elevations.boardUnderside,
              configuration.face.boardThickness,
              {
                ...shared,
                materialKey: boardMaterialKey(panel),
                ceilingDetailKind: 'panel',
                // The id the RCP editor selects by, so its selection can drive
                // the highlight here. `panel.id` is qualified with the ceiling;
                // this is the bare one the drawing knows.
                ceilingDetailElementId: panel.localId,
                panelLabel: panel.label,
                holes: (region.holes || []).map((hole) => hole.map(toPlan)),
              },
            ),
          ),
      );

  const framing = detail.framing
    .map((member) => {
      if (member.kind === 'wall_angle') {
        return createSegmentDescriptor(
          member.id,
          'ceiling',
          toPlan(member.start),
          toPlan(member.end),
          elevations.furringBottom + CEILING_WALL_ANGLE_LEG / 2,
          CEILING_WALL_ANGLE_LEG,
          {
            ...shared,
            materialKey: framingMaterialKey(member),
            ceilingDetailKind: 'framing',
            ceilingDetailElementId: member.id,
            framingKind: member.kind,
          },
        );
      }

      // The UV rect maps to a box spun to the ceiling frame's plan angle: box
      // local x follows the U axis and, because the frame mirrors V, box local
      // z follows −V — which lands on the same rectangle since the extents are
      // centred.
      const spanX = member.u1 - member.u0;
      const spanZ = member.v1 - member.v0;
      if (spanX <= 0 || spanZ <= 0) return null;

      return createBoxDescriptor(
        member.id,
        'ceiling',
        toPlan({ u: (member.u0 + member.u1) / 2, v: (member.v0 + member.v1) / 2 }),
        { x: spanX, y: member.depth, z: spanZ },
        member.kind === 'carrier' ? elevations.carrierBottom : elevations.furringBottom,
        space.rotation,
        {
          ...shared,
          materialKey: framingMaterialKey(member),
          ceilingDetailKind: 'framing',
          ceilingDetailElementId: member.id,
          framingKind: member.kind,
        },
      );
    })
    .filter(Boolean);

  const hangerLength = elevations.attachment - elevations.carrierTop;
  const hangers =
    hangerLength >= MIN_HANGER_LENGTH
      ? detail.hangers.map((hanger) =>
          createBoxDescriptor(
            hanger.id,
            'ceiling',
            toPlan(hanger),
            { x: HANGER_PLAN_SIZE, y: hangerLength, z: HANGER_PLAN_SIZE },
            elevations.carrierTop,
            space.rotation,
            { ...shared, materialKey: 'ceilingHanger', ceilingDetailKind: 'hanger', ceilingDetailElementId: hanger.id },
          ),
        )
      : [];

  const openingContext = {
    toPlan,
    elevations,
    boardThickness: configuration.face.boardThickness,
    rotation: space.rotation,
    length: detail.length,
    depth: detail.depth,
    shared,
  };
  const openings = detail.openings.flatMap((opening) => buildCeilingOpeningObjects(opening, openingContext));

  // Only the head is drawn, sitting proud of the boards: the shank is inside the
  // furring and would never be seen. The board underside is the datum for it,
  // like everything else on this face — so with the boards gone the screws go
  // too, having nothing left to pin up.
  const fasteners =
    options.fasteners && !hideBoards
      ? detail.fasteners.map((fastener) => {
          const descriptor = createBoxDescriptor(
            fastener.id,
            'ceiling',
            toPlan(fastener),
            { x: CEILING_FASTENER_HEAD_DIAMETER, y: CEILING_FASTENER_HEAD_DEPTH, z: CEILING_FASTENER_HEAD_DIAMETER },
            elevations.boardUnderside - CEILING_FASTENER_HEAD_DEPTH,
            space.rotation,
            {
              ...shared,
              materialKey: 'ceilingFastener',
              ceilingDetailKind: 'fastener',
              ceilingDetailElementId: fastener.id,
              fastenerType: fastener.type,
            },
          );
          descriptor.geometry = 'fastener';
          // Driven upward, unlike a wall screw: the head faces the room below.
          descriptor.axis = 'vertical';
          descriptor.radius = CEILING_FASTENER_HEAD_DIAMETER / 2;
          descriptor.depth = CEILING_FASTENER_HEAD_DEPTH;
          return descriptor;
        })
      : [];

  // Not behind the fastener switch: a room has a handful of luminaires and
  // several hundred screws, and the fixtures are half the reason to look at the
  // ceiling in 3D at all.
  const lighting = detail.lightFixtures.flatMap((fixture) =>
    buildCeilingLightFixtureObjects(fixture, { space, shared, ceilingId: ceiling.id }),
  );
  // After the fixtures, and separately from them: the indirect field is a
  // property of the room the ceiling closes, so it is counted once per patch of
  // ceiling rather than once per lamp.
  const bounceLights = buildCeilingBounceLights(detail.lightFixtures, { shared, ceilingId: ceiling.id });

  return [...boards, ...framing, ...hangers, ...openings, ...fasteners, ...lighting, ...bounceLights];
}
