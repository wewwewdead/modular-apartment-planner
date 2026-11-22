import { memo } from 'react';
import { columnOutline } from '@/geometry/columnGeometry';
import { DRAWING_GRAPHICS, PRESENTATION_GRAPHICS } from '@/sheets/standards';
import { isPresentationStyle, usePlanDragActive, usePlanStyle } from './PlanStyleContext';

// One memoised item per column: moving one column redraws that column only.
const ColumnItem = memo(function ColumnItem({ column, presentation, paintPresentation }) {
  const outline = columnOutline(column);
  const points = outline.map((p) => `${p.x},${p.y}`).join(' ');
  if (presentation) {
    return (
      <g>
        <polygon
          data-id={column.id}
          data-type="column"
          points={points}
          fill={paintPresentation ? PRESENTATION_GRAPHICS.plan.columnFill : 'none'}
          stroke="none"
          pointerEvents="none"
        />
      </g>
    );
  }
  return (
    <g>
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
});

function ColumnRenderer({ columns }) {
  const presentation = isPresentationStyle(usePlanStyle());
  const dragging = usePlanDragActive();
  // In presentation the columns are drawn as part of the solid wall union (see
  // WallRenderer), so their own polygons stay only as invisible hooks — except
  // mid-drag, when the walls fall back to per-wall drawing and the columns
  // have to paint themselves to stay on screen.
  const paintPresentation = presentation && dragging;
  return (
    <g className="columns">
      {columns.map((column) => (
        <ColumnItem key={column.id} column={column} presentation={presentation} paintPresentation={paintPresentation} />
      ))}
    </g>
  );
}

export default memo(ColumnRenderer);
