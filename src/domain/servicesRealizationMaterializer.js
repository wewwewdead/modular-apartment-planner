import { getBeamRenderData } from '@/geometry/beamGeometry';
import { polygonArea, polygonCentroid } from '@/geometry/polygon';
import { intersectionArea } from '@/geometry/polygonBoolean';
import { createElectricalPoint, createEquipmentZone } from './equipmentCoordination';
import { createDrainageRoute, createElectricalRiserZone, routeLength } from './servicesCoordination';
import {
  createServicesRealizationProfile,
  createServicesRealizationState,
  servicesRealizationInputSignature,
} from './servicesRealization';
import { DESIGN_CONFIDENCE } from './trustModels';
import { WET_FIXTURE_TYPES } from './wetCoreModels';

function bounds(points = []) {
  return points.reduce(
    (result, point) => ({
      minX: Math.min(result.minX, point.x),
      minY: Math.min(result.minY, point.y),
      maxX: Math.max(result.maxX, point.x),
      maxY: Math.max(result.maxY, point.y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
}

function rectangle(origin, width, depth) {
  return [
    { x: origin.x - width / 2, y: origin.y - depth / 2 },
    { x: origin.x + width / 2, y: origin.y - depth / 2 },
    { x: origin.x + width / 2, y: origin.y + depth / 2 },
    { x: origin.x - width / 2, y: origin.y + depth / 2 },
  ];
}

function generated(entity, realizationId, testFitId) {
  return {
    ...entity,
    generatedByServicesRealizationId: realizationId,
    generatedByTestFitId: testFitId,
    confidence: DESIGN_CONFIDENCE.MODELED,
    professionalReviewRequired: true,
  };
}

function hasAuthoredSystemsGeometry(project) {
  const systems = project?.building?.systems || {};
  return [
    ...(systems.plumbing?.drainageRoutes || []),
    ...(systems.electrical?.riserZones || []),
    ...(systems.electrical?.panelZones || []),
    ...(systems.electrical?.points || []),
    ...(systems.water?.equipmentZones || []),
    ...(systems.mechanical?.outdoorUnitZones || []),
  ].some((entity) => !entity.generatedByServicesRealizationId);
}

function largestSlab(floor) {
  return (
    [...(floor.slabs || [])].sort(
      (a, b) => polygonArea(b.boundaryPoints || []) - polygonArea(a.boundaryPoints || []),
    )[0] || null
  );
}

function conflictsStructure(floor, footprint) {
  if (
    (floor.columns || []).some(
      (column) => intersectionArea(footprint, rectangle(column, column.width, column.depth)) > 1,
    )
  )
    return true;
  if (
    (floor.beams || []).some((beam) => {
      const outline = getBeamRenderData(beam, floor.columns || [])?.outline || [];
      return outline.length >= 3 && intersectionArea(footprint, outline) > 1;
    })
  )
    return true;
  return (floor.slabs || []).some((slab) =>
    (slab.openings || []).some((opening) => intersectionArea(footprint, opening.boundaryPoints || []) > 1),
  );
}

function findRiserOrigin(floors, profile) {
  const corridor = (floors[0]?.rooms || []).find((room) => room.spaceType === 'shared_corridor');
  const slab = largestSlab(floors[0]);
  if (!corridor || !slab) return null;
  const area = bounds(corridor.points || []);
  const openingWidth = profile.electricalRiserWidth + profile.electricalOpeningClearance * 2;
  const openingDepth = profile.electricalRiserDepth + profile.electricalOpeningClearance * 2;
  const fractions = [0.18, 0.32, 0.46, 0.61, 0.76, 0.88];
  const yFractions = [0.5, 0.35, 0.65];
  for (const xFraction of fractions) {
    for (const yFraction of yFractions) {
      const origin = {
        x: area.minX + (area.maxX - area.minX) * xFraction,
        y: area.minY + (area.maxY - area.minY) * yFraction,
      };
      const footprint = rectangle(origin, openingWidth, openingDepth);
      const footprintArea = polygonArea(footprint);
      const usable = floors.every((floor) => {
        const host = largestSlab(floor);
        return (
          host &&
          intersectionArea(footprint, host.boundaryPoints || []) >= footprintArea - 1 &&
          !conflictsStructure(floor, footprint)
        );
      });
      if (usable) return origin;
    }
  }
  return null;
}

function placeZoneInsideFloor(floor, width, depth, preferred, forbidden = []) {
  const slab = largestSlab(floor);
  if (!slab) return null;
  const area = bounds(slab.boundaryPoints || []);
  const candidates = [
    preferred,
    ...[
      [0.2, 0.2],
      [0.8, 0.2],
      [0.2, 0.8],
      [0.8, 0.8],
      [0.5, 0.2],
      [0.5, 0.8],
    ].map(([x, y]) => ({ x: area.minX + (area.maxX - area.minX) * x, y: area.minY + (area.maxY - area.minY) * y })),
  ].filter(Boolean);
  for (const origin of candidates) {
    const footprint = rectangle(origin, width, depth);
    const size = polygonArea(footprint);
    if (intersectionArea(footprint, slab.boundaryPoints || []) < size - 1) continue;
    if (forbidden.some((entry) => intersectionArea(footprint, entry) > 1)) continue;
    return origin;
  }
  return polygonCentroid(slab.boundaryPoints || []);
}

function equipmentForbidden(floor, extras = []) {
  return [
    ...(floor.columns || []).map((column) => rectangle(column, column.width, column.depth)),
    ...(floor.slabs || []).flatMap((slab) => (slab.openings || []).map((opening) => opening.boundaryPoints || [])),
    ...extras,
  ];
}

function cleanGenerated(project) {
  const systems = project.building.systems;
  const floors = (project.floors || []).map((floor) => ({
    ...floor,
    slabs: (floor.slabs || []).map((slab) => ({
      ...slab,
      openings: (slab.openings || []).filter((opening) => !opening.generatedByServicesRealizationId),
    })),
  }));
  return {
    ...project,
    floors,
    building: {
      ...project.building,
      systems: {
        ...systems,
        plumbing: {
          ...systems.plumbing,
          drainageRoutes: (systems.plumbing?.drainageRoutes || []).filter(
            (entry) => !entry.generatedByServicesRealizationId,
          ),
        },
        electrical: {
          ...systems.electrical,
          riserZones: (systems.electrical?.riserZones || []).filter((entry) => !entry.generatedByServicesRealizationId),
          panelZones: (systems.electrical?.panelZones || []).filter((entry) => !entry.generatedByServicesRealizationId),
          points: (systems.electrical?.points || []).filter((entry) => !entry.generatedByServicesRealizationId),
        },
        water: {
          ...systems.water,
          equipmentZones: (systems.water?.equipmentZones || []).filter(
            (entry) => !entry.generatedByServicesRealizationId,
          ),
        },
        mechanical: {
          ...systems.mechanical,
          outdoorUnitZones: (systems.mechanical?.outdoorUnitZones || []).filter(
            (entry) => !entry.generatedByServicesRealizationId,
          ),
        },
      },
    },
  };
}

export function materializeAcceptedServicesRealization(project, profileOverrides = {}) {
  const building = project?.building || {};
  const acceptedId = building.acceptedTestFitId;
  if (!acceptedId)
    return {
      ok: false,
      code: 'accepted-test-fit-required',
      message: 'Accept a current test fit before realizing building systems.',
    };
  if (building.apartmentDesign?.status !== 'detailed' || building.apartmentDesign?.sourceTestFitId !== acceptedId)
    return {
      ok: false,
      code: 'detailed-apartment-design-required',
      message: 'Detail the accepted apartment basis before realizing building systems.',
    };
  const structural = building.systems?.structural || {};
  if (structural.realization?.status !== 'realized')
    return {
      ok: false,
      code: 'structural-realization-required',
      message: 'Realize the coordinated structural basis before placing service penetrations.',
    };
  if (hasAuthoredSystemsGeometry(project))
    return {
      ok: false,
      code: 'authored-systems-geometry-protected',
      message:
        'Systems realization will not overwrite manually authored routes, risers, points, panels, or equipment zones.',
    };
  const shaft = (building.systems?.plumbing?.shafts || []).find(
    (entry) => (entry.servedFloorIds || []).length === (project.floors || []).length,
  );
  if (!shaft)
    return {
      ok: false,
      code: 'continuous-plumbing-shaft-required',
      message: 'A plumbing shaft serving every modeled level is required.',
    };

  const profile = createServicesRealizationProfile({ ...building.systems?.realizationProfile, ...profileOverrides });
  const realizationId = `${building.id}_services_realization`;
  let base = cleanGenerated(project);
  const riserOrigin = findRiserOrigin(base.floors || [], profile);
  if (!riserOrigin)
    return {
      ok: false,
      code: 'electrical-riser-location-unresolved',
      message: 'No structurally clear electrical-riser penetration fits inside the shared corridor.',
    };
  const floorIds = base.floors.map((floor) => floor.id);
  const riser = generated(
    createElectricalRiserZone({
      id: `${realizationId}_electrical_riser`,
      name: 'Coordinated electrical riser reservation',
      origin: riserOrigin,
      width: profile.electricalRiserWidth,
      depth: profile.electricalRiserDepth,
      servedFloorIds: floorIds,
      openingClearance: profile.electricalOpeningClearance,
    }),
    realizationId,
    acceptedId,
  );
  const refs = {
    drainageRoutes: [],
    electricalRisers: [riser.id],
    panelZones: [],
    electricalPoints: [],
    waterEquipmentZones: [],
    outdoorUnitZones: [],
    slabOpenings: [],
  };
  const openingsByFloor = new Map();
  for (const floor of base.floors.slice(1)) {
    const slab = largestSlab(floor);
    const opening = generated(
      {
        id: `${riser.id}_${floor.id}_opening`,
        name: `${riser.name} opening`,
        purpose: 'electrical_riser',
        serviceRef: { kind: 'electrical', id: riser.id },
        boundaryPoints: rectangle(
          riser.origin,
          riser.width + profile.electricalOpeningClearance * 2,
          riser.depth + profile.electricalOpeningClearance * 2,
        ),
      },
      realizationId,
      acceptedId,
    );
    refs.slabOpenings.push(opening.id);
    openingsByFloor.set(floor.id, { slabId: slab.id, opening });
  }

  const panels = [];
  const electricalPoints = [];
  const drainageRoutes = [];
  const outdoorUnitZones = [];
  const panelByFloor = new Map();
  for (const floor of base.floors) {
    const panelOrigin = placeZoneInsideFloor(
      floor,
      profile.panelWidth,
      profile.panelDepth,
      {
        x: riserOrigin.x + profile.electricalRiserWidth / 2 + profile.panelWidth / 2 + 150,
        y: riserOrigin.y,
      },
      equipmentForbidden(floor, [rectangle(riser.origin, riser.width, riser.depth)]),
    );
    const panel = generated(
      createEquipmentZone({
        id: `${realizationId}_${floor.id}_panel`,
        name: `${floor.name} electrical panel reservation`,
        kind: 'electrical_panel',
        floorId: floor.id,
        location: 'floor',
        origin: panelOrigin,
        width: profile.panelWidth,
        depth: profile.panelDepth,
        clearance: profile.panelClearance,
        servedFloorIds: [floor.id],
      }),
      realizationId,
      acceptedId,
    );
    panels.push(panel);
    panelByFloor.set(floor.id, panel);
    refs.panelZones.push(panel.id);

    const instances = (building.unitInstances || [])
      .filter((instance) => instance.floorId === floor.id)
      .sort((a, b) => a.id.localeCompare(b.id));
    for (const instance of instances) {
      const rooms = (floor.rooms || []).filter((room) => room.unitInstanceId === instance.id);
      const primary =
        rooms.find((room) => ['living', 'living_sleeping', 'bedroom'].includes(room.spaceType)) || rooms[0];
      const kitchen = rooms.find((room) => room.spaceType === 'kitchen') || primary;
      const seeds = [
        { suffix: 'light', kind: 'light', room: primary },
        { suffix: 'outlet', kind: 'outlet', room: primary },
        { suffix: 'kitchen_dedicated', kind: 'dedicated_outlet', room: kitchen },
      ].slice(0, profile.electricalPointsPerUnit);
      while (seeds.length < profile.electricalPointsPerUnit)
        seeds.push({ suffix: `outlet_${seeds.length}`, kind: 'outlet', room: primary });
      for (const seed of seeds.filter((entry) => entry.room)) {
        const point = generated(
          createElectricalPoint({
            id: `${realizationId}_${instance.id}_${seed.suffix}`,
            name: `${instance.name} ${seed.kind.replaceAll('_', ' ')}`,
            kind: seed.kind,
            floorId: floor.id,
            position: polygonCentroid(seed.room.points || []),
            panelZoneId: panel.id,
          }),
          realizationId,
          acceptedId,
        );
        point.roomId = seed.room.id;
        point.unitInstanceId = instance.id;
        electricalPoints.push(point);
        refs.electricalPoints.push(point.id);
      }
    }

    for (const fixture of (floor.fixtures || []).filter(
      (entry) => WET_FIXTURE_TYPES.has(entry.fixtureType) && entry.plumbingShaftId === shaft.id,
    )) {
      const planPoints = [{ ...shaft.origin }, { x: fixture.x, y: fixture.y }];
      const length = routeLength(planPoints);
      const route = generated(
        createDrainageRoute({
          id: `${realizationId}_${floor.id}_${fixture.id}_drainage`,
          name: `${fixture.name || fixture.fixtureType} branch-drainage intent`,
          sourceShaftId: shaft.id,
          floorId: floor.id,
          points: planPoints,
          startInvertElevation: 0,
          endInvertElevation: -(length * profile.minimumDrainSlopePercent) / 100,
          minimumSlopePercent: profile.minimumDrainSlopePercent,
        }),
        realizationId,
        acceptedId,
      );
      route.targetFixtureId = fixture.id;
      route.routingMethod = 'straight_line_planning_intent_not_pipe_layout';
      drainageRoutes.push(route);
      refs.drainageRoutes.push(route.id);
    }

    const slabBounds = bounds(largestSlab(floor)?.boundaryPoints || []);
    const zoneWidth = Math.min(
      Math.max(profile.outdoorUnitWidthPerUnit, instances.length * profile.outdoorUnitWidthPerUnit),
      Math.max(profile.outdoorUnitWidthPerUnit, slabBounds.maxX - slabBounds.minX - 1200),
    );
    const acOrigin = placeZoneInsideFloor(
      floor,
      zoneWidth,
      profile.outdoorUnitDepth,
      {
        x: (slabBounds.minX + slabBounds.maxX) / 2,
        y: slabBounds.minY + profile.outdoorUnitDepth / 2 + 100,
      },
      equipmentForbidden(floor, [rectangle(riser.origin, riser.width, riser.depth)]),
    );
    const acZone = generated(
      createEquipmentZone({
        id: `${realizationId}_${floor.id}_ac_outdoor`,
        name: `${floor.name} AC outdoor-unit reservation`,
        kind: 'ac_outdoor_zone',
        floorId: floor.id,
        location: 'floor',
        origin: acOrigin,
        width: zoneWidth,
        depth: profile.outdoorUnitDepth,
        clearance: profile.equipmentClearance,
        unitCount: instances.length,
        servedFloorIds: [floor.id],
      }),
      realizationId,
      acceptedId,
    );
    outdoorUnitZones.push(acZone);
    refs.outdoorUnitZones.push(acZone.id);
  }

  const firstFloor = base.floors[0];
  const topFloor = base.floors.at(-1);
  const firstForbidden = equipmentForbidden(firstFloor, [rectangle(riser.origin, riser.width, riser.depth)]);
  const topForbidden = equipmentForbidden(topFloor, [rectangle(riser.origin, riser.width, riser.depth)]);
  const pump = generated(
    createEquipmentZone({
      id: `${realizationId}_water_pump`,
      name: 'Domestic-water pump reservation',
      kind: 'water_pump',
      floorId: firstFloor.id,
      location: 'floor',
      origin: placeZoneInsideFloor(
        firstFloor,
        profile.waterPumpWidth,
        profile.waterPumpDepth,
        { x: shaft.origin.x, y: shaft.origin.y + shaft.depth / 2 + profile.waterPumpDepth / 2 + 200 },
        firstForbidden,
      ),
      width: profile.waterPumpWidth,
      depth: profile.waterPumpDepth,
      clearance: profile.equipmentClearance,
      servedFloorIds: floorIds,
    }),
    realizationId,
    acceptedId,
  );
  const tank = generated(
    createEquipmentZone({
      id: `${realizationId}_water_tank`,
      name: 'Upper-level water-storage reservation',
      kind: 'water_tank',
      floorId: topFloor.id,
      location: 'floor',
      origin: placeZoneInsideFloor(
        topFloor,
        profile.waterTankWidth,
        profile.waterTankDepth,
        { x: shaft.origin.x, y: shaft.origin.y },
        topForbidden,
      ),
      width: profile.waterTankWidth,
      depth: profile.waterTankDepth,
      clearance: profile.equipmentClearance,
      servedFloorIds: floorIds,
    }),
    realizationId,
    acceptedId,
  );
  refs.waterEquipmentZones.push(pump.id, tank.id);

  const floors = base.floors.map((floor) => {
    const entry = openingsByFloor.get(floor.id);
    if (!entry) return floor;
    return {
      ...floor,
      slabs: floor.slabs.map((slab) =>
        slab.id === entry.slabId ? { ...slab, openings: [...(slab.openings || []), entry.opening] } : slab,
      ),
    };
  });
  const state = createServicesRealizationState({
    status: 'realized',
    sourceTestFitId: acceptedId,
    sourceApartmentDesignSignature: building.apartmentDesign.inputSignature,
    sourceStructuralRealizationSignature: structural.realization.inputSignature,
    inputSignature: servicesRealizationInputSignature(base, profile),
    generatedEntityRefs: refs,
  });
  base = {
    ...base,
    floors,
    building: {
      ...base.building,
      systems: {
        ...base.building.systems,
        realizationProfile: profile,
        realization: state,
        plumbing: {
          ...base.building.systems.plumbing,
          drainageRoutes: [...(base.building.systems.plumbing?.drainageRoutes || []), ...drainageRoutes],
        },
        electrical: {
          ...base.building.systems.electrical,
          riserZones: [...(base.building.systems.electrical?.riserZones || []), riser],
          panelZones: [...(base.building.systems.electrical?.panelZones || []), ...panels],
          points: [...(base.building.systems.electrical?.points || []), ...electricalPoints],
        },
        water: {
          ...base.building.systems.water,
          equipmentZones: [...(base.building.systems.water?.equipmentZones || []), pump, tank],
        },
        mechanical: {
          ...base.building.systems.mechanical,
          outdoorUnitZones: [...(base.building.systems.mechanical?.outdoorUnitZones || []), ...outdoorUnitZones],
        },
      },
    },
  };
  return { ok: true, project: base, profile, state, refs };
}
