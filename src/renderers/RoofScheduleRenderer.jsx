import { formatDrawingArea, formatDrawingMeasurement } from '@/sheets/standards';
import { buildRoofScheduleLayout } from '@/roof/roofScheduleLayout';

const BORDER = '#25303b';
const BORDER_MUTED = '#c8d0d8';
const FILL = '#ffffff';
const FILL_ALT = '#f6f8fa';
const TEXT = '#1b232c';
const TEXT_MUTED = '#5d6975';

function formatMetricValue(metric) {
  if (metric.kind === 'area') return formatDrawingArea(metric.value) || '0.00 m²';
  if (metric.kind === 'length') return formatDrawingMeasurement(metric.value);
  return String(Math.round(metric.value || 0));
}

function formatOpeningSize(row) {
  if (row.placeholder) return '-';
  return `${formatDrawingMeasurement(row.length)} x ${formatDrawingMeasurement(row.width)}`;
}

export default function RoofScheduleRenderer({ schedule, showTitle = true }) {
  if (!schedule) return null;

  const layout = buildRoofScheduleLayout(schedule, { showTitle });

  return (
    <g className="roof-schedule">
      {layout.title && (
        <text
          x={layout.title.x}
          y={layout.title.y}
          fill={TEXT}
          fontSize={layout.title.fontSize}
          fontWeight={600}
          fontFamily="var(--font-blueprint)"
        >
          {schedule.title}
        </text>
      )}

      {layout.metricCards.map((metric) => (
        <g key={metric.key}>
          <rect
            x={metric.x}
            y={metric.y}
            width={metric.width}
            height={metric.height}
            fill={metric.emphasis ? FILL_ALT : FILL}
            stroke={BORDER}
            strokeWidth={24}
          />
          <text
            x={metric.x + 180}
            y={metric.y + 240}
            fill={TEXT_MUTED}
            fontSize={124}
            fontWeight={600}
            letterSpacing={6}
            fontFamily="var(--font-blueprint)"
          >
            {metric.label.toUpperCase()}
          </text>
          <text
            x={metric.x + 180}
            y={metric.y + 520}
            fill={TEXT}
            fontSize={240}
            fontWeight={600}
            fontFamily="var(--font-blueprint)"
          >
            {formatMetricValue(metric)}
          </text>
          {metric.meta && (
            <text
              x={metric.x + metric.width - 180}
              y={metric.y + 240}
              textAnchor="end"
              fill={TEXT_MUTED}
              fontSize={108}
              fontFamily="var(--font-blueprint)"
            >
              {metric.meta}
            </text>
          )}
        </g>
      ))}

      {layout.notesSection.title && (
        <text
          x={layout.notesSection.title.x}
          y={layout.notesSection.title.y}
          fill={TEXT}
          fontSize={layout.notesSection.title.fontSize}
          fontWeight={600}
          letterSpacing={4}
          fontFamily="var(--font-blueprint)"
        >
          SUMMARY NOTES
        </text>
      )}
      {layout.notesSection.rows.map((note) => (
        <text
          key={note.id}
          x={note.x}
          y={note.y}
          fill={TEXT_MUTED}
          fontSize={122}
          fontFamily="var(--font-blueprint)"
        >
          {note.text}
        </text>
      ))}

      <text
        x={layout.table.title.x}
        y={layout.table.title.y}
        fill={TEXT}
        fontSize={layout.table.title.fontSize}
        fontWeight={600}
        letterSpacing={4}
        fontFamily="var(--font-blueprint)"
      >
        OPENING SCHEDULE
      </text>

      <rect
        x={layout.table.x}
        y={layout.table.y}
        width={layout.table.width}
        height={layout.table.headerHeight}
        fill={FILL_ALT}
        stroke={BORDER}
        strokeWidth={24}
      />
      {layout.table.columns.map((column) => (
        <g key={column.key}>
          <line
            x1={column.x}
            y1={layout.table.y}
            x2={column.x}
            y2={layout.table.y + layout.table.headerHeight + (layout.table.rows.length * layout.table.rowHeight)}
            stroke={BORDER_MUTED}
            strokeWidth={16}
          />
          <text
            x={column.x + 120}
            y={layout.table.y + 220}
            fill={TEXT_MUTED}
            fontSize={118}
            fontWeight={600}
            fontFamily="var(--font-blueprint)"
          >
            {column.label.toUpperCase()}
          </text>
        </g>
      ))}
      <line
        x1={layout.table.x + layout.table.width}
        y1={layout.table.y}
        x2={layout.table.x + layout.table.width}
        y2={layout.table.y + layout.table.headerHeight + (layout.table.rows.length * layout.table.rowHeight)}
        stroke={BORDER_MUTED}
        strokeWidth={16}
      />

      {layout.table.rows.map((row, index) => {
        const rowY = row.y;
        const isPlaceholder = Boolean(row.placeholder);
        const texts = [
          row.name,
          isPlaceholder ? '-' : row.type.toUpperCase(),
          formatOpeningSize(row),
          isPlaceholder ? '-' : (formatDrawingArea(row.planArea) || '0.00 m²'),
          isPlaceholder ? '-' : formatDrawingMeasurement(row.curbHeight),
        ];

        return (
          <g key={row.id}>
            <rect
              x={layout.table.x}
              y={rowY}
              width={layout.table.width}
              height={layout.table.rowHeight}
              fill={index % 2 === 0 ? FILL : FILL_ALT}
              stroke={BORDER_MUTED}
              strokeWidth={12}
            />
            {layout.table.columns.map((column, columnIndex) => (
              <text
                key={`${row.id}-${column.key}`}
                x={column.x + 120}
                y={rowY + 205}
                fill={columnIndex === 0 ? TEXT : TEXT_MUTED}
                fontSize={120}
                fontFamily="var(--font-blueprint)"
              >
                {texts[columnIndex]}
              </text>
            ))}
          </g>
        );
      })}
    </g>
  );
}
