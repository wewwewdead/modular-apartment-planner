// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { localStorageBackend } from '../localStorageBackend';

const INDEX_KEY = 'apartment-planner-projects';
const PROJECT_KEY = (id) => `apartment-planner-project-${id}`;

function quotaError() {
  return new DOMException('The quota has been exceeded.', 'QuotaExceededError');
}

// A storage that fills up on the index write: the project fit, its listing did not.
function failIndexWrites() {
  const realSetItem = Storage.prototype.setItem;
  return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function setItem(key, value) {
    if (key === INDEX_KEY) throw quotaError();
    return realSetItem.call(this, key, value);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('localStorageBackend.save', () => {
  it('lists a saved draft and loads it back', async () => {
    await localStorageBackend.save('p1', 'House', { savedAt: 't1', project: { id: 'p1' } });
    expect(await localStorageBackend.list()).toEqual([{ id: 'p1', name: 'House', savedAt: 't1' }]);
    expect(await localStorageBackend.load('p1')).toEqual({ savedAt: 't1', project: { id: 'p1' } });
  });

  it('surfaces a full quota on the index and leaves no unlisted draft behind', async () => {
    failIndexWrites();

    await expect(
      localStorageBackend.save('p2', 'Tower', { savedAt: 't1', project: { id: 'p2' } }),
    ).rejects.toMatchObject({ name: 'QuotaExceededError' });

    expect(window.localStorage.getItem(PROJECT_KEY('p2'))).toBeNull();
    expect(await localStorageBackend.list()).toEqual([]);
  });

  it('keeps an already-listed draft when only its index refresh fails', async () => {
    await localStorageBackend.save('p3', 'Villa', { savedAt: 't1', project: { id: 'p3', rev: 1 } });
    failIndexWrites();

    await expect(
      localStorageBackend.save('p3', 'Villa', { savedAt: 't2', project: { id: 'p3', rev: 2 } }),
    ).rejects.toMatchObject({ name: 'QuotaExceededError' });

    expect(await localStorageBackend.list()).toEqual([{ id: 'p3', name: 'Villa', savedAt: 't1' }]);
    expect((await localStorageBackend.load('p3')).project.rev).toBe(2);
  });

  it('surfaces a full quota on the project write and leaves the old draft intact', async () => {
    await localStorageBackend.save('p4', 'Cabin', { savedAt: 't1', project: { id: 'p4', rev: 1 } });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw quotaError();
    });

    await expect(
      localStorageBackend.save('p4', 'Cabin', { savedAt: 't2', project: { id: 'p4', rev: 2 } }),
    ).rejects.toMatchObject({ name: 'QuotaExceededError' });

    expect((await localStorageBackend.load('p4')).project.rev).toBe(1);
    expect(await localStorageBackend.list()).toEqual([{ id: 'p4', name: 'Cabin', savedAt: 't1' }]);
  });
});
