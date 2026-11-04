import {
  ROOF_COVERING_SUPPORTS,
  normalizeRoofCovering,
  resolveRoofCoveringProduct,
  slopePercentToDegrees,
} from '@/domain/roofCoveringCatalog';
import { defaultPurlinRoleForCovering } from '@/domain/trussModels';

/**
 * Advice for the truss panel (docs/roof-truss-industrial.md §7.6): never
 * blocking, never automatic. Covering rules apply only when the roof is
 * attached to this truss system — it is that roof's covering the trusses
 * carry.
 */

export const NZ_MAX_EAVE_OVERHANG = 750;
export const FLAT_TRUSS_MAX_SPAN_TO_DEPTH = 6.67;

/** The covering product of the roof this system carries, or null. */
export function resolveCarriedCovering(trussSystem, roofSystem) {
  if (!roofSystem || !trussSystem?.id || roofSystem.trussAttachmentId !== trussSystem.id) return null;
  const covering = normalizeRoofCovering(roofSystem.covering, roofSystem.roofType || 'flat', roofSystem.slabThickness);
  return { covering, product: resolveRoofCoveringProduct(covering) };
}

/**
 * Warnings for one truss instance. `profile` is its built profile (metrics
 * carry span, pitch, overall height). Returns plain sentences.
 */
export function buildTrussInstanceWarnings({ trussSystem, trussInstance, profile, roofSystem = null }) {
  const warnings = [];
  const metrics = profile?.metrics || {};
  const carried = resolveCarriedCovering(trussSystem, roofSystem);

  if (carried) {
    const { product } = carried;
    const spacing = Number(trussInstance?.spacing) || 0;
    if (Number.isFinite(product.maxTrussSpacing) && spacing > product.maxTrussSpacing) {
      warnings.push(
        `Trusses at ${Math.round(spacing)} mm exceed the ${product.maxTrussSpacing} mm ${product.label.toLowerCase()} allows.`,
      );
    }
    const purlins = trussSystem?.purlinSystem;
    const takesPurlins =
      product.support === ROOF_COVERING_SUPPORTS.PURLINS || product.support === ROOF_COVERING_SUPPORTS.BATTENS;
    if (takesPurlins && purlins?.enabled && Number(purlins.spacing) > product.maxSupportSpacing.internal) {
      warnings.push(
        `${purlins.role === 'batten' ? 'Battens' : 'Purlins'} at ${Math.round(purlins.spacing)} mm exceed the ${product.maxSupportSpacing.internal} mm internal span of the covering.`,
      );
    }
    if (metrics.family !== 'flat') {
      const degrees = slopePercentToDegrees(metrics.pitch || 0);
      if (degrees + 1e-6 < product.minPitchDeg) {
        warnings.push(
          `${degrees.toFixed(1)}° is below the ${product.minPitchDeg.toFixed(1)}° minimum for ${product.label.toLowerCase()}${product.approx ? ' (approximate)' : ''}.`,
        );
      }
    }
  }

  const overhang = Math.max(Number(metrics.overhangStart) || 0, Number(metrics.overhangEnd) || 0);
  if (overhang > NZ_MAX_EAVE_OVERHANG) {
    warnings.push(`An overhang of ${Math.round(overhang)} mm is past the ${NZ_MAX_EAVE_OVERHANG} mm eave limit (NZ).`);
  }

  if (metrics.family === 'flat' && metrics.overallHeight > 0) {
    const ratio = metrics.span / metrics.overallHeight;
    if (ratio > FLAT_TRUSS_MAX_SPAN_TO_DEPTH) {
      warnings.push(
        `Span / depth is ${ratio.toFixed(1)}, above ${FLAT_TRUSS_MAX_SPAN_TO_DEPTH} for a flat truss; deepen it or shorten the span.`,
      );
    }
  }

  return warnings;
}

/**
 * "Suggest from covering" (spec §7.4): the purlin system a covering wants —
 * spacing at the catalogue's internal maximum (sheet) or the tile gauge, and
 * 75 × 50 purlins (sheet) or 50 × 25 battens (tile). Null when the covering
 * sits on a deck or is the structure itself.
 */
export function suggestPurlinsFromCovering(covering) {
  if (!covering) return null;
  const product = resolveRoofCoveringProduct(covering);
  if (product.support === ROOF_COVERING_SUPPORTS.BATTENS) {
    const gauge = Number(covering.coverWidth) || product.coverWidth || product.maxSupportSpacing.internal;
    return { enabled: true, role: 'batten', spacing: Math.round(gauge), width: 50, depth: 25 };
  }
  if (product.support === ROOF_COVERING_SUPPORTS.PURLINS) {
    return {
      enabled: true,
      role: defaultPurlinRoleForCovering(covering.kind),
      spacing: product.maxSupportSpacing.internal,
      width: 75,
      depth: 50,
    };
  }
  return null;
}
