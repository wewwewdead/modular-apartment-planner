/**
 * A fingerprint of everything in the project that a drawing is made from —
 * the building, the floors, the roofs, the trusses and the ceilings — so an
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
import { getProjectRoofs } from './projectRoofs';

const signatureCache = new WeakMap();

function signatureParts(project) {
  return [project.building, project.floors, getProjectRoofs(project), project.trussSystems, project.ceilings];
}

function partsUnchanged(cached, parts) {
  for (let index = 0; index < parts.length; index += 1) {
    if (cached.parts[index] !== parts[index]) return false;
  }
  return true;
}

/**
 * The roofs as the hash sees them. Sheets and the documentation state store the
 * signature they were issued from and compare it with the live one, so the move
 * from one roof slot to a roof list (schema 32) must not change it: no roof
 * still hashes as `null` and one roof as that roof, exactly what the slot held.
 * Only a project with several roofs, which nothing before it could write,
 * hashes the list.
 */
function signatureRoofs(project) {
  const roofSystems = getProjectRoofs(project);
  if (roofSystems.length > 1) return roofSystems;
  return roofSystems[0] || null;
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
    roofSystem: signatureRoofs(project),
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
