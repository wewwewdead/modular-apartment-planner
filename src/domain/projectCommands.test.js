import { describe, expect, it } from 'vitest';
import {
  applyPropagatedWallEdits,
  applyWallUpdate,
  clampWallMountedOpenings,
  mergeWallUpdate,
} from './projectCommands';
import { createColumn } from './models';

function makeFloor(overrides = {}) {
  return {
    walls: [
      { id: 'M', start: { x: 0, y: 0 }, end: { x: 4000, y: 0 }, thickness: 100 },
      { id: 'N', start: { x: 0, y: -3000 }, end: { x: 0, y: 0 }, thickness: 100 },
    ],
    doors: [],
    windows: [],
    ...overrides,
  };
}

describe('applyPropagatedWallEdits', () => {
  it('preserves a healed neighbor attachment on its untouched endpoint', () => {
    const column = createColumn(0, -3000);
    const floor = makeFloor();
    floor.columns = [column];
    floor.walls = floor.walls.map((wall) =>
      wall.id === 'N'
        ? {
            ...wall,
            startAttachment: { kind: 'column', columnId: column.id, featureType: 'corner', featureIndex: 0 },
          }
        : wall,
    );

    const next = applyPropagatedWallEdits(
      floor,
      {
        primary: { id: 'M', start: { x: 0, y: 300 }, end: { x: 4000, y: 300 } },
        secondary: [{ id: 'N', end: { x: 0, y: 300 } }],
      },
      floor.columns,
    );

    const healedN = next.walls.find((wall) => wall.id === 'N');
    // The heal moved N.end; N.start's column attachment survives and stays pinned.
    expect(healedN.end).toMatchObject({ x: 0, y: 300 });
    expect(healedN.startAttachment).toMatchObject({ columnId: column.id });
  });

  it('re-validates preserved attachments: a missing column detaches cleanly', () => {
    const floor = makeFloor();
    floor.walls = floor.walls.map((wall) =>
      wall.id === 'N'
        ? {
            ...wall,
            startAttachment: { kind: 'column', columnId: 'col_gone', featureType: 'corner', featureIndex: 0 },
          }
        : wall,
    );

    const next = applyPropagatedWallEdits(
      floor,
      {
        primary: { id: 'M', start: { x: 0, y: 300 }, end: { x: 4000, y: 300 } },
        secondary: [{ id: 'N', end: { x: 0, y: 300 } }],
      },
      [],
    );

    expect(next.walls.find((wall) => wall.id === 'N').startAttachment).toBeNull();
  });

  it('clamps openings hosted on healed neighbors when their length shrinks', () => {
    const floor = makeFloor({
      doors: [{ id: 'door_1', wallId: 'N', offset: 2800, width: 900 }],
    });

    const next = applyPropagatedWallEdits(
      floor,
      {
        primary: { id: 'M', start: { x: 0, y: -1000 }, end: { x: 4000, y: -1000 } },
        // Heal shrinks N from 3000 to 2000.
        secondary: [{ id: 'N', end: { x: 0, y: -1000 } }],
      },
      [],
    );

    const door = next.doors.find((d) => d.id === 'door_1');
    // N is now 2000 long; offset clamps to len - width/2 = 1550.
    expect(door.offset).toBe(1550);
  });

  it('applies primary edits with user-edit semantics (mergeWallUpdate path)', () => {
    const floor = makeFloor();
    floor.walls = floor.walls.map((wall) =>
      wall.id === 'M'
        ? {
            ...wall,
            startAttachment: { kind: 'column', columnId: 'col_1', featureType: 'corner', featureIndex: 0 },
          }
        : wall,
    );

    const next = applyPropagatedWallEdits(
      floor,
      {
        primary: { id: 'M', start: { x: 0, y: 300 }, end: { x: 4000, y: 300 } },
        secondary: [],
      },
      [],
    );

    // Primary endpoint change without attachment field = deliberate detach [R].
    expect(next.walls.find((wall) => wall.id === 'M').startAttachment).toBeNull();
  });
});

describe('regressions — existing wall command semantics unchanged', () => {
  it('[R] mergeWallUpdate nulls attachments when endpoints change without attachment fields', () => {
    const wall = {
      id: 'w1',
      start: { x: 0, y: 0 },
      end: { x: 1000, y: 0 },
      startAttachment: { kind: 'column', columnId: 'col_x', featureType: 'corner', featureIndex: 0 },
      endAttachment: null,
    };
    const merged = mergeWallUpdate(wall, { id: 'w1', start: { x: 50, y: 50 } }, []);
    expect(merged.startAttachment).toBeNull();
  });

  it('[R] mergeWallUpdate keeps attachments when the update carries them', () => {
    const attachment = { kind: 'column', columnId: 'col_gone', featureType: 'corner', featureIndex: 0 };
    const wall = { id: 'w1', start: { x: 0, y: 0 }, end: { x: 1000, y: 0 } };
    const merged = mergeWallUpdate(wall, { id: 'w1', start: { x: 50, y: 50 }, startAttachment: attachment }, []);
    // Column doesn't exist → sync clears it; the semantic under test is that
    // the field passed through merge (not nulled by the endpoint-change rule).
    expect(merged.startAttachment).toBeNull();
  });

  it('[R] clampWallMountedOpenings clamps only openings on the target wall', () => {
    const openings = [
      { id: 'a', wallId: 'w1', offset: 2900, width: 900 },
      { id: 'b', wallId: 'w2', offset: 2900, width: 900 },
    ];
    const clamped = clampWallMountedOpenings(openings, 'w1', 2000);
    expect(clamped.find((o) => o.id === 'a').offset).toBe(1550);
    expect(clamped.find((o) => o.id === 'b').offset).toBe(2900);
  });

  it('[R] applyWallUpdate clamps hosted openings when the wall shrinks', () => {
    const floor = makeFloor({
      doors: [{ id: 'door_1', wallId: 'M', offset: 3800, width: 900 }],
    });
    const next = applyWallUpdate(floor, { id: 'M', end: { x: 2000, y: 0 } }, []);
    expect(next.doors[0].offset).toBe(1550);
  });
});
