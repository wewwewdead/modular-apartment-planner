// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createProject, createWall } from '@/domain/models';
import { syncProjectStructures } from '@/domain/projectStateHelpers';
import { serializeProject } from '../serialize';
import { isStarterDraft } from '../draftPruning';
import { listProjects, loadProject, pruneDrafts, saveProject } from '../storage';

const INDEX_KEY = 'apartment-planner-projects';
const PROJECT_KEY = (id) => `apartment-planner-project-${id}`;

// What the app stores: the project as the workspace holds it, synced.
const starter = (name = 'Untitled Project') => syncProjectStructures(createProject(name));

function edited(name) {
  const project = starter(name);
  const [floor] = project.floors;
  return syncProjectStructures({
    ...project,
    floors: [{ ...floor, walls: [createWall({ x: 0, y: 0 }, { x: 4000, y: 0 })] }],
  });
}

afterEach(() => {
  window.localStorage.clear();
});

describe('isStarterDraft', () => {
  it('knows the untouched starter project, whatever it is called', () => {
    expect(isStarterDraft(serializeProject(starter()))).toBe(true);
    expect(isStarterDraft(serializeProject(starter('Renamed')))).toBe(true);
  });

  it('sees any work in it', () => {
    expect(isStarterDraft(serializeProject(edited('Walls')))).toBe(false);
    expect(isStarterDraft(serializeProject({ ...starter(), address: '12 Lot Street' }))).toBe(false);
    expect(isStarterDraft(serializeProject({ ...starter(), phases: [{ id: 'p', name: 'Phase 1', order: 0 }] }))).toBe(
      false,
    );
  });

  it('does not judge a draft it cannot read', () => {
    expect(isStarterDraft({ nonsense: true })).toBe(false);
    expect(isStarterDraft(null)).toBe(false);
  });
});

describe('pruneDrafts', () => {
  it('removes orphaned drafts and dangling index entries, but never an orphan holding work', async () => {
    const work = edited('Recovered work');
    window.localStorage.setItem(PROJECT_KEY('orphan_blank'), JSON.stringify(serializeProject(starter())));
    window.localStorage.setItem(PROJECT_KEY('orphan_corrupt'), '{not json');
    window.localStorage.setItem(PROJECT_KEY(work.id), JSON.stringify(serializeProject(work)));
    window.localStorage.setItem(INDEX_KEY, JSON.stringify([{ id: 'gone', name: 'Gone', savedAt: 't' }]));

    const removed = await pruneDrafts();

    expect(removed.sort()).toEqual(['orphan_blank', 'orphan_corrupt']);
    expect(window.localStorage.getItem(PROJECT_KEY(work.id))).not.toBeNull();
    expect(await listProjects()).toEqual([]);
  });

  it('removes a listed draft that is still the blank starter', async () => {
    const blank = starter('Untitled Project');
    await saveProject(blank);

    expect(await pruneDrafts()).toEqual([blank.id]);
    expect(await listProjects()).toEqual([]);
    expect(window.localStorage.getItem(PROJECT_KEY(blank.id))).toBeNull();
  });

  it('keeps an edited draft, however old', async () => {
    const old = edited('Old house');
    window.localStorage.setItem(
      PROJECT_KEY(old.id),
      JSON.stringify({ ...serializeProject(old), savedAt: '2001-01-01T00:00:00.000Z' }),
    );
    window.localStorage.setItem(
      INDEX_KEY,
      JSON.stringify([{ id: old.id, name: old.name, savedAt: '2001-01-01T00:00:00.000Z' }]),
    );

    expect(await pruneDrafts()).toEqual([]);
    expect((await loadProject(old.id)).project.floors[0].walls).toHaveLength(1);
  });

  it('never removes the open project, blank or not', async () => {
    const open = starter('Just created');
    await saveProject(open);

    expect(await pruneDrafts({ keepId: open.id })).toEqual([]);
    expect((await listProjects()).map((entry) => entry.id)).toEqual([open.id]);
  });

  it('does nothing when the index cannot be read', async () => {
    window.localStorage.setItem(PROJECT_KEY('orphan_blank'), JSON.stringify(serializeProject(starter())));
    window.localStorage.setItem(INDEX_KEY, '{broken');

    expect(await pruneDrafts()).toEqual([]);
    expect(window.localStorage.getItem(PROJECT_KEY('orphan_blank'))).not.toBeNull();
    expect(window.localStorage.getItem(INDEX_KEY)).toBe('{broken');
  });
});
