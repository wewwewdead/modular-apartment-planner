import { describe, expect, it } from 'vitest';
import { studyRequestKey } from './studyRequestIdentity';
import { createWindStudyState, windRunSettingsOf } from './windState';

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
 * Behavioural pins that drive the real reducer live in
 * `src/features/floorplan/context/WindStudyContext.test.jsx`; these are the
 * pure structural facts the gate rests on.
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

  it('compares settings by value, so a re-derived settings object does not re-run', () => {
    const project = { id: 'project' };
    const settings = windRunSettingsOf(createWindStudyState({ enabled: true }));
    const rederived = windRunSettingsOf(createWindStudyState({ enabled: true }));
    expect(rederived).not.toBe(settings);
    expect(studyRequestKey({ project, projectRevision: '3||all', settings: rederived })).toBe(
      studyRequestKey({ project, projectRevision: '3||all', settings }),
    );
  });

  it('is stable across repeated no-op re-derivation of the same inputs', () => {
    const project = { id: 'project' };
    const settings = windRunSettingsOf(createWindStudyState({ enabled: true }));
    const keys = new Set();
    for (let pass = 0; pass < 5; pass += 1) {
      keys.add(studyRequestKey({ project, projectRevision: '3||all', settings }));
    }
    expect(keys.size).toBe(1);
  });

  it('changes for every wind setting the solver actually consumes', () => {
    const project = { id: 'project' };
    const base = createWindStudyState({ enabled: true });
    const baseKey = studyRequestKey({ project, projectRevision: '3||all', settings: windRunSettingsOf(base) });
    const patches = [
      { mode: 'comfort' },
      { directionDeg: 90 },
      { referenceSpeed: 7 },
      { sliceHeight: 1800 },
      { resolution: 128 },
      { iterations: 900 },
      { relaxationTime: 0.7 },
      { domainPadding: 45000 },
      { windRoseSource: 'user' },
      { windRose: [{ directionDeg: 0, frequency: 1, weibullK: 2, weibullC: 5 }] },
    ];
    for (const patch of patches) {
      const settings = windRunSettingsOf({ ...base, ...patch });
      expect(studyRequestKey({ project, projectRevision: '3||all', settings }), JSON.stringify(patch)).not.toBe(
        baseKey,
      );
    }
  });

  it('pins the wind settings key set — nothing viewport-shaped is in it', () => {
    const settings = windRunSettingsOf(createWindStudyState({ enabled: true }));
    expect(Object.keys(settings).sort()).toEqual([
      'directionDeg',
      'domainPadding',
      'iterations',
      'mode',
      'referenceSpeed',
      'relaxationTime',
      'resolution',
      'sliceHeight',
      'windRose',
      'windRoseSource',
    ]);
    // `enabled` is deliberately not part of the run identity: the hook gates on
    // it separately and always posts `enabled: true`.
    expect(settings.enabled).toBeUndefined();
    for (const key of Object.keys(settings)) {
      expect(/viewport|zoom|pan|scroll|screen/i.test(key), key).toBe(false);
    }
  });
});
