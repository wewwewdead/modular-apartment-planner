// Schema version: controls the persistence envelope and migration routing.
// Bump this when adding a new migration step.
export const CURRENT_SCHEMA_VERSION = 28;

// Project format version: the version stored inside project.version for display/compat.
// This is the "logical" version of the domain model, independent of the persistence layer.
export const CURRENT_PROJECT_FORMAT_VERSION = 23;

const SUPPORTED_SCHEMA_VERSIONS = new Set([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28,
]);

export function isSupportedSchemaVersion(version) {
  return SUPPORTED_SCHEMA_VERSIONS.has(Number(version));
}

// Legacy alias — kept for backward compatibility with existing code
export const CURRENT_PROJECT_VERSION = CURRENT_PROJECT_FORMAT_VERSION;
export const CURRENT_PROJECT_FILE_VERSION = CURRENT_PROJECT_FORMAT_VERSION;
export const isSupportedProjectFileVersion = isSupportedSchemaVersion;
