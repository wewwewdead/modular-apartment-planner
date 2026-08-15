import { useMemo, useState } from 'react';
import { optimizeCutList, DEFAULT_SHEET, DEFAULT_LINEAR_STOCK, DEFAULT_BLADE_KERF } from '../utils/nestingOptimizer';
import {
  DEFAULT_CUT_KERF_MM,
  DEFAULT_STOCK_LENGTH_MM,
  isLinearStockRow,
  optimizeLinearStock,
  resolveStockLengthMm,
} from '../utils/linearStockOptimizer';
import styles from '../styles/craftsman.module.css';

const COLORS = ['#4a9eff', '#ff6b6b', '#51cf66', '#ffd43b', '#cc5de8', '#ff922b', '#20c997', '#f06595'];

const GRAIN_ARROW_COLOR = '#ffffff';

/**
 * Grain arrow drawn through the centre of a grain-locked placement, pointing
 * along the part's grain AS PLACED on the sheet. Sheet grain runs horizontally
 * (along the sheet length), so an aligned part reads as a horizontal arrow.
 */
function GrainArrow({ placement }) {
  if (!placement.grainLocked) {
    return null;
  }

  const centerX = placement.x + placement.placedWidth / 2;
  const centerY = placement.y + placement.placedHeight / 2;
  const span = Math.min(placement.placedWidth, placement.placedHeight) * 0.6;
  if (!(span > 0)) {
    return null;
  }

  const radians = ((placement.placedGrainAngleDeg ?? 0) * Math.PI) / 180;
  const dirX = Math.cos(radians);
  const dirY = Math.sin(radians);
  const half = span / 2;
  const head = Math.max(span * 0.16, 1);

  const tipX = centerX + dirX * half;
  const tipY = centerY + dirY * half;
  const tailX = centerX - dirX * half;
  const tailY = centerY - dirY * half;
  // Barbs at +/-135 degrees from the shaft direction.
  const barb = (sign) => ({
    x: tipX - head * (dirX * Math.SQRT1_2 - sign * dirY * Math.SQRT1_2),
    y: tipY - head * (dirY * Math.SQRT1_2 + sign * dirX * Math.SQRT1_2),
  });
  const left = barb(1);
  const right = barb(-1);

  return (
    <g className={styles.nestingGrainArrow} opacity="0.85">
      <line
        x1={tailX}
        y1={tailY}
        x2={tipX}
        y2={tipY}
        stroke={GRAIN_ARROW_COLOR}
        strokeWidth={Math.max(head / 3, 0.6)}
      />
      <polyline
        points={`${left.x},${left.y} ${tipX},${tipY} ${right.x},${right.y}`}
        fill="none"
        stroke={GRAIN_ARROW_COLOR}
        strokeWidth={Math.max(head / 3, 0.6)}
      />
    </g>
  );
}

function getRowStockKind(row) {
  if (row?.stockKind === 'piece') return 'piece';
  return row?.stockKind === 'linear' || row?.costBasis === 'perLinearMeter' ? 'linear' : 'sheet';
}

function formatValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '0';
  if (Math.abs(numeric - Math.round(numeric)) < 0.001) return String(Math.round(numeric));
  return numeric
    .toFixed(2)
    .replace(/\.00$/, '')
    .replace(/(\.\d)0$/, '$1');
}

function buildTopLevelStats(summary) {
  if (summary.sheet && summary.linear) {
    return [
      { value: summary.sheet.unitsNeeded, label: 'sheets' },
      { value: summary.linear.unitsNeeded, label: 'sticks' },
      { value: summary.totalGroups, label: 'materials' },
    ];
  }

  if (summary.linear) {
    return [
      { value: summary.linear.unitsNeeded, label: 'sticks' },
      { value: `${formatValue(summary.linear.usedLengthM)} m`, label: 'used' },
      { value: `${formatValue(summary.linear.leftoverLengthM)} m`, label: 'leftover' },
      { value: `${summary.linear.efficiency}%`, label: 'efficiency' },
    ];
  }

  if (summary.sheet) {
    return [
      { value: summary.sheet.unitsNeeded, label: 'sheets' },
      { value: `${summary.sheet.efficiency}%`, label: 'efficiency' },
      { value: `${formatValue(summary.sheet.wasteAreaM2)} m2`, label: 'waste' },
    ];
  }

  return [];
}

function buildGroupStats(summary) {
  if (summary.stockKind === 'linear') {
    return [
      { value: summary.unitsNeeded, label: 'sticks' },
      { value: `${formatValue(summary.usedLengthM)} m`, label: 'used' },
      { value: `${formatValue(summary.leftoverLengthM)} m`, label: 'leftover' },
      { value: `${summary.efficiency}%`, label: 'efficiency' },
    ];
  }

  return [
    { value: summary.unitsNeeded, label: 'sheets' },
    { value: `${summary.efficiency}%`, label: 'efficiency' },
    { value: `${formatValue(summary.wasteAreaM2)} m2`, label: 'waste' },
  ];
}

function SummaryRow({ stats }) {
  if (!stats.length) return null;

  return (
    <div className={styles.nestingSummary}>
      {stats.map((stat) => (
        <div key={stat.label} className={styles.nestingStat}>
          <span className={styles.nestingStatValue}>{stat.value}</span>
          <span className={styles.nestingStatLabel}>{stat.label}</span>
        </div>
      ))}
    </div>
  );
}

function SheetDiagram({ sheet, index }) {
  const scale = 200 / Math.max(sheet.width, sheet.height, 1);
  const width = sheet.width * scale;
  const height = sheet.height * scale;

  return (
    <div className={styles.nestingSheet}>
      <div className={styles.nestingSheetLabel}>
        Sheet {index + 1} {sheet.oversized ? '— oversized' : `— ${sheet.wastePercent}% waste`}
      </div>
      <svg width={width} height={height} viewBox={`0 0 ${sheet.width} ${sheet.height}`} className={styles.nestingSvg}>
        <rect x="0" y="0" width={sheet.width} height={sheet.height} fill="#2a2a3e" stroke="#555" strokeWidth="2" />
        {sheet.placements.map((placement, placementIndex) => (
          <g key={placement.id || placementIndex}>
            <rect
              x={placement.x}
              y={placement.y}
              width={placement.placedWidth}
              height={placement.placedHeight}
              fill={COLORS[placementIndex % COLORS.length]}
              fillOpacity="0.6"
              stroke={COLORS[placementIndex % COLORS.length]}
              strokeWidth="1.5"
            />
            {placement.placedWidth * scale > 30 && placement.placedHeight * scale > 14 && (
              <text
                x={placement.x + placement.placedWidth / 2}
                y={placement.y + placement.placedHeight / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fill="white"
                fontSize={Math.min(placement.placedWidth, placement.placedHeight) * 0.2}
              >
                {Math.round(placement.width)}x{Math.round(placement.height)}
              </text>
            )}
            <GrainArrow placement={placement} />
          </g>
        ))}
      </svg>
    </div>
  );
}

function LinearDiagram({ unit, index }) {
  const viewWidth = Math.max(unit.displayLength, unit.length, 1);
  const scale = 220 / viewWidth;
  const width = Math.max(220, viewWidth * scale);
  const barY = 8;
  const barHeight = 18;

  return (
    <div className={styles.nestingSheet}>
      <div className={styles.nestingSheetLabel}>
        {unit.oversized
          ? `Stick ${index + 1} — oversized by ${formatValue(unit.oversizeBy * 0.001)} m`
          : `Stick ${index + 1} — ${formatValue(unit.cutLengthUsed * 0.001)} m used · ${formatValue(unit.remainingLength * 0.001)} m leftover`}
      </div>
      <svg width={width} height="46" viewBox={`0 0 ${viewWidth} 34`} className={styles.nestingSvg}>
        {viewWidth > unit.length && (
          <rect
            x={unit.length}
            y={barY}
            width={viewWidth - unit.length}
            height={barHeight}
            fill="rgba(255, 107, 107, 0.12)"
            stroke="#ff6b6b"
            strokeDasharray="12 6"
            strokeWidth="1"
          />
        )}
        <rect
          x="0"
          y={barY}
          width={unit.length}
          height={barHeight}
          fill="#2a2a3e"
          stroke={unit.oversized ? '#ff6b6b' : '#555'}
          strokeWidth="1.5"
        />
        {unit.cuts.map((cut, cutIndex) => (
          <g key={cut.id || `${cut.partName}-${cutIndex}`}>
            <rect
              x={cut.start}
              y={barY + 2}
              width={cut.length}
              height={barHeight - 4}
              fill={COLORS[cutIndex % COLORS.length]}
              fillOpacity="0.65"
              stroke={COLORS[cutIndex % COLORS.length]}
              strokeWidth="1"
            />
            {cut.length * scale > 28 && (
              <text
                x={cut.start + cut.length / 2}
                y={barY + barHeight / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fill="white"
                fontSize="4.2"
              >
                {Math.round(cut.length)}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

function MaterialGroup({ group }) {
  const unitLabel = group.stockKind === 'linear' ? group.stockLabel : `${group.stockLabel} sheets`;
  const grainLockedParts = group.summary.grainLockedParts || 0;

  return (
    <section className={styles.nestingGroup}>
      <div className={styles.nestingGroupHeader}>
        <div className={styles.nestingGroupTitle}>{group.materialName || group.material}</div>
        <div className={styles.nestingGroupMeta}>{unitLabel}</div>
      </div>

      <SummaryRow stats={buildGroupStats(group.summary)} />

      {grainLockedParts > 0 && (
        <div className={styles.hint}>
          Sheet grain runs along the sheet length (horizontal). {grainLockedParts} part
          {grainLockedParts === 1 ? ' is' : 's are'} grain locked and may not be turned to fit — arrows show the grain
          direction as placed.
        </div>
      )}

      {group.summary.oversizedCount > 0 && (
        <div className={styles.nestingWarning}>
          {group.summary.oversizedCount} cut{group.summary.oversizedCount === 1 ? '' : 's'} exceed the available stock
          size.
        </div>
      )}

      <div className={styles.nestingSheets}>
        {group.stockKind === 'linear'
          ? group.units.map((unit, index) => (
              <LinearDiagram key={`${group.material}-${index}`} unit={unit} index={index} />
            ))
          : group.units.map((sheet, index) => (
              <SheetDiagram key={`${group.material}-${index}`} sheet={sheet} index={index} />
            ))}
      </div>
    </section>
  );
}

/**
 * One board of the 1D cut plan, drawn like the sheet and stick diagrams above:
 * the full stock length as the bar, each cut as a coloured block in the order it
 * comes off the saw, and the offcut left dark at the end.
 */
function BoardDiagram({ board, kerfMm }) {
  const viewWidth = Math.max(board.stockLengthMm, 1);
  const scale = 220 / viewWidth;
  const barY = 8;
  const barHeight = 18;

  return (
    <div className={styles.nestingSheet}>
      <div className={styles.nestingSheetLabel}>
        Board {board.boardNumber} — {board.cuts.length} cut{board.cuts.length === 1 ? '' : 's'} ·{' '}
        {formatValue(board.usedLengthMm)}mm used · {formatValue(board.kerfLossMm)}mm kerf ·{' '}
        {formatValue(board.offcutLengthMm)}mm offcut
      </div>
      <svg width="100%" height="46" viewBox={`0 0 ${viewWidth} 34`} className={styles.nestingSvg}>
        <rect x="0" y={barY} width={viewWidth} height={barHeight} fill="#2a2a3e" stroke="#555" strokeWidth="1.5" />
        {board.cuts.map((cut, cutIndex) => (
          <g key={`${cut.partName}-${cutIndex}`}>
            <rect
              x={cut.startMm}
              y={barY + 2}
              width={cut.lengthMm}
              height={barHeight - 4}
              fill={COLORS[cutIndex % COLORS.length]}
              fillOpacity="0.65"
              stroke={COLORS[cutIndex % COLORS.length]}
              strokeWidth="1"
            />
            {cut.lengthMm * scale > 28 && (
              <text
                x={cut.startMm + cut.lengthMm / 2}
                y={barY + barHeight / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fill="white"
                fontSize="4.2"
              >
                {Math.round(cut.lengthMm)}
              </text>
            )}
          </g>
        ))}
        {kerfMm > 0 &&
          board.cuts.map((cut, cutIndex) => (
            <rect
              key={`kerf-${cutIndex}`}
              x={cut.endMm}
              y={barY + 2}
              width={kerfMm}
              height={barHeight - 4}
              fill="#ff6b6b"
              fillOpacity="0.7"
            />
          ))}
      </svg>
    </div>
  );
}

function CutListGroup({ group }) {
  return (
    <section className={styles.nestingGroup}>
      <div className={styles.nestingGroupHeader}>
        <div className={styles.nestingGroupTitle}>{group.materialName}</div>
        <div className={styles.nestingGroupMeta}>
          {group.stockLengthMm}mm boards · {group.kerfMm}mm kerf per cut
        </div>
      </div>

      <SummaryRow
        stats={[
          { value: group.summary.boardsNeeded, label: 'boards' },
          { value: `${formatValue(group.summary.offcutLengthM)} m`, label: 'offcut' },
          { value: `${group.summary.wastePercent}%`, label: 'waste' },
        ]}
      />

      {group.oversize.length > 0 && (
        <div className={styles.nestingWarning}>
          {group.oversize.length} part{group.oversize.length === 1 ? '' : 's'} longer than a {group.stockLengthMm}mm
          board: {group.oversize.map((item) => `${item.partName} (${formatValue(item.lengthMm)}mm)`).join(', ')}. Order
          longer stock or split the part.
        </div>
      )}

      <div className={styles.nestingSheets}>
        {group.boards.map((board) => (
          <BoardDiagram key={board.index} board={board} kerfMm={group.kerfMm} />
        ))}
      </div>
    </section>
  );
}

export default function NestingPanel({ bomRows }) {
  const [sheetWidth, setSheetWidth] = useState(DEFAULT_SHEET.width);
  const [sheetHeight, setSheetHeight] = useState(DEFAULT_SHEET.height);
  const [bladeKerf, setBladeKerf] = useState(DEFAULT_BLADE_KERF);
  const [linearStockLengths, setLinearStockLengths] = useState({});
  const [cutKerf, setCutKerf] = useState(DEFAULT_CUT_KERF_MM);
  const [cutStockLengths, setCutStockLengths] = useState({});

  const hasSheetRows = useMemo(() => bomRows.some((row) => getRowStockKind(row) === 'sheet'), [bomRows]);

  const linearMaterials = useMemo(() => {
    const materials = new Map();

    for (const row of bomRows) {
      if (getRowStockKind(row) !== 'linear') continue;
      const materialId = row.material || '__none__';
      if (!materials.has(materialId)) {
        materials.set(materialId, {
          material: materialId,
          materialName: row.materialName || materialId,
          defaultStockLength: Number(row.defaultStockLength) || DEFAULT_LINEAR_STOCK,
        });
      }
    }

    return Array.from(materials.values()).sort((a, b) => a.materialName.localeCompare(b.materialName));
  }, [bomRows]);

  // The 1D optimizer has its own stock-length source (`stockLengthMm` on the
  // catalog entry, 2400mm for anything without one), so its per-material
  // defaults are read from there rather than from the nesting view's.
  const cutMaterials = useMemo(() => {
    const materials = new Map();

    for (const row of bomRows) {
      if (!isLinearStockRow(row)) continue;
      const materialId = row.material || '__none__';
      if (!materials.has(materialId)) {
        materials.set(materialId, {
          material: materialId,
          materialName: row.materialName || materialId,
          defaultStockLengthMm: resolveStockLengthMm(materialId, row) || DEFAULT_STOCK_LENGTH_MM,
        });
      }
    }

    return Array.from(materials.values()).sort((a, b) => a.materialName.localeCompare(b.materialName));
  }, [bomRows]);

  const result = useMemo(
    () =>
      optimizeCutList(bomRows, {
        sheetSize: { width: sheetWidth, height: sheetHeight },
        bladeKerf,
        linearStockLengths,
      }),
    [bomRows, sheetWidth, sheetHeight, bladeKerf, linearStockLengths],
  );

  // The 1D plan is a separate answer to a separate question: the nesting view
  // above shows how sticks are consumed, this shows the cut sequence at the saw.
  const cutPlan = useMemo(
    () => optimizeLinearStock(bomRows, { kerfMm: cutKerf, stockLengthsMm: cutStockLengths }),
    [bomRows, cutKerf, cutStockLengths],
  );

  if (!bomRows.length) {
    return (
      <div className={styles.nestingPanel}>
        <h3 className={styles.panelTitle}>Cut-List Optimizer</h3>
        <p className={styles.emptyMessage}>Add materials to entities to optimize cutting layout.</p>
      </div>
    );
  }

  return (
    <div className={styles.nestingPanel}>
      <h3 className={styles.panelTitle}>Cut-List Optimizer</h3>

      <div className={styles.nestingConfig}>
        <label className={styles.fieldLabel}>Blade kerf (mm)</label>
        <input
          type="number"
          min="0"
          step="0.1"
          value={bladeKerf}
          onChange={(event) => setBladeKerf(Number(event.target.value) || DEFAULT_BLADE_KERF)}
          className={styles.thicknessInput}
        />
      </div>

      {hasSheetRows && (
        <div className={styles.nestingConfig}>
          <label className={styles.fieldLabel}>Sheet size (mm)</label>
          <div className={styles.nestingSizeInputs}>
            <input
              type="number"
              value={sheetWidth}
              onChange={(event) => setSheetWidth(Number(event.target.value) || DEFAULT_SHEET.width)}
              className={styles.thicknessInput}
            />
            <span className={styles.nestingSizeX}>x</span>
            <input
              type="number"
              value={sheetHeight}
              onChange={(event) => setSheetHeight(Number(event.target.value) || DEFAULT_SHEET.height)}
              className={styles.thicknessInput}
            />
          </div>
        </div>
      )}

      {linearMaterials.length > 0 && (
        <div className={styles.nestingConfig}>
          <label className={styles.fieldLabel}>Linear stock length (mm)</label>
          <div className={styles.nestingLinearConfigs}>
            {linearMaterials.map((material) => (
              <div key={material.material} className={styles.nestingLinearConfigRow}>
                <span className={styles.nestingLinearConfigLabel}>{material.materialName}</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={linearStockLengths[material.material] ?? material.defaultStockLength}
                  onChange={(event) => {
                    const nextValue = Number(event.target.value) || material.defaultStockLength;
                    setLinearStockLengths((current) => ({
                      ...current,
                      [material.material]: nextValue,
                    }));
                  }}
                  className={styles.thicknessInput}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <SummaryRow stats={buildTopLevelStats(result.summary)} />

      <div className={styles.nestingGroups}>
        {result.groups.map((group) => (
          <MaterialGroup key={`${group.stockKind}-${group.material}`} group={group} />
        ))}
      </div>

      {cutPlan.groups.length > 0 && (
        <>
          <h3 className={styles.panelTitle}>Cut list</h3>
          <p className={styles.hint}>
            First-fit-decreasing packing of every required length onto boards. Each cut is charged one kerf, including
            the one that frees the last piece.
          </p>

          <div className={styles.nestingConfig}>
            <label className={styles.fieldLabel} htmlFor="cut-kerf">
              Saw kerf per cut (mm)
            </label>
            <input
              id="cut-kerf"
              type="number"
              min="0"
              step="0.5"
              value={cutKerf}
              onChange={(event) => setCutKerf(Number(event.target.value) || 0)}
              className={styles.thicknessInput}
            />
          </div>

          <div className={styles.nestingConfig}>
            <label className={styles.fieldLabel}>Board length (mm)</label>
            <div className={styles.nestingLinearConfigs}>
              {cutMaterials.map((material) => (
                <div key={material.material} className={styles.nestingLinearConfigRow}>
                  <span className={styles.nestingLinearConfigLabel}>{material.materialName}</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={cutStockLengths[material.material] ?? material.defaultStockLengthMm}
                    onChange={(event) => {
                      const nextValue = Number(event.target.value) || material.defaultStockLengthMm;
                      setCutStockLengths((current) => ({ ...current, [material.material]: nextValue }));
                    }}
                    className={styles.thicknessInput}
                  />
                </div>
              ))}
            </div>
          </div>

          <SummaryRow
            stats={[
              { value: cutPlan.summary.boardsNeeded, label: 'boards' },
              { value: `${formatValue(cutPlan.summary.usedLengthM)} m`, label: 'parts' },
              { value: `${formatValue(cutPlan.summary.offcutLengthM)} m`, label: 'offcut' },
              { value: `${cutPlan.summary.wastePercent}%`, label: 'waste' },
            ]}
          />

          <div className={styles.nestingGroups}>
            {cutPlan.groups.map((group) => (
              <CutListGroup key={`cut-${group.material}`} group={group} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
