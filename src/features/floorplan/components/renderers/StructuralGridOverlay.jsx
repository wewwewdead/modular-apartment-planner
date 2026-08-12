import { memo } from 'react';
import { STRUCTURAL_ALIGNMENT_TOLERANCE } from '@/domain/buildingGraph';

function axisRange(axes, orientation) {
  const offsets = axes.filter((axis) => axis.orientation === orientation).map((axis) => axis.offset);
  return offsets.length ? { min: Math.min(...offsets), max: Math.max(...offsets) } : { min: 0, max: 0 };
}

function GridAxis({ axis, crossRange, extension, selected }) {
  const vertical = axis.orientation === 'vertical';
  const start = crossRange.min - extension;
  const end = crossRange.max + extension;
  const x1 = vertical ? axis.offset : start;
  const y1 = vertical ? start : axis.offset;
  const x2 = vertical ? axis.offset : end;
  const y2 = vertical ? end : axis.offset;
  const firstBubble = { x: x1, y: y1 };
  const secondBubble = { x: x2, y: y2 };
  const stroke = selected ? '#4636a8' : '#6f5f9f';

  return (
    <g data-type="structural-grid-axis" data-axis-id={axis.id}>
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={stroke}
        strokeWidth={selected ? 2 : 1}
        strokeDasharray="12 5 2 5"
        opacity={selected ? 1 : 0.8}
        vectorEffect="non-scaling-stroke"
      />
      {[firstBubble, secondBubble].map((point, index) => (
        <g key={index} transform={`translate(${point.x} ${point.y})`}>
          <circle
            r="180"
            fill={selected ? 'rgba(70, 54, 168, 0.14)' : 'var(--color-panel-bg)'}
            stroke={stroke}
            strokeWidth={selected ? 2.5 : 1.5}
            vectorEffect="non-scaling-stroke"
          />
          <text y="65" fill={stroke} fontSize="190" fontWeight="700" textAnchor="middle">
            {axis.label}
          </text>
        </g>
      ))}
    </g>
  );
}

/**
 * Rotation grip for the selected grid, drawn inside the grid's own transform
 * so it orbits with the grid and follows an uncommitted drag for free. It sits
 * on the local +x axis, which is what lets the select handler read the grid's
 * rotation straight off the pointer angle about the origin.
 *
 * The overlay layer is pointer-transparent; this is the one element that takes
 * the pointer, and only the circle does — the glyph stays transparent so the
 * event target always carries the data-handle the select handler looks for.
 */
function GridRotateHandle({ x }) {
  return (
    <g data-type="structural-grid-rotate">
      <line
        x1={x - 1000}
        y1="0"
        x2={x - 200}
        y2="0"
        stroke="#4636a8"
        strokeWidth="1.5"
        strokeDasharray="8 6"
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx={x}
        cy="0"
        r="200"
        fill="rgba(70, 54, 168, 0.14)"
        stroke="#4636a8"
        strokeWidth="2.5"
        vectorEffect="non-scaling-stroke"
        data-handle="grid-rotate"
        style={{ pointerEvents: 'all', cursor: 'grab' }}
      />
      <path
        d={`M ${x - 100} 0 A 100 100 0 1 1 ${x} 100`}
        fill="none"
        stroke="#4636a8"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
        style={{ pointerEvents: 'none' }}
      />
      <polygon points={`${x - 60},100 ${x + 20},62 ${x + 20},138`} fill="#4636a8" style={{ pointerEvents: 'none' }} />
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

/**
 * `previewTransform` is a live drag proposal ({ gridId, origin, rotation })
 * that has not been committed: the grid is drawn where the pointer is holding
 * it while the project still carries the pre-drag transform. Pinned stacks are
 * carried through the same move and turn, so the preview shows exactly what
 * mouseup will commit.
 */
function StructuralGridOverlay({
  structuralSystem,
  floor,
  loadPath,
  selectedId = null,
  selectedType = null,
  previewTransform = null,
}) {
  const grids = structuralSystem?.gridSystems || [];
  const stacks = structuralSystem?.columnStacks || [];
  if (!grids.length && !stacks.length && !(loadPath?.edges || []).length) return null;

  const previewGrid = previewTransform ? grids.find((grid) => grid.id === previewTransform.gridId) : null;
  const previewRotation = previewGrid ? (previewTransform.rotation ?? previewGrid.rotation ?? 0) : 0;
  // Positive degrees turn clockwise in y-down space, the same convention the
  // SVG rotate() below and the committed command both use.
  const previewTurn = previewGrid ? ((previewRotation - (previewGrid.rotation || 0)) * Math.PI) / 180 : 0;
  const previewPinnedStack = (stack) => {
    if (!previewGrid || stack.gridIntersection?.gridId !== previewGrid.id) return stack;
    const localX = stack.origin.x - (previewGrid.origin?.x || 0);
    const localY = stack.origin.y - (previewGrid.origin?.y || 0);
    const cos = Math.cos(previewTurn);
    const sin = Math.sin(previewTurn);
    return {
      ...stack,
      origin: {
        x: previewTransform.origin.x + localX * cos - localY * sin,
        y: previewTransform.origin.y + localX * sin + localY * cos,
      },
    };
  };

  return (
    <g data-layer="structural-coordination" style={{ pointerEvents: 'none' }}>
      {grids.map((grid) => {
        const axes = grid.axes || [];
        const xRange = axisRange(axes, 'vertical');
        const yRange = axisRange(axes, 'horizontal');
        const extension = Math.max(700, Math.max(xRange.max - xRange.min, yRange.max - yRange.min) * 0.08);
        const selected = selectedType === 'structuralGrid' && selectedId === grid.id;
        const preview = previewGrid?.id === grid.id;
        const origin = preview ? previewTransform.origin : grid.origin;
        const rotation = preview ? previewRotation : grid.rotation || 0;
        return (
          <g
            key={grid.id}
            data-type="structural-grid"
            data-grid-id={grid.id}
            data-selected={selected || undefined}
            transform={`translate(${origin?.x || 0} ${origin?.y || 0}) rotate(${rotation})`}
          >
            {axes.map((axis) => (
              <GridAxis
                key={axis.id}
                axis={axis}
                crossRange={axis.orientation === 'vertical' ? yRange : xRange}
                extension={extension}
                selected={selected}
              />
            ))}
            {selected && <GridRotateHandle x={xRange.max + extension + 1000} />}
          </g>
        );
      })}
      {stacks.map((stack) => (
        <ColumnStackMarker key={stack.id} stack={previewPinnedStack(stack)} floor={floor} />
      ))}
      <LoadPathEdges loadPath={loadPath} floor={floor} />
    </g>
  );
}

export default memo(StructuralGridOverlay);
