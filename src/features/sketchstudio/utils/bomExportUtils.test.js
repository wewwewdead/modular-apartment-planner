import { describe, expect, it } from 'vitest';
import { buildBomExportRows, exportBomWithCost, getBomEstimateSummary } from './bomExportUtils';

const sampleRows = [
  {
    partName: 'Panel',
    role: 'panel',
    material: 'plywood',
    thickness: 18,
    width: 1000,
    height: 500,
    quantity: 2,
    dimensionAccuracy: 'approximate',
    dimensionNote: 'Bounding-box dimensions for an irregular profile.',
  },
];

describe('getBomEstimateSummary', () => {
  it('summarizes approximation flags into export-friendly labels', () => {
    expect(getBomEstimateSummary({
      dimensionAccuracy: 'approximate',
      dimensionNote: 'Bounding-box dimensions.',
      costAccuracy: 'approximate',
      costNote: 'Bounding-box cost.',
    })).toMatchObject({
      estimateStatus: 'approximate-dimensions-and-cost',
      shortLabel: 'Approx. dims + cost',
    });
  });
});

describe('buildBomExportRows', () => {
  it('preserves additive status metadata without a cost summary', () => {
    const result = buildBomExportRows(sampleRows);

    expect(result[0].estimateStatus).toBe('approximate-dimensions');
    expect(result[0].estimateNote).toContain('Bounding-box dimensions');
  });

  it('enriches rows with cost data and cost approximation metadata', () => {
    const costSummary = {
      rows: [
        {
          ...sampleRows[0],
          area: 0.5,
          unitCost: 10,
          totalCost: 10,
          costBasis: 'perM2',
          costAccuracy: 'approximate',
          costNote: 'Bounding-box area estimate.',
        },
      ],
    };

    const result = buildBomExportRows(sampleRows, costSummary);
    expect(result[0].area).toBe(0.5);
    expect(result[0].costAccuracy).toBe('approximate');
    expect(result[0].estimateStatus).toBe('approximate-dimensions-and-cost');
  });
});

describe('exportBomWithCost', () => {
  it('exports CSV without cost', () => {
    const csv = exportBomWithCost(sampleRows, 'csv');
    const [headerLine] = csv.split('\n');

    expect(headerLine).toContain('estimateStatus');
    expect(headerLine).not.toContain('totalCost');
  });

  it('exports CSV with explicit accuracy columns', () => {
    const costSummary = {
      rows: [
        {
          ...sampleRows[0],
          area: 0.5,
          unitCost: 10,
          totalCost: 10,
          costBasis: 'perM2',
          costAccuracy: 'approximate',
          costNote: 'Bounding-box area estimate.',
        },
      ],
      totalCost: 10,
      costByMaterial: { plywood: 10 },
    };

    const csv = exportBomWithCost(sampleRows, 'csv', costSummary);
    const [headerLine, valueLine] = csv.split('\n');

    expect(headerLine).toContain('costAccuracy');
    expect(valueLine).toContain('approximate-dimensions-and-cost');
  });

  it('exports JSON with approximation metadata', () => {
    const parsed = JSON.parse(exportBomWithCost(sampleRows, 'json'));

    expect(parsed[0].estimateStatus).toBe('approximate-dimensions');
  });
});
