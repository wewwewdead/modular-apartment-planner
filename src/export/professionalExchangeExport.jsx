import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import SheetRenderer from '@/features/floorplan/components/renderers/SheetRenderer';
import { getPaperPreset } from '@/sheets/paper';
import { buildMultiSheetVectorPdf } from './sheetExport';
import {
  compareProfessionalExchanges,
  createProfessionalExchangeState,
  deriveProfessionalExchange,
} from '@/domain/professionalExchange';
import { deriveDocumentationRealization } from '@/domain/documentationRealization';

export const PROFESSIONAL_EXCHANGE_ARCHIVE_MIME_TYPE = 'application/zip';

function dxfPair(code, value) {
  return `${code}\n${value}\n`;
}

function n(value) {
  return Number.isFinite(Number(value))
    ? Number(value)
        .toFixed(3)
        .replace(/\.?0+$/, '')
    : '0';
}

function dxfLine(layer, start, end) {
  return `${dxfPair(0, 'LINE')}${dxfPair(8, layer)}${dxfPair(10, n(start.x))}${dxfPair(20, n(start.y))}${dxfPair(30, 0)}${dxfPair(11, n(end.x))}${dxfPair(21, n(end.y))}${dxfPair(31, 0)}`;
}

function dxfText(layer, point, value, height = 150) {
  const text = String(value || '')
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 240);
  return `${dxfPair(0, 'TEXT')}${dxfPair(8, layer)}${dxfPair(10, n(point.x))}${dxfPair(20, n(point.y))}${dxfPair(30, 0)}${dxfPair(40, n(height))}${dxfPair(1, text)}`;
}

function dxfPolygon(layer, points = [], close = true) {
  if (points.length < 2) return '';
  const lines = [];
  for (let index = 1; index < points.length; index += 1) lines.push(dxfLine(layer, points[index - 1], points[index]));
  if (close && points.length > 2) lines.push(dxfLine(layer, points.at(-1), points[0]));
  return lines.join('');
}

function rotatedRectangle(column) {
  const halfW = (column.width || 0) / 2;
  const halfD = (column.depth || 0) / 2;
  const angle = ((column.rotation || 0) * Math.PI) / 180;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return [
    { x: -halfW, y: -halfD },
    { x: halfW, y: -halfD },
    { x: halfW, y: halfD },
    { x: -halfW, y: halfD },
  ].map((point) => ({
    x: column.x + point.x * cosine - point.y * sine,
    y: column.y + point.x * sine + point.y * cosine,
  }));
}

function supportPoint(floor, ref) {
  if (ref?.kind === 'point') return { x: ref.x, y: ref.y };
  const column = (floor.columns || []).find((entry) => entry.id === ref?.id);
  return column ? { x: column.x, y: column.y } : null;
}

function wallOpeningLine(floor, opening, layer) {
  const wall = (floor.walls || []).find((entry) => entry.id === opening.wallId);
  if (!wall) return '';
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const length = Math.hypot(dx, dy) || 1;
  const startDistance = Math.max(0, Number(opening.offset) || 0);
  const endDistance = startDistance + (Number(opening.width) || 0);
  return dxfLine(
    layer,
    {
      x: wall.start.x + (dx / length) * startDistance,
      y: wall.start.y + (dy / length) * startDistance,
    },
    {
      x: wall.start.x + (dx / length) * endDistance,
      y: wall.start.y + (dy / length) * endDistance,
    },
  );
}

function floorEntities(project, floor, mode) {
  let content = '';
  if (!floor) return content;
  if (mode !== 'structural_only') {
    for (const room of floor.rooms || []) {
      content += dxfPolygon('A-ROOM', room.boundaryPoints || room.points || [], true);
      const point = room.centroid || room.labelPoint || room.boundaryPoints?.[0];
      if (point) content += dxfText('A-ROOM-TEXT', point, room.name || room.use || room.id, 120);
    }
    for (const wall of floor.walls || []) content += dxfLine('A-WALL', wall.start, wall.end);
    for (const door of floor.doors || []) content += wallOpeningLine(floor, door, 'A-DOOR');
    for (const window of floor.windows || []) content += wallOpeningLine(floor, window, 'A-WINDOW');
  }
  for (const slab of floor.slabs || []) {
    content += dxfPolygon('S-SLAB', slab.boundaryPoints, true);
    for (const opening of slab.openings || []) content += dxfPolygon('S-OPENING', opening.boundaryPoints, true);
  }
  for (const column of floor.columns || []) content += dxfPolygon('S-COLUMN', rotatedRectangle(column), true);
  for (const beam of floor.beams || []) {
    const start = supportPoint(floor, beam.startRef);
    const end = supportPoint(floor, beam.endRef);
    if (start && end) content += dxfLine('S-BEAM', start, end);
  }
  if (mode === 'services') {
    const systems = project.building?.systems || {};
    for (const shaft of systems.plumbing?.shafts || []) {
      if (shaft.floorId && shaft.floorId !== floor.id) continue;
      if (shaft.boundaryPoints?.length) content += dxfPolygon('P-SHAFT', shaft.boundaryPoints, true);
      else if (Number.isFinite(shaft.x) && Number.isFinite(shaft.y))
        content += dxfText('P-SHAFT', shaft, shaft.name || shaft.id, 120);
    }
    for (const route of systems.plumbing?.drainageRoutes || [])
      if (!route.floorId || route.floorId === floor.id)
        content += dxfPolygon('P-DRAIN', route.points || route.routePoints || [], false);
    for (const route of systems.egress?.routes || [])
      if (!route.floorId || route.floorId === floor.id)
        content += dxfPolygon('E-EGRESS', route.points || route.routePoints || [], false);
    for (const riser of systems.electrical?.riserZones || []) {
      if (riser.floorId && riser.floorId !== floor.id) continue;
      content += dxfPolygon('E-RISER', riser.boundaryPoints || [], true);
    }
  }
  return content;
}

function gridEntities(project) {
  let content = '';
  for (const grid of project.building?.systems?.structural?.gridSystems || []) {
    const axes = grid.axes || [];
    const extent = 100000;
    for (const axis of axes) {
      const vertical = axis.orientation === 'vertical';
      const origin = grid.origin || { x: 0, y: 0 };
      const offsetPoint = vertical
        ? { x: origin.x + axis.offset, y: origin.y }
        : { x: origin.x, y: origin.y + axis.offset };
      content += dxfLine(
        'S-GRID',
        vertical ? { x: offsetPoint.x, y: -extent } : { x: -extent, y: offsetPoint.y },
        vertical ? { x: offsetPoint.x, y: extent } : { x: extent, y: offsetPoint.y },
      );
      content += dxfText('S-GRID-TEXT', offsetPoint, axis.label || axis.id, 140);
    }
  }
  return content;
}

function entitiesForSheet(project, sheet) {
  let content = dxfText('X-SHEET', { x: 0, y: 0 }, `${sheet.number} - ${sheet.title}`, 250);
  const renderedFloors = new Set();
  for (const viewport of sheet.viewports || []) {
    const floor = (project.floors || []).find((entry) => entry.id === viewport.sourceFloorId);
    if (floor && !renderedFloors.has(`${floor.id}:${viewport.sourceView}`)) {
      renderedFloors.add(`${floor.id}:${viewport.sourceView}`);
      content += floorEntities(
        project,
        floor,
        viewport.sourceView === 'services_plan'
          ? 'services'
          : viewport.sourceView === 'structural_plan'
            ? 'structural_only'
            : 'plan',
      );
      if (viewport.sourceView === 'structural_plan') content += gridEntities(project);
    }
    if (viewport.sourceView === 'site_plan')
      content += dxfPolygon('C-SITE', project.building?.site?.boundary || [], true);
    if (viewport.sourceView === 'roof_plan') {
      for (const plane of project.roofSystem?.roofPlanes || [])
        content += dxfPolygon('A-ROOF', plane.boundaryPoints || plane.points || [], true);
    }
    if (viewport.sourceView === 'building_report')
      content += dxfText(
        'X-REPORT',
        { x: 0, y: -500 - renderedFloors.size * 300 },
        `Report: ${viewport.sourceRefId || 'coordination register'}`,
        140,
      );
  }
  return content;
}

export function buildArchitecturalSheetDxf(project, sheet) {
  const header = `${dxfPair(0, 'SECTION')}${dxfPair(2, 'HEADER')}${dxfPair(9, '$ACADVER')}${dxfPair(1, 'AC1009')}${dxfPair(9, '$INSUNITS')}${dxfPair(70, 4)}${dxfPair(0, 'ENDSEC')}`;
  const entities = `${dxfPair(0, 'SECTION')}${dxfPair(2, 'ENTITIES')}${entitiesForSheet(project, sheet)}${dxfPair(0, 'ENDSEC')}${dxfPair(0, 'EOF')}`;
  return header + entities;
}

function sheetLayer(element) {
  let current = element;
  while (current) {
    const className = typeof current.className === 'string' ? current.className : current.className?.baseVal;
    if (className)
      return `SHEET-${String(className)
        .split(/\s+/)[0]
        .replace(/[^a-zA-Z0-9_-]/g, '-')
        .slice(0, 28)}`.toUpperCase();
    current = current.parentElement;
  }
  return 'SHEET-GEOMETRY';
}

function transformedPoint(element, x, y) {
  const matrix = element.getCTM?.();
  if (!matrix) return { x, y };
  return { x: matrix.a * x + matrix.c * y + matrix.e, y: matrix.b * x + matrix.d * y + matrix.f };
}

function numberList(value) {
  return (String(value || '').match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || []).map(Number);
}

function renderedElementEntities(element) {
  const tag = element.tagName.toLowerCase();
  const layer = sheetLayer(element);
  if (tag === 'line')
    return dxfLine(
      layer,
      transformedPoint(element, Number(element.getAttribute('x1')) || 0, Number(element.getAttribute('y1')) || 0),
      transformedPoint(element, Number(element.getAttribute('x2')) || 0, Number(element.getAttribute('y2')) || 0),
    );
  if (tag === 'rect' || tag === 'image') {
    const x = Number(element.getAttribute('x')) || 0;
    const y = Number(element.getAttribute('y')) || 0;
    const width = Number(element.getAttribute('width')) || 0;
    const height = Number(element.getAttribute('height')) || 0;
    return dxfPolygon(
      layer,
      [
        transformedPoint(element, x, y),
        transformedPoint(element, x + width, y),
        transformedPoint(element, x + width, y + height),
        transformedPoint(element, x, y + height),
      ],
      true,
    );
  }
  if (tag === 'polygon' || tag === 'polyline') {
    const values = numberList(element.getAttribute('points'));
    const points = [];
    for (let index = 0; index < values.length; index += 2)
      points.push(transformedPoint(element, values[index], values[index + 1]));
    return dxfPolygon(layer, points, tag === 'polygon');
  }
  if (tag === 'circle') {
    const cx = Number(element.getAttribute('cx')) || 0;
    const cy = Number(element.getAttribute('cy')) || 0;
    const radius = Number(element.getAttribute('r')) || 0;
    const points = Array.from({ length: 32 }, (_, index) => {
      const angle = (index / 32) * Math.PI * 2;
      return transformedPoint(element, cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
    });
    return dxfPolygon(layer, points, true);
  }
  if (tag === 'path' && typeof element.getTotalLength === 'function') {
    try {
      const length = element.getTotalLength();
      const count = Math.max(2, Math.min(1000, Math.ceil(length / 0.8)));
      const points = Array.from({ length: count + 1 }, (_, index) => {
        const point = element.getPointAtLength((length * index) / count);
        return transformedPoint(element, point.x, point.y);
      });
      return dxfPolygon(layer, points, false);
    } catch {
      return '';
    }
  }
  if (tag === 'text') {
    return dxfText(
      layer,
      transformedPoint(element, Number(element.getAttribute('x')) || 0, Number(element.getAttribute('y')) || 0),
      element.textContent || '',
      Math.max(1.5, Number.parseFloat(getComputedStyle(element).fontSize) || 2.5),
    );
  }
  return '';
}

export function buildRenderedSheetDxf(svgElement, sheet) {
  const header = `${dxfPair(0, 'SECTION')}${dxfPair(2, 'HEADER')}${dxfPair(9, '$ACADVER')}${dxfPair(1, 'AC1009')}${dxfPair(9, '$INSUNITS')}${dxfPair(70, 4)}${dxfPair(999, `${sheet.number} - ${sheet.title}; sheet-layout coordinates in millimetres`)}${dxfPair(0, 'ENDSEC')}`;
  const body = [...svgElement.querySelectorAll('line,rect,polygon,polyline,path,circle,text,image')]
    .map(renderedElementEntities)
    .join('');
  return `${header}${dxfPair(0, 'SECTION')}${dxfPair(2, 'ENTITIES')}${body}${dxfPair(0, 'ENDSEC')}${dxfPair(0, 'EOF')}`;
}

function nextPaint() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => requestAnimationFrame(resolve));
    else setTimeout(resolve, 0);
  });
}

export async function renderProfessionalExchangeArtifacts(project, sheets) {
  if (typeof document === 'undefined')
    throw new Error('Multi-sheet drawing PDF rendering requires a browser document.');
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;';
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    flushSync(() =>
      root.render(
        <div>
          {sheets.map((sheet) => {
            const paper = getPaperPreset(sheet.paperSize || 'A3_LANDSCAPE');
            return (
              <svg
                key={sheet.id}
                data-xi-sheet-id={sheet.id}
                width={paper.width}
                height={paper.height}
                viewBox={`0 0 ${paper.width} ${paper.height}`}
              >
                <SheetRenderer project={project} sheet={sheet} selectedId={null} selectedType={null} />
              </svg>
            );
          })}
        </div>,
      ),
    );
    await nextPaint();
    const renderedSheets = [...host.querySelectorAll('[data-xi-sheet-id]')];
    const entries = sheets.map((sheet, index) => ({
      svgElement: renderedSheets[index],
      paperSize: sheet.paperSize,
    }));
    return {
      pdfBlob: await buildMultiSheetVectorPdf(entries),
      dxfBySheetId: new Map(
        entries.map((entry, index) => [sheets[index].id, buildRenderedSheetDxf(entry.svgElement, sheets[index])]),
      ),
    };
  } finally {
    root.unmount();
    host.remove();
  }
}

export async function renderProfessionalExchangePdf(project, sheets) {
  return (await renderProfessionalExchangeArtifacts(project, sheets)).pdfBlob;
}

async function loadJSZip() {
  const module = await import('jszip');
  return module.default || module;
}

export async function buildProfessionalExchangeArchive(project, options = {}) {
  const derived = deriveProfessionalExchange(project);
  const exchange = derived.state.exchanges.find(
    (entry) => entry.id === (options.exchangeId || derived.state.activeExchangeId),
  );
  if (!exchange) throw new Error('No published Xi exchange is available.');
  const documentation = deriveDocumentationRealization(project);
  if (
    documentation.outOfDate ||
    documentation.state.id !== exchange.sourceDocumentationRealizationId ||
    documentation.state.inputSignature !== exchange.sourceDocumentationInputSignature
  )
    throw new Error(
      'This historical Xi exchange cannot be regenerated from a changed Nu model. Use the archive downloaded when that issue was published.',
    );
  const sheetsById = new Map((project.sheets || []).map((entry) => [entry.id, entry]));
  const sheets = exchange.manifest.sheets.map((entry) => sheetsById.get(entry.id)).filter(Boolean);
  if (sheets.length !== exchange.manifest.sheets.length)
    throw new Error('One or more issued Nu sheets are missing from the project.');
  const renderedArtifacts = options.pdfBlob ? null : await renderProfessionalExchangeArtifacts(project, sheets);
  const pdfBlob = options.pdfBlob || renderedArtifacts.pdfBlob;
  const state = createProfessionalExchangeState(project.building?.professionalExchange);
  const markups = state.reviewerMarkups.filter((entry) => entry.exchangeId === exchange.id);
  const markupIds = new Set(markups.map((entry) => entry.id));
  const responses = state.externalResponses.filter((entry) => markupIds.has(entry.markupId));
  const previous = state.exchanges[state.exchanges.findIndex((entry) => entry.id === exchange.id) - 1] || null;
  const comparison = previous
    ? compareProfessionalExchanges(project, previous.id, exchange.id)
    : {
        baseline: null,
        current: exchange,
        changeCount: 0,
        note: 'First published Xi exchange; no earlier issue is available for comparison.',
        professionalReviewRequired: true,
      };
  const JSZip = await loadJSZip();
  const zip = new JSZip();
  zip.file(exchange.manifest.files.manifest.path, JSON.stringify(exchange.manifest, null, 2));
  zip.file(
    exchange.manifest.files.markups.path,
    JSON.stringify({ format: derived.profile.markupFormat, exchangeId: exchange.id, markups }, null, 2),
  );
  zip.file(
    exchange.manifest.files.responses.path,
    JSON.stringify(
      { format: 'apartment-design-engineer/external-professional-responses-v1', exchangeId: exchange.id, responses },
      null,
      2,
    ),
  );
  zip.file(exchange.manifest.files.revisionComparison.path, JSON.stringify(comparison, null, 2));
  zip.file(
    exchange.manifest.files.multiSheetPdf.path,
    typeof pdfBlob?.arrayBuffer === 'function' ? await pdfBlob.arrayBuffer() : pdfBlob,
  );
  for (const record of exchange.manifest.sheets) {
    zip.file(
      record.dxfPath,
      renderedArtifacts?.dxfBySheetId.get(record.id) || buildArchitecturalSheetDxf(project, sheetsById.get(record.id)),
    );
  }
  return zip.generateAsync({ type: 'blob', mimeType: PROFESSIONAL_EXCHANGE_ARCHIVE_MIME_TYPE });
}

function safeArchiveName(value) {
  // Strip filesystem-illegal characters and C0 controls from the downloaded archive name.
  // eslint-disable-next-line no-control-regex
  return String(value || 'professional-review-exchange').replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-');
}

export async function downloadProfessionalExchangeArchive(project, options = {}) {
  const derived = deriveProfessionalExchange(project);
  const exchange = derived.state.exchanges.find(
    (entry) => entry.id === (options.exchangeId || derived.state.activeExchangeId),
  );
  if (!exchange) throw new Error('No published Xi exchange is available.');
  const blob = await buildProfessionalExchangeArchive(project, { ...options, exchangeId: exchange.id });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeArchiveName(project.name)}_${safeArchiveName(exchange.id)}.zip`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
