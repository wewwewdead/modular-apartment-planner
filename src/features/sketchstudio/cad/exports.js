import JSZip from 'jszip';
import { svgPathProperties } from 'svg-path-properties';
import { buildCutList, cutListCsv, planLinearStock, planSheets } from './fabrication.js';
import { sheetSvg, profileSvg, xml } from './drawings.js';
import { sheetDxf } from './sheetDxf.js';
import { shopRecordRows } from './shopRecords.js';

export { download } from './download.js';

// `bendLines` (a sheet-metal flat pattern, docs/sketch-studio-fab-shop.md §9
// SM-1 item 7): one LINE per bend-zone interval on layer BEND, given in the
// paths' drawing frame and written like the polylines (y turned back); a
// round bend's two tangent lines (`tangent`, docs/sketch-studio-round-bend.md
// §7) go out on BEND with its centre line.
// `etchLines` (SM-4, the blank's etched marks): one LINE each on layer ETCH,
// after the bend lines; none is written when there are none.
export function drawingDxf(paths, { bendLines = [], etchLines = [] } = {}) {
  // Explicit polyline approximation; adaptive chord error is 0.02 mm.
  const lines = [
    '0',
    'SECTION',
    '2',
    'HEADER',
    '9',
    '$INSUNITS',
    '70',
    '4',
    '9',
    '$MEASUREMENT',
    '70',
    '1',
    '0',
    'ENDSEC',
    '0',
    'SECTION',
    '2',
    'ENTITIES',
  ];
  for (const path of paths)
    for (const subpath of path.match(/[Mm][^Mm]*/g) || []) {
      const curve = new svgPathProperties(subpath),
        length = curve.getTotalLength();
      if (!length) continue;
      const points = [curve.getPointAtLength(0)];
      const subdivide = (a, b, depth = 0) => {
        const pa = curve.getPointAtLength(a),
          pb = curve.getPointAtLength(b);
        let error = 0;
        for (const f of [0.25, 0.5, 0.75]) {
          const pt = curve.getPointAtLength(a + (b - a) * f);
          error = Math.max(error, Math.hypot(pt.x - (pa.x + (pb.x - pa.x) * f), pt.y - (pa.y + (pb.y - pa.y) * f)));
        }
        if (depth < 22 && (error > 0.02 || b - a > 10)) {
          subdivide(a, (a + b) / 2, depth + 1);
          subdivide((a + b) / 2, b, depth + 1);
        } else points.push(pb);
      };
      subdivide(0, length);
      lines.push(
        '0',
        'LWPOLYLINE',
        '100',
        'AcDbEntity',
        '8',
        'PROFILE',
        '100',
        'AcDbPolyline',
        '90',
        String(points.length),
        '70',
        /[zZ]/.test(subpath) ? '1' : '0',
      );
      points.forEach((pt) => lines.push('10', String(pt.x), '20', String(-pt.y)));
    }
  for (const [layer, list] of [
    ['BEND', bendLines],
    ['ETCH', etchLines],
  ])
    for (const line of list)
      lines.push(
        '0',
        'LINE',
        '100',
        'AcDbEntity',
        '8',
        layer,
        '100',
        'AcDbLine',
        '10',
        String(line.a[0]),
        '20',
        String(-line.a[1]),
        '30',
        '0',
        '11',
        String(line.b[0]),
        '21',
        String(-line.b[1]),
        '31',
        '0',
      );
  lines.push('0', 'ENDSEC', '0', 'EOF');
  return lines.join('\n');
}

// The drawing set as one true-size PDF (Phase T): sheetPdf.js, loaded only
// now so jsPDF and svg2pdf stay out of this chunk; options as sheetsPdf.
export async function vectorPdf(sheets, model, snapshot, options) {
  const { sheetsPdf } = await import('./sheetPdf.js');
  return sheetsPdf(sheets, model, snapshot, options);
}

// A sheet's export SVG; a refusal names the sheet ("Sheet “Frame”: …") unless
// the message already does (an overflow starts "Frame: front does not fit…").
export function exportSheetSvg(sheet, model, snapshot, page, pages) {
  try {
    return sheetSvg(sheet, model, snapshot, page, pages);
  } catch (error) {
    const message = error.message || String(error);
    if (message.startsWith(`${sheet.title}:`)) throw error;
    throw new Error(`Sheet “${sheet.title}”: ${message}`, { cause: error });
  }
}

// The README's ## Groups section (docs/sketch-studio-part-groups.md §3.7):
// each group's name, parent and member instance ids, so the editing
// structure survives an export that has no other place for it.
export function groupsReadme(model) {
  const groups = model.groups || [];
  if (!groups.length) return 'None.';
  const name = (id) => groups.find((g) => g.id === id)?.name || id;
  return groups
    .map((g) => {
      const parts = model.instances.filter((i) => i.groupId === g.id).map((i) => i.id);
      const children = groups.filter((c) => c.parentId === g.id).map((c) => c.id);
      return `- ${g.id}: ${g.name}; parent ${g.parentId ? `${g.parentId} (${name(g.parentId)})` : 'none'}; instances ${parts.join(', ') || 'none'}${children.length ? `; groups ${children.join(', ')}` : ''}`;
    })
    .join('\n');
}

export async function workshopZip(model, snapshot, exports, title) {
  const zip = new JSZip(),
    rows = buildCutList(model, snapshot);
  const stock = planLinearStock(rows, model.fabrication),
    sheets = planSheets(rows, exports.profiles, model.fabrication);
  const safe = (name) => name.replace(/[^A-Za-z0-9_-]/g, '_');
  zip.file('model.json', JSON.stringify(model, null, 2));
  zip.file(
    'resolved-assembly-placements.json',
    JSON.stringify(
      snapshot.instances.map(({ id, partId, placement, bounds }) => ({ id, partId, placement, bounds })),
      null,
      2,
    ),
  );
  zip.file('parts-and-cut-list.csv', cutListCsv(rows, shopRecordRows(model, snapshot)));
  zip.file('linear-stock-layout.json', JSON.stringify(stock, null, 2));
  zip.file('sheet-stock-layout.json', JSON.stringify(sheets, null, 2));
  if (exports.assembly) zip.file('assembly.step', await exports.assembly.arrayBuffer());
  for (const part of exports.files) {
    zip.file(`parts/${safe(part.id)}.step`, await part.step.arrayBuffer());
    zip.file(`parts/${safe(part.id)}.stl`, await part.stl.arrayBuffer());
  }
  // Each sheet is rendered once, for its DXF, its SVG and its PDF page; the
  // first sheet that cannot be exported stops the ZIP, by name.
  const pages = exports.drawings.map((sheet, index) => ({
    svg: exportSheetSvg(sheet, model, snapshot, index + 1, exports.drawings.length),
    size: sheet.size,
    title: sheet.title,
  }));
  for (const [index, sheet] of exports.drawings.entries()) {
    zip.file('drawings/' + safe(sheet.id) + '.dxf', sheetDxf(pages[index].svg));
    zip.file(`drawings/${safe(sheet.id)}.svg`, pages[index].svg);
    for (const view of sheet.views)
      zip.file(`drawings/${safe(sheet.id)}-${safe(view.name)}.dxf`, drawingDxf(view.visible));
  }
  if (pages.length)
    zip.file('drawings/workshop.pdf', await (await vectorPdf(null, model, snapshot, { title, pages })).arrayBuffer());
  for (const profile of exports.profiles) {
    zip.file(`cutting/${safe(profile.partId)}.svg`, profileSvg(profile));
    zip.file(
      `cutting/${safe(profile.partId)}.dxf`,
      drawingDxf(profile.visible, { bendLines: profile.bendLines, etchLines: profile.etchLines }),
    );
  }
  for (const sheet of sheets) {
    const paths = sheet.parts
      .map((part) => {
        const profile = exports.profiles.find((p) => p.partId === part.partId);
        return `<g transform="translate(${part.x - profile.viewBox[0]} ${part.y - profile.viewBox[1]})">${profile.visible.map((d) => `<path d="${xml(d)}"/>`).join('')}</g>`;
      })
      .join('');
    zip.file(
      `cutting/layout-${sheet.id}.svg`,
      `<svg xmlns="http://www.w3.org/2000/svg" width="${sheet.width}mm" height="${sheet.height}mm" viewBox="0 0 ${sheet.width} ${sheet.height}"><g fill="none" stroke="black" stroke-width="0.1">${paths}</g></svg>`,
    );
  }
  zip.file(
    'ASSEMBLY.md',
    `# ${title}\n\nAll solid and cutting coordinates are millimetres. STL is unitless; import as millimetres. SVG and PDF are vector drawings. DXF uses millimetres and tessellated polylines (0.02 mm sampled chord-error target).\n\nNominal model dimensions exclude kerf and stock allowances. Cutting layout reserves ${model.fabrication.kerf} mm kerf and ${model.fabrication.allowance} mm allowance. Tube end angles are measured from square, about local Y; refer to part STEP for orientation. Long and short points describe the extreme end measurements.\n\nOnly constant-thickness planar extrusions with through cuts receive flat cutting profiles. Other parts use STEP and detail drawings. Assembly quantities include hidden instances.\n\n## Instances\n${model.instances.map((i) => `- ${i.id}: ${i.partId}; position ${JSON.stringify(i.position)}; XYZ rotation ${JSON.stringify(i.rotation)}`).join('\n')}\n\n## Groups\n${groupsReadme(model)}\n\n## Connections and weld notes\n${model.connections.map((c) => `- ${c.id}: ${c.from} → ${c.to}; ${c.type}; ${c.note || ''}; location ${JSON.stringify(c.location || [])}`).join('\n')}\n`,
  );
  return zip.generateAsync({ type: 'blob' });
}
