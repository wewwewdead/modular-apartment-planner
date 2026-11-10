import { describe, expect, it } from 'vitest';
import { describeMachine } from '@/shared/machine';
import { advancePersistenceMeta, resumeEventFor, sketchPersistenceMachine } from './sketchPersistenceMachine';

const ANYWHERE = (from) => [
  `${from} --LOAD--> idle`,
  `${from} --OPEN--> opened`,
  `${from} --SAVE--> saving`,
  `${from} --SAVED--> saved`,
  `${from} --FAIL--> error`,
];

describe('the sketch document persistence table', () => {
  it('declares every move the hook makes', () => {
    expect(sketchPersistenceMachine.id).toBe('sketch-persistence');
    expect(sketchPersistenceMachine.initial).toBe('idle');
    expect(describeMachine(sketchPersistenceMachine)).toEqual([
      ...ANYWHERE('idle'),
      'idle --RECOVER--> recovered',
      'idle --EDIT--> dirty',
      ...ANYWHERE('recovered'),
      'recovered --EDIT--> dirty',
      ...ANYWHERE('opened'),
      'opened --EDIT--> dirty',
      ...ANYWHERE('saving'),
      'saving --EDIT--> dirty',
      'saving --RESUME_IDLE--> idle',
      'saving --RESUME_RECOVERED--> recovered',
      'saving --RESUME_OPENED--> opened',
      'saving --RESUME_SAVED--> saved',
      'saving --RESUME_ERROR--> error',
      'saving --RESUME_DIRTY--> dirty',
      ...ANYWHERE('saved'),
      'saved --EDIT--> dirty',
      ...ANYWHERE('error'),
      'error --EDIT--> dirty',
      'error --DISMISS--> error',
      ...ANYWHERE('dirty'),
      'dirty --CLEAN--> idle',
    ]);
  });

  it('names the way back from a cancelled save after the status it left', () => {
    expect(resumeEventFor('opened')).toBe('RESUME_OPENED');
    expect(sketchPersistenceMachine.next('saving', resumeEventFor('recovered'))).toBe('recovered');
    // A second save started while one is running has nothing to go back to.
    expect(sketchPersistenceMachine.can('saving', resumeEventFor('saving'))).toBe(false);
  });
});

describe('advancing the persistence meta', () => {
  const meta = (status, error = null) => ({
    savedAt: 't0',
    fileName: 'a.sketch.json',
    savedDocumentName: 'A',
    status,
    error,
  });

  it('leaves the meta untouched for an event the status ignores', () => {
    const current = meta('dirty');
    expect(advancePersistenceMeta(current, 'EDIT')).toBe(current);
    const idle = meta('idle');
    expect(advancePersistenceMeta(idle, 'CLEAN')).toBe(idle);
  });

  it('clears the error on any accepted move that does not bring one', () => {
    expect(advancePersistenceMeta(meta('error', 'Disk full'), 'EDIT')).toEqual(meta('dirty'));
    expect(advancePersistenceMeta(meta('error', 'Disk full'), 'DISMISS')).toEqual(meta('error'));
    expect(advancePersistenceMeta(meta('saving'), 'FAIL', { error: 'Disk full' })).toEqual(meta('error', 'Disk full'));
  });

  it('writes the fields an event carries', () => {
    expect(advancePersistenceMeta(meta('saving'), 'SAVED', { savedAt: 't1', fileName: 'b.sketch.json' })).toEqual({
      savedAt: 't1',
      fileName: 'b.sketch.json',
      savedDocumentName: 'A',
      status: 'saved',
      error: null,
    });
  });
});
