/*
 * Writes scripts/fixtures/bench-ceiling-project.json, the project
 * scripts/verify-ceiling-light-placement.mjs loads. Skipped unless asked for:
 *
 *   WRITE_BENCH_CEILING=1 npx vitest run scripts/fixtures/benchCeilingProject.test.js
 *
 * A script driving the browser cannot import the domain through Vite's `@/`
 * alias, so the fixture is built here once and committed. It is the playground
 * demo's first floor with one ceiling from `createCeilingForProject` — the
 * 12 × 10 m, 2,000-screw ceiling the light-placement spec was measured on —
 * plus one named room covering it, so the RCP's plan underlay has a label to
 * show.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import demo from '@/pages/playground-demo.json';
import { deserializeProject } from '@/persistence/deserialize';
import { serializeProject } from '@/persistence/serialize';
import { createCeilingForProject, deriveCeilingDetail, resolveCeilingBoundary } from '@/domain/ceilingModels';
import { createRoom } from '@/domain/models';

export const BENCH_ROOM_NAME = 'Open-plan living';

it.skipIf(!process.env.WRITE_BENCH_CEILING)('writes the bench ceiling project', () => {
  const project = deserializeProject(demo).project;
  const floor = project.floors[0];
  const ceiling = createCeilingForProject(project, { floorId: floor.id });
  const withCeiling = { ...project, ceilings: [ceiling] };
  const room = createRoom(
    BENCH_ROOM_NAME,
    resolveCeilingBoundary(withCeiling, ceiling).map((point) => ({ x: point.x, y: point.y })),
  );
  const bench = {
    ...withCeiling,
    id: 'bench-ceiling-project',
    name: 'Bench ceiling',
    floors: project.floors.map((entry) =>
      entry === floor ? { ...floor, rooms: [...(floor.rooms || []), room] } : entry,
    ),
  };
  const detail = deriveCeilingDetail(ceiling, bench);
  expect(detail.panels.length).toBeGreaterThan(10);
  expect(detail.fasteners.length).toBeGreaterThan(1000);
  const out = fileURLToPath(new URL('./bench-ceiling-project.json', import.meta.url));
  writeFileSync(out, `${JSON.stringify(serializeProject(bench), null, 2)}\n`);
});
