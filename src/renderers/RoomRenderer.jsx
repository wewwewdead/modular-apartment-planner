import { DRAWING_GRAPHICS } from '@/sheets/standards';

export default function RoomRenderer({ rooms, selectedId, interactive = true }) {
  return (
    <g className="rooms">
      {rooms.map(room => {
        const hasPolygon = room.points?.length >= 3;
        const isSelected = room.id === selectedId;

        return (
          <g key={room.id} data-id={room.id} data-type="room">
            {hasPolygon && (
              <polygon
                points={room.points.map(p => `${p.x},${p.y}`).join(' ')}
                fill={DRAWING_GRAPHICS.plan.roomFill.fill}
                fillOpacity={isSelected ? 0.72 : 1}
                stroke="none"
                style={{ pointerEvents: interactive ? 'all' : 'none', cursor: interactive ? 'pointer' : 'default' }}
              />
            )}
          </g>
        );
      })}
    </g>
  );
}
