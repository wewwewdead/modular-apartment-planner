import { memberMetrics, numeric, resolveParameters, positive } from './model.js';
import { hardwareNote, threadNote } from './hardware.js';

// A hole row's drilling note counts its holes (Phase K): "4 × M6 …".
const rowPrefix = (feature, parameters) => {
  if (feature.type !== 'hole' || !feature.row) return '';
  const count = numeric(feature.row.count, parameters);
  return count > 1 ? `${count} × ` : '';
};

export function buildCutList(model, snapshot) {
  const parameters = resolveParameters(model.parameters);
  const quantities = new Map();
  for (const instance of model.instances) quantities.set(instance.partId, (quantities.get(instance.partId) || 0) + 1);
  return model.parts
    .filter((p) => quantities.has(p.id))
    .map((part) => {
      const geometry = snapshot.parts.find((p) => p.id === part.id);
      if (!geometry) throw new Error(`No current geometry for ${part.name}.`);
      const features = part.features.filter((f) => !f.suppressed),
        f = features[0];
      const sourceMember = f?.type === 'member' ? memberMetrics(f, parameters) : null;
      const modifiedEnds =
        sourceMember &&
        features.slice(1).some((f) => !['hole', 'pocket', 'fillet', 'chamfer', 'transform'].includes(f.type));
      // A later extrusion, Boolean or pattern can change length, section or
      // number of bodies. Never schedule the original member as the final cut.
      const member = modifiedEnds ? null : sourceMember;
      return {
        partId: part.id,
        name: part.name,
        material: part.material || 'Unspecified',
        quantity: quantities.get(part.id),
        dimensions: geometry.bounds[1].map((value, i) => value - geometry.bounds[0][i]),
        volume: geometry.volume,
        grain: part.grain,
        member,
        sourceMember: modifiedEnds ? sourceMember : null,
        modifiedEnds,
        note: [
          f?.type === 'hardware' ? hardwareNote(f) : '',
          ...features
            .filter((f) => f.holeSpec)
            .map(
              (f) =>
                `${rowPrefix(f, parameters)}${threadNote(f)}; drill Ø${numeric(f.diameter, parameters)} mm${f.holeSpec.mode === 'tap' ? '; thread depth unspecified' : ''}`,
            ),
          modifiedEnds
            ? 'Modified member: final stock length and cuts require the part STEP and detail drawing. Excluded from automatic linear stock allocation.'
            : '',
        ]
          .filter(Boolean)
          .join('; '),
        section: sourceMember ? JSON.stringify(sourceMember.section) : '',
        blankLength: member ? member.longPoint + numeric(model.fabrication.allowance, parameters) : null,
      };
    });
}

export function planLinearStock(rows, fabrication) {
  const stockLength = positive(fabrication.stockLength),
    kerf = numeric(fabrication.kerf),
    allowance = numeric(fabrication.allowance);
  if (kerf < 0 || allowance < 0) throw new Error('Kerf and allowance cannot be negative.');
  const stocks = [];
  const cuts = rows
    .filter((r) => r.member)
    .flatMap((row) =>
      Array.from({ length: row.quantity }, (_, index) => ({
        partId: row.partId,
        copy: index + 1,
        section: row.section,
        material: row.material,
        length: row.member.longPoint + allowance,
      })),
    );
  cuts.sort((a, b) => b.length - a.length);
  for (const cut of cuts) {
    if (cut.length + kerf > stockLength) throw new Error(`${cut.partId} exceeds the stock length including kerf.`);
    let stock = stocks.find(
      (s) => s.section === cut.section && s.material === cut.material && s.remaining >= cut.length + kerf,
    );
    if (!stock) {
      stock = {
        id: stocks.length + 1,
        section: cut.section,
        material: cut.material,
        length: stockLength,
        remaining: stockLength,
        cuts: [],
      };
      stocks.push(stock);
    }
    stock.cuts.push(cut);
    stock.remaining -= cut.length + kerf;
  }
  return stocks;
}

// Conservative shelf packing: never rotate grain-sensitive parts. Profiles stay
// nominal; the reserved rectangle includes explicit kerf and stock allowance.
export function planSheets(rows, profiles, fabrication) {
  const width = positive(fabrication.sheetWidth),
    height = positive(fabrication.sheetHeight);
  const kerf = numeric(fabrication.kerf),
    allowance = numeric(fabrication.allowance);
  if (kerf < 0 || allowance < 0) throw new Error('Kerf and allowance cannot be negative.');
  const sheets = [];
  for (const profile of profiles) {
    const row = rows.find((r) => r.partId === profile.partId);
    if (!row) continue;
    const w = profile.viewBox[2] + allowance + kerf,
      h = profile.viewBox[3] + allowance + kerf;
    if (w > width || h > height) throw new Error(`${row.name} exceeds sheet stock dimensions.`);
    for (let copy = 1; copy <= row.quantity; copy++) {
      let placement;
      for (const sheet of sheets.filter((s) => s.material === row.material && s.thickness === profile.thickness)) {
        if (sheet.x + w > width) {
          sheet.x = 0;
          sheet.y += sheet.rowHeight;
          sheet.rowHeight = 0;
        }
        if (sheet.y + h <= height) {
          placement = sheet;
          break;
        }
      }
      if (!placement) {
        placement = {
          id: sheets.length + 1,
          width,
          height,
          material: row.material,
          thickness: profile.thickness,
          x: 0,
          y: 0,
          rowHeight: 0,
          parts: [],
        };
        sheets.push(placement);
      }
      placement.parts.push({
        partId: row.partId,
        copy,
        x: placement.x + allowance / 2,
        y: placement.y + allowance / 2,
        width: profile.viewBox[2],
        height: profile.viewBox[3],
        grain: row.grain,
      });
      placement.x += w;
      placement.rowHeight = Math.max(placement.rowHeight, h);
    }
  }
  return sheets;
}

export const csv = (rows) =>
  rows
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell ?? '');
          return `"${(/^[=+@-]/.test(value) && !Number.isFinite(Number(value)) ? "'" : '') + value.replaceAll('"', '""')}"`;
        })
        .join(','),
    )
    .join('\r\n');

export function cutListCsv(rows) {
  return csv([
    [
      'Part ID',
      'Part',
      'Material',
      'Quantity',
      'Stock section (mm)',
      'Centerline mm',
      'Long point mm',
      'Short point mm',
      'Start angle from square deg',
      'End angle from square deg',
      'Start gap mm',
      'End gap mm',
      'Blank length incl allowance mm',
      'Width mm',
      'Depth mm',
      'Height mm',
      'Grain',
      'Notes',
    ],
    ...rows.map((r) => [
      r.partId,
      r.name,
      r.material,
      r.quantity,
      r.section,
      r.member?.centerline,
      r.member?.longPoint,
      r.member?.shortPoint,
      r.member?.angleStart,
      r.member?.angleEnd,
      r.member?.gapStart,
      r.member?.gapEnd,
      r.blankLength,
      ...r.dimensions,
      r.grain,
      r.note,
    ]),
  ]);
}
