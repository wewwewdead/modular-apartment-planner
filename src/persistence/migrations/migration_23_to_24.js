import { createWallDetailing } from '@/domain/wallDetailing';
import { registerMigration } from './index';

export function migrateV23toV24(project) {
  return {
    ...project,
    version: 23,
    floors: (project.floors || []).map((floor) => ({
      ...floor,
      walls: (floor.walls || []).map((wall) => {
        if (!wall.assembly || (wall.assembly.system !== 'framed' && !wall.assembly.detailing)) return wall;
        return {
          ...wall,
          assembly: {
            ...wall.assembly,
            detailing: createWallDetailing(wall.assembly.detailing || { enabled: false }),
          },
        };
      }),
    })),
  };
}

registerMigration(23, 24, migrateV23toV24);
