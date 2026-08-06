import { describe, expect, it } from 'vitest';
import {
  combinedWindRequestKey,
  studyRequestKey,
  windMassingKey,
  windNetworkKey,
  windRequestKeys,
} from './studyRequestIdentity';
import { createWindStudyState, windRunSettingsOf } from './windState';
import { createWindApartmentProject } from './__fixtures__/windApartmentProject';

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

/**
 * The wind key split (T6).
 *
 * Two keys instead of one, because the two halves of a wind study cost three
 * orders of magnitude apart. `massingKey` names the solid the lattice flows
 * around; `networkKey` names everything the multizone solve reads. A change that
 * moves only the second must not cost a lattice solve, and a change that moves
 * the first must cost one — those two sentences are what this block is.
 *
 * Not characterization: this is new contract.
 */
describe('wind massing / network key split', () => {
  const baseSettings = () => windRunSettingsOf(createWindStudyState({ enabled: true }));

  function keysOf(project, overrides = {}) {
    return windRequestKeys({ project, settings: { ...baseSettings(), ...overrides } });
  }

  function editedProject(mutate) {
    const project = createWindApartmentProject();
    mutate(project, project.floors[0]);
    return project;
  }

  it('is stable for the same content in a different object', () => {
    const first = keysOf(createWindApartmentProject());
    const second = keysOf(createWindApartmentProject());
    expect(second.massingKey).toBe(first.massingKey);
    expect(second.networkKey).toBe(first.networkKey);
    expect(second.key).toBe(first.key);
  });

  it('derives the combined key from the pair, and nothing else', () => {
    const keys = keysOf(createWindApartmentProject());
    expect(keys.key).toBe(combinedWindRequestKey(keys));
    expect(keys.key).toContain(keys.massingKey);
    expect(keys.key).toContain(keys.networkKey);
  });

  it('carries a length alongside the hash, so unequal inputs of unequal size cannot collide', () => {
    const project = createWindApartmentProject();
    for (const key of [
      windMassingKey({ project, settings: baseSettings() }),
      windNetworkKey({ project, settings: baseSettings() }),
    ]) {
      const [hash, length] = key.split(':');
      expect(hash).toMatch(/^[0-9a-f]{16}$/);
      expect(Number(length)).toBeGreaterThan(0);
    }
  });

  it('leaves the massing key alone for every ventilation-only edit', () => {
    const base = keysOf(createWindApartmentProject());
    const edits = {
      'window open fraction': (_, floor) => {
        floor.windows[0].ventilation = { ...floor.windows[0].ventilation, openFraction: 0.1 };
      },
      'window discharge coefficient': (_, floor) => {
        floor.windows[0].ventilation = { ...floor.windows[0].ventilation, dischargeCoefficient: 0.5 };
      },
      'a fixed window made operable': (_, floor) => {
        floor.windows[5].type = 'standard';
      },
      'door open fraction': (_, floor) => {
        floor.doors[0].ventilation = { ...floor.doors[0].ventilation, openFraction: 0.2 };
      },
      'window width': (_, floor) => {
        floor.windows[0].width = 900;
      },
      'window sill height': (_, floor) => {
        floor.windows[0].sillHeight = 1100;
      },
      'room polygon': (_, floor) => {
        floor.rooms[0].points[2] = { x: 6800, y: 4400 };
      },
      'room renamed': (_, floor) => {
        floor.rooms[0].name = 'Lounge';
      },
      'a room removed entirely': (_, floor) => {
        floor.rooms.pop();
      },
    };

    for (const [label, mutate] of Object.entries(edits)) {
      const keys = keysOf(editedProject(mutate));
      expect(keys.massingKey, label).toBe(base.massingKey);
      expect(keys.networkKey, label).not.toBe(base.networkKey);
    }
  });

  it('moves the massing key for every edit that changes what the lattice flows around', () => {
    const base = keysOf(createWindApartmentProject());
    const edits = {
      'wall moved': (_, floor) => {
        floor.walls[0].end = { x: 12500, y: 0 };
      },
      'wall thickened': (_, floor) => {
        floor.walls[0].thickness = 300;
      },
      'wall raised': (_, floor) => {
        floor.walls[0].height = 4200;
      },
      'wall curved': (_, floor) => {
        floor.walls[0].controlPoint = { x: 6000, y: -900 };
      },
      'wall deleted': (_, floor) => {
        floor.walls.pop();
      },
      'floor raised': (_, floor) => {
        floor.elevation = 3000;
      },
      'floor-to-floor height changed': (_, floor) => {
        floor.floorToFloorHeight = 3600;
      },
      'a column added': (_, floor) => {
        floor.columns = [{ x: 3000, y: 3000, width: 400, depth: 400, rotation: 0, height: 3200 }];
      },
      'a slab added': (_, floor) => {
        floor.slabs = [
          {
            boundaryPoints: [
              { x: 0, y: -2000 },
              { x: 4000, y: -2000 },
              { x: 4000, y: 0 },
              { x: 0, y: 0 },
            ],
            elevation: 1200,
            thickness: 200,
          },
        ];
      },
      'site rotated': (project) => {
        project.building.site.northAngle = 30;
      },
    };

    for (const [label, mutate] of Object.entries(edits)) {
      expect(keysOf(editedProject(mutate)).massingKey, label).not.toBe(base.massingKey);
    }
  });

  it('moves the massing key for every solver control the lattice is built from', () => {
    const project = createWindApartmentProject();
    const base = keysOf(project);
    for (const patch of [
      { sliceHeight: 1800 },
      { resolution: 128 },
      { iterations: 900 },
      { relaxationTime: 0.7 },
      { domainPadding: 45000 },
      { directionDeg: 90 },
      { mode: 'comfort' },
    ]) {
      expect(keysOf(project, patch).massingKey, JSON.stringify(patch)).not.toBe(base.massingKey);
    }
  });

  it('leaves the massing key alone when only the reference speed changes', () => {
    const project = createWindApartmentProject();
    const base = keysOf(project);
    const faster = keysOf(project, { referenceSpeed: 11 });
    // The lattice is dimensionless. A different wind speed reads the same field.
    expect(faster.massingKey).toBe(base.massingKey);
    expect(faster.networkKey).not.toBe(base.networkKey);
  });

  it('files a comfort rose by the sectors it will solve, not by the frequencies it will mix', () => {
    const project = createWindApartmentProject();
    const rose = [
      { directionDeg: 0, frequency: 0.6, weibullK: 2, weibullC: 5 },
      { directionDeg: 180, frequency: 0.4, weibullK: 2, weibullC: 5 },
    ];
    const base = keysOf(project, { mode: 'comfort', windRose: rose });

    // Same directions, different weighting: every sector field is identical, so
    // the massing key must hold and only the mixture is re-assembled.
    const reweighted = keysOf(project, {
      mode: 'comfort',
      windRose: [
        { ...rose[0], frequency: 0.2 },
        { ...rose[1], frequency: 0.8 },
      ],
    });
    expect(reweighted.massingKey).toBe(base.massingKey);
    expect(reweighted.networkKey).not.toBe(base.networkKey);

    // A sector that points somewhere else is a lattice run that does not exist yet.
    const reaimed = keysOf(project, { mode: 'comfort', windRose: [rose[0], { ...rose[1], directionDeg: 270 }] });
    expect(reaimed.massingKey).not.toBe(base.massingKey);

    // 360 and 0 are the same bearing and the normaliser says so, which makes
    // this a legal cache hit rather than a coincidence to guard against.
    const wrapped = keysOf(project, { mode: 'comfort', windRose: [{ ...rose[0], directionDeg: 360 }, rose[1]] });
    expect(wrapped.massingKey).toBe(base.massingKey);
  });

  it('keeps a wall in BOTH keys, because the network reads walls too', () => {
    const base = keysOf(createWindApartmentProject());
    const moved = keysOf(
      editedProject((_, floor) => {
        floor.walls[0].end = { x: 12500, y: 0 };
      }),
    );
    // Room heights are probed off wall midpoints and every opening's centre and
    // outward normal come from its wall, so a wall edit is not massing-only.
    expect(moved.massingKey).not.toBe(base.massingKey);
    expect(moved.networkKey).not.toBe(base.networkKey);
  });

  it('reads an empty project without throwing, and tells it from a populated one', () => {
    const empty = windRequestKeys({ project: null, settings: baseSettings() });
    expect(typeof empty.massingKey).toBe('string');
    expect(typeof empty.networkKey).toBe('string');
    const populated = keysOf(createWindApartmentProject());
    expect(empty.massingKey).not.toBe(populated.massingKey);
    expect(empty.networkKey).not.toBe(populated.networkKey);
  });
});
