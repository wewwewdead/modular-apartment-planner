import { migrateToCanonicalBuilding } from '@/domain/buildingModels';
import { registerMigration } from './index';

export function migrateV19toV20(project) {
  return {
    ...migrateToCanonicalBuilding(project),
    version: 19,
  };
}

registerMigration(19, 20, migrateV19toV20);
