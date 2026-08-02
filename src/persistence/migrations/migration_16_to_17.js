import { migrateToCanonicalBuilding } from '@/domain/buildingModels';
import { registerMigration } from './index';

export function migrateV16toV17(project) {
  return {
    ...migrateToCanonicalBuilding(project),
    version: 16,
  };
}

registerMigration(16, 17, migrateV16toV17);
