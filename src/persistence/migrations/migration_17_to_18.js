import { migrateToCanonicalBuilding } from '@/domain/buildingModels';
import { registerMigration } from './index';

export function migrateV17toV18(project) {
  return {
    ...migrateToCanonicalBuilding(project),
    version: 17,
  };
}

registerMigration(17, 18, migrateV17toV18);
