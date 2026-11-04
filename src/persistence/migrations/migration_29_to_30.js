import { normalizeRoofCovering, normalizeRoofTrims } from '@/domain/roofCoveringCatalog';
import { registerMigration } from './index';

// The roof gained a covering — what it is clad in, and in which colour — and
// an edge kit: fascia, barge, gutter, downpipes, ridge and barge capping, and
// the soffit (docs/roof-truss-industrial.md §4.1–4.2).
//
// The backfill is unconditional. A roof saved before the fields existed was
// drawn as one grey body, so there is no stored answer to keep; the defaults
// are the spec's: flat roofs stay a grey concrete slab with every trim off
// (they have parapets), every pitched roof becomes corrugated metal in Shale
// Grey with fascia, barge, gutter, downpipes, ridge cap and a boxed soffit —
// the roof looks finished on load. Custom roofs keep their trims off, like
// flat ones. A stored value is kept (and deep-filled), so a project written by
// a newer build and read back by this path is not flattened.
//
// `version` is deliberately left alone: this step changes only the persistence
// schema; the domain format version (CURRENT_PROJECT_FORMAT_VERSION) is
// unchanged at 23.

export function migrateV29toV30(project) {
  const roofSystem = project?.roofSystem;
  if (!roofSystem || typeof roofSystem !== 'object') return project;

  const roofType = roofSystem.roofType || 'flat';
  const slabThickness = Number.isFinite(roofSystem.slabThickness) ? roofSystem.slabThickness : 180;

  return {
    ...project,
    roofSystem: {
      ...roofSystem,
      covering: normalizeRoofCovering(roofSystem.covering, roofType, slabThickness),
      trims: normalizeRoofTrims(roofSystem.trims, roofType),
    },
  };
}

registerMigration(29, 30, migrateV29toV30);
