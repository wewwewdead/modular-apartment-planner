import {
  FASTENER_GUIDE_DIRECTIONS,
  FASTENER_GUIDE_MODES,
  deriveFastenerGuideLayout,
  deriveWallDetail,
  deriveWallDimensionGeometry,
  formatWallDimensionValue,
} from '@/domain/wallDetailing';
import { resolveWallAssembly } from '@/domain/wallAssemblies';
import { getWallJurisdictionProfile, getWallProductProfile } from '@/domain/wallProductProfiles';

function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function drawingFilename(value) {
  return String(value || 'wall-detail')
    .trim()
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function triggerDownload(contents, filename, type) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function svgRegionPath(region, wallHeight) {
  return [region.outline, ...(region.holes || [])]
    .filter((ring) => ring?.length)
    .map(
      (ring) =>
        `${ring.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.u} ${wallHeight - point.v}`).join(' ')} Z`,
    )
    .join(' ');
}

export function createWallDetailSvg(wall, floor, side = 'interior') {
  const detail = deriveWallDetail(wall, floor);
  const assembly = resolveWallAssembly(wall);
  const face = detail.configuration.sides[side];
  const profile = getWallProductProfile(face.productProfileId);
  const jurisdiction = getWallJurisdictionProfile(detail.configuration.jurisdictionProfileId);
  const margin = 260;
  const width = detail.length + margin * 2;
  const height = detail.height + margin * 2;
  const panels = detail.panels[side];
  const fasteners = detail.fasteners[side];
  const fastenerAppearance = face.fasteners.appearance;
  const fastenerPalette =
    fastenerAppearance === 'metal'
      ? { fill: '#858d91', stroke: '#343c40' }
      : fastenerAppearance === 'contrast'
        ? { fill: '#171b1e', stroke: '#050708' }
        : fastenerAppearance === 'construction'
          ? { fill: '#d4523f', stroke: '#ffffff' }
          : assembly[side].material === 'plywood'
            ? { fill: '#c9975d', stroke: '#7a5937' }
            : { fill: '#dedbd1', stroke: '#777772' };
  const fastenerGuides = face.fasteners.guides.map((guide) =>
    deriveFastenerGuideLayout(guide, { length: detail.length, height: detail.height }, { panels }),
  );
  const verticalJointLanding = Math.max(0, (assembly.framing.studWidth - face.layout.horizontalGap) / 2);
  const horizontalJointLanding = Math.max(0, (assembly.framing.studWidth - face.layout.verticalGap) / 2);
  const panelMarkup = panels
    .flatMap((panel) =>
      panel.polygonal
        ? panel.regions.map(
            (region, index) =>
              `<path d="${svgRegionPath(region, detail.height)}" fill-rule="evenodd" class="panel" data-panel="${escapeXml(panel.label)}" data-region="${index + 1}"/>`,
          )
        : panel.fragments.map(
            (fragment, index) =>
              `<rect x="${fragment.u0}" y="${detail.height - fragment.v1}" width="${fragment.u1 - fragment.u0}" height="${fragment.v1 - fragment.v0}" class="panel" data-panel="${escapeXml(panel.label)}" data-fragment="${index + 1}"/>`,
          ),
    )
    .join('');
  const labelMarkup = panels
    .map(
      (panel) =>
        `<text x="${(panel.u0 + panel.u1) / 2}" y="${detail.height - (panel.v0 + panel.v1) / 2}" class="panel-label">${escapeXml(panel.label)}</text>`,
    )
    .join('');
  const framingMarkup = detail.framing
    .filter((member) => member.frameIndex === 0)
    .map(
      (member) =>
        `<rect x="${member.u0}" y="${detail.height - member.v1}" width="${member.u1 - member.u0}" height="${member.v1 - member.v0}" class="framing" data-kind="${escapeXml(member.kind)}"/>`,
    )
    .join('');
  const fastenerMarkup = fasteners
    .map(
      (fastener) =>
        `<circle cx="${fastener.u}" cy="${detail.height - fastener.v}" r="${face.fasteners.headDiameter / 2}" class="fastener" fill="${fastenerPalette.fill}" stroke="${fastenerPalette.stroke}" data-appearance="${escapeXml(fastenerAppearance)}" data-head-diameter-mm="${face.fasteners.headDiameter}" data-fastener="${escapeXml(fastener.id)}"${fastener.guideId ? ` data-guide="${escapeXml(fastener.guideId)}" data-guide-station="${fastener.guideStation}"` : ''}/>`,
    )
    .join('');
  const fastenerGuideMarkup = fastenerGuides
    .map((guide) => {
      if (guide.mode === FASTENER_GUIDE_MODES.PANEL_PERIMETER) {
        const segments = guide.segments
          .map((segment) => {
            const stations = segment.stations
              .map((station) => {
                const tickStart = {
                  x: station.u - station.inward.u * 16,
                  y: detail.height - (station.v - station.inward.v * 16),
                };
                const tickEnd = {
                  x: station.u + station.inward.u * 16,
                  y: detail.height - (station.v + station.inward.v * 16),
                };
                const labelPoint = {
                  x: station.u - station.inward.u * 26,
                  y: detail.height - (station.v - station.inward.v * 26),
                };
                const label =
                  station.stationIndex === 0
                    ? '0'
                    : `+${formatWallDimensionValue(station.distanceFromStart, face.dimensions.precision)}`;
                return `<line x1="${tickStart.x}" y1="${tickStart.y}" x2="${tickEnd.x}" y2="${tickEnd.y}" class="fastener-guide-tick"/><text x="${labelPoint.x}" y="${labelPoint.y}" class="fastener-guide-station">${escapeXml(label)}</text>`;
              })
              .join('');
            const remainder =
              segment.remainder > face.dimensions.precision / 2
                ? `<text x="${segment.end.u}" y="${detail.height - segment.end.v - 24}" class="fastener-guide-remainder">${escapeXml(`remainder ${formatWallDimensionValue(segment.remainder, face.dimensions.precision)}`)}</text>`
                : '';
            return `<line x1="${segment.start.u}" y1="${detail.height - segment.start.v}" x2="${segment.end.u}" y2="${detail.height - segment.end.v}" class="fastener-guide-line"/>${stations}${remainder}`;
          })
          .join('');
        const labelAnchor = guide.segments[0]?.start || { u: 0, v: 0 };
        return `<g class="fastener-guide-group" data-guide="${escapeXml(guide.id)}" data-mode="panel_perimeter" data-panel="${escapeXml(guide.panelId)}" data-spacing-mm="${guide.spacing}">
    ${segments}
    <text x="${labelAnchor.u}" y="${detail.height - labelAnchor.v + 34}" class="fastener-guide-label">${escapeXml(`${guide.name} · panel-edge trace · ${formatWallDimensionValue(guide.spacing, face.dimensions.precision)} O.C.`)}</text>
  </g>`;
      }
      const vertical = guide.direction === FASTENER_GUIDE_DIRECTIONS.VERTICAL;
      const start = vertical
        ? { x: guide.coordinate, y: detail.height - guide.start }
        : { x: guide.start, y: detail.height - guide.coordinate };
      const end = vertical
        ? { x: guide.coordinate, y: detail.height - guide.end }
        : { x: guide.end, y: detail.height - guide.coordinate };
      const stations = guide.stations
        .map((station) => {
          const x = station.u;
          const y = detail.height - station.v;
          const label =
            station.index === 0
              ? 'DATUM 0'
              : `+${formatWallDimensionValue(station.distanceFromStart, face.dimensions.precision)}`;
          return `<line x1="${x - (vertical ? 16 : 0)}" y1="${y - (vertical ? 0 : 16)}" x2="${x + (vertical ? 16 : 0)}" y2="${y + (vertical ? 0 : 16)}" class="fastener-guide-tick"/><text x="${x + (vertical ? 24 : 8)}" y="${y + (vertical ? -7 : -24)}" class="fastener-guide-station">${escapeXml(label)}</text>`;
        })
        .join('');
      const remainder =
        guide.remainder > face.dimensions.precision / 2
          ? `<text x="${end.x}" y="${end.y - 28}" class="fastener-guide-remainder">${escapeXml(`end remainder ${formatWallDimensionValue(guide.remainder, face.dimensions.precision)}`)}</text>`
          : '';
      return `<g class="fastener-guide-group" data-guide="${escapeXml(guide.id)}" data-spacing-mm="${guide.spacing}">
    <line x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" class="fastener-guide-line"/>
    ${stations}
    <text x="${start.x}" y="${start.y + 34}" class="fastener-guide-label">${escapeXml(`${guide.name} · ${guide.zone} · ${formatWallDimensionValue(guide.spacing, face.dimensions.precision)} O.C.`)}</text>
    ${remainder}
  </g>`;
    })
    .join('');
  const openingMarkup = detail.openings
    .map(
      (opening) =>
        `<rect x="${opening.u0}" y="${detail.height - opening.v1}" width="${opening.u1 - opening.u0}" height="${opening.v1 - opening.v0}" class="opening"/><text x="${(opening.u0 + opening.u1) / 2}" y="${detail.height - (opening.v0 + opening.v1) / 2}" class="opening-label">${escapeXml(opening.kind.toUpperCase())}</text>`,
    )
    .join('');
  const dimensionMarkup = detail.dimensions[side]
    .map((dimension) => {
      const geometry = deriveWallDimensionGeometry(dimension);
      const y = (point) => detail.height - point.v;
      return `<g class="dimension-group" data-dimension="${escapeXml(dimension.id)}" data-source="${escapeXml(dimension.source)}" data-measurement-mm="${dimension.measurement}" data-precision-mm="${face.dimensions.precision}">
    <line x1="${geometry.witnessStart.u}" y1="${y(geometry.witnessStart)}" x2="${geometry.dimensionStart.u}" y2="${y(geometry.dimensionStart)}" class="dimension-witness"/>
    <line x1="${geometry.witnessEnd.u}" y1="${y(geometry.witnessEnd)}" x2="${geometry.dimensionEnd.u}" y2="${y(geometry.dimensionEnd)}" class="dimension-witness"/>
    <line x1="${geometry.dimensionStart.u}" y1="${y(geometry.dimensionStart)}" x2="${geometry.dimensionEnd.u}" y2="${y(geometry.dimensionEnd)}" class="dimension"/>
    <text x="${geometry.textPoint.u}" y="${y(geometry.textPoint) - 10}" class="dimension-label" text-anchor="middle" transform="rotate(${geometry.angleDegrees} ${geometry.textPoint.u} ${y(geometry.textPoint) - 10})">${escapeXml(dimension.label)}</text>
  </g>`;
    })
    .join('');
  const issueMarkup = detail.validationIssues
    .map(
      (entry, index) =>
        `<text x="0" y="${detail.height + 145 + index * 28}" class="issue">${escapeXml(`${entry.severity.toUpperCase()}: ${entry.message}`)}</text>`,
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="${-margin} ${-margin} ${width} ${height}">
  <title>${escapeXml(`Wall ${wall.id} ${side} construction detail`)}</title>
  <style>
    .sheet { fill: #fbfaf6; }
    .wall { fill: #222a31; stroke: #0d1115; stroke-width: 8; }
    .panel { fill: #dedbd1; stroke: #14191e; stroke-width: 4; }
    .framing { fill: rgba(74,134,169,.24); stroke: #2f718f; stroke-width: 4; }
    .fastener { stroke-width: 1.5; }
    .fastener-guide-line { stroke: #1785a8; stroke-width: 2; stroke-dasharray: 9 6; }
    .fastener-guide-tick { stroke: #1785a8; stroke-width: 3; }
    .fastener-guide-label, .fastener-guide-station, .fastener-guide-remainder { fill: #126b86; font-weight: 700; paint-order: stroke fill; stroke: #fbfaf6; stroke-width: 7px; }
    .fastener-guide-label { font-size: 30px; }
    .fastener-guide-station { font-size: 25px; }
    .fastener-guide-remainder { fill: #a06013; font-size: 24px; }
    .opening { fill: #fff; stroke: #111; stroke-width: 8; }
    text { font-family: Arial, sans-serif; fill: #151a1f; }
    .title { font-size: 58px; font-weight: 700; }
    .meta { font-size: 30px; }
    .panel-label { font-size: 32px; text-anchor: middle; dominant-baseline: middle; }
    .opening-label { font-size: 30px; text-anchor: middle; dominant-baseline: middle; }
    .issue { font-size: 24px; fill: #9d382c; }
    .dimension { stroke: #293039; stroke-width: 3; marker-start: url(#arrow); marker-end: url(#arrow); }
    .dimension-witness { stroke: #293039; stroke-width: 2; stroke-dasharray: 8 6; }
    .dimension-label { font-size: 30px; font-weight: 700; paint-order: stroke fill; stroke: #fbfaf6; stroke-width: 8px; }
  </style>
  <defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="5" refY="3" orient="auto"><path d="M0,0 L0,6 L6,3 z" fill="#293039"/></marker></defs>
  <rect x="${-margin}" y="${-margin}" width="${width}" height="${height}" class="sheet"/>
  <text x="0" y="-170" class="title">WALL ASSEMBLY DETAIL — ${escapeXml(side.toUpperCase())}</text>
  <text x="0" y="-115" class="meta">${escapeXml(`${profile.manufacturer} ${profile.product} · ${jurisdiction.label}`)}</text>
  <text x="0" y="-70" class="meta">Wall ${escapeXml(wall.id)} · ${detail.length.toFixed(0)} × ${detail.height.toFixed(0)} mm · ${panels.length} panels · ${fasteners.length} fasteners · ${escapeXml(face.layout.jointSystem)} joint · V ${face.layout.horizontalGap} / H ${face.layout.verticalGap} mm reveal · ${verticalJointLanding.toFixed(1)} / ${horizontalJointLanding.toFixed(1)} mm panel landing per side · ${escapeXml(face.layout.revealIntent.replaceAll('_', ' '))}</text>
  <rect x="0" y="0" width="${detail.length}" height="${detail.height}" class="wall"/>
  ${panelMarkup}
  ${framingMarkup}
  ${fastenerGuideMarkup}
  ${fastenerMarkup}
  ${openingMarkup}
  ${labelMarkup}
  ${dimensionMarkup}
  ${issueMarkup}
</svg>`;
}

function csvCell(value) {
  const string = String(value ?? '');
  return /[",\r\n]/.test(string) ? `"${string.replaceAll('"', '""')}"` : string;
}

export function createWallDetailCsv(wall, floor, side = 'interior') {
  const detail = deriveWallDetail(wall, floor);
  const assembly = resolveWallAssembly(wall);
  const face = detail.configuration.sides[side];
  const layout = face.layout;
  const fastenerGuides = face.fasteners.guides.map((guide) =>
    deriveFastenerGuideLayout(guide, { length: detail.length, height: detail.height }, { panels: detail.panels[side] }),
  );
  const verticalJointLanding = Math.max(0, (assembly.framing.studWidth - layout.horizontalGap) / 2);
  const horizontalJointLanding = Math.max(0, (assembly.framing.studWidth - layout.verticalGap) / 2);
  const rows = [
    ['record_type', 'id', 'side_or_kind', 'u0_mm', 'u1_mm', 'v0_mm', 'v1_mm', 'quantity', 'note'],
    [
      'panel_layout',
      wall.id,
      `${side}:${layout.jointSystem}`,
      layout.horizontalGap,
      '',
      layout.verticalGap,
      '',
      '',
      `u0 = vertical-joint reveal mm; v0 = horizontal-joint reveal mm; ${verticalJointLanding.toFixed(1)} / ${horizontalJointLanding.toFixed(1)} mm panel landing per side on ${assembly.framing.studWidth} mm support; intent = ${layout.revealIntent}; planning intent—confirm product detail`,
    ],
    ...fastenerGuides.map((guide) =>
      guide.mode === FASTENER_GUIDE_MODES.PANEL_PERIMETER
        ? [
            'fastener_guide',
            guide.id,
            'panel_perimeter',
            guide.panel?.u0 ?? '',
            guide.panel?.u1 ?? '',
            guide.panel?.v0 ?? '',
            guide.panel?.v1 ?? '',
            guide.stations.length,
            `${guide.name}; panel ${guide.panelId}; ${guide.edgeClearance} mm edge setback; ${guide.cornerClearance} mm corner setback; ${guide.spacing} mm O.C.; ${guide.remainder} mm maximum edge remainder`,
          ]
        : [
            'fastener_guide',
            guide.id,
            guide.direction,
            guide.direction === FASTENER_GUIDE_DIRECTIONS.VERTICAL ? guide.coordinate : guide.start,
            guide.direction === FASTENER_GUIDE_DIRECTIONS.VERTICAL ? guide.coordinate : guide.end,
            guide.direction === FASTENER_GUIDE_DIRECTIONS.VERTICAL ? guide.start : guide.coordinate,
            guide.direction === FASTENER_GUIDE_DIRECTIONS.VERTICAL ? guide.end : guide.coordinate,
            guide.stations.length,
            `${guide.name}; ${guide.zone}; ${guide.spacing} mm O.C.; ${guide.remainder} mm end remainder`,
          ],
    ),
    ...detail.panels[side].map((panel) => [
      'panel',
      panel.label,
      side,
      panel.u0,
      panel.u1,
      panel.v0,
      panel.v1,
      (panel.netArea / 1_000_000).toFixed(4),
      'net m2',
    ]),
    ...detail.framing.map((member) => [
      'framing',
      member.id,
      member.kind,
      member.u0,
      member.u1,
      member.v0,
      member.v1,
      (member.orientation === 'vertical' ? member.v1 - member.v0 : member.u1 - member.u0).toFixed(1),
      'linear mm',
    ]),
    ...detail.fasteners[side].map((fastener) => [
      'fastener',
      fastener.id,
      side,
      fastener.u,
      fastener.u,
      fastener.v,
      fastener.v,
      1,
      fastener.guideId
        ? `${fastener.type}; guide ${fastener.guideId}; station ${(fastener.guideStation ?? 0) + 1}`
        : fastener.type,
    ]),
    ...detail.dimensions[side].map((dimension) => [
      'dimension',
      dimension.id,
      dimension.mode,
      dimension.start.u,
      dimension.end.u,
      dimension.start.v,
      dimension.end.v,
      dimension.measurement,
      `${dimension.name}: ${dimension.label}`,
    ]),
    ...detail.asBuilt.map((measurement) => [
      'as_built',
      measurement.id,
      measurement.axis,
      measurement.designValue,
      measurement.measuredValue,
      '',
      '',
      measurement.deviation,
      measurement.status,
    ]),
  ];
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

export function downloadWallDetailSvg(wall, floor, side = 'interior') {
  triggerDownload(
    createWallDetailSvg(wall, floor, side),
    `${drawingFilename(`${wall.id}-${side}-wall-detail`)}.svg`,
    'image/svg+xml;charset=utf-8',
  );
}

export function downloadWallDetailCsv(wall, floor, side = 'interior') {
  triggerDownload(
    createWallDetailCsv(wall, floor, side),
    `${drawingFilename(`${wall.id}-${side}-wall-detail`)}.csv`,
    'text/csv;charset=utf-8',
  );
}
