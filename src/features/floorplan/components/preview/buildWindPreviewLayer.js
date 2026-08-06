import * as THREE from 'three';
import { windCellColor } from '@/analysis/windVisualization';

function gridIndex(grid, column, row) {
  if (column < 0 || row < 0 || column >= grid.columns || row >= grid.rows) return -1;
  return row * grid.columns + column;
}

export function sampleWindVector(grid, x, z) {
  if (!grid?.velocityX || !grid?.velocityY || !(grid.cellSize > 0)) return null;
  const gridX = (x - grid.origin.x) / grid.cellSize - 0.5;
  const gridZ = (z - grid.origin.y) / grid.cellSize - 0.5;
  const column0 = Math.floor(gridX);
  const row0 = Math.floor(gridZ);
  const tx = gridX - column0;
  const tz = gridZ - row0;
  const samples = [
    [column0, row0, (1 - tx) * (1 - tz)],
    [column0 + 1, row0, tx * (1 - tz)],
    [column0, row0 + 1, (1 - tx) * tz],
    [column0 + 1, row0 + 1, tx * tz],
  ];
  let vx = 0;
  let vz = 0;
  let weight = 0;
  for (const [column, row, contribution] of samples) {
    const index = gridIndex(grid, column, row);
    if (index < 0 || grid.obstacles?.[index]) continue;
    vx += grid.velocityX[index] * contribution;
    vz += grid.velocityY[index] * contribution;
    weight += contribution;
  }
  if (!(weight > 0)) return null;
  vx /= weight;
  vz /= weight;
  return { x: vx, z: vz, magnitude: Math.hypot(vx, vz) };
}

function pointInsideFluid(grid, x, z) {
  const column = Math.floor((x - grid.origin.x) / grid.cellSize);
  const row = Math.floor((z - grid.origin.y) / grid.cellSize);
  const index = gridIndex(grid, column, row);
  return index >= 0 && !grid.obstacles?.[index];
}

export function buildStreamlinePositions(study, options = {}) {
  const grid = study?.grid;
  if (study?.mode !== 'direction' || !grid?.velocityX) return new Float32Array();
  const stride = options.stride || Math.max(5, Math.ceil(Math.max(grid.columns, grid.rows) / 12));
  const maxSteps = options.maxSteps || 42;
  const stepLength = grid.cellSize * 0.65;
  const elevation = (study.sliceHeight || 1500) + Math.max(20, grid.cellSize * 0.03);
  const positions = [];

  for (let row = Math.floor(stride / 2); row < grid.rows; row += stride) {
    for (let column = Math.floor(stride / 2); column < grid.columns; column += stride) {
      let x = grid.origin.x + (column + 0.5) * grid.cellSize;
      let z = grid.origin.y + (row + 0.5) * grid.cellSize;
      if (!pointInsideFluid(grid, x, z)) continue;
      for (let step = 0; step < maxSteps; step += 1) {
        const vector = sampleWindVector(grid, x, z);
        if (!vector || vector.magnitude < 0.04) break;
        const nextX = x + (vector.x / vector.magnitude) * stepLength;
        const nextZ = z + (vector.z / vector.magnitude) * stepLength;
        if (!pointInsideFluid(grid, nextX, nextZ)) break;
        positions.push(x, elevation, z, nextX, elevation, nextZ);
        x = nextX;
        z = nextZ;
      }
    }
  }
  return new Float32Array(positions);
}

function createHeatmap(study, opacity) {
  const { grid } = study;
  let count = 0;
  for (let index = 0; index < grid.columns * grid.rows; index += 1) {
    if (!grid.obstacles[index]) count += 1;
  }
  if (!count) return null;
  const geometry = new THREE.PlaneGeometry(grid.cellSize * 0.94, grid.cellSize * 0.94);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  const elevation = (study.sliceHeight || 1500) + 5;
  let instance = 0;
  for (let row = 0; row < grid.rows; row += 1) {
    for (let column = 0; column < grid.columns; column += 1) {
      const index = row * grid.columns + column;
      if (grid.obstacles[index]) continue;
      matrix.makeTranslation(
        grid.origin.x + (column + 0.5) * grid.cellSize,
        elevation,
        grid.origin.y + (row + 0.5) * grid.cellSize,
      );
      mesh.setMatrixAt(instance, matrix);
      const [red, green, blue] = windCellColor(study, index);
      color.setRGB(red / 255, green / 255, blue / 255, THREE.SRGBColorSpace);
      mesh.setColorAt(instance, color);
      instance += 1;
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.renderOrder = 20;
  return mesh;
}

function fluidCells(grid) {
  const cells = [];
  for (let index = 0; index < grid.columns * grid.rows; index += 1) {
    if (!grid.obstacles[index]) cells.push(index);
  }
  return cells;
}

function createParticles(study, opacity) {
  if (study.mode !== 'direction') return null;
  const { grid } = study;
  const cells = fluidCells(grid);
  if (!cells.length) return null;
  const count = Math.min(1200, Math.max(180, Math.floor(cells.length / 5)));
  const positions = new Float32Array(count * 3);
  const ages = new Float32Array(count);
  const geometry = new THREE.BufferGeometry();
  const attribute = new THREE.BufferAttribute(positions, 3);
  attribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', attribute);
  const material = new THREE.PointsMaterial({
    color: 0xf7fbff,
    size: Math.max(70, grid.cellSize * 0.14),
    sizeAttenuation: true,
    transparent: true,
    opacity: Math.min(1, opacity + 0.28),
    depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  const elevation = (study.sliceHeight || 1500) + Math.max(35, grid.cellSize * 0.05);
  let generation = 0;

  const reset = (particle, spread = true) => {
    const cellIndex = cells[(particle * 97 + generation * 53) % cells.length];
    const column = cellIndex % grid.columns;
    const row = Math.floor(cellIndex / grid.columns);
    const jitterX = spread ? (((particle * 37 + generation * 11) % 101) / 101 - 0.5) * grid.cellSize : 0;
    const jitterZ = spread ? (((particle * 61 + generation * 17) % 103) / 103 - 0.5) * grid.cellSize : 0;
    positions[particle * 3] = grid.origin.x + (column + 0.5) * grid.cellSize + jitterX;
    positions[particle * 3 + 1] = elevation + ((particle % 7) - 3) * Math.max(5, grid.cellSize * 0.01);
    positions[particle * 3 + 2] = grid.origin.y + (row + 0.5) * grid.cellSize + jitterZ;
    ages[particle] = spread ? ((particle * 29) % 100) / 22 : 0;
  };
  for (let particle = 0; particle < count; particle += 1) reset(particle);
  attribute.needsUpdate = true;

  const update = (deltaSeconds) => {
    const referenceSpeedMm = Math.max(0.1, study.summary?.referenceSpeed || 5) * 1000;
    generation += 1;
    for (let particle = 0; particle < count; particle += 1) {
      const offset = particle * 3;
      const vector = sampleWindVector(grid, positions[offset], positions[offset + 2]);
      ages[particle] += deltaSeconds;
      if (!vector || vector.magnitude < 0.025 || ages[particle] > 7.5) {
        reset(particle);
        continue;
      }
      positions[offset] += vector.x * referenceSpeedMm * deltaSeconds;
      positions[offset + 2] += vector.z * referenceSpeedMm * deltaSeconds;
      if (!pointInsideFluid(grid, positions[offset], positions[offset + 2])) reset(particle, false);
    }
    attribute.needsUpdate = true;
  };
  points.renderOrder = 22;
  return { points, update };
}

function representativeFlowStudy(study) {
  if (study.mode === 'direction') return study;
  const flow = study.representativeFlow;
  if (!flow?.velocityX || !flow?.velocityY) return null;
  return {
    mode: 'direction',
    sliceHeight: study.sliceHeight,
    grid: {
      ...study.grid,
      amplification: flow.amplification,
      velocityX: flow.velocityX,
      velocityY: flow.velocityY,
    },
    summary: { referenceSpeed: flow.referenceSpeed },
  };
}

function achColor(airChangesPerHour) {
  if (airChangesPerHour < 0.1) return 0x7f8790;
  if (airChangesPerHour < 1) return 0x4d8ca1;
  if (airChangesPerHour < 4) return 0x43a66b;
  if (airChangesPerHour < 8) return 0xe0b43c;
  return 0xd3694d;
}

function roomFlowPoint(room, elevation = null) {
  return new THREE.Vector3(
    room.centroid.x,
    elevation ?? room.floorElevation + Math.min(1500, room.heightMm * 0.5),
    room.centroid.y,
  );
}

function createRoomAirflowLayer(study, opacity) {
  const ventilation = study.ventilation;
  if (!ventilation?.rooms?.length) return null;
  const group = new THREE.Group();
  group.name = 'room-airflow-network';
  const roomsById = new Map(ventilation.rooms.map((room) => [room.id, room]));

  for (const room of ventilation.rooms) {
    if (room.polygon.length < 3) continue;
    const shape = new THREE.Shape();
    shape.moveTo(room.polygon[0].x, room.polygon[0].y);
    for (let index = 1; index < room.polygon.length; index += 1) {
      shape.lineTo(room.polygon[index].x, room.polygon[index].y);
    }
    shape.closePath();
    const geometry = new THREE.ShapeGeometry(shape);
    geometry.rotateX(Math.PI / 2);
    geometry.translate(0, room.floorElevation + 65, 0);
    const material = new THREE.MeshBasicMaterial({
      color: achColor(room.airChangesPerHour),
      transparent: true,
      opacity: Math.min(0.68, opacity + 0.18),
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const plate = new THREE.Mesh(geometry, material);
    plate.name = `room-airflow:${room.id}`;
    plate.renderOrder = 23;
    group.add(plate);
  }

  for (const opening of ventilation.openings || []) {
    if (Math.abs(opening.flowM3s) < 1e-6) continue;
    const roomA = roomsById.get(opening.roomAId);
    const roomB = roomsById.get(opening.roomBId);
    if (!roomA) continue;
    const openingPoint = new THREE.Vector3(opening.centre.x, opening.centreElevation, opening.centre.y);
    let start;
    let end;
    if (opening.exterior) {
      const outside = new THREE.Vector3(
        opening.centre.x + opening.outwardNormal.x * Math.max(750, study.grid.cellSize),
        opening.centreElevation,
        opening.centre.y + opening.outwardNormal.y * Math.max(750, study.grid.cellSize),
      );
      const inside = roomFlowPoint(roomA, opening.centreElevation);
      start = opening.flowM3s > 0 ? inside : outside;
      end = opening.flowM3s > 0 ? outside : inside;
    } else if (roomB) {
      const a = roomFlowPoint(roomA, opening.centreElevation);
      const b = roomFlowPoint(roomB, opening.centreElevation);
      start = opening.flowM3s > 0 ? a : b;
      end = opening.flowM3s > 0 ? b : a;
    } else {
      continue;
    }

    const pathGeometry = new THREE.BufferGeometry().setFromPoints([start, openingPoint, end]);
    const inflow = opening.exterior && opening.flowM3s < 0;
    const material = new THREE.LineBasicMaterial({
      color: inflow ? 0x2d9cdb : 0xee7848,
      transparent: true,
      opacity: Math.min(0.95, opacity + 0.35),
      depthWrite: false,
    });
    const path = new THREE.Line(pathGeometry, material);
    path.name = `opening-flow:${opening.id}`;
    path.renderOrder = 25;
    group.add(path);

    const direction = end.clone().sub(start);
    const length = direction.length();
    if (length > 1) {
      const arrow = new THREE.ArrowHelper(
        direction.normalize(),
        start,
        length,
        inflow ? 0x2d9cdb : 0xee7848,
        Math.min(450, Math.max(140, length * 0.12)),
        Math.min(220, Math.max(75, length * 0.05)),
      );
      arrow.name = `opening-arrow:${opening.id}`;
      arrow.renderOrder = 26;
      group.add(arrow);
    }
  }
  return group;
}

export function createWindPreviewLayer(study, { stale = false, mode = 'outdoor' } = {}) {
  if (!study?.grid) return null;
  const group = new THREE.Group();
  group.name = 'wind-preview-layer';
  const opacity = stale ? 0.2 : 0.42;
  if (mode === 'ventilation') {
    const ventilation = createRoomAirflowLayer(study, opacity);
    if (ventilation) group.add(ventilation);
    return {
      group,
      animated: false,
      update() {},
      dispose() {
        group.traverse((object) => {
          object.geometry?.dispose?.();
          if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose?.());
          else object.material?.dispose?.();
        });
      },
    };
  }
  const heatmap = createHeatmap(study, opacity);
  if (heatmap) group.add(heatmap);

  // A comfort result combines every direction and therefore has no meaningful
  // aggregate vector. Animate its most frequent sector over the full comfort
  // heatmap instead of pretending the weighted result is one physical flow.
  const flowStudy = representativeFlowStudy(study);
  const streamlinePositions = buildStreamlinePositions(flowStudy);
  if (streamlinePositions.length) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(streamlinePositions, 3));
    const material = new THREE.LineBasicMaterial({
      color: 0x173d5b,
      transparent: true,
      opacity: stale ? 0.25 : 0.68,
      depthWrite: false,
    });
    const lines = new THREE.LineSegments(geometry, material);
    lines.renderOrder = 21;
    group.add(lines);
  }

  const particles = flowStudy ? createParticles(flowStudy, stale ? 0.25 : 0.7) : null;
  if (particles) group.add(particles.points);
  return {
    group,
    animated: Boolean(particles),
    update: particles?.update || (() => {}),
    dispose() {
      group.traverse((object) => {
        object.geometry?.dispose?.();
        if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose?.());
        else object.material?.dispose?.();
      });
    },
  };
}
