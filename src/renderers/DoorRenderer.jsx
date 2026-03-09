import { doorOutlineOnWall } from '@/geometry/wallGeometry';
import { DRAWING_GRAPHICS } from '@/sheets/standards';

function SwingDoor({ door, info }) {
  const flipSign = door.openDirection === 'right' ? -1 : 1;
  const angleDeg = (info.angle * 180) / Math.PI;

  return (
    <g transform={`translate(${info.start.x},${info.start.y}) rotate(${angleDeg})`}>
      <line
        x1={0} y1={0}
        x2={0} y2={flipSign * -door.width}
        stroke={DRAWING_GRAPHICS.plan.markerStroke}
        strokeWidth={1.1}
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={`M ${door.width} 0 A ${door.width} ${door.width} 0 0 ${door.openDirection === 'left' ? 1 : 0} 0 ${flipSign * -door.width}`}
        fill="none"
        stroke={DRAWING_GRAPHICS.plan.hiddenStroke}
        strokeWidth={DRAWING_GRAPHICS.plan.hiddenStrokeWidth}
        strokeDasharray={DRAWING_GRAPHICS.plan.hiddenDash}
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
}

function DoubleDoor({ door, info }) {
  const angleDeg = (info.angle * 180) / Math.PI;
  const halfWidth = door.width / 2;

  return (
    <g transform={`translate(${info.center.x},${info.center.y}) rotate(${angleDeg})`}>
      {/* Left leaf */}
      <line
        x1={0} y1={0}
        x2={0} y2={-halfWidth}
        stroke={DRAWING_GRAPHICS.plan.markerStroke}
        strokeWidth={1.1}
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={`M ${-halfWidth} 0 A ${halfWidth} ${halfWidth} 0 0 1 0 ${-halfWidth}`}
        fill="none"
        stroke={DRAWING_GRAPHICS.plan.hiddenStroke}
        strokeWidth={DRAWING_GRAPHICS.plan.hiddenStrokeWidth}
        strokeDasharray={DRAWING_GRAPHICS.plan.hiddenDash}
        vectorEffect="non-scaling-stroke"
      />
      {/* Right leaf */}
      <line
        x1={0} y1={0}
        x2={0} y2={halfWidth}
        stroke={DRAWING_GRAPHICS.plan.markerStroke}
        strokeWidth={1.1}
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={`M ${halfWidth} 0 A ${halfWidth} ${halfWidth} 0 0 1 0 ${halfWidth}`}
        fill="none"
        stroke={DRAWING_GRAPHICS.plan.hiddenStroke}
        strokeWidth={DRAWING_GRAPHICS.plan.hiddenStrokeWidth}
        strokeDasharray={DRAWING_GRAPHICS.plan.hiddenDash}
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
}

function SlidingDoor({ door, info }) {
  const flipSign = door.openDirection === 'right' ? -1 : 1;
  const angleDeg = (info.angle * 180) / Math.PI;
  const arrowY = flipSign * -12;
  const arrowStart = 0.2 * door.width;
  const arrowEnd = 0.8 * door.width;

  return (
    <g transform={`translate(${info.start.x},${info.start.y}) rotate(${angleDeg})`}>
      {/* Thick panel line */}
      <line
        x1={0} y1={0}
        x2={door.width} y2={0}
        stroke={DRAWING_GRAPHICS.plan.markerStroke}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
      {/* Direction arrow line */}
      <line
        x1={arrowStart} y1={arrowY}
        x2={arrowEnd} y2={arrowY}
        stroke={DRAWING_GRAPHICS.plan.secondaryStroke}
        strokeWidth={0.72}
        vectorEffect="non-scaling-stroke"
      />
      {/* Arrowhead */}
      <polyline
        points={`${arrowEnd - 6},${arrowY - 4} ${arrowEnd},${arrowY} ${arrowEnd - 6},${arrowY + 4}`}
        fill="none"
        stroke={DRAWING_GRAPHICS.plan.secondaryStroke}
        strokeWidth={0.72}
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
}

export default function DoorRenderer({ doors, walls }) {
  return (
    <g className="doors">
      {doors.map(door => {
        const wall = walls.find(w => w.id === door.wallId);
        if (!wall) return null;

        const info = doorOutlineOnWall(wall, door);
        const type = door.type || 'swing';

        return (
          <g key={door.id} data-id={door.id} data-type="door">
            {/* White rectangle to mask wall */}
            <polygon
              points={`${info.p1.x},${info.p1.y} ${info.p2.x},${info.p2.y} ${info.p3.x},${info.p3.y} ${info.p4.x},${info.p4.y}`}
              fill="white"
              stroke="none"
            />
            {type === 'double' && <DoubleDoor door={door} info={info} />}
            {type === 'sliding' && <SlidingDoor door={door} info={info} />}
            {type === 'swing' && <SwingDoor door={door} info={info} />}
          </g>
        );
      })}
    </g>
  );
}
