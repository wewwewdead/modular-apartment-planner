import { memo } from 'react';
import { windowOutlineOnWall, wallDirection } from '@/geometry/wallGeometry';
import { perpendicular, scale, add } from '@/geometry/point';
import { DRAWING_GRAPHICS, PRESENTATION_GRAPHICS } from '@/sheets/standards';
import { isPresentationStyle, usePlanStyle } from './PlanStyleContext';

function offsetLine(info, perp, distance) {
  const offset = scale(perp, distance);
  const a = add(info.start, offset);
  const b = add(info.end, offset);
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}

/**
 * Presentation window: the wall opens to a white gap carrying a frame line at
 * each wall face, a pale glazing band down the middle with a fine glass line,
 * and a jamb tick at each end. Opening variants keep their geometry, drawn in
 * the frame ink as fine solid lines.
 */
function PresentationWindow({ win, info, wall }) {
  const g = PRESENTATION_GRAPHICS.plan;
  const dir = wallDirection(wall);
  const perp = perpendicular(dir);
  const half = wall.thickness / 2;
  const band = (wall.thickness * g.glazingBand) / 2;
  const faceA = offsetLine(info, perp, half);
  const faceB = offsetLine(info, perp, -half);
  const bandA = offsetLine(info, perp, band);
  const bandB = offsetLine(info, perp, -band);
  const centre = offsetLine(info, perp, 0);
  const type = win.type || 'standard';
  const angleDeg = (info.angle * 180) / Math.PI;
  const flipSign = win.openDirection === 'right' ? -1 : 1;
  const fine = { stroke: g.frameStroke, strokeWidth: g.swingStrokeWidth, vectorEffect: 'non-scaling-stroke' };
  const frame = { stroke: g.frameStroke, strokeWidth: g.frameStrokeWidth, vectorEffect: 'non-scaling-stroke' };

  return (
    <>
      <polygon
        data-window-glazing=""
        points={`${bandA.x1},${bandA.y1} ${bandA.x2},${bandA.y2} ${bandB.x2},${bandB.y2} ${bandB.x1},${bandB.y1}`}
        fill={g.glazingFill}
        stroke="none"
      />
      <line {...centre} {...fine} />
      <line {...faceA} {...frame} />
      <line {...faceB} {...frame} />
      <line x1={faceA.x1} y1={faceA.y1} x2={faceB.x1} y2={faceB.y1} {...frame} />
      <line x1={faceA.x2} y1={faceA.y2} x2={faceB.x2} y2={faceB.y2} {...frame} />
      {type === 'casement' ? (
        <g transform={`translate(${info.start.x},${info.start.y}) rotate(${angleDeg})`}>
          <path
            d={`M ${win.width * 0.3} 0 A ${win.width * 0.3} ${win.width * 0.3} 0 0 ${flipSign > 0 ? 0 : 1} 0 ${
              flipSign * -win.width * 0.3
            }`}
            fill="none"
            {...fine}
          />
          <line x1={0} y1={0} x2={0} y2={flipSign * -win.width * 0.3} {...fine} />
        </g>
      ) : null}
      {type === 'awning' ? (
        <g transform={`translate(${info.start.x},${info.start.y}) rotate(${angleDeg})`}>
          <path
            d={`M 0 0 A ${win.width / 2} ${win.width * 0.25} 0 0 ${win.openDirection === 'left' ? 1 : 0} ${win.width} 0`}
            fill="none"
            {...fine}
          />
        </g>
      ) : null}
      {type === 'jalousie'
        ? [1, 2, 3, 4, 5].map((i) => {
            const along = add(info.start, scale(dir, (win.width * i) / 6));
            const a = add(along, scale(perp, -half * 0.7));
            const b = add(along, scale(perp, half * 0.7));
            return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} {...fine} />;
          })
        : null}
    </>
  );
}

function StandardWindow({ info, wall }) {
  const dir = wallDirection(wall);
  const perp = perpendicular(dir);
  const halfThick = wall.thickness / 2;

  const lines = [-0.3, 0, 0.3].map((fraction) => {
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
      x1={l.x1}
      y1={l.y1}
      x2={l.x2}
      y2={l.y2}
      stroke={i === 1 ? DRAWING_GRAPHICS.plan.markerStroke : DRAWING_GRAPHICS.plan.secondaryStroke}
      strokeWidth={i === 1 ? 1.1 : 0.72}
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
        x1={0}
        y1={0}
        x2={win.width}
        y2={0}
        stroke={DRAWING_GRAPHICS.plan.markerStroke}
        strokeWidth={1.1}
        vectorEffect="non-scaling-stroke"
      />
      {/* Hinge leaf */}
      <line
        x1={0}
        y1={0}
        x2={0}
        y2={flipSign * -leafLen}
        stroke={DRAWING_GRAPHICS.plan.secondaryStroke}
        strokeWidth={0.72}
        vectorEffect="non-scaling-stroke"
      />
      {/* Quarter-circle arc */}
      <path
        d={`M ${leafLen} 0 A ${leafLen} ${leafLen} 0 0 ${win.openDirection === 'left' ? 1 : 0} 0 ${flipSign * -leafLen}`}
        fill="none"
        stroke={DRAWING_GRAPHICS.plan.hiddenStroke}
        strokeWidth={DRAWING_GRAPHICS.plan.hiddenStrokeWidth}
        strokeDasharray={DRAWING_GRAPHICS.plan.hiddenDash}
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
}

function AwningWindow({ win, info }) {
  const angleDeg = (info.angle * 180) / Math.PI;
  const flipSign = win.openDirection === 'right' ? -1 : 1;
  const projLen = win.width * 0.25;
  const midX = win.width / 2;

  return (
    <g transform={`translate(${info.start.x},${info.start.y}) rotate(${angleDeg})`}>
      {/* Hinge line along wall */}
      <line
        x1={0}
        y1={0}
        x2={win.width}
        y2={0}
        stroke={DRAWING_GRAPHICS.plan.markerStroke}
        strokeWidth={1.1}
        vectorEffect="non-scaling-stroke"
      />
      {/* Left arm to apex */}
      <line
        x1={0}
        y1={0}
        x2={midX}
        y2={flipSign * -projLen}
        stroke={DRAWING_GRAPHICS.plan.secondaryStroke}
        strokeWidth={0.72}
        vectorEffect="non-scaling-stroke"
      />
      {/* Right arm to apex */}
      <line
        x1={win.width}
        y1={0}
        x2={midX}
        y2={flipSign * -projLen}
        stroke={DRAWING_GRAPHICS.plan.secondaryStroke}
        strokeWidth={0.72}
        vectorEffect="non-scaling-stroke"
      />
      {/* Dashed arc showing swing path */}
      <path
        d={`M 0 0 A ${midX} ${projLen} 0 0 ${win.openDirection === 'left' ? 1 : 0} ${win.width} 0`}
        fill="none"
        stroke={DRAWING_GRAPHICS.plan.hiddenStroke}
        strokeWidth={DRAWING_GRAPHICS.plan.hiddenStrokeWidth}
        strokeDasharray={DRAWING_GRAPHICS.plan.hiddenDash}
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
        x1={info.start.x}
        y1={info.start.y}
        x2={info.end.x}
        y2={info.end.y}
        stroke={DRAWING_GRAPHICS.plan.markerStroke}
        strokeWidth={1.1}
        vectorEffect="non-scaling-stroke"
      />
      {/* Diagonal X: p1→p3 */}
      <line
        x1={info.p1.x}
        y1={info.p1.y}
        x2={info.p3.x}
        y2={info.p3.y}
        stroke={DRAWING_GRAPHICS.plan.secondaryStroke}
        strokeWidth={0.72}
        vectorEffect="non-scaling-stroke"
      />
      {/* Diagonal X: p2→p4 */}
      <line
        x1={info.p2.x}
        y1={info.p2.y}
        x2={info.p4.x}
        y2={info.p4.y}
        stroke={DRAWING_GRAPHICS.plan.secondaryStroke}
        strokeWidth={0.72}
        vectorEffect="non-scaling-stroke"
      />
    </>
  );
}

function JalousieWindow({ win, info, wall }) {
  const dir = wallDirection(wall);
  const perp = perpendicular(dir);
  const halfThick = wall.thickness / 2;
  const slats = 5;

  // Evenly space slats along the window width
  const lines = [];
  for (let i = 1; i <= slats; i++) {
    const t = i / (slats + 1);
    const along = add(info.start, scale(dir, win.width * t));
    lines.push({
      x1: add(along, scale(perp, -halfThick * 0.7)).x,
      y1: add(along, scale(perp, -halfThick * 0.7)).y,
      x2: add(along, scale(perp, halfThick * 0.7)).x,
      y2: add(along, scale(perp, halfThick * 0.7)).y,
    });
  }

  return (
    <>
      {/* Center line */}
      <line
        x1={info.start.x}
        y1={info.start.y}
        x2={info.end.x}
        y2={info.end.y}
        stroke={DRAWING_GRAPHICS.plan.markerStroke}
        strokeWidth={1.1}
        vectorEffect="non-scaling-stroke"
      />
      {/* Perpendicular slat lines */}
      {lines.map((l, i) => (
        <line
          key={i}
          x1={l.x1}
          y1={l.y1}
          x2={l.x2}
          y2={l.y2}
          stroke={DRAWING_GRAPHICS.plan.secondaryStroke}
          strokeWidth={0.72}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </>
  );
}

function WindowRenderer({ windows, walls }) {
  const presentation = isPresentationStyle(usePlanStyle());
  return (
    <g className="windows">
      {windows.map((win) => {
        const wall = walls.find((w) => w.id === win.wallId);
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
            {presentation ? (
              <PresentationWindow win={win} info={info} wall={wall} />
            ) : (
              <>
                {type === 'standard' && <StandardWindow info={info} wall={wall} />}
                {type === 'casement' && <CasementWindow win={win} info={info} />}
                {type === 'awning' && <AwningWindow win={win} info={info} />}
                {type === 'fixed' && <FixedWindow info={info} />}
                {type === 'jalousie' && <JalousieWindow win={win} info={info} wall={wall} />}
              </>
            )}
          </g>
        );
      })}
    </g>
  );
}

export default memo(WindowRenderer);
