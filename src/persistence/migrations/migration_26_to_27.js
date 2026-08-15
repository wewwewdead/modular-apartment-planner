import { registerMigration } from './index';
import { CEILING_DROP } from '@/domain/defaults';

// Ceilings used to hang from a truss system; they now hang from the beams
// themselves. A truss carried by a beam pair already names those beams, so the
// attachment can be rebuilt from it — and where it cannot (no truss, no beam
// pair, or a truss standing on another floor) the ceiling keeps the boundary and
// the height it already had, on its own manual datum.
//
// `version` is deliberately left alone: this step changes only the persistence
// schema, and the domain format version (CURRENT_PROJECT_FORMAT_VERSION) is
// unchanged at 23.

// The value the truss tool wrote for a beam-carried instance.
const BEAM_PAIR_SUPPORT_MODE = 'beam_pair';

function normalizeBeamIds(value) {
  return [...new Set((Array.isArray(value) ? value : []).filter((id) => typeof id === 'string' && id))];
}

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

// Matches createCeilingSuspension: a missing or nonsensical drop resolves to the
// same default the loaded ceiling will use.
function suspensionDrop(ceiling) {
  const drop = Number(ceiling?.detailing?.suspension?.drop);
  return Number.isFinite(drop) && drop > 0 ? drop : CEILING_DROP;
}

function collectTrussSupportBeamIds(trussSystem) {
  return normalizeBeamIds(
    (trussSystem?.trussInstances || [])
      .filter((instance) => instance?.supportMode === BEAM_PAIR_SUPPORT_MODE)
      .flatMap((instance) => [instance?.supportBeamIds?.start, instance?.supportBeamIds?.end]),
  );
}

function migrateCeiling(ceiling, project) {
  const attachment = ceiling?.attachment || {};
  const beamIds = normalizeBeamIds(attachment.beamIds);

  if (attachment.mode !== 'truss') {
    return {
      ...ceiling,
      attachment: { mode: attachment.mode === 'beam' ? 'beam' : 'manual', beamIds },
    };
  }

  const trussSystem = (project.trussSystems || []).find((entry) => entry?.id === attachment.trussSystemId) || null;
  const trussFloor = (project.floors || []).find((entry) => entry?.id === trussSystem?.floorId) || null;
  const floorBeamIds = new Set((trussFloor?.beams || []).map((beam) => beam?.id).filter(Boolean));
  const supportBeamIds = collectTrussSupportBeamIds(trussSystem).filter((id) => floorBeamIds.has(id));
  const trussElevation = trussSystem ? finite(trussSystem.baseElevation, null) : null;

  // The trusses stood on beams under this very ceiling: those beams are the new
  // attachment, and the plane the ceiling hung from is their level.
  if (supportBeamIds.length >= 2 && trussSystem.floorId === ceiling.floorId) {
    return {
      ...ceiling,
      attachment: { mode: 'beam', beamIds: supportBeamIds },
      baseElevation: trussElevation ?? ceiling.baseElevation,
    };
  }

  return {
    ...ceiling,
    attachment: { mode: 'manual', beamIds: [] },
    // Truss mode stored the attachment plane and hung the boards a drop below
    // it; manual mode stores the boards themselves. Carrying the plane across
    // unchanged would lift the whole ceiling by its drop.
    baseElevation: trussElevation === null ? ceiling.baseElevation : trussElevation - suspensionDrop(ceiling),
  };
}

export function migrateV26toV27(project) {
  if (!Array.isArray(project.ceilings) || !project.ceilings.length) return project;

  return {
    ...project,
    ceilings: project.ceilings.map((ceiling) => migrateCeiling(ceiling, project)),
  };
}

registerMigration(26, 27, migrateV26toV27);
