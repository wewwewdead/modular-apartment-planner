export default function RoomRenderer({ rooms, selectedId }) {
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
                fill={room.color}
                fillOpacity={isSelected ? 0.55 : 0.4}
                stroke="none"
                style={{ pointerEvents: 'all', cursor: 'pointer' }}
              />
            )}
          </g>
        );
      })}
    </g>
  );
}
