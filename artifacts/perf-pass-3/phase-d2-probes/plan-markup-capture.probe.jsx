import { it } from 'vitest';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { scenarioMarkups } from './planItemScenarios.testSupport';

const OUT = process.env.D2_CAPTURE_FILE;

it('captures or compares plan markup', () => {
  const now = scenarioMarkups();
  if (process.env.D2_CAPTURE_MODE === 'write') {
    writeFileSync(OUT, JSON.stringify(now));
    console.log(
      'wrote',
      Object.keys(now).length,
      'scenarios',
      Object.values(now).reduce((s, h) => s + h.length, 0),
      'chars',
    );
    return;
  }
  const before = JSON.parse(readFileSync(OUT, 'utf8'));
  let diffs = 0;
  for (const key of Object.keys(before)) {
    if (before[key] !== now[key]) {
      diffs += 1;
      const a = before[key];
      const b = now[key] || '';
      let i = 0;
      while (i < a.length && a[i] === b[i]) i++;
      console.log(
        'DIFF',
        key,
        i,
        '\nold:',
        a.slice(Math.max(0, i - 200), i + 200),
        '\nnew:',
        b.slice(Math.max(0, i - 200), i + 200),
      );
    }
  }
  console.log('compared', Object.keys(before).length, 'diffs', diffs, existsSync(OUT));
  if (diffs) throw new Error('markup changed');
});
