export const CURRENT_PROJECT_VERSION = 14;
export const CURRENT_PROJECT_FILE_VERSION = 14;
const SUPPORTED_PROJECT_FILE_VERSIONS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);

export function isSupportedProjectFileVersion(version) {
  return SUPPORTED_PROJECT_FILE_VERSIONS.has(Number(version));
}
