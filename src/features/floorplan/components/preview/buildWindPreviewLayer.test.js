import { describe, expect, it } from 'vitest';
import { buildStreamlinePositions, createWindPreviewLayer, sampleWindVector } from './buildWindPreviewLayer';

function study() {
  return {
    mode: 'direction',
    sliceHeight: 1500,
    grid: {
      origin: { x: 0, y: 0 },
      cellSize: 1000,
      columns: 8,
      rows: 8,
      obstacles: new Uint8Array(64),
      velocityX: new Float32Array(64).fill(1),
      velocityY: new Float32Array(64).fill(0),
      amplification: new Float32Array(64).fill(1),
    },
  };
}

describe('3D wind preview field', () => {
  it('bilinearly samples the model-space velocity grid', () => {
    const grid = study().grid;
    grid.velocityX[3 * grid.columns + 3] = 2;
    expect(sampleWindVector(grid, 3500, 3500)).toMatchObject({ x: 2, z: 0, magnitude: 2 });
    expect(sampleWindVector(grid, -1000, -1000)).toBeNull();
  });

  it('builds elevated streamline segments that follow the field', () => {
    const positions = buildStreamlinePositions(study(), { stride: 4, maxSteps: 3 });
    expect(positions.length).toBeGreaterThan(0);
    for (let index = 0; index < positions.length; index += 6) {
      expect(positions[index + 3]).toBeGreaterThan(positions[index]);
      expect(positions[index + 1]).toBeGreaterThanOrEqual(1500);
      expect(positions[index + 2]).toBeCloseTo(positions[index + 5]);
    }
  });

  it('stops streamlines at building obstacles', () => {
    const input = study();
    for (let row = 0; row < input.grid.rows; row += 1) input.grid.obstacles[row * input.grid.columns + 4] = 1;
    const positions = buildStreamlinePositions(input, { stride: 3, maxSteps: 20 });
    for (let index = 0; index < positions.length; index += 3) {
      expect(positions[index] < 4000 || positions[index] >= 5000).toBe(true);
    }
  });

  it('builds a separate 3D room airflow view with room plates and opening paths', () => {
    const input = study();
    input.ventilation = {
      rooms: [
        {
          id: 'room-1',
          polygon: [
            { x: 0, y: 0 },
            { x: 4000, y: 0 },
            { x: 4000, y: 3000 },
            { x: 0, y: 3000 },
          ],
          centroid: { x: 2000, y: 1500 },
          floorElevation: 0,
          heightMm: 3000,
          airChangesPerHour: 2.4,
        },
      ],
      openings: [
        {
          id: 'win-1',
          roomAId: 'room-1',
          roomBId: null,
          exterior: true,
          centre: { x: 2000, y: 0 },
          centreElevation: 1400,
          outwardNormal: { x: 0, y: -1 },
          flowM3s: -0.2,
        },
      ],
    };
    const layer = createWindPreviewLayer(input, { mode: 'ventilation' });
    expect(layer.animated).toBe(false);
    expect(layer.group.getObjectByName('room-airflow:room-1')).toBeTruthy();
    expect(layer.group.getObjectByName('opening-flow:win-1')).toBeTruthy();
    layer.dispose();
  });

  it('animates the representative sector over a multi-direction comfort map', () => {
    const input = study();
    input.mode = 'comfort';
    input.grid.categories = new Uint8Array(64);
    delete input.grid.velocityX;
    delete input.grid.velocityY;
    input.representativeFlow = {
      directionDeg: 45,
      frequency: 0.3,
      referenceSpeed: 4.5,
      amplification: new Float32Array(64).fill(1),
      velocityX: new Float32Array(64).fill(0.7),
      velocityY: new Float32Array(64).fill(0.7),
    };
    const layer = createWindPreviewLayer(input);
    expect(layer.animated).toBe(true);
    expect(layer.group.children.some((child) => child.isPoints)).toBe(true);
    expect(layer.group.children.some((child) => child.isLineSegments)).toBe(true);
    layer.dispose();
  });
});
