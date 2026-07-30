import { generateProjectThumbnailSvg } from './projectThumbnail';
import { serializeProject } from './serialize';

export const ARCHIVE_FORMAT = 'modular-apartment-planner/project';
export const ARCHIVE_FORMAT_VERSION = 1;
export const ARCHIVE_APP_VERSION = '1.0.0';
export const ARCHIVE_FILE_EXTENSION = '.apz';
export const ARCHIVE_MIME_TYPE = 'application/zip';

const PROJECT_ENTRY = 'project.json';
const THUMBNAIL_ENTRY = 'thumbnail.svg';
const MANIFEST_ENTRY = 'manifest.json';

// Kept dynamic so jszip stays out of the main bundle — only sharing pulls it in.
async function loadJSZip() {
  const module = await import('jszip');
  return module.default || module;
}

export async function buildProjectArchiveResult(project) {
  const serialized = serializeProject(project);
  const JSZip = await loadJSZip();
  const zip = new JSZip();

  const manifest = {
    format: ARCHIVE_FORMAT,
    formatVersion: ARCHIVE_FORMAT_VERSION,
    appVersion: ARCHIVE_APP_VERSION,
    projectName: project?.name || 'Untitled Project',
    savedAt: serialized.savedAt,
    schemaVersion: serialized.schemaVersion,
  };

  zip.file(PROJECT_ENTRY, JSON.stringify(serialized, null, 2));
  zip.file(THUMBNAIL_ENTRY, generateProjectThumbnailSvg(project));
  zip.file(MANIFEST_ENTRY, JSON.stringify(manifest, null, 2));

  const blob = await zip.generateAsync({ type: 'blob', mimeType: ARCHIVE_MIME_TYPE });
  return { blob, savedAt: serialized.savedAt };
}

export async function buildProjectArchive(project) {
  const { blob } = await buildProjectArchiveResult(project);
  return blob;
}

function assertSupportedManifest(manifest) {
  if (manifest.format && manifest.format !== ARCHIVE_FORMAT) {
    throw new Error('Selected archive was not created by Apartment Planner.');
  }
  if (Number(manifest.formatVersion) > ARCHIVE_FORMAT_VERSION) {
    throw new Error('Selected archive was created by a newer version of Apartment Planner.');
  }
}

export async function readProjectArchive(file) {
  if (!file || typeof file.arrayBuffer !== 'function') {
    throw new Error('No project archive selected.');
  }

  const JSZip = await loadJSZip();
  let zip;
  try {
    zip = await JSZip.loadAsync(await file.arrayBuffer());
  } catch {
    throw new Error('Selected file is not a valid project archive.');
  }

  const manifestEntry = zip.file(MANIFEST_ENTRY);
  if (manifestEntry) {
    let manifest;
    try {
      manifest = JSON.parse(await manifestEntry.async('string'));
    } catch {
      throw new Error('Project archive manifest is not valid JSON.');
    }
    assertSupportedManifest(manifest || {});
  }

  const projectEntry = zip.file(PROJECT_ENTRY);
  if (!projectEntry) {
    throw new Error(`Project archive is missing ${PROJECT_ENTRY}.`);
  }

  try {
    return JSON.parse(await projectEntry.async('string'));
  } catch {
    throw new Error(`Project archive contains an invalid ${PROJECT_ENTRY}.`);
  }
}

export async function isZipFile(file) {
  if (!file || typeof file.slice !== 'function') return false;

  try {
    const header = new Uint8Array(await file.slice(0, 2).arrayBuffer());
    return header.length === 2 && header[0] === 0x50 && header[1] === 0x4b;
  } catch {
    return false;
  }
}
