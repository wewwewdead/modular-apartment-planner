import { migrateToCanonicalBuilding } from '@/domain/buildingModels';
import { registerMigration } from './index';

export function migrateV15toV16(project) {
  return {
    ...migrateToCanonicalBuilding(project),
    version: 15,
  };
}

registerMigration(15, 16, migrateV15toV16);
