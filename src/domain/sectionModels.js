import { SECTION_DEPTH } from './defaults';

export function getSectionDepthMode(sectionCut) {
  if (sectionCut?.depthMode === 'full' || sectionCut?.depthMode === 'limited') return sectionCut.depthMode;
  // Older cuts inherited a silent 2 m crop. Treat that former default as full
  // building depth; retain deliberate, non-default limits. The numeric value
  // remains available when the user explicitly selects Limited depth.
  const depth = Number(sectionCut?.depth);
  return Number.isFinite(depth) && depth > 0 && depth !== SECTION_DEPTH ? 'limited' : 'full';
}

export function getSectionLimitedDepth(sectionCut) {
  const depth = Number(sectionCut?.depth);
  return Number.isFinite(depth) && depth > 0 ? depth : SECTION_DEPTH;
}
