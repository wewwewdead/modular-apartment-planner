/**
 * Shaper Origin SVG export.
 *
 * The Origin does not read layers, line types or tool tables. It reads COLOUR:
 * the fill and stroke of each closed path tell the machine what kind of cut it
 * is, and the operator sets depth on the tool. That encoding is a hard contract,
 * so the mapping below is exact and every path in the file uses one of these
 * five styles and nothing else:
 *
 *   exterior cut   white fill  (#FFFFFF) + black stroke (#000000)
 *                  part perimeters - the machine cuts OUTSIDE the line
 *   interior cut   black fill  (#000000), no stroke
 *                  through cutouts, slots, fastener holes - cuts INSIDE
 *   pocket         grey fill   (#808080), no stroke
 *                  partial-depth: dado and rabbet channels, blind pockets
 *   on-line cut    grey stroke (#808080), no fill
 *                  open paths, where the cutter follows the line itself
 *   guide          blue stroke (#0068FF)
 *                  grain arrows and labels: never cut, alignment only
 *
 * Flat geometry only
 * ------------------
 * No `transform` attributes anywhere, and no groups: every path carries absolute
 * millimetre coordinates in a millimetre viewBox. Rotated rectangles are written
 * out as their four corner points, rotated ellipses use the SVG arc command's
 * own x-axis-rotation parameter, and corner reliefs become real arc segments.
 * A transform the importer silently drops would move a cut, so there are none
 * to drop.
 *
 * Kerf
 * ----
 * NEVER applied. The Origin knows its own cutter diameter and offsets the
 * toolpath on-tool from the cut type it read out of the colour; pre-compensating
 * in the file would apply the correction twice. This is the one place the
 * fabrication pipeline deliberately diverges from the DXF path.
 *
 * Dogbone
 * -------
 * DOES apply, through the same `dogboneUtils` pipeline the DXF export uses, with
 * the same settings object. The Origin's cutter is round like any other, so an
 * inside corner it cuts is filleted at the bit radius and a square tenon will
 * not seat - the relief is as necessary here as on a gantry machine. It is off
 * by default, and Origin users who finish inside corners by hand (chisel, or a
 * second pass with a smaller bit) will want to leave it off, which is why it
 * follows the export bar's existing toggle rather than being forced on.
 *
 * Depth
 * -----
 * Origin has no depth field in the file - the operator dials it in. Each cut's
 * INTENDED depth still travels with it, as a `<desc>` child and a
 * `data-shaper-depth-mm` attribute, purely so the workshop README can print the
 * depth table the operator works from. The machine ignores both.
 */

import { getArcPath } from '../../utils/arcUtils';
import { computeEntityBoundingBox } from '../../utils/bboxUtils';
import { getRectCorners } from '../../utils/entityUtils';
import { isFastenerEntity } from '../../utils/fastenerUtils';
import { downloadAsFile } from '../../utils/bomExportUtils';
import { normalizeGrainAngle } from '../utils/grainUtils';
import { isEntityBomEligible } from '../utils/entityBomAdapter';
import { applyDogboneToEntity, normalizeDogboneSettings } from './dogboneUtils';
import { selectPartCutEntities } from './dxfExport';

export const SHAPER_CUT_TYPES = Object.freeze({
  EXTERIOR: 'exterior',
  INTERIOR: 'interior',
  POCKET: 'pocket',
  ONLINE: 'online',
  GUIDE: 'guide',
});

/** The colour contract, in one place, so a test can assert it literally. */
export const SHAPER_STYLES = Object.freeze({
  [SHAPER_CUT_TYPES.EXTERIOR]: Object.freeze({ fill: '#FFFFFF', stroke: '#000000', strokeWidth: 0.25 }),
  [SHAPER_CUT_TYPES.INTERIOR]: Object.freeze({ fill: '#000000', stroke: 'none', strokeWidth: 0 }),
  [SHAPER_CUT_TYPES.POCKET]: Object.freeze({ fill: '#808080', stroke: 'none', strokeWidth: 0 }),
  [SHAPER_CUT_TYPES.ONLINE]: Object.freeze({ fill: 'none', stroke: '#808080', strokeWidth: 0.25 }),
  [SHAPER_CUT_TYPES.GUIDE]: Object.freeze({ fill: 'none', stroke: '#0068FF', strokeWidth: 0.25 }),
});

export const SHAPER_FOLDER = 'shaper';

const CUTTABLE_TYPES = new Set(['line', 'rect', 'circle', 'arc', 'polyline', 'ellipse', 'feature']);
const CLOSED_TOP_LEVEL_TYPES = new Set(['rect', 'circle', 'ellipse']);
const GRAIN_ARROW_MAX_MM = 120;

/** A bulge this small is a 0.0002-degree arc: a straight line, for any cutter. */
const BULGE_EPSILON = 1e-6;

function escapeXml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function num(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Object.is(numeric, -0) ? 0 : numeric;
}

function round(value, decimals = 4) {
  const factor = 10 ** decimals;
  return Math.round(num(value) * factor) / factor;
}

function sanitizeName(value, fallback = 'part') {
  const cleaned = String(value ?? '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || fallback;
}

/* ------------------------------------------------------------- geometry */

/**
 * LWPOLYLINE bulge -> SVG elliptical-arc parameters.
 *
 * `bulge = tan(sweep / 4)` (the AutoCAD definition `dogboneUtils` emits), so
 * `sweep = 4 * atan(bulge)` and the chord and sweep give the radius:
 *
 *   radius = chord / (2 sin(|sweep| / 2))
 *
 * Both coordinate systems here are y-DOWN - the sketch world and SVG user space
 * agree - so a mathematically positive sweep in the source frame is the same
 * direction SVG calls sweep-flag 1. No sign flip, unlike the DXF writer, which
 * mirrors Y and therefore negates the bulge.
 */
export function bulgeToArcCommand(from, to, bulge) {
  const sweep = 4 * Math.atan(bulge);
  const chord = Math.hypot(to.x - from.x, to.y - from.y);
  const halfSweep = Math.abs(sweep) / 2;
  const sine = Math.sin(halfSweep);

  // Below BULGE_EPSILON the arc is flatter than any cutter can tell from a
  // straight line, and its radius runs away to infinity. Emit the line.
  if (!(chord > 0) || !(Math.abs(bulge) > BULGE_EPSILON) || !(sine > 0)) {
    return `L ${round(to.x)} ${round(to.y)}`;
  }

  const radius = chord / (2 * sine);
  const largeArc = Math.abs(sweep) > Math.PI ? 1 : 0;
  const sweepFlag = sweep > 0 ? 1 : 0;

  return `A ${round(radius)} ${round(radius)} 0 ${largeArc} ${sweepFlag} ${round(to.x)} ${round(to.y)}`;
}

function pointsToPathData(points, closed) {
  if (!points?.length) {
    return '';
  }

  const commands = [`M ${round(points[0].x)} ${round(points[0].y)}`];
  const limit = closed ? points.length : points.length - 1;

  for (let index = 0; index < limit; index += 1) {
    const from = points[index];
    const to = points[(index + 1) % points.length];
    const bulge = Number(from?.bulge);
    const isWrapSegment = closed && index === points.length - 1;

    if (Number.isFinite(bulge) && Math.abs(bulge) > BULGE_EPSILON) {
      commands.push(bulgeToArcCommand(from, to, bulge));
      continue;
    }

    // `Z` already draws the straight run back to the start, so emitting it as
    // an explicit `L` would duplicate the closing vertex. A wrap segment that
    // carries a bulge still has to be written out - `Z` cannot draw an arc.
    if (!isWrapSegment) {
      commands.push(`L ${round(to.x)} ${round(to.y)}`);
    }
  }

  if (closed) {
    commands.push('Z');
  }

  return commands.join(' ');
}

/** Full circle as two half arcs - no <circle>, so nothing depends on element type. */
function circleToPathData(cx, cy, radius) {
  if (!(radius > 0)) {
    return '';
  }

  const left = round(cx - radius);
  const right = round(cx + radius);
  const y = round(cy);
  const r = round(radius);
  return `M ${left} ${y} A ${r} ${r} 0 1 0 ${right} ${y} A ${r} ${r} 0 1 0 ${left} ${y} Z`;
}

/**
 * Ellipse as two 180-degree arcs, with the rotation carried by the arc
 * command's x-axis-rotation parameter rather than by a transform.
 */
function ellipseToPathData(cx, cy, rx, ry, rotationDeg = 0) {
  if (!(rx > 0) || !(ry > 0)) {
    return '';
  }

  const radians = (num(rotationDeg) * Math.PI) / 180;
  const dx = rx * Math.cos(radians);
  const dy = rx * Math.sin(radians);
  const startX = round(cx - dx);
  const startY = round(cy - dy);
  const endX = round(cx + dx);
  const endY = round(cy + dy);
  const rotation = round(num(rotationDeg));

  return (
    `M ${startX} ${startY} A ${round(rx)} ${round(ry)} ${rotation} 1 0 ${endX} ${endY} ` +
    `A ${round(rx)} ${round(ry)} ${rotation} 1 0 ${startX} ${startY} Z`
  );
}

function rectToPathData(entity) {
  if (num(entity.rotation)) {
    const corners = getRectCorners(entity);
    return pointsToPathData([corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft], true);
  }

  const x = Math.min(num(entity.x1 ?? entity.x), num(entity.x2 ?? num(entity.x) + num(entity.width)));
  const y = Math.min(num(entity.y1 ?? entity.y), num(entity.y2 ?? num(entity.y) + num(entity.height)));
  const width = Math.abs(num(entity.width ?? num(entity.x2) - num(entity.x1)));
  const height = Math.abs(num(entity.height ?? num(entity.y2) - num(entity.y1)));

  return pointsToPathData(
    [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
    ],
    true,
  );
}

function featureToPathData(entity) {
  if (entity.shape === 'circle') {
    return circleToPathData(num(entity.cx), num(entity.cy), num(entity.diameter) / 2);
  }

  if (entity.shape === 'ellipse') {
    return ellipseToPathData(num(entity.cx), num(entity.cy), num(entity.rx), num(entity.ry), entity.rotation);
  }

  if (entity.shape === 'polygon') {
    return pointsToPathData(entity.points, true);
  }

  const x = num(entity.x);
  const y = num(entity.y);
  const width = num(entity.width);
  const height = num(entity.height);
  return pointsToPathData(
    [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
    ],
    true,
  );
}

export function entityToShaperPathData(entity) {
  switch (entity.type) {
    case 'rect':
      return rectToPathData(entity);
    case 'circle':
      return circleToPathData(
        num(entity.center?.x ?? entity.cx),
        num(entity.center?.y ?? entity.cy),
        num(entity.r ?? entity.radius),
      );
    case 'ellipse':
      return ellipseToPathData(
        num(entity.cx),
        num(entity.cy),
        num(entity.rx ?? entity.radius),
        num(entity.ry ?? entity.radius),
        entity.rotation,
      );
    case 'polyline':
      return pointsToPathData(entity.points, Boolean(entity.closed));
    case 'line':
      return `M ${round(entity.x1)} ${round(entity.y1)} L ${round(entity.x2)} ${round(entity.y2)}`;
    case 'arc':
      // Already a quadratic bezier in absolute coordinates - exactly what the
      // "curves as arcs or beziers, no transforms" rule asks for.
      return entity.start && entity.end && entity.control ? getArcPath(entity) : '';
    case 'feature':
      return featureToPathData(entity);
    default:
      return '';
  }
}

/* --------------------------------------------------------- classification */

/**
 * Which of the five Shaper styles an entity gets.
 *
 * `partThicknessMm` decides pocket vs through for a feature that states a depth:
 * a channel shallower than the stock is a pocket, one that reaches or passes the
 * far face is an interior cut. A feature with no depth at all is treated as
 * through, which is the safe reading - a hole the operator cuts through when it
 * should have been blind is a mistake they can see coming, whereas a pocket that
 * should have been through leaves the part joined to the offcut.
 */
export function classifyShaperCut(entity, partThicknessMm = 0) {
  if (entity?.type !== 'feature') {
    if (CLOSED_TOP_LEVEL_TYPES.has(entity?.type)) {
      return SHAPER_CUT_TYPES.EXTERIOR;
    }
    if (entity?.type === 'polyline') {
      return entity.closed ? SHAPER_CUT_TYPES.EXTERIOR : SHAPER_CUT_TYPES.ONLINE;
    }
    // line, arc: open geometry the cutter follows down the middle.
    return SHAPER_CUT_TYPES.ONLINE;
  }

  // Fastener pilot holes are drilled straight through the part they fix, and
  // Shaper cuts them as interior openings.
  if (isFastenerEntity(entity)) {
    return SHAPER_CUT_TYPES.INTERIOR;
  }

  if (entity.through === true) {
    return SHAPER_CUT_TYPES.INTERIOR;
  }

  const depth = num(entity.depth);
  if (!(depth > 0)) {
    return SHAPER_CUT_TYPES.INTERIOR;
  }

  const thickness = num(partThicknessMm);
  if (thickness > 0 && depth >= thickness) {
    return SHAPER_CUT_TYPES.INTERIOR;
  }

  return SHAPER_CUT_TYPES.POCKET;
}

function resolveCutDepthMm(entity, cutType, partThicknessMm) {
  if (cutType === SHAPER_CUT_TYPES.POCKET) {
    return num(entity.depth);
  }
  if (cutType === SHAPER_CUT_TYPES.INTERIOR || cutType === SHAPER_CUT_TYPES.EXTERIOR) {
    return num(entity.depth) || num(partThicknessMm);
  }
  return 0;
}

function buildPathElement({ pathData, cutType, depthMm, description }) {
  const style = SHAPER_STYLES[cutType];
  const depthAttribute = depthMm > 0 ? ` data-shaper-depth-mm="${round(depthMm, 3)}"` : '';
  const strokeAttribute =
    style.stroke === 'none' ? ' stroke="none"' : ` stroke="${style.stroke}" stroke-width="${style.strokeWidth}"`;
  const desc = description ? `<desc>${escapeXml(description)}</desc>` : '';

  return `  <path d="${pathData}" fill="${style.fill}"${strokeAttribute} data-shaper-cut="${cutType}"${depthAttribute}>${desc}</path>`;
}

function buildGrainGuideElements(part, bounds) {
  const angle = normalizeGrainAngle(part?.grainAngle);
  if (angle == null || !bounds) {
    return [];
  }

  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const span = Math.min(Math.min(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * 0.5, GRAIN_ARROW_MAX_MM);
  if (!(span > 0)) {
    return [];
  }

  const radians = (angle * Math.PI) / 180;
  const dirX = Math.cos(radians);
  const dirY = Math.sin(radians);
  const half = span / 2;
  const head = Math.max(span * 0.12, 2);
  const tip = { x: centerX + dirX * half, y: centerY + dirY * half };
  const tail = { x: centerX - dirX * half, y: centerY - dirY * half };
  const barb = (sign) => ({
    x: tip.x - head * (dirX * Math.SQRT1_2 - sign * dirY * Math.SQRT1_2),
    y: tip.y - head * (dirY * Math.SQRT1_2 + sign * dirX * Math.SQRT1_2),
  });

  return [
    buildPathElement({
      pathData: `M ${round(tail.x)} ${round(tail.y)} L ${round(tip.x)} ${round(tip.y)}`,
      cutType: SHAPER_CUT_TYPES.GUIDE,
      depthMm: 0,
      description: `grain ${round(angle, 2)} deg - guide only, not a cut`,
    }),
    buildPathElement({
      pathData: pointsToPathData([barb(1), tip, barb(-1)], false),
      cutType: SHAPER_CUT_TYPES.GUIDE,
      depthMm: 0,
      description: 'grain direction arrowhead - guide only, not a cut',
    }),
  ];
}

/* --------------------------------------------------------------- export */

function resolveCutEntities(entities, partId, options) {
  const dogbone = normalizeDogboneSettings(options.dogbone);
  const cutEntities = selectPartCutEntities(entities, partId).filter((entity) => CUTTABLE_TYPES.has(entity.type));
  // Kerf is deliberately absent: Origin compensates on-tool. Dogbone runs the
  // same pass the DXF export runs, on the un-kerfed path.
  return dogbone ? cutEntities.map((entity) => applyDogboneToEntity(entity, dogbone)) : cutEntities;
}

function computeBounds(entities, referenceEntities) {
  const boxes = entities.map((entity) => computeEntityBoundingBox(entity, referenceEntities)).filter(Boolean);
  if (!boxes.length) {
    return null;
  }

  return {
    minX: Math.min(...boxes.map((box) => box.minX)),
    minY: Math.min(...boxes.map((box) => box.minY)),
    maxX: Math.max(...boxes.map((box) => box.maxX)),
    maxY: Math.max(...boxes.map((box) => box.maxY)),
  };
}

function buildSvgDocument(elements, bounds, title, marginMm) {
  const minX = round(bounds.minX - marginMm);
  const minY = round(bounds.minY - marginMm);
  const width = round(bounds.maxX - bounds.minX + marginMm * 2);
  const height = round(bounds.maxY - bounds.minY + marginMm * 2);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${width}mm" height="${height}mm"
     viewBox="${minX} ${minY} ${width} ${height}">
  <title>${escapeXml(title)}</title>
  <!-- Generated by Craftsman Studio for Shaper Origin. Colour encodes cut type. -->
  <!-- Kerf is NOT compensated: Origin offsets the toolpath on-tool. -->
${elements.join('\n')}
</svg>`;
}

export const SHAPER_MARGIN_MM = 2;

/**
 * One part's Shaper file plus the depth table for it.
 *
 * @returns {{partId:string, partName:string, filename:string, content:string,
 *   cuts:Array<{cutType:string, depthMm:number, entityId:string}>} | null}
 */
export function buildShaperPartDocument(entities, part, options = {}) {
  const referenceEntities = options.referenceEntities || entities;
  const cutEntities = resolveCutEntities(entities, part.id, options);
  if (!cutEntities.length) {
    return null;
  }

  const bounds = computeBounds(cutEntities, referenceEntities);
  if (!bounds) {
    return null;
  }

  const thickness = num(part.thickness);
  const cuts = [];
  const elements = [];

  for (const entity of cutEntities) {
    const pathData = entityToShaperPathData(entity);
    if (!pathData) {
      continue;
    }

    const cutType = classifyShaperCut(entity, thickness);
    const depthMm = resolveCutDepthMm(entity, cutType, thickness);
    cuts.push({ entityId: entity.id, cutType, depthMm: round(depthMm, 3) });
    elements.push(
      buildPathElement({
        pathData,
        cutType,
        depthMm,
        description:
          depthMm > 0
            ? `${cutType} cut, intended depth ${round(depthMm, 3)}mm (Origin ignores this - set depth on the tool)`
            : `${cutType} cut`,
      }),
    );
  }

  if (!elements.length) {
    return null;
  }

  elements.push(...buildGrainGuideElements(part, bounds));

  const partName = part.meta?.label || part.id;
  // The entity id is appended so two parts sharing a label cannot collide on
  // one filename; an unlabelled part is already named by its id, so it is not
  // repeated.
  const filename =
    partName === part.id
      ? `${sanitizeName(part.id, 'part')}.svg`
      : `${sanitizeName(partName, 'part')}-${sanitizeName(part.id, 'id')}.svg`;

  return {
    partId: part.id,
    partName,
    thicknessMm: thickness,
    filename,
    content: buildSvgDocument(elements, bounds, `${partName} - Shaper Origin`, SHAPER_MARGIN_MM),
    cuts,
  };
}

/**
 * Every part as its own Shaper file, plus one combined file with all parts in
 * their drawn positions.
 *
 * @returns {{parts:Array, combined:{filename:string, content:string}|null}}
 */
export function buildShaperSvgDocuments(entities = [], options = {}) {
  const referenceEntities = options.referenceEntities || entities;
  const parts = entities.filter((entity) => isEntityBomEligible(entity));
  const documents = parts.map((part) => buildShaperPartDocument(entities, part, options)).filter(Boolean);

  if (!documents.length) {
    return { parts: [], combined: null };
  }

  const combinedElements = [];
  const combinedBoxes = [];

  for (const part of parts) {
    const cutEntities = resolveCutEntities(entities, part.id, options);
    const bounds = computeBounds(cutEntities, referenceEntities);
    if (!bounds) {
      continue;
    }
    combinedBoxes.push(bounds);

    const thickness = num(part.thickness);
    for (const entity of cutEntities) {
      const pathData = entityToShaperPathData(entity);
      if (!pathData) {
        continue;
      }
      const cutType = classifyShaperCut(entity, thickness);
      const depthMm = resolveCutDepthMm(entity, cutType, thickness);
      combinedElements.push(
        buildPathElement({
          pathData,
          cutType,
          depthMm,
          description: `${part.meta?.label || part.id}: ${cutType} cut${depthMm > 0 ? `, intended depth ${round(depthMm, 3)}mm` : ''}`,
        }),
      );
    }

    combinedElements.push(...buildGrainGuideElements(part, bounds));
  }

  const combinedBounds = combinedBoxes.length
    ? {
        minX: Math.min(...combinedBoxes.map((box) => box.minX)),
        minY: Math.min(...combinedBoxes.map((box) => box.minY)),
        maxX: Math.max(...combinedBoxes.map((box) => box.maxX)),
        maxY: Math.max(...combinedBoxes.map((box) => box.maxY)),
      }
    : null;

  return {
    parts: documents,
    combined: combinedBounds
      ? {
          filename: 'all-parts.svg',
          content: buildSvgDocument(combinedElements, combinedBounds, 'All parts - Shaper Origin', SHAPER_MARGIN_MM),
        }
      : null,
  };
}

/** README lines listing every cut's intended depth, per part. */
export function buildShaperDepthTable(shaperDocuments) {
  const lines = [];

  for (const document of shaperDocuments.parts || []) {
    const byType = new Map();
    for (const cut of document.cuts) {
      const key = `${cut.cutType}|${cut.depthMm}`;
      byType.set(key, (byType.get(key) || 0) + 1);
    }

    const summary = [...byType.entries()]
      .map(([key, count]) => {
        const [cutType, depth] = key.split('|');
        return `${count}x ${cutType}${Number(depth) > 0 ? ` @ ${depth}mm` : ''}`;
      })
      .join(', ');

    lines.push(`    ${document.filename} - ${summary}`);
  }

  return lines;
}

export function downloadShaperSvg(entities, part, filename, options = {}) {
  const document = buildShaperPartDocument(entities, part, options);
  if (!document) {
    return;
  }
  downloadAsFile(document.content, filename || document.filename, 'image/svg+xml');
}
