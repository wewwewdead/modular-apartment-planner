import { TOOLS } from '@/editor/tools';
import { getFloorBeamSupportData, resolveBeamPairSupport } from '@/truss/beamSupports';

function beamPoints(entry) {
  return entry.renderData.outline.map((point) => `${point.x},${point.y}`).join(' ');
}

export default function TrussDrawOverlay({ floor = null, activeTool, toolState = {} }) {
  if (activeTool !== TOOLS.TRUSS_DRAW || !floor) return null;

  const beamData = getFloorBeamSupportData(floor);
  const startBeamId = toolState.startTrussBeamId || null;
  const hoveredBeamId = toolState.hoveredTrussBeamId || null;
  const preview = startBeamId && hoveredBeamId && startBeamId !== hoveredBeamId
    ? resolveBeamPairSupport(floor, startBeamId, hoveredBeamId)
    : null;

  return (
    <g className="truss-draw-overlay" pointerEvents="none">
      {beamData.map((entry) => {
        const isStart = entry.beam.id === startBeamId;
        const isHovered = entry.beam.id === hoveredBeamId;
        if (!isStart && !isHovered) return null;

        return (
          <polygon
            key={entry.beam.id}
            points={beamPoints(entry)}
            fill={isStart ? 'rgba(100, 182, 255, 0.28)' : 'rgba(255, 196, 92, 0.24)'}
            stroke={isStart ? 'var(--color-selection)' : '#d59a22'}
            strokeWidth={2}
            strokeDasharray={isStart && isHovered ? '4 2' : undefined}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
      {preview?.valid && (
        <g>
          <line
            x1={preview.startPoint.x}
            y1={preview.startPoint.y}
            x2={preview.endPoint.x}
            y2={preview.endPoint.y}
            stroke="var(--color-selection)"
            strokeWidth={1.8}
            strokeDasharray="6 3"
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={preview.supportLines.start.startPoint.x}
            y1={preview.supportLines.start.startPoint.y}
            x2={preview.supportLines.end.startPoint.x}
            y2={preview.supportLines.end.startPoint.y}
            stroke="#d59a22"
            strokeWidth={1.2}
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={preview.supportLines.start.endPoint.x}
            y1={preview.supportLines.start.endPoint.y}
            x2={preview.supportLines.end.endPoint.x}
            y2={preview.supportLines.end.endPoint.y}
            stroke="#d59a22"
            strokeWidth={1.2}
            vectorEffect="non-scaling-stroke"
          />
        </g>
      )}
    </g>
  );
}
