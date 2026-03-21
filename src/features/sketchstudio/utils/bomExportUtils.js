export function buildBomExportRows(groupedRows, costSummary = null) {
  if (!costSummary) {
    return groupedRows.map((row) => ({ ...row }));
  }

  const costMap = new Map(
    (costSummary.rows || []).map((r) => [
      [r.partName, r.role, r.material, r.thickness, r.width, r.height].join('|'),
      r,
    ]),
  );

  return groupedRows.map((row) => {
    const key = [row.partName, row.role, row.material, row.thickness, row.width, row.height].join('|');
    const costRow = costMap.get(key);
    return {
      ...row,
      area: costRow?.area ?? 0,
      unitCost: costRow?.unitCost ?? 0,
      totalCost: costRow?.totalCost ?? 0,
    };
  });
}

export function exportBomWithCost(rows, format = 'json', costSummary = null) {
  const enriched = buildBomExportRows(rows, costSummary);

  if (format === 'csv') {
    const hasCost = costSummary != null;
    const baseHeaders = ['partName', 'role', 'material', 'thickness', 'width', 'height', 'quantity'];
    const headers = hasCost
      ? [...baseHeaders, 'area', 'unitCost', 'totalCost']
      : baseHeaders;
    const lines = enriched.map((row) => headers.map((h) => {
      const val = row[h];
      return typeof val === 'number' ? val.toFixed(4) : (val ?? '');
    }).join(','));
    return [headers.join(','), ...lines].join('\n');
  }

  return JSON.stringify(costSummary ? { rows: enriched, totalCost: costSummary.totalCost, costByMaterial: costSummary.costByMaterial } : enriched, null, 2);
}

export function downloadAsFile(content, filename, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
