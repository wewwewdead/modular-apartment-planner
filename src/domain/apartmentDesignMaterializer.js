import { createEgressExit, createEgressRoute } from './servicesCoordination';
import { createDoor, createFixture, createRoom, createStair, createWall, createWindow } from './models';
import { deriveStairClearanceEnvelope } from './stairValidation';
import {
  apartmentDesignInputSignature,
  createApartmentDesignProfile,
  createApartmentDesignState,
} from './apartmentDesign';
import { DESIGN_CONFIDENCE } from './trustModels';
import { polygonCentroid } from '@/geometry/polygon';
import { projectPointOnWall, positionOnWall, wallLength } from '@/geometry/wallGeometry';

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

function rectangle(minX, minY, maxX, maxY) {
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

function pointOnSegment(point, start, end, tolerance = 2) {
  const cross = (end.x - start.x) * (point.y - start.y) - (end.y - start.y) * (point.x - start.x);
  if (Math.abs(cross) > tolerance * Math.max(1, Math.hypot(end.x - start.x, end.y - start.y))) return false;
  return (
    point.x >= Math.min(start.x, end.x) - tolerance &&
    point.x <= Math.max(start.x, end.x) + tolerance &&
    point.y >= Math.min(start.y, end.y) - tolerance &&
    point.y <= Math.max(start.y, end.y) + tolerance
  );
}

function findWallAtPoint(walls, point, minimumLength = 0) {
  return (walls || []).find((wall) => wallLength(wall) >= minimumLength && pointOnSegment(point, wall.start, wall.end));
}

function generated(entity, designId, testFitId, extra = {}) {
  return {
    ...entity,
    ...extra,
    generatedByApartmentDesignId: designId,
    generatedByTestFitId: testFitId,
    confidence: DESIGN_CONFIDENCE.MODELED,
  };
}

function roomEntity(block, instance, name, spaceType, points, designId, requirementId = null, idSuffix = spaceType) {
  return generated(createRoom(name, points), designId, block.testFitId, {
    id: `${block.id}_${idSuffix}_room`,
    useCategory: 'rentable',
    spaceType,
    unitInstanceId: instance.id,
    spaceRequirementId: requirementId,
  });
}

function roomRequirementId(unitType, spaceType) {
  return (unitType?.spaceRequirements || []).find((entry) => entry.spaceType === spaceType)?.id || null;
}

function unitMainSpaces(category) {
  if (category === 'one_bedroom')
    return [
      { spaceType: 'bedroom', name: 'Bedroom', fraction: 0.4 },
      { spaceType: 'living', name: 'Living area', fraction: 0.6 },
    ];
  if (category === 'two_bedroom')
    return [
      { spaceType: 'bedroom', name: 'Bedroom 1', fraction: 0.25 },
      { spaceType: 'bedroom', name: 'Bedroom 2', fraction: 0.25 },
      { spaceType: 'living', name: 'Living area', fraction: 0.5 },
    ];
  return [{ spaceType: 'living_sleeping', name: 'Living / sleeping area', fraction: 1 }];
}

function createHostedOpening(factory, wall, center, width, id, designId, testFitId, extra = {}) {
  const safeWidth = Math.min(width, Math.max(100, wallLength(wall) - 200));
  return generated(factory(wall.id, projectPointOnWall(wall, center), safeWidth), designId, testFitId, {
    id,
    ...extra,
  });
}

function detailUnit({ floor, block, instance, unitType, corridor, shaft, profile, designId }) {
  const unitBounds = bounds(block.polygon);
  const corridorBounds = bounds(corridor.polygon);
  const width = unitBounds.maxX - unitBounds.minX;
  const depth = unitBounds.maxY - unitBounds.minY;
  const corridorAtTop = Math.abs(unitBounds.maxY - corridorBounds.minY) <= 2;
  const corridorAtBottom = Math.abs(unitBounds.minY - corridorBounds.maxY) <= 2;
  if (!corridorAtTop && !corridorAtBottom)
    return { error: 'Unit does not share a supported horizontal boundary with the corridor.' };
  const serviceDepth = Math.min(profile.serviceBandDepth, depth * 0.45);
  const bathroomWidth = Math.min(profile.bathroomWidth, width * 0.38);
  const serviceMinY = corridorAtTop ? unitBounds.maxY - serviceDepth : unitBounds.minY;
  const serviceMaxY = corridorAtTop ? unitBounds.maxY : unitBounds.minY + serviceDepth;
  const mainMinY = corridorAtTop ? unitBounds.minY : serviceMaxY;
  const mainMaxY = corridorAtTop ? serviceMinY : unitBounds.maxY;
  const bathroomMinX = unitBounds.maxX - bathroomWidth;
  const blockWithSource = block;
  const mainDefinitions = unitMainSpaces(unitType?.category);
  let currentX = unitBounds.minX;
  const mainRooms = mainDefinitions.map((definition, index) => {
    const nextX = index === mainDefinitions.length - 1 ? unitBounds.maxX : currentX + width * definition.fraction;
    const room = roomEntity(
      blockWithSource,
      instance,
      `${instance.name} · ${definition.name}`,
      definition.spaceType,
      rectangle(currentX, mainMinY, nextX, mainMaxY),
      designId,
      roomRequirementId(unitType, definition.spaceType),
      `${definition.spaceType}_${index + 1}`,
    );
    currentX = nextX;
    return room;
  });
  const kitchen = roomEntity(
    blockWithSource,
    instance,
    `${instance.name} · Kitchen`,
    'kitchen',
    rectangle(unitBounds.minX, serviceMinY, bathroomMinX, serviceMaxY),
    designId,
    roomRequirementId(unitType, 'kitchen'),
  );
  const bathroom = roomEntity(
    blockWithSource,
    instance,
    `${instance.name} · Bathroom`,
    'bathroom',
    rectangle(bathroomMinX, serviceMinY, unitBounds.maxX, serviceMaxY),
    designId,
    roomRequirementId(unitType, 'bathroom'),
  );
  const rooms = [...mainRooms, kitchen, bathroom];

  const partitionY = corridorAtTop ? serviceMinY : serviceMaxY;
  const partition = generated(
    createWall({ x: unitBounds.minX, y: partitionY }, { x: unitBounds.maxX, y: partitionY }),
    designId,
    block.testFitId,
    { id: `${block.id}_service_partition` },
  );
  const bathPartition = generated(
    createWall({ x: bathroomMinX, y: serviceMinY }, { x: bathroomMinX, y: serviceMaxY }),
    designId,
    block.testFitId,
    { id: `${block.id}_bath_partition` },
  );
  const mainPartitions = [];
  let splitX = unitBounds.minX;
  for (let index = 0; index < mainDefinitions.length - 1; index += 1) {
    splitX += width * mainDefinitions[index].fraction;
    mainPartitions.push(
      generated(createWall({ x: splitX, y: mainMinY }, { x: splitX, y: mainMaxY }), designId, block.testFitId, {
        id: `${block.id}_main_partition_${index + 1}`,
      }),
    );
  }
  const walls = [partition, bathPartition, ...mainPartitions];
  const availableWalls = [...(floor.walls || []), ...walls];
  const entryY = corridorAtTop ? unitBounds.maxY : unitBounds.minY;
  const entryCenter = { x: (unitBounds.minX + bathroomMinX) / 2, y: entryY };
  const entryWall = findWallAtPoint(availableWalls, entryCenter, profile.entryDoorWidth + 100);
  const primaryRoom =
    mainRooms.find((room) => ['living', 'living_sleeping'].includes(room.spaceType)) || mainRooms.at(-1);
  const primaryBounds = bounds(primaryRoom.points);
  const kitchenAccessMinX = Math.max(primaryBounds.minX, unitBounds.minX);
  const kitchenAccessMaxX = Math.min(primaryBounds.maxX, bathroomMinX);
  const kitchenDoorCenter = {
    x: (kitchenAccessMinX + Math.max(kitchenAccessMinX + 100, kitchenAccessMaxX)) / 2,
    y: partitionY,
  };
  const bathroomDoorCenter = { x: (bathroomMinX + unitBounds.maxX) / 2, y: partitionY };
  const exteriorY = corridorAtTop ? unitBounds.minY : unitBounds.maxY;
  if (!entryWall) return { error: 'No normalized unit-to-corridor wall was found for the entry door.' };

  const entryDoor = createHostedOpening(
    (wallId, offset, openingWidth) =>
      createDoor(wallId, offset, openingWidth, corridorAtTop ? 'left' : 'right', 'swing'),
    entryWall,
    entryCenter,
    profile.entryDoorWidth,
    `${block.id}_entry_door`,
    designId,
    block.testFitId,
    { unitInstanceId: instance.id, role: 'unit_entry' },
  );
  const kitchenDoor = createHostedOpening(
    (wallId, offset, openingWidth) => createDoor(wallId, offset, openingWidth, 'left', 'sliding'),
    partition,
    kitchenDoorCenter,
    profile.internalDoorWidth,
    `${block.id}_kitchen_door`,
    designId,
    block.testFitId,
    { unitInstanceId: instance.id, role: 'internal_passage' },
  );
  const bathroomDoor = createHostedOpening(
    (wallId, offset, openingWidth) => createDoor(wallId, offset, openingWidth, 'left', 'sliding'),
    partition,
    bathroomDoorCenter,
    profile.internalDoorWidth,
    `${block.id}_bathroom_door`,
    designId,
    block.testFitId,
    { unitInstanceId: instance.id, role: 'bathroom_entry' },
  );
  const doors = [entryDoor, kitchenDoor, bathroomDoor];
  const doorPoints = {
    entry: positionOnWall(entryWall, entryDoor.offset),
    kitchen: positionOnWall(partition, kitchenDoor.offset),
  };

  const exteriorWall = findWallAtPoint(
    availableWalls,
    { x: (unitBounds.minX + unitBounds.maxX) / 2, y: exteriorY },
    500,
  );
  const windows = [];
  if (exteriorWall) {
    for (const [index, room] of mainRooms.entries()) {
      const roomBounds = bounds(room.points);
      const center = { x: (roomBounds.minX + roomBounds.maxX) / 2, y: exteriorY };
      windows.push(
        createHostedOpening(
          (wallId, offset, openingWidth) => createWindow(wallId, offset, openingWidth, 'awning', 'left'),
          exteriorWall,
          center,
          Math.min(profile.exteriorWindowWidth, roomBounds.maxX - roomBounds.minX - 300),
          `${block.id}_window_${index + 1}`,
          designId,
          block.testFitId,
          { unitInstanceId: instance.id, roomId: room.id, role: 'natural_light_ventilation' },
        ),
      );
    }
  }

  const fixtures = [];
  for (const room of mainRooms) {
    const roomBounds = bounds(room.points);
    const fixtureType = room.spaceType === 'living' ? 'sofa' : 'bed';
    fixtures.push(
      generated(
        createFixture(fixtureType, (roomBounds.minX + roomBounds.maxX) / 2, (roomBounds.minY + roomBounds.maxY) / 2),
        designId,
        block.testFitId,
        { id: `${room.id}_${fixtureType}`, roomId: room.id, unitInstanceId: instance.id },
      ),
    );
  }
  const kitchenBounds = bounds(kitchen.points);
  const kitchenCounterY = corridorAtTop
    ? kitchenBounds.minY + Math.min(350, (kitchenBounds.maxY - kitchenBounds.minY) / 2)
    : kitchenBounds.maxY - Math.min(350, (kitchenBounds.maxY - kitchenBounds.minY) / 2);
  fixtures.push(
    generated(
      createFixture('kitchenTop', (kitchenBounds.minX + kitchenBounds.maxX) / 2, kitchenCounterY, {
        width: Math.max(800, Math.min(1800, kitchenBounds.maxX - kitchenBounds.minX - 600)),
      }),
      designId,
      block.testFitId,
      {
        id: `${kitchen.id}_kitchen_top`,
        roomId: kitchen.id,
        unitInstanceId: instance.id,
        plumbingShaftId: shaft?.id || null,
      },
    ),
  );
  const bathroomBounds = bounds(bathroom.points);
  const bathCenterX = (bathroomBounds.minX + bathroomBounds.maxX) / 2;
  fixtures.push(
    generated(
      createFixture('toilet', bathCenterX, bathroomBounds.minY + (bathroomBounds.maxY - bathroomBounds.minY) * 0.3),
      designId,
      block.testFitId,
      {
        id: `${bathroom.id}_toilet`,
        roomId: bathroom.id,
        unitInstanceId: instance.id,
        plumbingShaftId: shaft?.id || null,
      },
    ),
  );
  fixtures.push(
    generated(
      createFixture('lavatory', bathCenterX, bathroomBounds.minY + (bathroomBounds.maxY - bathroomBounds.minY) * 0.72),
      designId,
      block.testFitId,
      {
        id: `${bathroom.id}_lavatory`,
        roomId: bathroom.id,
        unitInstanceId: instance.id,
        plumbingShaftId: shaft?.id || null,
      },
    ),
  );
  return { rooms, walls, doors, windows, fixtures, primaryRoom, doorPoints };
}

function stairForTransition({ fromFloor, toFloor, block, targetSlab, profile, designId, testFitId }) {
  if (!block || !targetSlab) return null;
  const stairBounds = bounds(block.polygon);
  const width = stairBounds.maxX - stairBounds.minX;
  const depth = stairBounds.maxY - stairBounds.minY;
  const rise = (toFloor.elevation || 0) - (fromFloor.elevation || 0);
  if (rise <= 0) return null;
  const risers = Math.max(2, Math.ceil(rise / profile.targetRiserHeight));
  const riserHeight = rise / risers;
  const verticalRun = depth >= width;
  const availableRun = Math.max(100, (verticalRun ? depth : width) - 200);
  const treadDepth = Math.min(profile.treadDepth, availableRun / risers);
  const stairWidth = Math.min(profile.stairWidth, Math.max(100, (verticalRun ? width : depth) - 300));
  const startPoint = verticalRun
    ? { x: (stairBounds.minX + stairBounds.maxX) / 2, y: stairBounds.minY + 100 }
    : { x: stairBounds.minX + 100, y: (stairBounds.minY + stairBounds.maxY) / 2 };
  const stair = generated(
    createStair(
      startPoint,
      stairWidth,
      risers,
      riserHeight,
      treadDepth,
      { angle: verticalRun ? 90 : 0 },
      { fromFloorId: fromFloor.id, toFloorId: toFloor.id },
      { coordination: { minimumHeadroom: profile.minimumHeadroom } },
    ),
    designId,
    testFitId,
    { id: `${designId}_${fromFloor.id}_${toFloor.id}_stair`, name: `${fromFloor.name} to ${toFloor.name}` },
  );
  const opening = {
    id: `${stair.id}_clearance_opening`,
    name: `${stair.name} headroom opening`,
    purpose: 'stair',
    boundaryPoints: deriveStairClearanceEnvelope(stair, fromFloor, targetSlab, profile.minimumHeadroom),
    generatedByApartmentDesignId: designId,
    generatedByTestFitId: testFitId,
    confidence: DESIGN_CONFIDENCE.MODELED,
  };
  stair.coordination.clearanceOpeningRef = { floorId: toFloor.id, slabId: targetSlab.id, openingId: opening.id };
  return { stair, opening };
}

function authoredGeometryBlocksDetail(project, designId, testFitId) {
  return (project.floors || []).some((floor) =>
    ['rooms', 'walls', 'doors', 'windows', 'fixtures', 'stairs'].some((collection) =>
      (floor[collection] || []).some(
        (entity) => entity.generatedByApartmentDesignId !== designId && entity.generatedByTestFitId !== testFitId,
      ),
    ),
  );
}

export function materializeAcceptedApartmentDesign(project, profileOverrides = {}) {
  const acceptedId = project?.building?.acceptedTestFitId;
  const option = (project?.building?.testFitOptions || []).find((entry) => entry.id === acceptedId);
  if (!option)
    return {
      ok: false,
      code: 'accepted-test-fit-required',
      message: 'Accept a current feasible test fit before detailing apartments.',
    };
  const profile = createApartmentDesignProfile({ ...project.building.apartmentDesignProfile, ...profileOverrides });
  const designId = `${acceptedId}_apartment_design`;
  if (authoredGeometryBlocksDetail(project, designId, acceptedId)) {
    return {
      ok: false,
      code: 'authored-apartment-geometry-protected',
      message: 'Apartment detailing will not overwrite manually authored rooms, walls, openings, fixtures, or stairs.',
    };
  }
  const shaft =
    (project.building.systems?.plumbing?.shafts || []).find((entry) => entry.generatedByTestFitId === acceptedId) ||
    null;
  const typeById = new Map((project.building.unitTypes || []).map((entry) => [entry.id, entry]));
  const instanceById = new Map((project.building.unitInstances || []).map((entry) => [entry.id, entry]));
  const refs = Object.fromEntries(
    ['rooms', 'walls', 'doors', 'windows', 'fixtures', 'stairs', 'slabOpenings', 'egressExits', 'egressRoutes'].map(
      (key) => [key, []],
    ),
  );
  const unitRouteBasis = [];
  const cleanedFloors = (project.floors || []).map((floor) => ({
    ...floor,
    rooms: (floor.rooms || []).filter(
      (entry) => !entry.generatedByApartmentDesignId && entry.spaceType !== 'unit_block',
    ),
    walls: (floor.walls || []).filter((entry) => !entry.generatedByApartmentDesignId),
    doors: (floor.doors || []).filter((entry) => !entry.generatedByApartmentDesignId),
    windows: (floor.windows || []).filter((entry) => !entry.generatedByApartmentDesignId),
    fixtures: (floor.fixtures || []).filter((entry) => !entry.generatedByApartmentDesignId),
    stairs: (floor.stairs || []).filter((entry) => !entry.generatedByApartmentDesignId),
    slabs: (floor.slabs || []).map((slab) => ({
      ...slab,
      openings: (slab.openings || []).filter((entry) => !entry.generatedByApartmentDesignId),
    })),
  }));
  const detailedFloors = cleanedFloors.map((floor, levelIndex) => {
    const plan = option.floorPlans.find((entry) => entry.levelIndex === levelIndex);
    if (!plan) return floor;
    const corridor = plan.blocks.find((entry) => entry.kind === 'corridor');
    if (!corridor) return floor;
    const additions = { rooms: [], walls: [], doors: [], windows: [], fixtures: [] };
    for (const block of plan.blocks.filter((entry) => entry.kind === 'unit')) {
      const instance = instanceById.get(`${block.id}_instance`);
      if (!instance) return floor;
      const result = detailUnit({
        floor: { ...floor, walls: [...floor.walls, ...additions.walls] },
        block: { ...block, testFitId: acceptedId },
        instance,
        unitType: typeById.get(instance.typeId),
        corridor,
        shaft,
        profile,
        designId,
      });
      if (result.error) return { ...floor, apartmentDesignError: result.error };
      for (const key of Object.keys(additions)) additions[key].push(...result[key]);
      unitRouteBasis.push({
        floorId: floor.id,
        instanceId: instance.id,
        primaryRoom: result.primaryRoom,
        doorPoints: result.doorPoints,
      });
    }
    for (const [key, entities] of Object.entries(additions)) refs[key].push(...entities.map((entry) => entry.id));
    return {
      ...floor,
      rooms: [...floor.rooms, ...additions.rooms],
      walls: [...floor.walls, ...additions.walls],
      doors: [...floor.doors, ...additions.doors],
      windows: [...floor.windows, ...additions.windows],
      fixtures: [...floor.fixtures, ...additions.fixtures],
    };
  });
  const detailError = detailedFloors.find((floor) => floor.apartmentDesignError)?.apartmentDesignError;
  if (detailError) return { ok: false, code: 'apartment-detail-geometry-invalid', message: detailError };

  for (let index = 0; index < detailedFloors.length - 1; index += 1) {
    const fromFloor = detailedFloors[index];
    const toFloor = detailedFloors[index + 1];
    const block = option.floorPlans
      .find((entry) => entry.levelIndex === index)
      ?.blocks.find((entry) => entry.kind === 'stair_core');
    const targetSlab = toFloor.slabs?.[0];
    const stairResult = stairForTransition({
      fromFloor,
      toFloor,
      block,
      targetSlab,
      profile,
      designId,
      testFitId: acceptedId,
    });
    if (!stairResult) continue;
    fromFloor.stairs = [...fromFloor.stairs, stairResult.stair];
    toFloor.slabs = toFloor.slabs.map((slab) =>
      slab.id === targetSlab.id ? { ...slab, openings: [...(slab.openings || []), stairResult.opening] } : slab,
    );
    refs.stairs.push(stairResult.stair.id);
    refs.slabOpenings.push(stairResult.opening.id);
  }
  if (shaft) {
    const servedIndexes = (shaft.servedFloorIds || [])
      .map((floorId) => detailedFloors.findIndex((floor) => floor.id === floorId))
      .filter((index) => index >= 0)
      .sort((a, b) => a - b);
    for (const floorIndex of servedIndexes.slice(1)) {
      const floor = detailedFloors[floorIndex];
      const slab = floor.slabs?.[0];
      if (!slab) continue;
      const halfWidth = shaft.width / 2;
      const halfDepth = shaft.depth / 2;
      const opening = {
        id: `${shaft.id}_${floor.id}_opening`,
        name: `${shaft.name} opening`,
        purpose: 'plumbing_riser',
        serviceRef: { kind: 'plumbing', id: shaft.id },
        boundaryPoints: rectangle(
          shaft.origin.x - halfWidth,
          shaft.origin.y - halfDepth,
          shaft.origin.x + halfWidth,
          shaft.origin.y + halfDepth,
        ),
        generatedByApartmentDesignId: designId,
        generatedByTestFitId: acceptedId,
        confidence: DESIGN_CONFIDENCE.MODELED,
      };
      floor.slabs = floor.slabs.map((entry) =>
        entry.id === slab.id ? { ...entry, openings: [...(entry.openings || []), opening] } : entry,
      );
      refs.slabOpenings.push(opening.id);
    }
  }

  const exits = [];
  const routes = [];
  for (const [levelIndex, floor] of detailedFloors.entries()) {
    const plan = option.floorPlans.find((entry) => entry.levelIndex === levelIndex);
    const corridorBlock = plan?.blocks.find((entry) => entry.kind === 'corridor');
    const stairBlock = plan?.blocks.find((entry) => entry.kind === 'stair_core');
    if (!corridorBlock || !stairBlock) continue;
    const corridorCenter = polygonCentroid(corridorBlock.polygon);
    const stairCenter = polygonCentroid(stairBlock.polygon);
    const sharedCenter = { x: bounds(corridorBlock.polygon).maxX, y: corridorCenter.y };
    const stairDoorWall = findWallAtPoint(floor.walls, sharedCenter, profile.internalDoorWidth + 100);
    let stairDoorPoint = stairCenter;
    if (stairDoorWall) {
      const stairDoor = createHostedOpening(
        (wallId, offset, openingWidth) => createDoor(wallId, offset, openingWidth, 'left', 'sliding'),
        stairDoorWall,
        sharedCenter,
        profile.internalDoorWidth,
        `${designId}_${floor.id}_stair_door`,
        designId,
        acceptedId,
        { role: 'stair_access' },
      );
      floor.doors = [...floor.doors, stairDoor];
      refs.doors.push(stairDoor.id);
      stairDoorPoint = positionOnWall(stairDoorWall, stairDoor.offset);
    }
    const exit = generated(
      createEgressExit({
        id: `${designId}_${floor.id}_egress_waypoint`,
        name: `${floor.name} stair/exit waypoint`,
        floorId: floor.id,
        point: stairCenter,
      }),
      designId,
      acceptedId,
      { role: levelIndex === 0 ? 'ground_discharge_for_professional_confirmation' : 'protected_stair_waypoint' },
    );
    exits.push(exit);
    refs.egressExits.push(exit.id);
    for (const basis of unitRouteBasis.filter((entry) => entry.floorId === floor.id)) {
      const route = generated(
        createEgressRoute({
          id: `${designId}_${basis.instanceId}_egress_route`,
          name: `${basis.instanceId} primary circulation path`,
          floorId: floor.id,
          fromRoomId: basis.primaryRoom.id,
          exitId: exit.id,
          points: [
            polygonCentroid(basis.primaryRoom.points),
            basis.doorPoints.kitchen,
            basis.doorPoints.entry,
            corridorCenter,
            stairDoorPoint,
            stairCenter,
          ],
          maximumTravelDistance: profile.maximumEgressTravelDistance,
        }),
        designId,
        acceptedId,
        { role: 'deterministic_unit_to_stair_path' },
      );
      routes.push(route);
      refs.egressRoutes.push(route.id);
    }
  }

  const nextProject = {
    ...project,
    floors: detailedFloors,
    building: {
      ...project.building,
      apartmentDesignProfile: profile,
      apartmentDesign: createApartmentDesignState({
        status: 'detailed',
        sourceTestFitId: acceptedId,
        inputSignature: apartmentDesignInputSignature(project, profile),
        detailedUnitInstanceIds: unitRouteBasis.map((entry) => entry.instanceId),
        generatedEntityRefs: refs,
      }),
      systems: {
        ...project.building.systems,
        egress: {
          ...project.building.systems.egress,
          exits: [
            ...(project.building.systems.egress?.exits || []).filter((entry) => !entry.generatedByApartmentDesignId),
            ...exits,
          ],
          routes: [
            ...(project.building.systems.egress?.routes || []).filter((entry) => !entry.generatedByApartmentDesignId),
            ...routes,
          ],
        },
      },
    },
  };
  return { ok: true, project: nextProject, profile, state: nextProject.building.apartmentDesign, refs };
}
