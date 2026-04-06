import { getArcPath, getArcMidpoint } from '../utils/arcUtils';
import { getRectCorners } from '../utils/entityUtils';
import { getTextLeaderGeometry } from '../utils/textLeaderUtils';

function rectPoints(entity) {
  const corners = getRectCorners(entity);
  return [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft]
    .map((point) => `${point.x},${point.y}`)
    .join(' ');
}

function renderFeature(entity, className, interactive) {
  const featureClassName = `${className} is-feature is-${entity.featureType}`;
  const sharedProps = {
    className: featureClassName,
    vectorEffect: 'non-scaling-stroke',
    pointerEvents: interactive ? 'all' : 'none',
    ...(interactive ? { cursor: 'pointer' } : {}),
  };

  if (entity.shape === 'circle') {
    return <circle key={entity.id} {...sharedProps} cx={entity.cx} cy={entity.cy} r={entity.diameter / 2} />;
  }

  if (entity.shape === 'ellipse') {
    return (
      <ellipse
        key={entity.id}
        {...sharedProps}
        cx={entity.cx}
        cy={entity.cy}
        rx={entity.rx}
        ry={entity.ry}
        transform={`rotate(${entity.rotation ?? 0} ${entity.cx} ${entity.cy})`}
      />
    );
  }

  if (entity.shape === 'polygon') {
    const points = (entity.points || []).map((point) => `${point.x},${point.y}`).join(' ');
    return <polygon key={entity.id} {...sharedProps} points={points} />;
  }

  const w = Math.abs(entity.width);
  const h = Math.abs(entity.height);
  const x = entity.width < 0 ? entity.x + entity.width : entity.x;
  const y = entity.height < 0 ? entity.y + entity.height : entity.y;
  return <rect key={entity.id} {...sharedProps} x={x} y={y} width={w} height={h} />;
}

function renderEntity(entity, className, interactive) {
  const sharedProps = {
    className,
    vectorEffect: 'non-scaling-stroke',
    pointerEvents: interactive ? 'all' : 'none',
    ...(interactive ? { cursor: 'pointer' } : {}),
  };

  if (entity.type === 'line') {
    return (
      <line
        key={entity.id}
        {...sharedProps}
        x1={entity.x1}
        y1={entity.y1}
        x2={entity.x2}
        y2={entity.y2}
        strokeLinecap="round"
      />
    );
  }

  if (entity.type === 'rect') {
    return <polygon key={entity.id} {...sharedProps} points={rectPoints(entity)} />;
  }

  if (entity.type === 'circle') {
    return <circle key={entity.id} {...sharedProps} cx={entity.cx} cy={entity.cy} r={entity.r} />;
  }

  if (entity.type === 'ellipse') {
    return (
      <ellipse
        key={entity.id}
        {...sharedProps}
        cx={entity.cx}
        cy={entity.cy}
        rx={entity.rx}
        ry={entity.ry}
        transform={`rotate(${entity.rotation ?? 0} ${entity.cx} ${entity.cy})`}
      />
    );
  }

  if (entity.type === 'text') {
    const leaderGeometry = getTextLeaderGeometry(entity);

    return (
      <g key={entity.id}>
        {leaderGeometry ? (
          <>
            <line
              {...sharedProps}
              className={`${className} sketchStudioEntityLeader`}
              x1={leaderGeometry.anchor.x}
              y1={leaderGeometry.anchor.y}
              x2={leaderGeometry.shaftEnd.x}
              y2={leaderGeometry.shaftEnd.y}
              fill="none"
              strokeLinecap="round"
            />
            <polygon
              {...sharedProps}
              className={`${className} sketchStudioEntityLeaderHead`}
              points={leaderGeometry.arrowHead.map((point) => `${point.x},${point.y}`).join(' ')}
              strokeLinejoin="round"
            />
          </>
        ) : null}
        <text
          {...sharedProps}
          className={`${className} is-text`}
          x={entity.x}
          y={entity.y}
          fontSize={entity.fontSize}
          dominantBaseline="hanging"
          transform={`rotate(${entity.rotation ?? 0} ${entity.x} ${entity.y})`}
        >
          {entity.text}
        </text>
      </g>
    );
  }

  if (entity.type === 'polyline') {
    const points = entity.points.map((point) => `${point.x},${point.y}`).join(' ');

    if (entity.closed) {
      return <polygon key={entity.id} {...sharedProps} className={`${className} is-profile`} points={points} />;
    }

    return (
      <polyline
        key={entity.id}
        {...sharedProps}
        points={points}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }

  if (entity.type === 'arc') {
    const hasFillet = entity.meta?.filletRadius != null;

    if (!hasFillet) {
      return <path key={entity.id} {...sharedProps} d={getArcPath(entity)} fill="none" strokeLinecap="round" />;
    }

    const mid = getArcMidpoint(entity);
    const labelOffX = mid.x + (mid.x - entity.control.x) * 0.4;
    const labelOffY = mid.y + (mid.y - entity.control.y) * 0.4;

    return (
      <g key={entity.id}>
        <path {...sharedProps} d={getArcPath(entity)} fill="none" strokeLinecap="round" />
        <text
          className="sketchStudioFilletLabel"
          x={labelOffX}
          y={labelOffY}
          textAnchor="middle"
          dominantBaseline="middle"
          pointerEvents="none"
        >
          R{entity.meta.filletRadius.toFixed(0)}
        </text>
      </g>
    );
  }

  if (entity.type === 'feature') {
    return renderFeature(entity, className, interactive);
  }

  return null;
}

export default function EntityRenderer({
  entities,
  hoveredId,
  selectedIds,
  baseClassName = 'sketchStudioEntity',
  onEntityClick,
}) {
  const interactive = !!onEntityClick;
  return (
    <g className="sketchStudioEntities">
      {entities
        .filter((entity) => entity.visible !== false)
        .filter((entity) => entity.type !== 'dimension')
        .map((entity) => {
          const isSelected = selectedIds.includes(entity.id);
          const isHovered = hoveredId === entity.id;
          const className = [
            baseClassName,
            entity.meta?.lineStyle === 'broken' ? 'is-broken-line' : '',
            isHovered ? 'is-hovered' : '',
            isSelected ? 'is-selected' : '',
          ]
            .filter(Boolean)
            .join(' ');
          const rendered = renderEntity(entity, className, interactive);
          if (interactive && rendered) {
            return (
              <g
                key={`click-${entity.id}`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onEntityClick(entity);
                }}
              >
                {rendered}
              </g>
            );
          }
          return rendered;
        })}
    </g>
  );
}
