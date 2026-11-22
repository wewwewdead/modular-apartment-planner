import { memo } from 'react';
import { DRAWING_GRAPHICS } from '@/sheets/standards';
import { buildRoofPlanGeometry } from '@/geometry/roofPlanGeometry';

// Screen pixels: the name reads the same at every zoom.
const NAME_FONT_PX = 11;

/**
 * The roofs that are NOT being edited, drawn under the active one in the roof
 * plan (docs/multi-roof.md §5.2): each roof's outline as a hairline and its
 * name, nothing else — no fill, no handles, no hit area. They are context, the
 * way the ghost floor underlay is; a click on one goes to the roof select tool,
 * which makes that roof the active one.
 */
function RoofContextLayer({ roofSystems, zoom = 1 }) {
  if (!roofSystems?.length) return null;
  const fontSize = NAME_FONT_PX / Math.max(zoom || 1, 0.0001);

  return (
    <g className="roof-context-layer" style={{ pointerEvents: 'none' }} aria-hidden="true">
      {roofSystems.map((roofSystem) => {
        const plan = buildRoofPlanGeometry(roofSystem);
        const outlinePath = plan.roofOutlinePath || plan.boundaryPath;
        if (!outlinePath) return null;
        return (
          <g key={roofSystem.id} data-context-roof-id={roofSystem.id}>
            <path
              d={outlinePath}
              fill="none"
              stroke={DRAWING_GRAPHICS.plan.hiddenStroke}
              strokeWidth={DRAWING_GRAPHICS.plan.hiddenStrokeWidth}
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={plan.centroid.x}
              y={plan.centroid.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={DRAWING_GRAPHICS.plan.hiddenStroke}
              fontSize={fontSize}
              fontFamily="var(--font-blueprint)"
            >
              {roofSystem.name || 'Roof'}
            </text>
          </g>
        );
      })}
    </g>
  );
}

export default memo(RoofContextLayer);
