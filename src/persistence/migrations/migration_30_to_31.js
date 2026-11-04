import { getAttachedTrussSystem, syncRoofSystemAttachment } from '@/domain/roofModels';
import { registerMigration } from './index';

// RT-3.1 (docs/roof-truss-industrial.md §7.8.3, judgment call §9.11): a roof
// attached to a truss system loses its stored `attachmentOffset`.
//
// Before RT-3 the attachment datum was the top-chord CENTRE-LINE at the start
// tail plus the purlin depth, and the preset ridge sat `slope × overhang` too
// high, so users pulled the roof down with the Base elevation field (the
// playground stores −200). RT-3 moved the datum to the chord TOP FACE + the
// purlins, where the roof underside belongs; under it that old offset drops
// the roof into the trusses (purlins through the covering). The offset was a
// workaround, so it goes to 0 and the base elevation is re-derived by the
// normalizer (`syncRoofSystemAttachment`: attachment elevation + offset).
//
// A detached roof — no `trussAttachmentId`, or one naming a truss system the
// project no longer has (the normalizer then measures from the floor stack, so
// the offset still means what the user set) — is untouched.
//
// `version` is deliberately left alone: this step changes only the persistence
// schema; the domain format version (CURRENT_PROJECT_FORMAT_VERSION) is
// unchanged at 23.

export function migrateV30toV31(project) {
  const roofSystem = project?.roofSystem;
  if (!roofSystem || typeof roofSystem !== 'object') return project;
  if (!getAttachedTrussSystem(project, roofSystem)) return project;

  const resetRoofSystem = { ...roofSystem, attachmentOffset: 0 };
  const { baseElevation } = syncRoofSystemAttachment(project, resetRoofSystem);

  return {
    ...project,
    roofSystem: {
      ...resetRoofSystem,
      baseElevation,
    },
  };
}

registerMigration(30, 31, migrateV30toV31);
