import { memo } from 'react';
import { STRUCTURAL_ALIGNMENT_TOLERANCE } from '@/domain/buildingGraph';

function axisRange(axes, orientation) {
  const offsets = axes.filter((axis) => axis.orientation === orientation).map((axis) => axis.offset);
  return offsets.length ? { min: Math.min(...offsets), max: Math.max(...offsets) } : { min: 0, max: 0 };
}

function GridAxis({ axis, crossRange, extension }) {
  const vertical = axis.orientation === 'vertical';
  const start = crossRange.min - extension;
  const end = crossRange.max + extension;
  const x1 = vertical ? axis.offset : start;
  const y1 = vertical ? start : axis.offset;
  const x2 = vertical ? axis.offset : end;
  const y2 = vertical ? end : axis.offset;
  const firstBubble = { x: x1, y: y1 };
  const secondBubble = { x: x2, y: y2 };

  return (
    <g data-type="structural-grid-axis" data-axis-id={axis.id}>
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="#6f5f9f"
        strokeWidth="1"
        strokeDasharray="12 5 2 5"
        opacity="0.8"
        vectorEffect="non-scaling-stroke"
      />
      {[firstBubble, secondBubble].map((point, index) => (
        <g key={index} transform={`translate(${point.x} ${point.y})`}>
          <circle
            r="180"
            fill="var(--color-panel-bg)"
            stroke="#6f5f9f"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
          <text y="65" fill="#6f5f9f" fontSize="190" fontWeight="700" textAnchor="middle">
            {axis.label}
          </text>
        </g>
      ))}
    </g>
  );
}

function stackStatus(stack, floor) {
  const ref = (stack.columnRefs || []).find((entry) => entry.floorId === floor?.id);
  if (!ref) return { kind: 'planned', column: null, offset: null };
  const column = (floor.columns || []).find((entry) => entry.id === ref.columnId);
  if (!column) return { kind: 'broken', column: null, offset: null };
  const offset = Math.hypot(column.x - stack.origin.x, column.y - stack.origin.y);
  return {
    kind: offset > STRUCTURAL_ALIGNMENT_TOLERANCE ? 'misaligned' : 'aligned',
    column,
    offset,
  };
}

function ColumnStackMarker({ stack, floor }) {
  const status = stackStatus(stack, floor);
  const color =
    status.kind === 'aligned'
      ? '#2d7d5d'
      : status.kind === 'misaligned' || status.kind === 'broken'
        ? '#b24a3a'
        : '#b78949';
  return (
    <g data-type="column-stack" data-stack-id={stack.id} data-status={status.kind}>
      {status.column && status.kind === 'misaligned' && (
        <line
          x1={stack.origin.x}
          y1={stack.origin.y}
          x2={status.column.x}
          y2={status.column.y}
          stroke={color}
          strokeWidth="2"
          strokeDasharray="5 4"
          vectorEffect="non-scaling-stroke"
        />
      )}
      <circle
        cx={stack.origin.x}
        cy={stack.origin.y}
        r="115"
        fill={status.kind === 'aligned' ? 'rgba(45, 125, 93, 0.18)' : 'var(--color-panel-bg)'}
        stroke={color}
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={stack.origin.x - 170}
        y1={stack.origin.y}
        x2={stack.origin.x + 170}
        y2={stack.origin.y}
        stroke={color}
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={stack.origin.x}
        y1={stack.origin.y - 170}
        x2={stack.origin.x}
        y2={stack.origin.y + 170}
        stroke={color}
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
      {status.offset != null && status.kind === 'misaligned' && (
        <text x={stack.origin.x + 210} y={stack.origin.y - 160} fill={color} fontSize="180">
          {Math.round(status.offset)} mm offset
        </text>
      )}
    </g>
  );
}

function LoadPathEdges({ loadPath, floor }) {
  const edges = (loadPath?.edges || []).filter((edge) => edge.floorId === floor?.id && edge.fromPoint && edge.toPoint);
  if (!edges.length) return null;
  return (
    <g data-type="conceptual-load-path" opacity="0.72">
      {edges.map((edge) => (
        <g key={edge.id} data-edge-kind={edge.kind}>
          <line
            x1={edge.fromPoint.x}
            y1={edge.fromPoint.y}
            x2={edge.toPoint.x}
            y2={edge.toPoint.y}
            stroke="#167c80"
            strokeWidth="1.5"
            strokeDasharray="8 5"
            vectorEffect="non-scaling-stroke"
          />
          <circle cx={edge.toPoint.x} cy={edge.toPoint.y} r="55" fill="#167c80" />
        </g>
      ))}
    </g>
  );
}

function StructuralGridOverlay({ structuralSystem, floor, loadPath }) {
  const grids = structuralSystem?.gridSystems || [];
  const stacks = structuralSystem?.columnStacks || [];
  if (!grids.length && !stacks.length && !(loadPath?.edges || []).length) return null;

  return (
    <g data-layer="structural-coordination" style={{ pointerEvents: 'none' }}>
      {grids.map((grid) => {
        const axes = grid.axes || [];
        const xRange = axisRange(axes, 'vertical');
        const yRange = axisRange(axes, 'horizontal');
        const extension = Math.max(700, Math.max(xRange.max - xRange.min, yRange.max - yRange.min) * 0.08);
        return (
          <g
            key={grid.id}
            data-type="structural-grid"
            data-grid-id={grid.id}
            transform={`translate(${grid.origin?.x || 0} ${grid.origin?.y || 0}) rotate(${grid.rotation || 0})`}
          >
            {axes.map((axis) => (
              <GridAxis
                key={axis.id}
                axis={axis}
                crossRange={axis.orientation === 'vertical' ? yRange : xRange}
                extension={extension}
              />
            ))}
          </g>
        );
      })}
      {stacks.map((stack) => (
        <ColumnStackMarker key={stack.id} stack={stack} floor={floor} />
      ))}
      <LoadPathEdges loadPath={loadPath} floor={floor} />
    </g>
  );
}

export default memo(StructuralGridOverlay);
