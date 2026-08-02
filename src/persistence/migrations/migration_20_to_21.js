import { migrateToCanonicalBuilding } from '@/domain/buildingModels';
import { registerMigration } from './index';

export function migrateV20toV21(project) {
  return {
    ...migrateToCanonicalBuilding(project),
    version: 20,
  };
}

registerMigration(20, 21, migrateV20toV21);
