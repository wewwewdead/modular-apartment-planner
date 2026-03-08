import { deserializeProject } from './deserialize';
import { serializeProject } from './serialize';

const PROJECT_FILE_TYPES = [
  {
    description: 'Apartment Planner Project',
    accept: {
      'application/json': ['.json'],
    },
  },
];

function sanitizeFileNamePart(value) {
  return String(value || 'project')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    || 'project';
}

function getProjectFileName(project) {
  return `${sanitizeFileNamePart(project?.name)}.json`;
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

export async function importProjectFile(file) {
  if (!file) {
    throw new Error('No project file selected.');
  }

  let json;
  try {
    json = JSON.parse(await file.text());
  } catch {
    throw new Error('Selected file is not valid JSON.');
  }

  return deserializeProject(json);
}

export async function openProjectFile() {
  if (!canUseOpenFilePicker()) {
    throw new Error('Direct file open is not supported in this browser.');
  }

  const [handle] = await window.showOpenFilePicker({
    multiple: false,
    excludeAcceptAllOption: false,
    types: PROJECT_FILE_TYPES,
  });
  const file = await handle.getFile();
  const result = await importProjectFile(file);

  return {
    ...result,
    fileHandle: handle,
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

export function isFilePickerAbortError(error) {
  return Boolean(error) && typeof error === 'object' && error.name === 'AbortError';
}
