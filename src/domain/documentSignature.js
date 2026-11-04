/**
 * A fingerprint of everything in the project that a drawing is made from —
 * the building, the floors, the roof, the trusses and the ceilings — so an
 * issued sheet can tell whether the model has moved on since it was generated.
 *
 * Memoised per project object. The coordination pass asks for this signature a
 * dozen times per edit (the preliminary package, the documentation realization
 * and the document validation each derive it, several of them more than once),
 * and each ask serialised the whole project. The store never mutates a project
 * in place, so the same object always has the same signature; the five parts
 * the signature reads are still checked by identity, so a caller that did
 * swap one in place is not handed a stale answer.
 */
const signatureCache = new WeakMap();

function signatureParts(project) {
  return [project.building, project.floors, project.roofSystem, project.trussSystems, project.ceilings];
}

function partsUnchanged(cached, parts) {
  for (let index = 0; index < parts.length; index += 1) {
    if (cached.parts[index] !== parts[index]) return false;
  }
  return true;
}

function computeDocumentModelSignature(project) {
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
    ceilings: project.ceilings,
  });
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function deriveDocumentModelSignature(project) {
  if (!project || typeof project !== 'object') return computeDocumentModelSignature(project || {});
  const parts = signatureParts(project);
  const cached = signatureCache.get(project);
  if (cached && partsUnchanged(cached, parts)) return cached.signature;
  const signature = computeDocumentModelSignature(project);
  signatureCache.set(project, { parts, signature });
  return signature;
}
