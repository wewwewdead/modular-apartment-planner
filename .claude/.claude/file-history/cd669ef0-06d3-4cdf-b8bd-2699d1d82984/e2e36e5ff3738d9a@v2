import { createPanel, createLeg } from './partModels';
import { createAssembly } from './assemblyModels';

export function buildDemoTable() {
  const assembly = createAssembly('Office Desk', { category: 'table' });

  // Tabletop: 1200×600mm panel at z=720 (on top of legs)
  const tabletop = createPanel({
    name: 'Tabletop',
    width: 1200,
    depth: 600,
    thickness: 18,
    material: 'plywood',
    position: { x: 0, y: 0, z: 720 },
    fill: 'rgba(184, 134, 11, 0.06)',
  });

  const inset = 30;
  const legW = 40;
  const legD = 40;
  const legH = 720;

  const legTL = createLeg({
    name: 'Leg TL',
    width: legW, depth: legD, height: legH,
    position: { x: inset, y: inset, z: 0 },
  });

  const legTR = createLeg({
    name: 'Leg TR',
    width: legW, depth: legD, height: legH,
    position: { x: 1200 - inset - legW, y: inset, z: 0 },
  });

  const legBL = createLeg({
    name: 'Leg BL',
    width: legW, depth: legD, height: legH,
    position: { x: inset, y: 600 - inset - legD, z: 0 },
  });

  const legBR = createLeg({
    name: 'Leg BR',
    width: legW, depth: legD, height: legH,
    position: { x: 1200 - inset - legW, y: 600 - inset - legD, z: 0 },
  });

  const parts = [tabletop, legTL, legTR, legBL, legBR];
  assembly.partIds = parts.map((p) => p.id);
  for (const part of parts) {
    part.assemblyId = assembly.id;
  }

  return { assembly, parts };
}
