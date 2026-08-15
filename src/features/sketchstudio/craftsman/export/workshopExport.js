/**
 * One-click workshop export.
 * Pure package assembly lives in buildWorkshopPackageContents; ZIP download stays in generateWorkshopZip.
 */

import JSZip from 'jszip';
import { exportBomWithCost } from '../../utils/bomExportUtils';
import { generateAssemblyHtml } from './assemblyHtmlExport';
import { generateBomHtml } from './bomHtmlExport';
import { exportEntitiesToDxf } from './dxfExport';
import { buildNestedSheetFilename, exportNestedSheetsToDxf } from './nestedDxfExport';
import { exportEntitiesToSvg } from './svgExport';
import { SHAPER_FOLDER, buildShaperDepthTable, buildShaperSvgDocuments } from './shaperSvgExport';
import { generateAssemblySteps } from '../utils/assemblyGenerator';
import { buildBomEntityList, isHardwareBomRow } from '../utils/entityBomAdapter';
import { buildCutListCsv, buildCutListReadmeLines, optimizeLinearStock } from '../utils/linearStockOptimizer';

const NESTED_SHEETS_FOLDER = 'sheets';
const CUT_LIST_FILE = 'cutlist.csv';

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9_\- ]/g, '').trim() || 'Untitled';
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function buildNestedSheetsReadmeLine(sheetCount) {
  if (!sheetCount) {
    return [];
  }

  const firstSheet = buildNestedSheetFilename(0, sheetCount);
  const lastSheet = buildNestedSheetFilename(sheetCount - 1, sheetCount);
  const range = sheetCount === 1 ? lastSheet : `${firstSheet} .. ${lastSheet}`;

  return [
    `  ${NESTED_SHEETS_FOLDER}/${range} - ${sheetCount} nested sheet${sheetCount === 1 ? '' : 's'}, one DXF per sheet of stock (stock outline on layer SHEET, parts cut-ready in place)`,
  ];
}

/**
 * How the package documents hardware, and how many fasteners it expects. The
 * count comes from the BOM rows the sidebar already grouped, so it matches the
 * cutting list and the assembly instructions.
 */
function buildHardwareReadmeLines(name, bomRows, sheetCount = 0, skippedFasteners = 0) {
  const hardwareRows = (bomRows || []).filter(isHardwareBomRow);

  if (!hardwareRows.length) {
    return [];
  }

  const totalFasteners = hardwareRows.reduce((sum, row) => sum + (Number(row.quantity) || 1), 0);

  return [
    '',
    'Hardware:',
    `  ${totalFasteners} fastener(s) across ${hardwareRows.length} catalog item(s) - see the Hardware section of cutting-list.html`,
    '  and the "Hardware needed" list in assembly-instructions.html.',
    `  ${name}.dxf puts every placed fastener on the HARDWARE layer as a true CIRCLE at its pilot diameter.`,
    '  Those circles are drill centres, not cut paths: kerf compensation is never applied to them.',
    `  ${name}.svg (and the 1:1 PDF print) marks each fastener F1, F2, ... with a matching HARDWARE LEGEND block.`,
    ...(sheetCount
      ? [`  ${NESTED_SHEETS_FOLDER}/ repeats each part's own fasteners on its sheet, on the same HARDWARE layer.`]
      : []),
    ...(skippedFasteners
      ? [
          `  WARNING: ${skippedFasteners} fastener(s) were left off the nested sheets because their centre no longer`,
          '  lands on the part they were placed against. Re-place them over the part before drilling.',
        ]
      : []),
  ];
}

/**
 * Fabrication settings baked into the cut files, in the order the exporter
 * applied them. Nothing is printed when the operator opted into nothing, so a
 * plain package reads exactly as it always did.
 */
function buildFabricationReadmeLines(options = {}, grainLockedParts = 0) {
  const lines = [];

  if (options.kerf > 0) {
    lines.push(`  Kerf compensation: ${options.kerf}mm (outer profiles grown, holes and pockets shrunk by half that).`);
  }

  if (options.dogbone?.style && options.dogbone.style !== 'none') {
    lines.push(
      `  Corner relief: ${options.dogbone.style}, ${options.dogbone.bitDiameter ?? 6.35}mm cutter, applied AFTER kerf`,
      '  on the kerf-compensated path. Drilled fastener holes are exempt.',
    );
  }

  if (grainLockedParts > 0) {
    lines.push(
      `  Grain: ${grainLockedParts} part(s) are grain locked and were nested without rotation. Sheet grain runs`,
      `  along the sheet length; the ${NESTED_SHEETS_FOLDER}/ files mark each locked part with an arrow on layer GRAIN.`,
    );
  }

  return lines.length ? ['', 'Fabrication settings:', ...lines] : [];
}

/**
 * How the Shaper Origin files are colour-coded, and what depth each cut wants.
 * Depth is documentation only - Origin sets depth on the tool - so the table is
 * here in the README rather than pretending to be machine data.
 */
function buildShaperReadmeLines(shaperDocuments, options = {}) {
  if (!shaperDocuments?.parts?.length) {
    return [];
  }

  const dogboneOn = Boolean(options.dogbone?.style && options.dogbone.style !== 'none');

  return [
    '',
    `Shaper Origin (${SHAPER_FOLDER}/):`,
    `  One SVG per part plus ${SHAPER_FOLDER}/${shaperDocuments.combined?.filename ?? 'all-parts.svg'} with every part in place.`,
    '  Origin reads CUT TYPE FROM COLOUR, not from layers:',
    '    white fill + black stroke = exterior cut (part perimeter, cut outside the line)',
    '    black fill                = interior cut (through cutouts, slots, fastener holes)',
    '    grey fill  (#808080)      = pocket / partial depth (dado and rabbet channels)',
    '    grey stroke               = on-line cut (the cutter follows the line itself)',
    '    blue stroke (#0068FF)     = guide only (grain arrows) - never cut',
    '  Kerf is NOT compensated in these files. Origin offsets the toolpath on-tool from the',
    '  cut type it reads out of the colour, so pre-compensating would apply the correction twice.',
    dogboneOn
      ? '  Corner relief IS applied, the same as the DXFs. Turn it off if you prefer to pare inside corners by hand.'
      : '  Corner relief is off. Origin cuts with a round bit like any other router, so inside corners come out',
    dogboneOn
      ? null
      : '  filleted at the bit radius - enable Dogbone in the export bar if a square mating part has to seat.',
    '  Intended depth per cut (Origin ignores it; set depth on the tool):',
    ...buildShaperDepthTable(shaperDocuments),
    // `!== null` rather than Boolean: the leading '' is the blank separator line
    // and a truthiness filter would swallow it.
  ].filter((line) => line !== null);
}

function buildWorkshopReadme(name, errors, bomRows, sheetCount = 0, skippedFasteners = 0, options = {}, extras = {}) {
  const approximateRows = (bomRows || []).filter(
    (row) => row.dimensionAccuracy === 'approximate' || row.costAccuracy === 'approximate',
  );
  const grainLockedParts = (bomRows || []).filter((row) => row.hasGrain === true && row.grainAngle != null).length;

  return [
    `${name} - Workshop Package`,
    'Generated by Craftsman Studio',
    '',
    'Contents:',
    `  ${name}.dxf - CNC/laser-ready vector file (cuts on layer 0, drilled fasteners on layer HARDWARE)`,
    ...buildNestedSheetsReadmeLine(sheetCount),
    `  ${name}.svg - Vector file for Inkscape/Illustrator, with the hardware legend`,
    '  cutting-list.csv - Bill of Materials (spreadsheet)',
    '  cutting-list.html - BOM report (open in browser)',
    ...(extras.cutListPlan?.groups?.length
      ? [`  ${CUT_LIST_FILE} - 1D cut list: which lengths come off which board, in order`]
      : []),
    '  assembly-instructions.html - Step-by-step build guide',
    ...(extras.shaperDocuments?.parts?.length
      ? [`  ${SHAPER_FOLDER}/ - Shaper Origin SVGs, one per part plus a combined file`]
      : []),
    ...buildHardwareReadmeLines(name, bomRows, sheetCount, skippedFasteners),
    ...buildFabricationReadmeLines(options, grainLockedParts),
    ...(extras.cutListPlan ? buildCutListReadmeLines(extras.cutListPlan) : []),
    ...buildShaperReadmeLines(extras.shaperDocuments, options),
    '',
    'For full-scale PDF printing, use the PDF export button in Craftsman Studio.',
    'Set your browser print dialog to "Scale: 100%" and "Margins: None".',
    '',
    approximateRows.length
      ? `BOM note: ${approximateRows.length} row(s) include approximate dimensions or cost estimates. Check the BOM report status column before manufacturing.`
      : 'BOM note: all exported BOM rows are marked exact under the current geometry model.',
    '',
    errors.length ? `Warnings during export:\n  ${errors.join('\n  ')}` : 'All files exported successfully.',
  ].join('\n');
}

export function buildWorkshopPackageContents(
  entities,
  bomRows,
  totalCost,
  costByMaterial,
  projectName = 'Untitled',
  options = {},
) {
  const name = sanitizeFilename(projectName);
  const folderName = `${name}-Workshop`;
  const referenceEntities = options.referenceEntities ?? entities;
  const files = [];
  const errors = [];
  let nestedSheetCount = 0;
  let skippedFasteners = 0;

  try {
    files.push({
      name: `${name}.dxf`,
      content: exportEntitiesToDxf(entities, {
        kerf: options.kerf,
        dogbone: options.dogbone,
        referenceEntities: options.referenceEntities,
      }),
    });
  } catch (error) {
    errors.push(`DXF: ${error.message}`);
  }

  try {
    // One cut file per nested sheet of stock. Projects with no sheet-stock parts
    // (all-linear or empty BOM) simply contribute no files and no warning.
    const nestedSheets = exportNestedSheetsToDxf(entities, bomRows, {
      kerf: options.kerf,
      dogbone: options.dogbone,
      sheetSize: options.sheetSize,
      bladeKerf: options.bladeKerf,
    });
    nestedSheetCount = nestedSheets.length;
    nestedSheets.forEach((sheet) => {
      skippedFasteners += sheet.skippedFasteners || 0;
      files.push({
        name: `${NESTED_SHEETS_FOLDER}/${sheet.filename}`,
        content: sheet.content,
      });
    });
  } catch (error) {
    nestedSheetCount = 0;
    errors.push(`Nested sheet DXF: ${error.message}`);
  }

  try {
    files.push({
      name: `${name}.svg`,
      content: exportEntitiesToSvg(entities, {
        referenceEntities: options.referenceEntities,
      }),
    });
  } catch (error) {
    errors.push(`SVG: ${error.message}`);
  }

  try {
    files.push({
      name: 'cutting-list.csv',
      content: exportBomWithCost(bomRows, 'csv', { rows: bomRows, totalCost, costByMaterial }),
    });
  } catch (error) {
    errors.push(`BOM CSV: ${error.message}`);
  }

  try {
    files.push({
      name: 'cutting-list.html',
      content: generateBomHtml(bomRows, totalCost, name),
    });
  } catch (error) {
    errors.push(`BOM HTML: ${error.message}`);
  }

  // 1D cut list. Only written when the project actually has linear stock, so an
  // all-sheet-goods package keeps exactly the file list it has always had.
  let cutListPlan = null;
  try {
    cutListPlan = optimizeLinearStock(bomRows || [], {
      kerfMm: options.cutKerfMm,
      stockLengthsMm: options.linearStockLengthsMm,
    });
    if (cutListPlan.groups.length) {
      files.push({ name: CUT_LIST_FILE, content: buildCutListCsv(cutListPlan) });
    }
  } catch (error) {
    cutListPlan = null;
    errors.push(`Cut list: ${error.message}`);
  }

  try {
    // Same entity list the sidebar's assembly panel and the BOM are built from:
    // parts from the document (so the manufacturing set's cloned panels and
    // generated cut profiles cannot be mistaken for extra parts) plus the
    // joinery-generated features that consume a fastener. Callers that pass no
    // `referenceEntities` keep the previous single-list behaviour.
    files.push({
      name: 'assembly-instructions.html',
      content: generateAssemblyHtml(generateAssemblySteps(buildBomEntityList(referenceEntities, entities)), name),
    });
  } catch (error) {
    errors.push(`Assembly: ${error.message}`);
  }

  // Shaper Origin files. Kerf is deliberately NOT forwarded - Origin
  // compensates on-tool - while the dogbone setting is, exactly as the DXFs get
  // it. See `shaperSvgExport` for why the two diverge.
  let shaperDocuments = null;
  try {
    shaperDocuments = buildShaperSvgDocuments(entities, {
      dogbone: options.dogbone,
      referenceEntities: options.referenceEntities,
    });
    shaperDocuments.parts.forEach((document) => {
      files.push({ name: `${SHAPER_FOLDER}/${document.filename}`, content: document.content });
    });
    if (shaperDocuments.combined) {
      files.push({
        name: `${SHAPER_FOLDER}/${shaperDocuments.combined.filename}`,
        content: shaperDocuments.combined.content,
      });
    }
  } catch (error) {
    shaperDocuments = null;
    errors.push(`Shaper SVG: ${error.message}`);
  }

  files.push({
    name: 'README.txt',
    content: buildWorkshopReadme(name, errors, bomRows, nestedSheetCount, skippedFasteners, options, {
      cutListPlan,
      shaperDocuments,
    }),
  });

  return {
    folderName,
    files,
    errors,
  };
}

export async function generateWorkshopZip(
  entities,
  bomRows,
  totalCost,
  costByMaterial,
  projectName = 'Untitled',
  options = {},
) {
  const packageContents = buildWorkshopPackageContents(
    entities,
    bomRows,
    totalCost,
    costByMaterial,
    projectName,
    options,
  );

  const zip = new JSZip();
  const folder = zip.folder(packageContents.folderName);
  packageContents.files.forEach((file) => {
    folder.file(file.name, file.content);
  });

  const blob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(blob, `${packageContents.folderName}.zip`);

  return {
    errors: packageContents.errors,
    fileCount: packageContents.files.length,
  };
}
