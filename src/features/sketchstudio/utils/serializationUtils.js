export function validateBasicDocumentShape(document) {
  return Boolean(
    document
    && typeof document.version === 'number'
    && typeof document.id === 'string'
    && typeof document.name === 'string'
    && typeof document.units === 'string'
    && Array.isArray(document.layers)
    && Array.isArray(document.entities)
    && Array.isArray(document.constraints),
  );
}

export function serializeDocument(document) {
  return JSON.stringify(document, null, 2);
}

export function deserializeDocument(serialized) {
  const parsed = JSON.parse(serialized);

  if (!validateBasicDocumentShape(parsed)) {
    throw new Error('Invalid SketchStudio document shape.');
  }

  return parsed;
}
