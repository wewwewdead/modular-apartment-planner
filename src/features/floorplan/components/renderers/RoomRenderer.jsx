import { memo } from 'react';
import { DRAWING_GRAPHICS, PRESENTATION_GRAPHICS } from '@/sheets/standards';
import { resolveRoomPresentationFill, resolveRoomZone } from '@/domain/roomZones';
import { isPresentationStyle, usePlanStyle } from './PlanStyleContext';

function ringPath(points, dx = 0, dy = 0) {
  return `M${points.map((p) => `${p.x + dx},${p.y + dy}`).join('L')}Z`;
}

/**
 * The crisp band of shade a wall throws onto the floor beside it, with the
 * light coming from the top-left: the room's own ring and the same ring pushed
 * down-right, filled even-odd and clipped to the room, leaves exactly the strip
 * along the room's top and left edges. Geometry, not a blur — one clip per
 * room and no filter, so it costs what any other polygon costs.
 */
function RoomWallShadow({ room, clipId }) {
  const g = PRESENTATION_GRAPHICS.plan;
  const depth = g.zoneShadowDepth;
  return (
    <>
      <defs>
        <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
          <polygon points={room.points.map((p) => `${p.x},${p.y}`).join(' ')} />
        </clipPath>
      </defs>
      <path
        data-room-shadow=""
        d={`${ringPath(room.points)} ${ringPath(room.points, depth, depth)}`}
        fillRule="evenodd"
        fill={g.zoneShadow}
        clipPath={`url(#${clipId})`}
        style={{ pointerEvents: 'none' }}
      />
    </>
  );
}

function RoomRenderer({ rooms, selectedId, interactive = true }) {
  const presentation = isPresentationStyle(usePlanStyle());

  return (
    <g className="rooms">
      {rooms.map((room) => {
        const hasPolygon = room.points?.length >= 3;
        const isSelected = room.id === selectedId;
        const zone = presentation ? resolveRoomZone(room) : undefined;
        const fill = presentation
          ? resolveRoomPresentationFill(room, PRESENTATION_GRAPHICS.plan.zoneFill)
          : DRAWING_GRAPHICS.plan.roomFill.fill;

        return (
          <g key={room.id} data-id={room.id} data-type="room" data-zone={zone}>
            {hasPolygon && (
              <polygon
                points={room.points.map((p) => `${p.x},${p.y}`).join(' ')}
                fill={fill}
                fillOpacity={isSelected ? 0.72 : 1}
                stroke="none"
                style={{ pointerEvents: interactive ? 'all' : 'none', cursor: interactive ? 'pointer' : 'default' }}
              />
            )}
            {presentation && hasPolygon ? <RoomWallShadow room={room} clipId={`room-shadow-${room.id}`} /> : null}
          </g>
        );
      })}
    </g>
  );
}

export default memo(RoomRenderer);
