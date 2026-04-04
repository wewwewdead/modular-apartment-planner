function getPartDimension(part, key) {
  const directValue = Number(part?.[key]);
  if (Number.isFinite(directValue) && directValue > 0) {
    return directValue;
  }

  const parametricValue = Number(part?.parametric?.[key]);
  if (Number.isFinite(parametricValue) && parametricValue > 0) {
    return parametricValue;
  }

  return 0;
}

function serializeBomKeyPart(value) {
  if (value == null || value === '') {
    return '';
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value.toFixed(4) : '';
  }

  return String(value);
}

export function computePartCutSize(part) {
  return {
    width: getPartDimension(part, 'width'),
    height: getPartDimension(part, 'height'),
    thickness: Number(part?.thickness) || Number(part?.parametric?.thickness) || 0,
  };
}

export function buildObjectBom(objectDraft) {
  return (objectDraft?.parts || []).map((part) => {
    const cutSize = computePartCutSize(part);
    return {
      partId: part.id,
      partName: part.name,
      role: part.role || 'generic',
      material: part.material || objectDraft?.defaults?.material || '',
      thickness: cutSize.thickness,
      width: cutSize.width,
      height: cutSize.height,
      quantity: 1,
    };
  });
}

export function getBomRowGroupKey(row = {}) {
  return [
    row.partName,
    row.role,
    row.material,
    row.thickness,
    row.width,
    row.height,
    row.areaMm2,
    row.stockLength,
    row.stockSectionWidth,
    row.dimensionAccuracy,
    row.dimensionNote,
  ].map(serializeBomKeyPart).join('|');
}

export function groupBomRows(rows = []) {
  const grouped = new Map();

  rows.forEach((row) => {
    const key = getBomRowGroupKey(row);
    const existing = grouped.get(key);
    if (existing) {
      existing.quantity += row.quantity || 1;
      return;
    }

    grouped.set(key, {
      ...row,
      quantity: row.quantity || 1,
    });
  });

  return Array.from(grouped.values());
}

export function exportBomRows(rows = [], format = 'json') {
  if (format === 'csv') {
    const header = ['partName', 'role', 'material', 'thickness', 'width', 'height', 'quantity'];
    const lines = rows.map((row) => header.map((key) => row[key]).join(','));
    return [header.join(','), ...lines].join('\n');
  }

  return JSON.stringify(rows, null, 2);
}
