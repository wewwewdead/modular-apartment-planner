import { describe, it, expect } from 'vitest';
import { buildBomExportRows, exportBomWithCost } from './bomExportUtils';

describe('buildBomExportRows', () => {
  const sampleRows = [
    { partName: 'Panel', role: 'panel', material: 'plywood', thickness: 18, width: 1000, height: 500, quantity: 2 },
  ];

  it('returns rows unchanged without cost summary', () => {
    const result = buildBomExportRows(sampleRows);
    expect(result).toHaveLength(1);
    expect(result[0].partName).toBe('Panel');
  });

  it('enriches rows with cost data', () => {
    const costSummary = {
      rows: [
        { partName: 'Panel', role: 'panel', material: 'plywood', thickness: 18, width: 1000, height: 500, area: 0.5, unitCost: 10, totalCost: 10 },
      ],
    };
    const result = buildBomExportRows(sampleRows, costSummary);
    expect(result[0].area).toBe(0.5);
    expect(result[0].unitCost).toBe(10);
    expect(result[0].totalCost).toBe(10);
  });
});

describe('exportBomWithCost', () => {
  const sampleRows = [
    { partName: 'Panel', role: 'panel', material: 'plywood', thickness: 18, width: 1000, height: 500, quantity: 2 },
  ];

  it('exports CSV without cost', () => {
    const csv = exportBomWithCost(sampleRows, 'csv');
    const lines = csv.split('\n');
    expect(lines[0]).toContain('partName');
    expect(lines[0]).not.toContain('totalCost');
    expect(lines).toHaveLength(2);
  });

  it('exports CSV with cost columns', () => {
    const costSummary = {
      rows: [{ partName: 'Panel', role: 'panel', material: 'plywood', thickness: 18, width: 1000, height: 500, area: 0.5, unitCost: 10, totalCost: 10 }],
      totalCost: 10,
      costByMaterial: { plywood: 10 },
    };
    const csv = exportBomWithCost(sampleRows, 'csv', costSummary);
    expect(csv.split('\n')[0]).toContain('totalCost');
    expect(csv.split('\n')[0]).toContain('area');
  });

  it('exports JSON structure', () => {
    const json = exportBomWithCost(sampleRows, 'json');
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].partName).toBe('Panel');
  });

  it('exports JSON with cost summary', () => {
    const costSummary = {
      rows: [{ partName: 'Panel', role: 'panel', material: 'plywood', thickness: 18, width: 1000, height: 500, area: 0.5, unitCost: 10, totalCost: 10 }],
      totalCost: 10,
      costByMaterial: { plywood: 10 },
    };
    const json = exportBomWithCost(sampleRows, 'json', costSummary);
    const parsed = JSON.parse(json);
    expect(parsed.totalCost).toBe(10);
    expect(parsed.rows).toHaveLength(1);
  });
});
