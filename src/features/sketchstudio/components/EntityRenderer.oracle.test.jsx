/* @vitest-environment jsdom */
/**
 * Perf pass 3, C2: EntityRenderer became a memoised layer of memoised
 * per-entity shapes, with the selection looked up in a Set. The DOM it writes
 * must not change. The renderer as it stood before is kept below, verbatim,
 * as the oracle; both are mounted with the same props -- every entity type,
 * hover, selection (array and Set), the broken-line style, the ghost and
 * joinery `baseClassName`s and the interactive `onEntityClick` mode -- and
 * their `innerHTML` compared, first on mount and then after each prop change,
 * so the memoised path is checked as well as the first render.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import EntityRenderer from './EntityRenderer';
import { getArcPath, getArcMidpoint } from '../utils/arcUtils';
import { getRectCorners } from '../utils/entityUtils';
import { getFastenerDrillingDefaults, getHardwarePattern, isFastenerEntity } from '../utils/fastenerUtils';
import { getTextLeaderGeometry } from '../utils/textLeaderUtils';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// ---------------------------------------------------------------------------
// The oracle: EntityRenderer.jsx before perf pass 3, verbatim.
// ---------------------------------------------------------------------------

function rectPoints(entity) {
  const corners = getRectCorners(entity);
  return [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft]
    .map((point) => `${point.x},${point.y}`)
    .join(' ');
}

function renderFastener(entity, className, interactive) {
  const defaults = getFastenerDrillingDefaults(entity.hardwareId);
  const pilotRadius = Math.max((Number(entity.diameter) || defaults?.diameter || 0) / 2, 0.1);
  const headRadius = Math.max((Number(defaults?.headDiameter) || 0) / 2, pilotRadius);
  const crosshairReach = headRadius * 1.8;
  const kind = defaults?.kind ?? getHardwarePattern(entity.hardwareId)?.kind ?? 'hardware';
  const fastenerClassName = `${className} is-feature is-fastener is-fastener-${kind}`;
  const sharedProps = {
    vectorEffect: 'non-scaling-stroke',
    pointerEvents: interactive ? 'all' : 'none',
    ...(interactive ? { cursor: 'pointer' } : {}),
  };

  return (
    <g key={entity.id}>
      <circle
        {...sharedProps}
        className={`${fastenerClassName} is-fastener-head`}
        cx={entity.cx}
        cy={entity.cy}
        r={headRadius}
      />
      <circle {...sharedProps} className={fastenerClassName} cx={entity.cx} cy={entity.cy} r={pilotRadius} />
      <line
        {...sharedProps}
        className={`${fastenerClassName} is-fastener-tick`}
        x1={entity.cx - crosshairReach}
        y1={entity.cy}
        x2={entity.cx + crosshairReach}
        y2={entity.cy}
      />
      <line
        {...sharedProps}
        className={`${fastenerClassName} is-fastener-tick`}
        x1={entity.cx}
        y1={entity.cy - crosshairReach}
        x2={entity.cx}
        y2={entity.cy + crosshairReach}
      />
    </g>
  );
}

function renderFeature(entity, className, interactive) {
  if (isFastenerEntity(entity) && entity.shape === 'circle') {
    return renderFastener(entity, className, interactive);
  }

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

function OracleEntityRenderer({
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

// ---------------------------------------------------------------------------

const ENTITIES = [
  { id: 'line', type: 'line', x1: 0, y1: 0, x2: 100, y2: 0, visible: true, meta: {} },
  { id: 'broken', type: 'line', x1: 0, y1: 10, x2: 100, y2: 10, visible: true, meta: { lineStyle: 'broken' } },
  { id: 'hidden', type: 'line', x1: 0, y1: 20, x2: 100, y2: 20, visible: false, meta: {} },
  { id: 'rect', type: 'rect', x: 10, y: 10, width: 50, height: 30, rotation: 15, visible: true, meta: {} },
  { id: 'circle', type: 'circle', cx: 40, cy: 40, r: 12, visible: true, meta: {} },
  { id: 'ellipse', type: 'ellipse', cx: 80, cy: 40, rx: 20, ry: 8, rotation: 30, visible: true, meta: {} },
  { id: 'ellipse0', type: 'ellipse', cx: 80, cy: 60, rx: 20, ry: 8, visible: true, meta: {} },
  {
    id: 'text',
    type: 'text',
    x: 120,
    y: 80,
    text: 'Desk A',
    fontSize: 120,
    rotation: 0,
    leader: { target: { x: 40, y: 180 } },
    visible: true,
    meta: {},
  },
  { id: 'text2', type: 'text', x: 10, y: 5, text: 'Plain', fontSize: 12, visible: true, meta: {} },
  {
    id: 'poly',
    type: 'polyline',
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 5 },
      { x: 20, y: 0 },
    ],
    closed: false,
    visible: true,
    meta: {},
  },
  {
    id: 'profile',
    type: 'polyline',
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ],
    closed: true,
    visible: true,
    meta: { lineStyle: 'broken' },
  },
  {
    id: 'arc',
    type: 'arc',
    start: { x: 0, y: 0 },
    control: { x: 20, y: 20 },
    end: { x: 40, y: 0 },
    visible: true,
    meta: {},
  },
  {
    id: 'fillet',
    type: 'arc',
    start: { x: 0, y: 50 },
    control: { x: 10, y: 60 },
    end: { x: 20, y: 50 },
    visible: true,
    meta: { filletRadius: 12.4 },
  },
  {
    id: 'hole',
    type: 'feature',
    featureType: 'hole',
    shape: 'circle',
    cx: 5,
    cy: 5,
    diameter: 8,
    visible: true,
    meta: {},
  },
  {
    id: 'screw',
    type: 'feature',
    featureType: 'hole',
    operation: 'subtract',
    shape: 'circle',
    cx: 100,
    cy: 50,
    diameter: 3,
    hardwareId: 'hw-screw-8-32',
    visible: true,
    meta: {},
  },
  {
    id: 'hinge',
    type: 'feature',
    featureType: 'hole',
    shape: 'circle',
    cx: 30,
    cy: 90,
    diameter: 35,
    hardwareId: 'hw-hinge-concealed-35',
    visible: true,
    meta: {},
  },
  {
    id: 'cutout',
    type: 'feature',
    featureType: 'cutout',
    shape: 'rect',
    x: 50,
    y: 50,
    width: -20,
    height: 10,
    visible: true,
    meta: {},
  },
  {
    id: 'slot',
    type: 'feature',
    featureType: 'pocket',
    shape: 'ellipse',
    cx: 70,
    cy: 70,
    rx: 6,
    ry: 3,
    visible: true,
    meta: {},
  },
  {
    id: 'poly-feature',
    type: 'feature',
    featureType: 'cutout',
    shape: 'polygon',
    points: [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 5 },
    ],
    visible: true,
    meta: {},
  },
  { id: 'dim', type: 'dimension', p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 }, visible: true, meta: {} },
  {
    id: 'angle',
    type: 'angle-dimension',
    vertex: { x: 0, y: 0 },
    p1: { x: 10, y: 0 },
    p2: { x: 0, y: 10 },
    visible: true,
    meta: {},
  },
  { id: 'unknown', type: 'mystery', visible: true, meta: {} },
];

const mounted = [];

function mountBoth(props) {
  const oracleHost = document.createElement('div');
  const host = document.createElement('div');
  const oracleRoot = createRoot(oracleHost);
  const root = createRoot(host);
  mounted.push(oracleRoot, root);

  const renderBoth = (nextProps) => {
    act(() => {
      oracleRoot.render(
        <svg>
          <OracleEntityRenderer
            {...nextProps}
            selectedIds={nextProps.selectedIds instanceof Set ? [...nextProps.selectedIds] : nextProps.selectedIds}
          />
        </svg>,
      );
      root.render(
        <svg>
          <EntityRenderer {...nextProps} />
        </svg>,
      );
    });
    return { oracle: oracleHost.innerHTML, actual: host.innerHTML, host };
  };

  return { renderBoth, first: renderBoth(props) };
}

afterEach(() => {
  act(() => mounted.splice(0).forEach((root) => root.unmount()));
});

describe('C2: EntityRenderer writes the same DOM as before', () => {
  it('on mount, for every entity type, hover and selection', () => {
    for (const hoveredId of [null, 'line', 'rect', 'screw', 'text', 'absent']) {
      for (const selectedIds of [[], ['line'], ['rect', 'broken', 'fillet', 'hinge', 'profile'], ['absent']]) {
        const { first } = mountBoth({ entities: ENTITIES, hoveredId, selectedIds });
        expect(first.actual).toBe(first.oracle);
        expect(first.actual).toContain('<path');
      }
    }
  });

  it('after each hover, selection and entity change (the memoised path)', () => {
    const { renderBoth } = mountBoth({ entities: ENTITIES, hoveredId: null, selectedIds: [] });
    const moved = ENTITIES.map((entity) => (entity.id === 'circle' ? { ...entity, cx: 99 } : entity));
    const steps = [
      { entities: ENTITIES, hoveredId: 'line', selectedIds: [] },
      { entities: ENTITIES, hoveredId: 'rect', selectedIds: [] },
      { entities: ENTITIES, hoveredId: 'rect', selectedIds: new Set(['rect', 'circle']) },
      { entities: ENTITIES, hoveredId: null, selectedIds: ['circle'] },
      { entities: moved, hoveredId: null, selectedIds: ['circle'] },
      { entities: moved.slice(3), hoveredId: 'screw', selectedIds: [] },
      { entities: ENTITIES, hoveredId: 'screw', selectedIds: [], baseClassName: 'sketchStudioDraftEntity' },
      { entities: [], hoveredId: null, selectedIds: [] },
      { entities: ENTITIES, hoveredId: null, selectedIds: [] },
    ];
    for (const step of steps) {
      const { oracle, actual } = renderBoth(step);
      expect(actual).toBe(oracle);
    }
  });

  it('for the ghost and joinery baseClassNames and the interactive mode', () => {
    const onEntityClick = vi.fn();
    for (const props of [
      { baseClassName: 'sketchStudioDraftEntity' },
      { baseClassName: 'sketchStudioEntity sketchStudioEntityJoinery' },
      { baseClassName: 'sketchStudioEntity sketchStudioEntityJoinery', onEntityClick },
      { onEntityClick, hoveredId: 'line', selectedIds: ['rect'] },
    ]) {
      const { first } = mountBoth({ entities: ENTITIES, hoveredId: null, selectedIds: [], ...props });
      expect(first.actual).toBe(first.oracle);
    }
  });

  it('keeps the interactive click: the entity reaches onEntityClick, the press stops at the shape', () => {
    const onEntityClick = vi.fn();
    const outerPointerDown = vi.fn();
    const outerClick = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    mounted.push(root);
    act(() =>
      root.render(
        <svg onPointerDown={outerPointerDown} onClick={outerClick}>
          <EntityRenderer
            entities={ENTITIES}
            hoveredId={null}
            selectedIds={[]}
            baseClassName="sketchStudioEntity sketchStudioEntityJoinery"
            onEntityClick={onEntityClick}
          />
        </svg>,
      ),
    );

    const rect = host.querySelector('polygon');
    act(() => {
      rect.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      rect.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onEntityClick).toHaveBeenCalledTimes(1);
    expect(onEntityClick.mock.calls[0][0]).toBe(ENTITIES.find((entity) => entity.id === 'rect'));
    expect(outerPointerDown).not.toHaveBeenCalled();
    expect(outerClick).not.toHaveBeenCalled();
    host.remove();
  });
});
