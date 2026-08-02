import { createWallDetailing } from '@/domain/wallDetailing';
import { registerMigration } from './index';

function createV1WallDetailing() {
  const current = createWallDetailing({ enabled: false });
  const { dimensions: _interiorDimensions, ...interior } = current.sides.interior;
  const { dimensions: _exteriorDimensions, ...exterior } = current.sides.exterior;
  return {
    ...current,
    schemaVersion: 1,
    sides: { interior, exterior },
  };
}

export function migrateV22toV23(project) {
  return {
    ...project,
    version: 22,
    floors: (project.floors || []).map((floor) => ({
      ...floor,
      walls: (floor.walls || []).map((wall) =>
        wall.assembly?.system === 'framed' && !wall.assembly.detailing
          ? {
              ...wall,
              assembly: {
                ...wall.assembly,
                detailing: createV1WallDetailing(),
              },
            }
          : wall,
      ),
    })),
  };
}

registerMigration(22, 23, migrateV22toV23);
