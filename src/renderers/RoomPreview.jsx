import { TOOLS } from '@/editor/tools';

export default function RoomPreview({ toolState, activeTool }) {
  const previewPoints = toolState.previewPoints;
  if (activeTool !== TOOLS.ROOM || !previewPoints?.length) return null;

  return (
    <polygon
      points={previewPoints.map(point => `${point.x},${point.y}`).join(' ')}
      fill="var(--color-accent)"
      fillOpacity={0.12}
      stroke="var(--color-accent)"
      strokeWidth={40}
      strokeDasharray="140 80"
      style={{ pointerEvents: 'none' }}
    />
  );
}
