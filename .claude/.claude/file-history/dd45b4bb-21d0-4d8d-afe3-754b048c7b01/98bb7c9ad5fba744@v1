import { windowOutlineOnWall, wallDirection } from '@/geometry/wallGeometry';
import { perpendicular, scale, add } from '@/geometry/point';

function StandardWindow({ info, wall }) {
  const dir = wallDirection(wall);
  const perp = perpendicular(dir);
  const halfThick = wall.thickness / 2;

  const lines = [-0.3, 0, 0.3].map(fraction => {
    const offset = scale(perp, halfThick * fraction);
    return {
      x1: add(info.start, offset).x,
      y1: add(info.start, offset).y,
      x2: add(info.end, offset).x,
      y2: add(info.end, offset).y,
    };
  });

  return lines.map((l, i) => (
    <line
      key={i}
      x1={l.x1} y1={l.y1}
      x2={l.x2} y2={l.y2}
      stroke="var(--color-wall-fill)"
      strokeWidth={i === 1 ? 2 : 1}
      vectorEffect="non-scaling-stroke"
    />
  ));
}

function CasementWindow({ win, info }) {
  const angleDeg = (info.angle * 180) / Math.PI;
  const flipSign = win.openDirection === 'right' ? -1 : 1;
  const leafLen = win.width * 0.3;

  return (
    <g transform={`translate(${info.start.x},${info.start.y}) rotate(${angleDeg})`}>
      {/* Glass pane line */}
      <line
        x1={0} y1={0}
        x2={win.width} y2={0}
        stroke="var(--color-wall-fill)"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
      {/* Hinge leaf */}
      <line
        x1={0} y1={0}
        x2={0} y2={flipSign * -leafLen}
        stroke="var(--color-wall-fill)"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      {/* Quarter-circle arc */}
      <path
        d={`M ${leafLen} 0 A ${leafLen} ${leafLen} 0 0 ${win.openDirection === 'left' ? 1 : 0} 0 ${flipSign * -leafLen}`}
        fill="none"
        stroke="var(--color-wall-fill)"
        strokeWidth={1}
        strokeDasharray="4 3"
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
}

function FixedWindow({ info }) {
  return (
    <>
      {/* Center line */}
      <line
        x1={info.start.x} y1={info.start.y}
        x2={info.end.x} y2={info.end.y}
        stroke="var(--color-wall-fill)"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
      {/* Diagonal X: p1→p3 */}
      <line
        x1={info.p1.x} y1={info.p1.y}
        x2={info.p3.x} y2={info.p3.y}
        stroke="var(--color-wall-fill)"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      {/* Diagonal X: p2→p4 */}
      <line
        x1={info.p2.x} y1={info.p2.y}
        x2={info.p4.x} y2={info.p4.y}
        stroke="var(--color-wall-fill)"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
    </>
  );
}

export default function WindowRenderer({ windows, walls }) {
  return (
    <g className="windows">
      {windows.map(win => {
        const wall = walls.find(w => w.id === win.wallId);
        if (!wall) return null;

        const info = windowOutlineOnWall(wall, win);
        const type = win.type || 'standard';

        return (
          <g key={win.id} data-id={win.id} data-type="window">
            {/* White rectangle to mask wall */}
            <polygon
              points={`${info.p1.x},${info.p1.y} ${info.p2.x},${info.p2.y} ${info.p3.x},${info.p3.y} ${info.p4.x},${info.p4.y}`}
              fill="white"
              stroke="none"
            />
            {type === 'standard' && <StandardWindow info={info} wall={wall} />}
            {type === 'casement' && <CasementWindow win={win} info={info} />}
            {type === 'fixed' && <FixedWindow info={info} />}
          </g>
        );
      })}
    </g>
  );
}
