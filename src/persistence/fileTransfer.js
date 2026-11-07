import { deserializeProject } from './deserialize';
import {
  ARCHIVE_FILE_EXTENSION,
  ARCHIVE_MIME_TYPE,
  buildProjectArchiveResult,
  isZipFile,
  readProjectArchive,
} from './projectArchive';
import { serializeProject } from './serialize';

const PROJECT_FILE_TYPES = [
  {
    description: 'Apartment Planner Project',
    accept: {
      'application/json': ['.json'],
    },
  },
];

const PROJECT_ARCHIVE_FILE_TYPES = [
  {
    description: 'Apartment Planner Shared Project',
    accept: {
      [ARCHIVE_MIME_TYPE]: [ARCHIVE_FILE_EXTENSION],
    },
  },
];

const PROJECT_OPEN_FILE_TYPES = [
  {
    description: 'Apartment Planner Project',
    accept: {
      'application/json': ['.json'],
      [ARCHIVE_MIME_TYPE]: [ARCHIVE_FILE_EXTENSION, '.zip'],
    },
  },
];

function sanitizeFileNamePart(value) {
  return (
    String(value || 'project')
      .trim()
      // Strip filesystem-illegal characters and C0 control chars (U+0000-U+001F) from file names.
      // eslint-disable-next-line no-control-regex
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'project'
  );
}

function getProjectFileName(project) {
  return `${sanitizeFileNamePart(project?.name)}.json`;
}

function getProjectArchiveFileName(project) {
  return `${sanitizeFileNamePart(project?.name)}${ARCHIVE_FILE_EXTENSION}`;
}

function canUseOpenFilePicker() {
  return typeof window !== 'undefined' && typeof window.showOpenFilePicker === 'function';
}

function canUseSaveFilePicker() {
  return typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function';
}

function downloadBlob(blob, fileName) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 0);
}

async function writeSerializedProject(handle, serialized) {
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(serialized, null, 2));
  await writable.close();
}

async function pickSaveFileHandle(project) {
  if (!canUseSaveFilePicker()) return null;
  return window.showSaveFilePicker({
    suggestedName: getProjectFileName(project),
    types: PROJECT_FILE_TYPES,
  });
}

/** A file that is neither JSON nor a zip; the UI words it (loadingCopy `badProjectFile`). */
export const NOT_A_PROJECT_FILE = 'not-a-project-file';

export function isNotAProjectFileError(error) {
  return error?.code === NOT_A_PROJECT_FILE;
}

/**
 * `onProgress` hears `{ stage: 'reading' | 'unpacking', name }` as the file is
 * read and, for an archive, unpacked — so the screen can say which.
 */
export async function importProjectFile(file, { onProgress } = {}) {
  if (!file) {
    throw new Error('No project file selected.');
  }

  onProgress?.({ stage: 'reading', name: file.name || '' });
  if (await isZipFile(file)) {
    onProgress?.({ stage: 'unpacking', name: file.name || '' });
    return deserializeProject(await readProjectArchive(file));
  }

  let json;
  try {
    json = JSON.parse(await file.text());
  } catch {
    // A .json that will not parse is a broken project; anything else that is
    // not a zip was never a project file at all.
    if (/\.json$/i.test(file.name || '')) throw new Error('Selected file is not valid JSON.');
    const error = new Error('Selected file is not a project file or archive.');
    error.code = NOT_A_PROJECT_FILE;
    throw error;
  }

  return deserializeProject(json);
}

export async function openProjectFile({ onProgress } = {}) {
  if (!canUseOpenFilePicker()) {
    throw new Error('Direct file open is not supported in this browser.');
  }

  const [handle] = await window.showOpenFilePicker({
    multiple: false,
    excludeAcceptAllOption: false,
    types: PROJECT_OPEN_FILE_TYPES,
  });
  const file = await handle.getFile();
  // Archives must not be adopted as the save target: Ctrl+S writes plain JSON and would
  // overwrite the container, dropping its thumbnail and manifest.
  const isArchive = await isZipFile(file);
  const result = await importProjectFile(file, { onProgress });

  return {
    ...result,
    fileHandle: isArchive ? null : handle,
  };
}

export async function exportProjectFile(project, options = {}) {
  const serialized = serializeProject(project);
  let fileHandle = options.fileHandle ?? null;

  if (!fileHandle) {
    fileHandle = await pickSaveFileHandle(project);
  }

  if (fileHandle) {
    await writeSerializedProject(fileHandle, serialized);
    return { savedAt: serialized.savedAt, fileHandle };
  }

  const blob = new Blob([JSON.stringify(serialized, null, 2)], {
    type: 'application/json',
  });

  downloadBlob(blob, getProjectFileName(project));
  return { savedAt: serialized.savedAt, fileHandle: null };
}

export async function exportProjectArchive(project) {
  const { blob, savedAt } = await buildProjectArchiveResult(project);
  const fileName = getProjectArchiveFileName(project);

  if (canUseSaveFilePicker()) {
    const handle = await window.showSaveFilePicker({
      suggestedName: fileName,
      types: PROJECT_ARCHIVE_FILE_TYPES,
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return { savedAt };
  }

  downloadBlob(blob, fileName);
  return { savedAt };
}

export function isFilePickerAbortError(error) {
  return Boolean(error) && typeof error === 'object' && error.name === 'AbortError';
}
