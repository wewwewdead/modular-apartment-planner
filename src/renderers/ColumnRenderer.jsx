import { columnOutline } from '@/geometry/columnGeometry';
import { DRAWING_GRAPHICS } from '@/sheets/standards';

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
              fill={DRAWING_GRAPHICS.plan.cutFill}
              stroke={DRAWING_GRAPHICS.plan.cutStroke}
              strokeWidth={DRAWING_GRAPHICS.plan.cutStrokeWidth}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        );
      })}
    </g>
  );
}
