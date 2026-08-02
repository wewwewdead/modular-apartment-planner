export function deriveDocumentModelSignature(project) {
  const {
    documentationRealization: _issuedDocumentation,
    professionalExchange: _professionalExchange,
    professionalExchangeProfile: _professionalExchangeProfile,
    ...building
  } = project.building || {};
  const serialized = JSON.stringify({
    building,
    floors: project.floors,
    roofSystem: project.roofSystem,
    trussSystems: project.trussSystems,
  });
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
