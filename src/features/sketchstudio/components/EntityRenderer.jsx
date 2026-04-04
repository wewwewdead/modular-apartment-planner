import { getArcPath, getArcMidpoint } from '../utils/arcUtils';
import { getRectCorners } from '../utils/entityUtils';

function rectPoints(entity) {
  const corners = getRectCorners(entity);
  return [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft]
    .map((point) => `${point.x},${point.y}`)
    .join(' ');
}

function renderFeature(entity, className) {
  const featureClassName = `${className} is-feature is-${entity.featureType}`;
  const sharedProps = {
    className: featureClassName,
    vectorEffect: 'non-scaling-stroke',
    pointerEvents: 'none',
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

function renderEntity(entity, className) {
  const sharedProps = {
    className,
    vectorEffect: 'non-scaling-stroke',
    pointerEvents: 'none',
  };

  if (entity.type === 'line') {
    return <line key={entity.id} {...sharedProps} x1={entity.x1} y1={entity.y1} x2={entity.x2} y2={entity.y2} strokeLinecap="round" />;
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
    return (
      <text
        key={entity.id}
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
    return renderFeature(entity, className);
  }

  return null;
}

export default function EntityRenderer({ entities, hoveredId, selectedIds }) {
  return (
    <g className="sketchStudioEntities">
      {entities
        .filter((entity) => entity.visible !== false)
        .filter((entity) => entity.type !== 'dimension')
        .map((entity) => {
          const isSelected = selectedIds.includes(entity.id);
          const isHovered = hoveredId === entity.id;
          const className = [
            'sketchStudioEntity',
            entity.meta?.lineStyle === 'broken' ? 'is-broken-line' : '',
            isHovered ? 'is-hovered' : '',
            isSelected ? 'is-selected' : '',
          ].filter(Boolean).join(' ');
          return renderEntity(entity, className);
        })}
    </g>
  );
}
