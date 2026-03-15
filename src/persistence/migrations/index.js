const migrations = new Map();

export function registerMigration(fromVersion, toVersion, migrateFn) {
  migrations.set(fromVersion, { toVersion, migrate: migrateFn });
}

export function runMigrations(project, fromSchemaVersion, targetSchemaVersion) {
  let current = fromSchemaVersion;
  let result = project;

  while (current < targetSchemaVersion) {
    const step = migrations.get(current);
    if (!step) {
      throw new Error(`No migration registered from schema version ${current}`);
    }
    result = step.migrate(result);
    current = step.toVersion;
  }

  return result;
}
