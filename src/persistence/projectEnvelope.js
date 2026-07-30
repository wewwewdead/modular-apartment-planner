import { CorruptedDataError } from './errors';

// Schema versions 1-14 all share a single backfill migration path, so any historical shape
// that carried no explicit schema version enters the pipeline at 14.
export const LEGACY_SCHEMA_VERSION = 14;

const NOT_A_PROJECT_MESSAGE =
  'This file is not an Apartment Planner project file. Open a .json project export or a .apz project archive.';

const SKETCH_STUDIO_MESSAGE =
  'This file is a SketchStudio sketch, not an Apartment Planner project file. Open it from SketchStudio instead.';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// Positive fingerprint of a bare project payload (the object that normally lives under
// `data`). Deliberately narrow: unrelated JSON must never be wrapped and silently accepted.
export function isRawProject(value) {
  return isPlainObject(value) && typeof value.id === 'string' && value.id !== '' && Array.isArray(value.floors);
}

// SketchStudio workspace files are also plain `.json` and both open pickers accept
// `application/json`, so they are the most likely non-project file to land here.
function isSketchStudioFile(value) {
  if (!isPlainObject(value)) return false;
  if (value.kind === 'sketchstudio-workspace') return true;

  const document = isPlainObject(value.document) ? value.document : value;
  return Array.isArray(document.entities) && Array.isArray(document.layers);
}

function toSchemaVersion(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : LEGACY_SCHEMA_VERSION;
}

// A bare project's own `version` is the domain format version (CURRENT_PROJECT_FORMAT_VERSION),
// not the persistence schema version, so it is never read as one. Only an explicit
// `schemaVersion` counts; otherwise the project is treated as legacy and enters at 14.
function readBareProjectSchemaVersion(project) {
  return toSchemaVersion(project.schemaVersion);
}

// On a wrapper, top-level `version` played the same role `version` did in the original
// envelope — the schema/file version — so it is honoured as a fallback.
function readWrapperSchemaVersion(wrapper) {
  return toSchemaVersion(wrapper.schemaVersion ?? wrapper.version);
}

function readSavedAt(source) {
  return typeof source.savedAt === 'string' ? source.savedAt : undefined;
}

/**
 * Normalizes every shape this app has ever written for a project file into the current
 * `{ schemaVersion, version, data, savedAt }` envelope so a single migration pipeline
 * can handle all of them.
 *
 * Accepted:
 *  - the envelope itself (`{ version, data, savedAt }` through
 *    `{ schemaVersion, version, data, savedAt }`) — returned untouched so version
 *    detection and `UnsupportedVersionError` behave exactly as before
 *  - a bare project object (`{ id, name, floors, ... }`) — the payload normally nested
 *    under `data`, e.g. hand-extracted from an envelope or an archive
 *  - a `{ project: <bare project> }` wrapper
 *
 * Anything else throws `CorruptedDataError` with a message that distinguishes "never was
 * a project file" from "is a project file but is damaged".
 */
export function normalizeProjectEnvelope(json) {
  if (!isPlainObject(json)) {
    throw new CorruptedDataError(NOT_A_PROJECT_MESSAGE);
  }

  // Already an envelope. Pass through untouched — including a `data` that is not an
  // object, which the structure checks downstream report as a damaged project.
  if ('data' in json) {
    if (!isPlainObject(json.data)) {
      throw new CorruptedDataError('Invalid project data: project file envelope has an empty data payload');
    }
    return json;
  }

  if (isRawProject(json)) {
    return {
      schemaVersion: readBareProjectSchemaVersion(json),
      version: json.version,
      data: json,
      savedAt: readSavedAt(json) ?? (typeof json.updatedAt === 'string' ? json.updatedAt : undefined),
    };
  }

  if (isRawProject(json.project)) {
    return {
      schemaVersion: readWrapperSchemaVersion(json),
      version: json.version,
      data: json.project,
      savedAt: readSavedAt(json),
    };
  }

  if (isSketchStudioFile(json)) {
    throw new CorruptedDataError(SKETCH_STUDIO_MESSAGE);
  }

  throw new CorruptedDataError(NOT_A_PROJECT_MESSAGE);
}
