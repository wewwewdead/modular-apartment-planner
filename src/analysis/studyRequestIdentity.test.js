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

/**
 * Characterization suite: what the worker re-run gate is actually made of.
 * These are the pure structural facts the gate rests on.
 */
describe('studyRequestKey composition (characterization)', () => {
  it('pins the exact set of inputs a request key is built from', () => {
    const project = { id: 'project' };
    const parsed = JSON.parse(
      studyRequestKey({ project, projectRevision: '7|a|single', settings: { mode: 'direction' }, scope: 'floor_1' }),
    );
    // Four inputs, and nothing that describes how the plan is being LOOKED at.
    expect(Object.keys(parsed).sort()).toEqual(['projectIdentity', 'projectRevision', 'scope', 'settings']);
    expect(parsed.projectRevision).toBe('7|a|single');
    expect(parsed.scope).toBe('floor_1');
    expect(parsed.settings).toEqual({ mode: 'direction' });
  });

  it('defaults projectRevision, settings and scope to null when omitted', () => {
    const parsed = JSON.parse(studyRequestKey({ project: { id: 'project' } }));
    expect(parsed.projectRevision).toBeNull();
    expect(parsed.settings).toBeNull();
    expect(parsed.scope).toBeNull();
  });

  it('is stable across repeated re-derivation of the same inputs', () => {
    const project = { id: 'project' };
    const settings = { mode: 'grid', spacing: 500 };
    const keys = new Set();
    for (let pass = 0; pass < 5; pass += 1) {
      keys.add(studyRequestKey({ project, projectRevision: '3||all', settings }));
    }
    expect(keys.size).toBe(1);
  });
});
