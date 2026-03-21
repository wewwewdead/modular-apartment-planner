import { deserializeSketchWorkspace, serializeSketchWorkspace } from './workspaceSerializationUtils';

export const SKETCH_WORKSPACE_FILE_TYPES = [
  {
    description: 'SketchStudio Sketch',
    accept: {
      'application/json': ['.json'],
    },
  },
];

function sanitizeFileNamePart(value) {
  return String(value || 'untitled-sketch')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    || 'untitled-sketch';
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

async function writeSerializedWorkspace(handle, serialized) {
  const writable = await handle.createWritable();
  await writable.write(serialized);
  await writable.close();
}

function pickSaveFileHandle(fileName) {
  if (!canUseSketchSaveFilePicker()) {
    return null;
  }

  return window.showSaveFilePicker({
    suggestedName: fileName,
    types: SKETCH_WORKSPACE_FILE_TYPES,
  });
}

export function getSketchWorkspaceFileName(name) {
  return `${sanitizeFileNamePart(name)}.sketch.json`;
}

export function canUseSketchOpenFilePicker() {
  return typeof window !== 'undefined' && typeof window.showOpenFilePicker === 'function';
}

export function canUseSketchSaveFilePicker() {
  return typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function';
}

export async function importSketchWorkspaceFile(file) {
  if (!file) {
    throw new Error('No sketch file selected.');
  }

  const workspace = deserializeSketchWorkspace(await file.text());
  return {
    workspace,
    fileName: typeof file.name === 'string' && file.name ? file.name : getSketchWorkspaceFileName(workspace.document?.name),
  };
}

export async function openSketchWorkspaceFile() {
  if (!canUseSketchOpenFilePicker()) {
    throw new Error('Direct file open is not supported in this browser.');
  }

  const [handle] = await window.showOpenFilePicker({
    multiple: false,
    excludeAcceptAllOption: false,
    types: SKETCH_WORKSPACE_FILE_TYPES,
  });
  const file = await handle.getFile();
  const { workspace, fileName } = await importSketchWorkspaceFile(file);

  return {
    workspace,
    fileHandle: handle,
    fileName: fileName || handle.name || null,
  };
}

export async function saveSketchWorkspaceFile(workspace, options = {}) {
  const savedAt = options.savedAt || new Date().toISOString();
  const serialized = serializeSketchWorkspace(workspace, { savedAt });
  const fileName = getSketchWorkspaceFileName(workspace?.document?.name);
  let fileHandle = options.fileHandle ?? null;

  if (!fileHandle) {
    fileHandle = await pickSaveFileHandle(fileName);
  }

  if (fileHandle) {
    await writeSerializedWorkspace(fileHandle, serialized);
    return {
      savedAt,
      fileHandle,
      fileName: fileHandle.name || fileName,
    };
  }

  const blob = new Blob([serialized], {
    type: 'application/json',
  });
  downloadBlob(blob, fileName);
  return {
    savedAt,
    fileHandle: null,
    fileName,
  };
}

export function isFilePickerAbortError(error) {
  return Boolean(error) && typeof error === 'object' && error.name === 'AbortError';
}
