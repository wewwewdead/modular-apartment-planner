/* @vitest-environment jsdom */
/**
 * Perf pass 3, C2 / C5: DimensionRenderer became a memoised layer of memoised
 * per-dimension shapes, and source references resolve through an id lookup
 * built once per entities array instead of a scan per reference. The DOM must
 * not change, and the positional `sourceRefs` slots must be read exactly as
 * before -- nulls kept in place, legacy compacted refs re-slotted, refs to a
 * deleted entity hiding the dimension. The pre-change renderer is the oracle,
 * kept verbatim below (it resolves through the scanning path).
 */

import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import DimensionRenderer from './DimensionRenderer';
import { formatDimensionText, getDimensionGeometry, measureDistance } from '../utils/dimensionUtils';
import { getAngleDimensionGeometry, formatAngleText } from '../utils/angleUtils';
import {
  buildEntityIdLookup,
  resolveAngleDimensionPoints,
  resolveLinearDimensionPoints,
  resolveSourceReferenceFromEntities,
} from '../utils/entityUtils';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// ---------------------------------------------------------------------------
// The oracle: DimensionRenderer.jsx before perf pass 3, verbatim.
// ---------------------------------------------------------------------------

function hasValidSourceRefs(entity, allEntities) {
  const sourceRefs = entity.meta?.sourceRefs ?? [];
  if (sourceRefs.length === 0) return true;
  return sourceRefs.every((ref) => {
    if (!ref?.entityId) return true;
    return allEntities.some((e) => e.id === ref.entityId);
  });
}

function renderLinearDimension(entity, allEntities, className) {
  const { p1, p2 } = resolveLinearDimensionPoints(entity, allEntities);
  const geometry = getDimensionGeometry({
    p1,
    p2,
    subtype: entity.subtype,
    offset: entity.offset,
  });
  const text = formatDimensionText(measureDistance(p1, p2, entity.subtype), entity.units);

  return (
    <g key={entity.id} className={className} pointerEvents="none">
      <line className="sketchStudioDimensionLine" {...geometry.ext1} vectorEffect="non-scaling-stroke" />
      <line className="sketchStudioDimensionLine" {...geometry.ext2} vectorEffect="non-scaling-stroke" />
      <line className="sketchStudioDimensionLine" {...geometry.dimLine} vectorEffect="non-scaling-stroke" />
      <line className="sketchStudioDimensionTick" {...geometry.tick1} vectorEffect="non-scaling-stroke" />
      <line className="sketchStudioDimensionTick" {...geometry.tick2} vectorEffect="non-scaling-stroke" />
      <text
        className="sketchStudioDimensionText"
        x={geometry.textPoint.x}
        y={geometry.textPoint.y}
        textAnchor="middle"
        dominantBaseline="middle"
        transform={`rotate(${geometry.textAngle} ${geometry.textPoint.x} ${geometry.textPoint.y})`}
      >
        {text}
      </text>
    </g>
  );
}

function renderAngleDimension(entity, allEntities, className) {
  const { vertex, p1, p2 } = resolveAngleDimensionPoints(entity, allEntities);
  const geometry = getAngleDimensionGeometry({
    vertex,
    p1,
    p2,
    arcRadius: entity.arcRadius,
    isometricPlane: entity.isometricPlane,
  });

  return (
    <g key={entity.id} className={className} pointerEvents="none">
      <line className="sketchStudioDimensionLine" {...geometry.ray1} vectorEffect="non-scaling-stroke" />
      <line className="sketchStudioDimensionLine" {...geometry.ray2} vectorEffect="non-scaling-stroke" />
      {geometry.arcPath ? (
        <path
          className="sketchStudioDimensionLine"
          d={geometry.arcPath}
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      {geometry.angleDeg == null ? null : (
        <text
          className="sketchStudioDimensionText"
          x={geometry.textPoint.x}
          y={geometry.textPoint.y}
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {formatAngleText(geometry.angleDeg)}
        </text>
      )}
    </g>
  );
}

function OracleDimensionRenderer({ entities, allEntities, hoveredId, selectedIds }) {
  const dimensionEntities = entities.filter(
    (entity) =>
      entity.visible !== false &&
      (entity.type === 'dimension' || entity.type === 'angle-dimension') &&
      hasValidSourceRefs(entity, allEntities),
  );

  return (
    <g className="sketchStudioDimensionLayer">
      {dimensionEntities.map((entity) => {
        const className = [
          'sketchStudioDimension',
          entity.meta?.lineStyle === 'broken' ? 'is-broken-line' : '',
          selectedIds.includes(entity.id) ? 'is-selected' : '',
          hoveredId === entity.id ? 'is-hovered' : '',
        ]
          .filter(Boolean)
          .join(' ');

        if (entity.type === 'angle-dimension') {
          return renderAngleDimension(entity, allEntities, className);
        }

        return renderLinearDimension(entity, allEntities, className);
      })}
    </g>
  );
}

// ---------------------------------------------------------------------------

const line = (id, x1, y1, x2, y2) => ({ id, type: 'line', x1, y1, x2, y2, visible: true, meta: {} });
const A = line('a', 0, 0, 100, 0);
const B = line('b', 0, 0, 0, 80);
const C = line('c', 100, 0, 160, 90);
// A duplicate id: the scan takes the FIRST match, and so must the lookup.
const A_DUPLICATE = line('a', 500, 500, 900, 500);

const endRef = (entityId, sourceKey) => ({ entityId, sourceType: 'endpoint', sourceKey });

const DIMENSIONS = [
  {
    id: 'd-plain',
    type: 'dimension',
    subtype: 'horizontal',
    p1: { x: 0, y: 0 },
    p2: { x: 100, y: 0 },
    offset: 20,
    units: 'mm',
    visible: true,
    meta: {},
  },
  {
    id: 'd-linked',
    type: 'dimension',
    subtype: 'aligned',
    p1: { x: -5, y: -5 },
    p2: { x: 200, y: 3 },
    offset: -15,
    units: 'mm',
    visible: true,
    meta: { sourceRefs: [endRef('a', 'start'), endRef('c', 'end')] },
  },
  {
    // A null slot stays a null slot: p1 keeps its stored point.
    id: 'd-null-slot',
    type: 'dimension',
    subtype: 'vertical',
    p1: { x: 3, y: 4 },
    p2: { x: 0, y: 80 },
    offset: 10,
    units: 'mm',
    visible: true,
    meta: { lineStyle: 'broken', sourceRefs: [null, endRef('b', 'end')] },
  },
  {
    // Legacy compacted refs (one ref for two slots): re-slotted by matching
    // the resolved point to the stored slot points.
    id: 'd-legacy',
    type: 'dimension',
    subtype: 'horizontal',
    p1: { x: 7, y: 7 },
    p2: { x: 160, y: 90 },
    offset: 12,
    units: 'mm',
    visible: true,
    meta: { sourceRefs: [endRef('c', 'end')] },
  },
  {
    // A ref to a deleted entity hides the dimension.
    id: 'd-dangling',
    type: 'dimension',
    subtype: 'horizontal',
    p1: { x: 0, y: 0 },
    p2: { x: 10, y: 0 },
    offset: 5,
    units: 'mm',
    visible: true,
    meta: { sourceRefs: [endRef('gone', 'start'), null] },
  },
  {
    id: 'd-hidden',
    type: 'dimension',
    subtype: 'horizontal',
    p1: { x: 0, y: 0 },
    p2: { x: 10, y: 0 },
    offset: 5,
    units: 'mm',
    visible: false,
    meta: {},
  },
  {
    id: 'ang-linked',
    type: 'angle-dimension',
    vertex: { x: 1, y: 1 },
    p1: { x: 100, y: 0 },
    p2: { x: 0, y: 80 },
    arcRadius: 30,
    visible: true,
    meta: { sourceRefs: [endRef('a', 'end'), endRef('a', 'start'), endRef('b', 'end')] },
  },
  {
    // A collapsed ray: no arc, no text.
    id: 'ang-degenerate',
    type: 'angle-dimension',
    vertex: { x: 0, y: 0 },
    p1: { x: 0, y: 0 },
    p2: { x: 0, y: 50 },
    arcRadius: 20,
    visible: true,
    meta: { sourceRefs: [null, null, null] },
  },
  {
    id: 'ang-iso',
    type: 'angle-dimension',
    vertex: { x: 0, y: 0 },
    p1: { x: 100, y: 0 },
    p2: { x: 50, y: 90 },
    arcRadius: 40,
    isometricPlane: 'left',
    visible: true,
    meta: { sourceRefs: [endRef('c', 'start')] },
  },
];

const mounted = [];

function mountBoth() {
  const oracleHost = document.createElement('div');
  const host = document.createElement('div');
  const oracleRoot = createRoot(oracleHost);
  const root = createRoot(host);
  mounted.push(oracleRoot, root);
  return (props) => {
    act(() => {
      oracleRoot.render(
        <svg>
          <OracleDimensionRenderer
            {...props}
            selectedIds={props.selectedIds instanceof Set ? [...props.selectedIds] : props.selectedIds}
          />
        </svg>,
      );
      root.render(
        <svg>
          <DimensionRenderer {...props} />
        </svg>,
      );
    });
    return { oracle: oracleHost.innerHTML, actual: host.innerHTML };
  };
}

afterEach(() => {
  act(() => mounted.splice(0).forEach((root) => root.unmount()));
});

describe('C2: DimensionRenderer writes the same DOM as before', () => {
  it('on mount and after every hover, selection and document change', () => {
    const all = [A, B, C, A_DUPLICATE, ...DIMENSIONS];
    const movedC = { ...C, x2: 220, y2: 40 };
    const allMoved = [A, B, movedC, A_DUPLICATE, ...DIMENSIONS];
    const renderBoth = mountBoth();
    const steps = [
      { entities: all, allEntities: all, hoveredId: null, selectedIds: [] },
      { entities: all, allEntities: all, hoveredId: 'd-linked', selectedIds: [] },
      { entities: all, allEntities: all, hoveredId: 'ang-linked', selectedIds: ['d-null-slot'] },
      { entities: all, allEntities: all, hoveredId: null, selectedIds: new Set(['d-legacy', 'ang-iso']) },
      { entities: allMoved, allEntities: allMoved, hoveredId: null, selectedIds: ['d-linked'] },
      // The visible list without C: refs to C then dangle.
      { entities: DIMENSIONS, allEntities: [A, B, ...DIMENSIONS], hoveredId: null, selectedIds: [] },
      { entities: DIMENSIONS, allEntities: [], hoveredId: 'd-plain', selectedIds: [] },
      { entities: all, allEntities: all, hoveredId: null, selectedIds: [] },
    ];

    for (const step of steps) {
      const { oracle, actual } = renderBoth(step);
      expect(actual).toBe(oracle);
    }
    // The fixtures reach every path: linked, null slot, legacy, dangling, angle.
    const { actual } = renderBoth(steps[0]);
    expect(actual).toContain('is-broken-line');
    expect((actual.match(/sketchStudioDimension(?=[ "])/g) || []).length).toBe(7);
  });
});

describe('C5: buildEntityIdLookup answers as the scan does', () => {
  it('first match by id, nothing for an id `===` never matches', () => {
    const entities = [A, B, A_DUPLICATE, { id: Number.NaN }, { id: 0 }, { id: undefined, tag: 'no-id' }];
    const lookup = buildEntityIdLookup(entities);
    for (const id of ['a', 'b', 'missing', Number.NaN, 0, -0, undefined, null, '0']) {
      expect(lookup.get(id)).toBe(entities.find((item) => item.id === id));
      expect(lookup.has(id)).toBe(entities.some((item) => item.id === id));
    }
  });

  it('resolves every slot of every dimension to the same point with and without the lookup', () => {
    const all = [A, B, C, A_DUPLICATE, ...DIMENSIONS];
    const lookup = buildEntityIdLookup(all);
    for (const dimension of DIMENSIONS) {
      const resolve = dimension.type === 'angle-dimension' ? resolveAngleDimensionPoints : resolveLinearDimensionPoints;
      expect(resolve(dimension, all, lookup)).toEqual(resolve(dimension, all));
      for (const ref of dimension.meta.sourceRefs ?? []) {
        expect(resolveSourceReferenceFromEntities(all, ref, null, lookup)).toEqual(
          resolveSourceReferenceFromEntities(all, ref, null),
        );
      }
    }
  });
});
