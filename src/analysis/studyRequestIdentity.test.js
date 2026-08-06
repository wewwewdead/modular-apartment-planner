import { describe, expect, it } from 'vitest';
import { studyRequestKey } from './studyRequestIdentity';

describe('studyRequestKey', () => {
  it('changes when geometry is replaced even if settings are identical', () => {
    const settings = { spacing: 500 };
    const before = { id: 'project' };
    const after = { ...before };

    expect(studyRequestKey({ project: before, settings })).not.toBe(studyRequestKey({ project: after, settings }));
  });

  it('is stable for the same project and changes with phase/editor revision', () => {
    const project = { id: 'project' };
    const first = studyRequestKey({ project, settings: {}, projectRevision: '4|existing' });
    expect(studyRequestKey({ project, settings: {}, projectRevision: '4|existing' })).toBe(first);
    expect(studyRequestKey({ project, settings: {}, projectRevision: '4|proposed' })).not.toBe(first);
  });
});
