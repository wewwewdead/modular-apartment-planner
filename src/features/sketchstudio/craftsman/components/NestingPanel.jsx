import { useMemo, useState } from 'react';
import {
  optimizeCutList,
  DEFAULT_SHEET,
  DEFAULT_LINEAR_STOCK,
  DEFAULT_BLADE_KERF,
} from '../utils/nestingOptimizer';
import styles from '../styles/craftsman.module.css';

const COLORS = ['#4a9eff', '#ff6b6b', '#51cf66', '#ffd43b', '#cc5de8', '#ff922b', '#20c997', '#f06595'];

function getRowStockKind(row) {
  return row?.stockKind === 'linear' || row?.costBasis === 'perLinearMeter' ? 'linear' : 'sheet';
}

function formatValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '0';
  if (Math.abs(numeric - Math.round(numeric)) < 0.001) return String(Math.round(numeric));
  return numeric.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
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
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${sheet.width} ${sheet.height}`}
        className={styles.nestingSvg}
      >
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
      <svg
        width={width}
        height="46"
        viewBox={`0 0 ${viewWidth} 34`}
        className={styles.nestingSvg}
      >
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

  return (
    <section className={styles.nestingGroup}>
      <div className={styles.nestingGroupHeader}>
        <div className={styles.nestingGroupTitle}>{group.materialName || group.material}</div>
        <div className={styles.nestingGroupMeta}>{unitLabel}</div>
      </div>

      <SummaryRow stats={buildGroupStats(group.summary)} />

      {group.summary.oversizedCount > 0 && (
        <div className={styles.nestingWarning}>
          {group.summary.oversizedCount} cut{group.summary.oversizedCount === 1 ? '' : 's'} exceed the available stock size.
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

export default function NestingPanel({ bomRows }) {
  const [sheetWidth, setSheetWidth] = useState(DEFAULT_SHEET.width);
  const [sheetHeight, setSheetHeight] = useState(DEFAULT_SHEET.height);
  const [bladeKerf, setBladeKerf] = useState(DEFAULT_BLADE_KERF);
  const [linearStockLengths, setLinearStockLengths] = useState({});

  const hasSheetRows = useMemo(
    () => bomRows.some((row) => getRowStockKind(row) === 'sheet'),
    [bomRows],
  );

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

  const result = useMemo(
    () => optimizeCutList(bomRows, {
      sheetSize: { width: sheetWidth, height: sheetHeight },
      bladeKerf,
      linearStockLengths,
    }),
    [bomRows, sheetWidth, sheetHeight, bladeKerf, linearStockLengths],
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
    </div>
  );
}
