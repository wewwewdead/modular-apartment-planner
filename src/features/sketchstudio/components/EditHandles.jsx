import { pixelsToWorldUnits } from '../utils/canvasMath';

const VISIBLE_HANDLE_RADIUS_PX = 4;
const HIT_HANDLE_RADIUS_PX = 7;

export default function EditHandles({ handles, onHandlePointerDown, zoom = 1 }) {
  if (!handles.length) {
    return null;
  }

  const visibleRadius = pixelsToWorldUnits(VISIBLE_HANDLE_RADIUS_PX, zoom || 1);
  const hitRadius = pixelsToWorldUnits(HIT_HANDLE_RADIUS_PX, zoom || 1);

  return (
    <g className="sketchStudioHandleLayer">
      {handles.map((handle) => (
        <g key={handle.id}>
          <circle
            className="sketchStudioEditHandleHitArea"
            cx={handle.x}
            cy={handle.y}
            r={hitRadius}
            fill="transparent"
            pointerEvents="all"
            onPointerDown={(event) => onHandlePointerDown(handle, event)}
          />
          <circle
            className="sketchStudioEditHandle"
            cx={handle.x}
            cy={handle.y}
            r={visibleRadius}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        </g>
      ))}
    </g>
  );
}
