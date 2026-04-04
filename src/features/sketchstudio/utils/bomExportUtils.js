import { getBomRowGroupKey } from './bomUtils';

function joinNotes(notes) {
  return notes.filter(Boolean).join(' | ');
}

export function getBomEstimateSummary(row = {}) {
  const dimensionApproximate = row.dimensionAccuracy === 'approximate';
  const costApproximate = row.costAccuracy === 'approximate';

  let estimateStatus = 'exact';
  if (dimensionApproximate && costApproximate) {
    estimateStatus = 'approximate-dimensions-and-cost';
  } else if (dimensionApproximate) {
    estimateStatus = 'approximate-dimensions';
  } else if (costApproximate) {
    estimateStatus = 'approximate-cost';
  }

  let shortLabel = '';
  if (estimateStatus === 'approximate-dimensions-and-cost') {
    shortLabel = 'Approx. dims + cost';
  } else if (estimateStatus === 'approximate-dimensions') {
    shortLabel = 'Approx. dims';
  } else if (estimateStatus === 'approximate-cost') {
    shortLabel = 'Approx. cost';
  }

  return {
    estimateStatus,
    estimateNote: joinNotes([row.dimensionNote, row.costNote]),
    shortLabel,
    dimensionApproximate,
    costApproximate,
  };
}

export function buildBomExportRows(groupedRows, costSummary = null) {
  if (!costSummary) {
    return groupedRows.map((row) => ({
      ...row,
      ...getBomEstimateSummary(row),
    }));
  }

  const costMap = new Map(
    (costSummary.rows || []).map((r) => [
      getBomRowGroupKey(r),
      r,
    ]),
  );

  return groupedRows.map((row) => {
    const key = getBomRowGroupKey(row);
    const costRow = costMap.get(key);
    const exportRow = {
      ...row,
      area: costRow?.area ?? 0,
      unitCost: costRow?.unitCost ?? 0,
      totalCost: costRow?.totalCost ?? 0,
      costBasis: costRow?.costBasis ?? row.costBasis ?? 'perM2',
      costAccuracy: costRow?.costAccuracy ?? row.costAccuracy ?? 'exact',
      costNote: costRow?.costNote ?? row.costNote ?? '',
      areaMm2: costRow?.areaMm2 ?? row.areaMm2 ?? null,
      stockLength: costRow?.stockLength ?? row.stockLength ?? null,
      stockSectionWidth: costRow?.stockSectionWidth ?? row.stockSectionWidth ?? null,
    };
    return {
      ...exportRow,
      ...getBomEstimateSummary(exportRow),
    };
  });
}

export function exportBomWithCost(rows, format = 'json', costSummary = null) {
  const enriched = buildBomExportRows(rows, costSummary);

  if (format === 'csv') {
    const hasCost = costSummary != null;
    const baseHeaders = [
      'partName',
      'role',
      'material',
      'thickness',
      'width',
      'height',
      'quantity',
      'dimensionAccuracy',
      'dimensionNote',
      'estimateStatus',
      'estimateNote',
    ];
    const headers = hasCost
      ? [...baseHeaders, 'area', 'unitCost', 'totalCost', 'costBasis', 'costAccuracy', 'costNote']
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
