import { describe, it, expect, afterEach, vi } from 'vitest';
import JSZip from 'jszip';
import { createProject, createRoom, createWall } from '@/domain/models';
import { CURRENT_SCHEMA_VERSION } from '@/domain/projectVersion';
import { deserializeProject } from '../deserialize';
import { importProjectFile, openProjectFile } from '../fileTransfer';
import { serializeProject } from '../serialize';
import {
  ARCHIVE_FORMAT,
  ARCHIVE_FORMAT_VERSION,
  buildProjectArchive,
  isZipFile,
  readProjectArchive,
} from '../projectArchive';

function makeProject(name = 'Archive Test') {
  const project = createProject(name);
  const floor = project.floors[0];
  floor.walls.push(createWall({ x: 0, y: 0 }, { x: 5000, y: 0 }, 200));
  floor.walls.push(createWall({ x: 5000, y: 0 }, { x: 5000, y: 4000 }, 200));
  floor.rooms.push(
    createRoom('Living', [
      { x: 0, y: 0 },
      { x: 5000, y: 0 },
      { x: 5000, y: 4000 },
      { x: 0, y: 4000 },
    ]),
  );
  return project;
}

async function makeZip(entries) {
  const zip = new JSZip();
  Object.entries(entries).forEach(([name, content]) => zip.file(name, content));
  return zip.generateAsync({ type: 'blob' });
}

describe('buildProjectArchive', () => {
  it('produces a zip containing project.json, thumbnail.svg and manifest.json', async () => {
    const blob = await buildProjectArchive(makeProject());
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());

    expect(zip.file('project.json')).toBeTruthy();
    expect(zip.file('thumbnail.svg')).toBeTruthy();
    expect(zip.file('manifest.json')).toBeTruthy();
  });

  it('writes a manifest describing the archive format', async () => {
    const blob = await buildProjectArchive(makeProject('Manifest Project'));
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const manifest = JSON.parse(await zip.file('manifest.json').async('string'));

    expect(manifest.format).toBe(ARCHIVE_FORMAT);
    expect(manifest.formatVersion).toBe(ARCHIVE_FORMAT_VERSION);
    expect(manifest.projectName).toBe('Manifest Project');
    expect(manifest.appVersion).toBe('1.0.0');
    expect(manifest.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(typeof manifest.savedAt).toBe('string');
  });

  it('stores an inner project.json that is itself a valid legacy import', async () => {
    const blob = await buildProjectArchive(makeProject());
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const inner = JSON.parse(await zip.file('project.json').async('string'));

    const { project } = deserializeProject(inner);
    expect(project.name).toBe('Archive Test');
  });
});

describe('readProjectArchive', () => {
  it('round-trips the serialized project payload', async () => {
    const project = makeProject('Round Trip');
    const blob = await buildProjectArchive(project);
    const restored = await readProjectArchive(blob);

    expect(restored.data).toEqual(project);
    expect(restored.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('round-trips through a File wrapper', async () => {
    const project = makeProject('File Wrapper');
    const file = new File([await buildProjectArchive(project)], 'shared.apz');
    const { project: restored } = deserializeProject(await readProjectArchive(file));

    expect(restored.name).toBe('File Wrapper');
    expect(restored.floors[0].walls).toHaveLength(2);
    expect(restored.floors[0].rooms).toHaveLength(1);
  });

  it('tolerates an archive without a manifest', async () => {
    const project = makeProject('No Manifest');
    const blob = await buildProjectArchive(project);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    zip.remove('manifest.json');
    const stripped = await zip.generateAsync({ type: 'blob' });

    const restored = await readProjectArchive(stripped);
    expect(restored.data.name).toBe('No Manifest');
  });

  it('rejects an archive missing project.json', async () => {
    const blob = await makeZip({ 'manifest.json': JSON.stringify({ format: ARCHIVE_FORMAT, formatVersion: 1 }) });
    await expect(readProjectArchive(blob)).rejects.toThrow('missing project.json');
  });

  it('rejects an archive whose project.json is corrupt', async () => {
    const blob = await makeZip({ 'project.json': '{ not json' });
    await expect(readProjectArchive(blob)).rejects.toThrow('invalid project.json');
  });

  it('rejects an archive with a corrupt manifest', async () => {
    const blob = await makeZip({ 'manifest.json': '{ nope', 'project.json': '{}' });
    await expect(readProjectArchive(blob)).rejects.toThrow('manifest is not valid JSON');
  });

  it('rejects an archive from a foreign format', async () => {
    const blob = await makeZip({
      'manifest.json': JSON.stringify({ format: 'some-other-app/project', formatVersion: 1 }),
      'project.json': '{}',
    });
    await expect(readProjectArchive(blob)).rejects.toThrow('not created by Apartment Planner');
  });

  it('rejects an archive from a newer format version', async () => {
    const blob = await makeZip({
      'manifest.json': JSON.stringify({ format: ARCHIVE_FORMAT, formatVersion: ARCHIVE_FORMAT_VERSION + 1 }),
      'project.json': '{}',
    });
    await expect(readProjectArchive(blob)).rejects.toThrow('newer version of Apartment Planner');
  });

  it('rejects a file that is not a zip at all', async () => {
    await expect(readProjectArchive(new Blob(['plain text']))).rejects.toThrow('not a valid project archive');
  });

  it('rejects a missing file', async () => {
    await expect(readProjectArchive(null)).rejects.toThrow('No project archive selected.');
  });
});

describe('importProjectFile format detection', () => {
  it('imports a shared archive', async () => {
    const file = new File([await buildProjectArchive(makeProject('Shared'))], 'shared.apz');
    const { project, savedAt } = await importProjectFile(file);

    expect(project.name).toBe('Shared');
    expect(typeof savedAt).toBe('string');
  });

  it('still imports a legacy json project file', async () => {
    const serialized = serializeProject(makeProject('Legacy'));
    const file = new File([JSON.stringify(serialized, null, 2)], 'legacy.json');
    const { project } = await importProjectFile(file);

    expect(project.name).toBe('Legacy');
  });

  it('reports invalid JSON for non-zip garbage', async () => {
    await expect(importProjectFile(new File(['not json at all'], 'broken.json'))).rejects.toThrow(
      'Selected file is not valid JSON.',
    );
  });
});

describe('openProjectFile save-target adoption', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubPicker(file) {
    const handle = { getFile: async () => file };
    vi.stubGlobal('window', { showOpenFilePicker: async () => [handle] });
    return handle;
  }

  it('does not adopt a shared archive as the save target', async () => {
    const file = new File([await buildProjectArchive(makeProject('Shared Archive'))], 'shared.apz');
    stubPicker(file);

    const { project, fileHandle } = await openProjectFile();

    expect(project.name).toBe('Shared Archive');
    expect(fileHandle).toBeNull();
  });

  it('adopts a legacy json project file as the save target', async () => {
    const serialized = serializeProject(makeProject('Legacy Handle'));
    const file = new File([JSON.stringify(serialized, null, 2)], 'legacy.json');
    const handle = stubPicker(file);

    const { project, fileHandle } = await openProjectFile();

    expect(project.name).toBe('Legacy Handle');
    expect(fileHandle).toBe(handle);
  });
});

describe('isZipFile', () => {
  it('detects zip content regardless of file name', async () => {
    const blob = await buildProjectArchive(makeProject());
    expect(await isZipFile(blob)).toBe(true);
    expect(await isZipFile(new File([blob], 'misnamed.json'))).toBe(true);
  });

  it('returns false for JSON content', async () => {
    expect(await isZipFile(new File(['{"schemaVersion":15}'], 'project.json'))).toBe(false);
  });

  it('returns false for empty or missing input', async () => {
    expect(await isZipFile(new Blob([]))).toBe(false);
    expect(await isZipFile(null)).toBe(false);
  });
});
