import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { describeMachine } from './machine.js';
import { projectOpenMachine } from '@/features/floorplan/hooks/projectOpenMachine';
import { sketchPersistenceMachine } from '@/features/sketchstudio/hooks/sketchPersistenceMachine';
import { MATE, PDF_RUN } from '@/features/sketchstudio/cad/toolSession';

/*
  docs/state-machines.md is the page people and agents read to learn which
  states a lifecycle has before they change it. A table that moved on without
  the page is worse than no page, so every machine declared with defineMachine
  is listed here and checked against it, both ways: each declared move must be
  printed in the machine's section, and the section must print no move the
  table no longer has.

  Declaring a new machine: add it to MACHINES, give it a `### \`id\`` section
  on the page, and paste the lines this test asks for.
*/
const MACHINES = [projectOpenMachine, sketchPersistenceMachine, MATE, PDF_RUN];

const registry = readFileSync(fileURLToPath(new URL('../../docs/state-machines.md', import.meta.url)), 'utf8');

/** The text of the `### \`id\`` section: from its heading to the next heading. */
function sectionOf(id) {
  const start = registry.indexOf(`### \`${id}\``);
  if (start === -1) return null;
  const rest = registry.slice(start + 4);
  const end = rest.search(/\n#{2,3} /);
  return end === -1 ? rest : rest.slice(0, end);
}

const printedMoves = (section) =>
  section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^\S+ --[A-Z_]+--> \S+$/.test(line));

describe('docs/state-machines.md', () => {
  it('gives every machine an id of its own', () => {
    const ids = MACHINES.map((machine) => machine.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(MACHINES.map((machine) => [machine.id, machine]))(
    'prints the table of %s as it is declared',
    (id, machine) => {
      const section = sectionOf(id);
      expect(section, `docs/state-machines.md has no "### \`${id}\`" section`).not.toBeNull();
      expect(printedMoves(section).sort()).toEqual(describeMachine(machine).sort());
    },
  );
});
