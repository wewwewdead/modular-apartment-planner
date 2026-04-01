import { useMemo, useState } from 'react';
import { nestPartsOnSheets, DEFAULT_SHEET } from '../utils/nestingOptimizer';
import styles from '../styles/craftsman.module.css';

const COLORS = ['#4a9eff', '#ff6b6b', '#51cf66', '#ffd43b', '#cc5de8', '#ff922b', '#20c997', '#f06595'];

function SheetDiagram({ sheet, index }) {
  const scale = 200 / Math.max(sheet.width, sheet.height, 1);
  const w = sheet.width * scale;
  const h = sheet.height * scale;

  return (
    <div className={styles.nestingSheet}>
      <div className={styles.nestingSheetLabel}>
        Sheet {index + 1} — {sheet.materialName || 'Mixed'} — {sheet.wastePercent}% waste
      </div>
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${sheet.width} ${sheet.height}`}
        className={styles.nestingSvg}
      >
        <rect x="0" y="0" width={sheet.width} height={sheet.height} fill="#2a2a3e" stroke="#555" strokeWidth="2" />
        {sheet.placements.map((p, i) => (
          <g key={i}>
            <rect
              x={p.x}
              y={p.y}
              width={p.placedWidth}
              height={p.placedHeight}
              fill={COLORS[i % COLORS.length]}
              fillOpacity="0.6"
              stroke={COLORS[i % COLORS.length]}
              strokeWidth="1.5"
            />
            {p.placedWidth * scale > 30 && p.placedHeight * scale > 14 && (
              <text
                x={p.x + p.placedWidth / 2}
                y={p.y + p.placedHeight / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fill="white"
                fontSize={Math.min(p.placedWidth, p.placedHeight) * 0.2}
              >
                {Math.round(p.width)}x{Math.round(p.height)}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

export default function NestingPanel({ bomRows }) {
  const [sheetWidth, setSheetWidth] = useState(DEFAULT_SHEET.width);
  const [sheetHeight, setSheetHeight] = useState(DEFAULT_SHEET.height);

  const result = useMemo(
    () => nestPartsOnSheets(bomRows, { sheetSize: { width: sheetWidth, height: sheetHeight } }),
    [bomRows, sheetWidth, sheetHeight],
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
        <label className={styles.fieldLabel}>Sheet size (mm)</label>
        <div className={styles.nestingSizeInputs}>
          <input type="number" value={sheetWidth} onChange={(e) => setSheetWidth(Number(e.target.value) || DEFAULT_SHEET.width)} className={styles.thicknessInput} />
          <span className={styles.nestingSizeX}>x</span>
          <input type="number" value={sheetHeight} onChange={(e) => setSheetHeight(Number(e.target.value) || DEFAULT_SHEET.height)} className={styles.thicknessInput} />
        </div>
      </div>

      <div className={styles.nestingSummary}>
        <div className={styles.nestingStat}>
          <span className={styles.nestingStatValue}>{result.summary.sheetsNeeded}</span>
          <span className={styles.nestingStatLabel}>sheets</span>
        </div>
        <div className={styles.nestingStat}>
          <span className={styles.nestingStatValue}>{result.summary.efficiency}%</span>
          <span className={styles.nestingStatLabel}>efficiency</span>
        </div>
        <div className={styles.nestingStat}>
          <span className={styles.nestingStatValue}>{result.summary.wasteArea} m2</span>
          <span className={styles.nestingStatLabel}>waste</span>
        </div>
      </div>

      <div className={styles.nestingSheets}>
        {result.sheets.map((sheet, i) => (
          <SheetDiagram key={i} sheet={sheet} index={i} />
        ))}
      </div>
    </div>
  );
}
