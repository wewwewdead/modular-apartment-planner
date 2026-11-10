/**
 * The status a study panel is shown, as a table.
 *
 * `useStudyWorker` stores only what a run answered — the study, which inputs it
 * was for, and which inputs were last answered at all — and derives everything
 * else here, against the inputs the plan has now. Each row is one situation a
 * panel can be in.
 */

import { describe, expect, it } from 'vitest';
import { deriveStudyStatus } from './useStudyWorker';

const EMPTY = { study: null, studyKey: null, key: null, error: null, progress: null, unavailable: false };
const STUDY = { name: 'study' };

const result = (patch) => ({ ...EMPTY, ...patch });

describe('deriveStudyStatus', () => {
  it.each([
    [
      'switched off',
      { active: false, requestKey: 'a', result: result({ study: STUDY, studyKey: 'a', key: 'a' }) },
      'idle',
      false,
    ],
    [
      'switched off with a study from other inputs',
      { active: false, requestKey: 'b', result: result({ study: STUDY, studyKey: 'a', key: 'a' }) },
      'idle',
      false,
    ],
    ['first run in flight', { active: true, requestKey: 'a', result: EMPTY }, 'running', false],
    [
      'answered for these inputs',
      { active: true, requestKey: 'a', result: result({ study: STUDY, studyKey: 'a', key: 'a' }) },
      'ready',
      false,
    ],
    [
      'an edit is being solved',
      { active: true, requestKey: 'b', result: result({ study: STUDY, studyKey: 'a', key: 'a' }) },
      'running',
      true,
    ],
    [
      'a superseded run landed',
      { active: true, requestKey: 'c', result: result({ study: STUDY, studyKey: 'b', key: 'b' }) },
      'running',
      true,
    ],
    [
      'these inputs failed, nothing on screen',
      { active: true, requestKey: 'a', result: result({ key: 'a', error: 'failed' }) },
      'error',
      false,
    ],
    [
      'these inputs failed beside an older study',
      { active: true, requestKey: 'b', result: result({ study: STUDY, studyKey: 'a', key: 'b', error: 'failed' }) },
      'error',
      true,
    ],
    [
      'an older run failed, these are being solved',
      { active: true, requestKey: 'c', result: result({ study: STUDY, studyKey: 'a', key: 'b', error: 'failed' }) },
      'running',
      true,
    ],
    [
      'no worker for these inputs',
      { active: true, requestKey: 'a', result: result({ key: 'a', unavailable: true }) },
      'unavailable',
      false,
    ],
    [
      'no worker since an earlier edit',
      { active: true, requestKey: 'b', result: result({ key: 'a', unavailable: true }) },
      'unavailable',
      false,
    ],
    [
      'no worker, an older study on screen',
      { active: true, requestKey: 'b', result: result({ study: STUDY, studyKey: 'a', key: 'b', unavailable: true }) },
      'unavailable',
      true,
    ],
  ])('%s', (_situation, input, status, stale) => {
    expect(deriveStudyStatus(input)).toEqual({ status, stale });
  });
});
