import { describe, expect, it } from 'vitest';
import { deriveDocumentModelSignature } from './documentSignature';
import { createFloor, createProject, createWall } from './models';

function projectWithWall() {
  const project = createProject('Signed');
  const floor = project.floors[0] || createFloor('Ground');
  const wall = createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }, 200);
  return { ...project, floors: [{ ...floor, walls: [...(floor.walls || []), wall] }] };
}

describe('deriveDocumentModelSignature', () => {
  it('is the same answer for the same project object, and a different one for a changed model', () => {
    const project = projectWithWall();
    const first = deriveDocumentModelSignature(project);
    expect(deriveDocumentModelSignature(project)).toBe(first);

    const moved = {
      ...project,
      floors: [{ ...project.floors[0], walls: [{ ...project.floors[0].walls[0], end: { x: 4100, y: 0 } }] }],
    };
    expect(deriveDocumentModelSignature(moved)).not.toBe(first);
  });

  it('ignores the issued documentation and the professional exchange, which describe the model rather than being it', () => {
    const project = projectWithWall();
    const issued = {
      ...project,
      building: { ...project.building, documentationRealization: { issued: true }, professionalExchange: { x: 1 } },
    };
    expect(deriveDocumentModelSignature(issued)).toBe(deriveDocumentModelSignature(project));
  });

  it('notices a part swapped on the same object rather than serving the memo', () => {
    const project = projectWithWall();
    const before = deriveDocumentModelSignature(project);
    project.floors = [{ ...project.floors[0], walls: [] }];
    expect(deriveDocumentModelSignature(project)).not.toBe(before);
  });

  it('does not serialise an unchanged project twice', () => {
    const project = projectWithWall();
    const original = JSON.stringify;
    let calls = 0;
    JSON.stringify = (...args) => {
      calls += 1;
      return original(...args);
    };
    try {
      deriveDocumentModelSignature(project);
      deriveDocumentModelSignature(project);
      deriveDocumentModelSignature(project);
    } finally {
      JSON.stringify = original;
    }
    expect(calls).toBe(1);
  });
});
