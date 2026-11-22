import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { describeMachine } from './machine.js';
import { projectOpenMachine } from '@/features/floorplan/hooks/projectOpenMachine';
import { sketchPersistenceMachine } from '@/features/sketchstudio/hooks/sketchPersistenceMachine';
import { previewLoadMachine } from '@/features/floorplan/components/preview/loadPhase';
import { BRAKE, FILM, LASER, MATE, PAINT, PDF_RUN, PRINT } from '@/features/sketchstudio/cad/toolSession';

/*
  docs/state-machines.md and the pages under docs/state-machines/ are what
  people and agents read to learn which states a lifecycle has before they
  change it. A table that moved on without its page is worse than no page, so
  every machine declared with defineMachine is listed here and checked against
  the registry, both ways: each declared move must be printed in the machine's
  section, and the section must print no move the table no longer has.

  Declaring a new machine: add it to MACHINES, give it a `### \`id\`` section
  on the page of its subsystem, and paste the lines this test asks for.

  The second half keeps the pages usable. A page nobody can open is no
  registry: a formatter once padded the tables of the single page this used to
  be to 11,000-character lines and 349 KB, past what an editor or an agent
  reads in one go. So the pages carry no tables, and their size, their line
  length and the files they name are checked here.
*/
const MACHINES = [
  projectOpenMachine,
  sketchPersistenceMachine,
  previewLoadMachine,
  MATE,
  PDF_RUN,
  BRAKE,
  PAINT,
  PRINT,
  LASER,
  FILM,
];

const MAX_PAGE_BYTES = 64 * 1024;
const MAX_LINE_LENGTH = 400;

const repo = fileURLToPath(new URL('../../', import.meta.url));
const read = (path) => readFileSync(`${repo}${path}`, 'utf8');

const PAGES = [
  'docs/state-machines.md',
  ...readdirSync(`${repo}docs/state-machines`)
    .filter((name) => name.endsWith('.md'))
    .sort()
    .map((name) => `docs/state-machines/${name}`),
].map((path) => ({ path, text: read(path) }));

/** The text of the `### \`id\`` section, on whichever page has it: from its heading to the next heading. */
function sectionsOf(id) {
  return PAGES.flatMap(({ text }) => {
    const start = text.indexOf(`### \`${id}\``);
    if (start === -1) return [];
    const rest = text.slice(start + 4);
    const end = rest.search(/\n#{2,3} /);
    return [end === -1 ? rest : rest.slice(0, end)];
  });
}

const printedMoves = (section) =>
  section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^\S+ --[A-Z_]+--> \S+$/.test(line));

/** Every file under `folder`, as a path from the repo root with forward slashes. */
function filesUnder(folder) {
  return readdirSync(`${repo}${folder}`, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => `${entry.parentPath.slice(repo.length)}/${entry.name}`.replaceAll('\\', '/'));
}

/*
  A page names a file either whole (`src/editor/toolSession.js`) or from the
  folder its heading declares (`store/sketchStudioReducer.js`, a bare
  `CadWorkspace.jsx`). Either way some file in the repo must end with what is
  written. Names with a `*` are patterns, not files, and are not checked.
*/
const NAMED_FILE = /`([\w@./-]+\.(?:jsx?|cjs|mjs|css|md))`/g;

describe('the state machine registry', () => {
  it('gives every machine an id of its own', () => {
    const ids = MACHINES.map((machine) => machine.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(MACHINES.map((machine) => [machine.id, machine]))(
    'prints the table of %s as it is declared',
    (id, machine) => {
      const sections = sectionsOf(id);
      expect(sections.length, `the registry needs exactly one "### \`${id}\`" section`).toBe(1);
      expect(printedMoves(sections[0]).sort()).toEqual(describeMachine(machine).sort());
    },
  );

  it('lists every page on the front page', () => {
    const front = PAGES[0].text;
    for (const { path } of PAGES.slice(1))
      expect(front, `docs/state-machines.md does not list ${path}`).toContain(path);
  });

  it.each(PAGES.map((page) => [page.path, page]))('%s stays small enough to read whole', (path, { text }) => {
    expect(Buffer.byteLength(text), 'split the page by subsystem rather than let it grow').toBeLessThan(MAX_PAGE_BYTES);
    const long = text
      .split('\n')
      .map((line, index) => ({ line: index + 1, length: line.length }))
      .filter(({ length }) => length > MAX_LINE_LENGTH);
    expect(long, 'wrap the prose; a table row padded by a formatter is what this catches').toEqual([]);
    const tableRows = text.split('\n').filter((line) => /^\|.*\|\s*$/.test(line));
    expect(tableRows, 'write entries as lists: a formatter pads every table row to its widest cell').toEqual([]);
  });

  it('names only files that exist', () => {
    const files = [...filesUnder('src'), ...filesUnder('docs'), ...filesUnder('electron'), ...filesUnder('scripts')];
    const exists = (name) => files.some((file) => file === name || file.endsWith(`/${name}`));
    const missing = PAGES.flatMap(({ path, text }) =>
      [...text.matchAll(NAMED_FILE)]
        .map((match) => match[1].replace(/^@\//, 'src/'))
        .filter((name) => !exists(name))
        .map((name) => `${path}: ${name}`),
    );
    expect([...new Set(missing)]).toEqual([]);
  });
});
