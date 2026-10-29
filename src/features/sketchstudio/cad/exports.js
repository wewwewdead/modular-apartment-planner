import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import 'svg2pdf.js';
import { svgPathProperties } from 'svg-path-properties';
import { buildCutList, cutListCsv, planLinearStock, planSheets } from './fabrication.js';
import { PAGE_SIZES, sheetSvg, profileSvg, xml } from './drawings.js';
import { sheetDxf } from './sheetDxf.js';

export function drawingDxf(paths) {
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
  lines.push('0', 'ENDSEC', '0', 'EOF');
  return lines.join('\n');
}

export async function vectorPdf(sheets, model, snapshot) {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: PAGE_SIZES[sheets[0]?.size] || PAGE_SIZES.A3 });
  for (let index = 0; index < sheets.length; index++) {
    const sheet = sheets[index],
      [width, height] = PAGE_SIZES[sheet.size] || PAGE_SIZES.A3;
    if (index) pdf.addPage([width, height], 'landscape');
    const svg = new DOMParser().parseFromString(
      sheetSvg(sheet, model, snapshot, index + 1, sheets.length),
      'image/svg+xml',
    ).documentElement;
    await pdf.svg(svg, { x: 0, y: 0, width, height });
  }
  return pdf.output('blob');
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
  zip.file('parts-and-cut-list.csv', cutListCsv(rows));
  zip.file('linear-stock-layout.json', JSON.stringify(stock, null, 2));
  zip.file('sheet-stock-layout.json', JSON.stringify(sheets, null, 2));
  if (exports.assembly) zip.file('assembly.step', await exports.assembly.arrayBuffer());
  for (const part of exports.files) {
    zip.file(`parts/${safe(part.id)}.step`, await part.step.arrayBuffer());
    zip.file(`parts/${safe(part.id)}.stl`, await part.stl.arrayBuffer());
  }
  for (const [index, sheet] of exports.drawings.entries()) {
    zip.file(
      'drawings/' + safe(sheet.id) + '.dxf',
      sheetDxf(sheetSvg(sheet, model, snapshot, index + 1, exports.drawings.length)),
    );
    zip.file(`drawings/${safe(sheet.id)}.svg`, sheetSvg(sheet, model, snapshot, index + 1, exports.drawings.length));
    for (const view of sheet.views)
      zip.file(`drawings/${safe(sheet.id)}-${safe(view.name)}.dxf`, drawingDxf(view.visible));
  }
  if (exports.drawings.length)
    zip.file('drawings/workshop.pdf', await (await vectorPdf(exports.drawings, model, snapshot)).arrayBuffer());
  for (const profile of exports.profiles) {
    zip.file(`cutting/${safe(profile.partId)}.svg`, profileSvg(profile));
    zip.file(`cutting/${safe(profile.partId)}.dxf`, drawingDxf(profile.visible));
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
    `# ${title}\n\nAll solid and cutting coordinates are millimetres. STL is unitless; import as millimetres. SVG and PDF are vector drawings. DXF uses millimetres and tessellated polylines (0.02 mm sampled chord-error target).\n\nNominal model dimensions exclude kerf and stock allowances. Cutting layout reserves ${model.fabrication.kerf} mm kerf and ${model.fabrication.allowance} mm allowance. Tube end angles are measured from square, about local Y; refer to part STEP for orientation. Long and short points describe the extreme end measurements.\n\nOnly constant-thickness planar extrusions with through cuts receive flat cutting profiles. Other parts use STEP and detail drawings. Assembly quantities include hidden instances.\n\n## Instances\n${model.instances.map((i) => `- ${i.id}: ${i.partId}; position ${JSON.stringify(i.position)}; XYZ rotation ${JSON.stringify(i.rotation)}`).join('\n')}\n\n## Connections and weld notes\n${model.connections.map((c) => `- ${c.id}: ${c.from} → ${c.to}; ${c.type}; ${c.note || ''}; location ${JSON.stringify(c.location || [])}`).join('\n')}\n`,
  );
  return zip.generateAsync({ type: 'blob' });
}

export function download(blob, filename) {
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
