import { columnOutline } from '@/geometry/columnGeometry';

export default function ColumnRenderer({ columns }) {
  return (
    <g className="columns">
      {columns.map(column => {
        const outline = columnOutline(column);
        const points = outline.map(p => `${p.x},${p.y}`).join(' ');
        return (
          <g key={column.id}>
            <polygon
              data-id={column.id}
              data-type="column"
              points={points}
              fill="var(--color-column-fill, #A0A0A0)"
              stroke="var(--color-column-stroke, #555)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        );
      })}
    </g>
  );
}
