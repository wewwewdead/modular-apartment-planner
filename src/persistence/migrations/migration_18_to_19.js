import { migrateToCanonicalBuilding } from '@/domain/buildingModels';
import { registerMigration } from './index';

export function migrateV18toV19(project) {
  return {
    ...migrateToCanonicalBuilding(project),
    version: 18,
  };
}

registerMigration(18, 19, migrateV18toV19);
