import { getArcPath } from '../utils/arcUtils';
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

  return <rect key={entity.id} {...sharedProps} x={entity.x} y={entity.y} width={entity.width} height={entity.height} />;
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
    return <path key={entity.id} {...sharedProps} d={getArcPath(entity)} fill="none" strokeLinecap="round" />;
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
