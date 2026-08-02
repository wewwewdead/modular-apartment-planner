function displayCell(value, maxLength = 58) {
  const text = String(value ?? '');
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

export default function BuildingReportRenderer({ report }) {
  if (!report) return null;
  const width = 16000;
  const left = 500;
  const top = 600;
  const tableTop = 1300;
  const rowHeight = 420;
  const columns = report.columns || [];
  const columnWidth = (width - left * 2) / Math.max(1, columns.length);
  return (
    <g data-type="building-report">
      <text x={left} y={top} fontSize="430" fontWeight="700" fill="#17202a">
        {report.title}
      </text>
      <line x1={left} y1={top + 180} x2={width - left} y2={top + 180} stroke="#2d5f8e" strokeWidth="35" />
      <rect
        x={left}
        y={tableTop}
        width={width - left * 2}
        height={rowHeight}
        fill="#e8eef4"
        stroke="#607080"
        strokeWidth="18"
      />
      {columns.map((column, index) => (
        <text
          key={column}
          x={left + index * columnWidth + 100}
          y={tableTop + 275}
          fontSize="230"
          fontWeight="700"
          fill="#17202a"
        >
          {displayCell(column, 26)}
        </text>
      ))}
      {(report.rows || []).map((row, rowIndex) => {
        const y = tableTop + rowHeight * (rowIndex + 1);
        return (
          <g key={`${rowIndex}:${row[0]}`}>
            <rect
              x={left}
              y={y}
              width={width - left * 2}
              height={rowHeight}
              fill={rowIndex % 2 ? '#f6f8fa' : '#ffffff'}
              stroke="#a8b0b8"
              strokeWidth="12"
            />
            {row.map((cell, columnIndex) => (
              <text
                key={`${rowIndex}:${columnIndex}`}
                x={left + columnIndex * columnWidth + 100}
                y={y + 275}
                fontSize="205"
                fill="#263442"
              >
                {displayCell(cell, columns.length <= 2 ? 72 : 30)}
              </text>
            ))}
          </g>
        );
      })}
      {(report.notes || []).map((note, index) => (
        <text
          key={`${index}:${note}`}
          x={left}
          y={tableTop + rowHeight * ((report.rows || []).length + 2) + index * 320}
          fontSize="205"
          fill="#526170"
        >
          • {displayCell(note, 110)}
        </text>
      ))}
    </g>
  );
}
