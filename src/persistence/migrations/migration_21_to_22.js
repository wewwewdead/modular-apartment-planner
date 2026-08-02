import { migrateToCanonicalBuilding } from '@/domain/buildingModels';
import { registerMigration } from './index';

export function migrateV21toV22(project) {
  return {
    ...migrateToCanonicalBuilding(project),
    version: 21,
  };
}

registerMigration(21, 22, migrateV21toV22);
