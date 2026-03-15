import { LANDING_WIDTH, LANDING_DEPTH } from '@/domain/defaults';
import { TOOLS } from '@/editor/tools';
import { landingOutline } from '@/geometry/landingGeometry';

export default function LandingPreview({ toolState, activeTool }) {
  if (activeTool !== TOOLS.LANDING) return null;
  if (toolState.previewX == null || toolState.previewY == null) return null;

  const previewLanding = {
    position: { x: toolState.previewX, y: toolState.previewY },
    width: LANDING_WIDTH,
    depth: LANDING_DEPTH,
    rotation: 0,
  };

  const outline = landingOutline(previewLanding);
  if (outline.length < 3) return null;

  const points = outline.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <g style={{ pointerEvents: 'none' }}>
      <polygon
        points={points}
        fill="rgba(160, 165, 175, 0.12)"
        stroke="var(--color-selection)"
        strokeWidth={2}
        strokeDasharray="6 3"
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
}
