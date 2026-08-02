/**
 * Hardware legend for the printable exports (SVG and the 1:1 PDF print sheet).
 *
 * Spelling a fastener's full name next to every hole does not survive 1:1 print:
 * screws sit 30-60mm apart and "#8 x 32mm Wood Screw" is wider than that, so the
 * labels would overlap each other and the geometry. Instead every distinct
 * catalog item gets a short index symbol (F1, F2, ...) drawn beside each of its
 * holes, and one legend block under the drawing expands the symbols into names,
 * pilot diameters and quantities.
 *
 * Counting is the BOM adapter's, not a second implementation: `entitiesToBomRows`
 * already dedupes a joinery fastener that was drilled twice (pocket bore + pilot
 * hole) down to one physical fastener, so the legend quantities always agree with
 * the cutting list.
 *
 * Marks are counted per drill site, not per fastener: one pocket screw is two
 * drill operations (bore plus pilot) and a dowel is one hole in each part, so
 * every site carries the tag of the fastener it belongs to while the legend
 * still counts one screw. Sites that project onto the same plan coordinate - the
 * usual case for a screw driven straight through the joint - collapse into a
 * single tag carrying `sites: 2`, because drawing the same "F1" twice at the same
 * point only smudges the print.
 */

import { groupBomRows } from '../../utils/bomUtils';
import { getFastenerDrillingDefaults } from '../../utils/fastenerUtils';
import {
  createFastenerHardwareResolver,
  entitiesToBomRows,
  getEntityFastenerHardwareId,
  isHardwareBomRow,
} from '../utils/entityBomAdapter';
import { TAG_CLEARANCE, TAG_FONT_SIZE, layoutFastenerTags } from './fastenerTagLayout';

/** All millimetres: the export is authored at 1:1 print scale. */
const MARK_FONT_SIZE = TAG_FONT_SIZE;
const MARK_OFFSET = TAG_CLEARANCE;
const LEGEND_TOP_GAP = 8;
const LEGEND_TITLE_FONT_SIZE = 5;
const LEGEND_TITLE_HEIGHT = 9;
const LEGEND_ROW_HEIGHT = 7;
const LEGEND_ROW_FONT_SIZE = 4;
// Enough clear space under the last row for the print sheet's ruler band.
const LEGEND_BOTTOM_PADDING = 6;
const LEGEND_SYMBOL_COLUMN = 12;

const EMPTY_LEGEND = { items: [], marks: [] };

const DIAMETER_SIGN = 'Ø';
const TIMES_SIGN = '×';
const EM_DASH = '—';

function escapeXml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getRowHardwareId(row) {
  return row.hardwareId ?? row.material ?? null;
}

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

/**
 * Where a drill site sits and how far its symbol has to clear the geometry.
 * `radius` is the drawn extent of the hole itself; the caller widens it to the
 * fastener's head so every tag - user-placed or joinery - is offset by the same
 * rule and two tags can never sit closer together than their holes do.
 */
function getDrillSiteGeometry(entity) {
  if (entity?.type !== 'feature') {
    return null;
  }

  if (entity.shape === 'circle' || entity.shape === 'ellipse') {
    const x = toFiniteNumber(entity.cx);
    const y = toFiniteNumber(entity.cy);
    if (x === null || y === null) {
      return null;
    }

    const radius =
      entity.shape === 'circle'
        ? Math.abs(toFiniteNumber(entity.diameter) ?? 0) / 2
        : Math.max(Math.abs(toFiniteNumber(entity.rx) ?? 0), Math.abs(toFiniteNumber(entity.ry) ?? 0));

    return { x, y, radius };
  }

  const points =
    entity.shape === 'polygon'
      ? entity.points
      : [
          { x: toFiniteNumber(entity.x), y: toFiniteNumber(entity.y) },
          {
            x: (toFiniteNumber(entity.x) ?? 0) + (toFiniteNumber(entity.width) ?? 0),
            y: (toFiniteNumber(entity.y) ?? 0) + (toFiniteNumber(entity.height) ?? 0),
          },
        ];

  const xs = (points || []).map((point) => toFiniteNumber(point?.x)).filter((value) => value !== null);
  const ys = (points || []).map((point) => toFiniteNumber(point?.y)).filter((value) => value !== null);
  if (!xs.length || !ys.length) {
    return null;
  }

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    radius: Math.max(maxX - minX, maxY - minY) / 2,
  };
}

/**
 * Collapses drill sites that share a symbol and a plan position into one tag,
 * keeping the widest hole's clearance so the text still clears the bigger bore.
 * `sites` records how many drill operations the tag stands for.
 */
function mergeCoincidentMarks(marks) {
  const byPosition = new Map();

  marks.forEach((mark) => {
    const key = `${mark.symbol}|${mark.x.toFixed(2)}|${mark.y.toFixed(2)}`;
    const existing = byPosition.get(key);

    if (!existing) {
      byPosition.set(key, mark);
      return;
    }

    byPosition.set(key, {
      ...(mark.headRadius > existing.headRadius ? mark : existing),
      sites: existing.sites + mark.sites,
    });
  });

  return [...byPosition.values()];
}

/**
 * Legend model for a set of export entities: one `items` entry per distinct
 * catalog item, one `marks` entry per drill position. A user fastener is one
 * site; a pocket screw or dowel is two (bore plus pilot, or one hole in each
 * part), which share a symbol so the operator can see which holes pair up.
 */
export function buildFastenerLegend(entities = []) {
  const hardwareRows = entitiesToBomRows(entities, null).filter(isHardwareBomRow);

  if (!hardwareRows.length) {
    return EMPTY_LEGEND;
  }

  const symbolByHardwareId = new Map();
  const items = groupBomRows(hardwareRows).map((row, index) => {
    const hardwareId = getRowHardwareId(row);
    const symbol = `F${index + 1}`;
    const drilling = getFastenerDrillingDefaults(hardwareId);
    symbolByHardwareId.set(hardwareId, symbol);

    return {
      symbol,
      hardwareId,
      name: row.materialName ?? hardwareId,
      kind: row.fastenerKind ?? drilling?.kind ?? null,
      pilotDiameter: drilling?.diameter ?? null,
      quantity: row.quantity || 1,
    };
  });

  // One catalog resolver for the whole pass: a joint's holes all ask the same
  // (kind, diameter) question, and the memo is discarded with this call so a
  // custom-material edit is always picked up by the next build.
  const resolveHardwareId = createFastenerHardwareResolver();
  const marks = entities
    .map((entity) => {
      const hardwareId = getEntityFastenerHardwareId(entity, resolveHardwareId);
      const symbol = hardwareId ? symbolByHardwareId.get(hardwareId) : null;
      const site = symbol ? getDrillSiteGeometry(entity) : null;
      if (!site) {
        return null;
      }

      const drilling = getFastenerDrillingDefaults(hardwareId);

      return {
        symbol,
        hardwareId,
        entityId: entity.id,
        joineryGenerated: entity.meta?.joineryGenerated === true,
        sites: 1,
        x: site.x,
        y: site.y,
        headRadius: Math.max((Number(drilling?.headDiameter) || 0) / 2, site.radius),
      };
    })
    .filter(Boolean);

  return { items, marks: layoutFastenerTags(mergeCoincidentMarks(marks)) };
}

/** Vertical space the legend block needs under the drawing, in mm. */
export function getFastenerLegendHeight(legend) {
  if (!legend?.items?.length) {
    return 0;
  }

  return LEGEND_TOP_GAP + LEGEND_TITLE_HEIGHT + legend.items.length * LEGEND_ROW_HEIGHT + LEGEND_BOTTOM_PADDING;
}

/** `#8 x 32mm Wood Screw, Ø3.0 pilot, ×6` - the legend row minus its symbol. */
export function formatFastenerLegendDescription(item) {
  const parts = [item.name];

  if (Number.isFinite(item.pilotDiameter)) {
    parts.push(`${DIAMETER_SIGN}${Number(item.pilotDiameter).toFixed(1)} pilot`);
  }

  parts.push(`${TIMES_SIGN}${item.quantity}`);

  return parts.join(', ');
}

export function formatFastenerLegendRow(item) {
  return `${item.symbol} ${EM_DASH} ${formatFastenerLegendDescription(item)}`;
}

/**
 * Index symbols drawn beside each drill site, at the positions the tag layout
 * settled on. A tag that had to be pushed clear of its neighbours carries a
 * leader line back to its hole.
 */
export function buildFastenerMarkElements(legend) {
  return (legend?.marks ?? []).flatMap((mark) => {
    const tag = mark.tag ?? {
      x: mark.x + mark.headRadius + MARK_OFFSET,
      y: mark.y - mark.headRadius - MARK_OFFSET,
      leader: null,
    };
    const text = `  <text x="${tag.x}" y="${tag.y}" font-size="${MARK_FONT_SIZE}" font-family="sans-serif" fill="#333" text-anchor="start">${escapeXml(mark.symbol)}</text>`;

    if (!tag.leader) {
      return [text];
    }

    return [
      `  <line x1="${tag.leader.x1}" y1="${tag.leader.y1}" x2="${tag.leader.x2}" y2="${tag.leader.y2}" stroke="#666" stroke-width="0.25" />`,
      text,
    ];
  });
}

/** The legend block itself, anchored at `origin` (top-left, mm). */
export function buildFastenerLegendElements(legend, origin = { x: 0, y: 0 }) {
  if (!legend?.items?.length) {
    return [];
  }

  const titleY = origin.y + LEGEND_TITLE_FONT_SIZE;
  const rows = legend.items.map((item, index) => {
    const rowY = origin.y + LEGEND_TITLE_HEIGHT + index * LEGEND_ROW_HEIGHT + LEGEND_ROW_FONT_SIZE;
    return `    <text x="${origin.x}" y="${rowY}" font-size="${LEGEND_ROW_FONT_SIZE}" font-family="sans-serif" fill="#333">${escapeXml(item.symbol)}</text>
    <text x="${origin.x + LEGEND_SYMBOL_COLUMN}" y="${rowY}" font-size="${LEGEND_ROW_FONT_SIZE}" font-family="sans-serif" fill="#333">${escapeXml(formatFastenerLegendDescription(item))}</text>`;
  });

  return [
    `  <g>
    <text x="${origin.x}" y="${titleY}" font-size="${LEGEND_TITLE_FONT_SIZE}" font-family="sans-serif" fill="#333" font-weight="bold">HARDWARE LEGEND</text>
    <line x1="${origin.x}" y1="${titleY + 2}" x2="${origin.x + 90}" y2="${titleY + 2}" stroke="#666" stroke-width="0.3" />
${rows.join('\n')}
  </g>`,
  ];
}

export const FASTENER_LEGEND_TOP_GAP = LEGEND_TOP_GAP;
