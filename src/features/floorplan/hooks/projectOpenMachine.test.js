import { describe, expect, it } from 'vitest';
import { describeMachine } from '@/shared/machine';
import { projectOpenMachine, projectOpenEventForStage } from './projectOpenMachine';

describe('projectOpenMachine', () => {
  it('declares every way a project can come in, and every way it can stop', () => {
    expect(projectOpenMachine.id).toBe('project-open');
    expect(projectOpenMachine.initial).toBe('idle');
    expect(describeMachine(projectOpenMachine)).toEqual([
      'idle --OPEN_DRAFT--> draft',
      'idle --PICK--> picking',
      'idle --READ--> reading',
      'picking --READ--> reading',
      'picking --FAIL--> idle',
      'picking --CANCEL--> idle',
      'draft --COMMIT--> idle',
      'draft --FAIL--> idle',
      'draft --CANCEL--> idle',
      'reading --READ--> reading',
      'reading --UNPACK--> unpacking',
      'reading --COMMIT--> idle',
      'reading --FAIL--> idle',
      'reading --CANCEL--> idle',
      'unpacking --UNPACK--> unpacking',
      'unpacking --COMMIT--> idle',
      'unpacking --FAIL--> idle',
      'unpacking --CANCEL--> idle',
    ]);
  });

  it('can be cancelled from every stage a load passes through, and from nowhere else', () => {
    for (const state of ['picking', 'draft', 'reading', 'unpacking']) {
      expect(projectOpenMachine.next(state, 'CANCEL')).toBe('idle');
    }
    // Closing the dialog with nothing loading cancels nothing.
    expect(projectOpenMachine.can('idle', 'CANCEL')).toBe(false);
  });

  it('has no use for a reply once the load has ended', () => {
    // What a cancelled or finished load hears afterwards: its own progress,
    // result or failure, arriving at a machine that is back at rest.
    for (const event of ['UNPACK', 'COMMIT', 'FAIL', 'CANCEL']) {
      expect(projectOpenMachine.can('idle', event)).toBe(false);
    }
  });

  it('does not let a file slip back to reading once it is being unpacked', () => {
    expect(projectOpenMachine.next('unpacking', 'READ')).toBe('unpacking');
  });

  it('turns the stage a reader reports into the event for it', () => {
    expect(projectOpenEventForStage('reading')).toBe('READ');
    expect(projectOpenEventForStage('unpacking')).toBe('UNPACK');
    expect(projectOpenEventForStage('something else')).toBeNull();
  });
});
