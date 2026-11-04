import { memo } from 'react';
import { DRAWING_GRAPHICS } from '@/sheets/standards';
import { getWallRenderData } from '@/geometry/wallColumnGeometry';
import { getSlabRenderData } from '@/geometry/slabGeometry';
import { getBeamRenderData } from '@/geometry/beamGeometry';
import { buildFloorTrussGeometry } from '@/geometry/trussGeometry';
import { buildEndClosureLayout, closureFootprint } from '@/truss/endClosures';

function FloorBackdrop({ floor }) {
  if (!floor) return null;

  return (
    <g className="truss-floor-backdrop" opacity={0.55}>
      {(floor.slabs || []).map((slab) => {
        const renderData = getSlabRenderData(slab);
        if (!renderData?.points) return null;
        return (
          <polygon
            key={slab.id}
            points={renderData.points}
            fill="#ffffff"
            stroke={DRAWING_GRAPHICS.plan.secondaryStroke}
            strokeWidth={0.8}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
      {(floor.walls || []).map((wall) => {
        const outline = getWallRenderData(wall, floor.columns || []).outline || [];
        if (!outline.length) return null;
        return (
          <polygon
            key={wall.id}
            points={outline.map((point) => `${point.x},${point.y}`).join(' ')}
            fill="#ffffff"
            stroke={DRAWING_GRAPHICS.plan.secondaryStroke}
            strokeWidth={0.85}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
      {(floor.beams || []).map((beam) => {
        const renderData = getBeamRenderData(beam, floor.columns || []);
        if (!renderData) return null;

        return (
          <polygon
            key={beam.id}
            points={renderData.outline.map((point) => `${point.x},${point.y}`).join(' ')}
            fill="#eef3f7"
            stroke={DRAWING_GRAPHICS.plan.secondaryStroke}
            strokeWidth={0.85}
            strokeDasharray="6 3"
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </g>
  );
}

/**
 * Gable-end closures in plan (RT-2): each built closure's footprint — the end
 * truss's line, the panel's thickness wide — drawn like a cut wall.
 */
function ClosureFootprints({ systemGeometry, roofSystem, selected }) {
  const { closures } = buildEndClosureLayout(systemGeometry.trussSystem, systemGeometry, roofSystem);
  if (!closures.length) return null;
  return (
    <g className="truss-end-closures">
      {closures.map((closure) => (
        <polygon
          key={closure.id}
          data-truss-closure={closure.side}
          points={closureFootprint(closure)
            .map((point) => `${point.x},${point.y}`)
            .join(' ')}
          fill={DRAWING_GRAPHICS.plan.cutFill}
          stroke={selected ? 'var(--color-selection)' : DRAWING_GRAPHICS.plan.cutStroke}
          strokeWidth={DRAWING_GRAPHICS.plan.cutStrokeWidth}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </g>
  );
}

const LABEL_FONT_SIZE = 200;
const LABEL_SETBACK = 420;
const SPACING_NOTE_GAP = 520;

function unit(vector) {
  const length = Math.hypot(vector.x, vector.y);
  return length > 1e-6 ? { x: vector.x / length, y: vector.y / length } : { x: 1, y: 0 };
}

/** A readable text angle (degrees) for a plan direction: never upside down. */
function readableAngle(direction) {
  const degrees = (Math.atan2(direction.y, direction.x) * 180) / Math.PI;
  return degrees > 90 ? degrees - 180 : degrees < -90 ? degrees + 180 : degrees;
}

function formatSpacing(value) {
  return String(Math.round(Number(value) || 0));
}

/**
 * Object tags of the truss layout plan (spec §7.5): each copy's label (T1…,
 * GE for a gable end frame, H1… for hip slices) beside the layout line, and the
 * spacing note "5 @ 900 = 3600" along it. These are tags, not derived
 * dimension figures, so the plan-canvas dimension suppression does not apply.
 */
function TrussLabels({ instanceGeometry }) {
  const copies = instanceGeometry.copies || [];
  if (!copies.length) return null;
  const instance = instanceGeometry.instance;
  const layoutDirection = unit({
    x: instanceGeometry.layoutLineEndPoint.x - instanceGeometry.layoutLineStartPoint.x,
    y: instanceGeometry.layoutLineEndPoint.y - instanceGeometry.layoutLineStartPoint.y,
  });
  const first = copies[0];
  const spanDirection = unit({
    x: first.overallEndPoint.x - first.overallStartPoint.x,
    y: first.overallEndPoint.y - first.overallStartPoint.y,
  });
  const count = copies.length;
  const spacing = Number(instance.spacing) || 0;
  const runLength = spacing * Math.max(count - 1, 0);
  const lastCopy = copies[copies.length - 1];
  const middle = {
    x: (first.origin.x + lastCopy.origin.x) / 2,
    y: (first.origin.y + lastCopy.origin.y) / 2,
  };
  const reach = Math.hypot(first.overallEndPoint.x - first.origin.x, first.overallEndPoint.y - first.origin.y);
  const notePoint = {
    x: middle.x + spanDirection.x * (reach + SPACING_NOTE_GAP),
    y: middle.y + spanDirection.y * (reach + SPACING_NOTE_GAP),
  };
  const textProps = {
    fontSize: LABEL_FONT_SIZE,
    fontFamily: 'var(--font-blueprint)',
    fill: DRAWING_GRAPHICS.annotation.text,
    stroke: '#ffffff',
    strokeWidth: 3,
    paintOrder: 'stroke',
    strokeLinejoin: 'round',
    textAnchor: 'middle',
    dominantBaseline: 'middle',
  };
  return (
    <g className="truss-labels">
      {copies.map((copy) => {
        if (!copy.label) return null;
        const anchor = {
          x: copy.origin.x + spanDirection.x * LABEL_SETBACK,
          y: copy.origin.y + spanDirection.y * LABEL_SETBACK,
        };
        return (
          <text
            key={`label-${copy.id}`}
            data-truss-label={copy.label}
            x={anchor.x}
            y={anchor.y}
            transform={`rotate(${readableAngle(spanDirection)} ${anchor.x} ${anchor.y})`}
            {...textProps}
            vectorEffect="non-scaling-stroke"
          >
            {copy.label}
          </text>
        );
      })}
      {count > 1 && spacing > 0 && (
        <text
          data-truss-spacing={instance.id}
          x={notePoint.x}
          y={notePoint.y}
          transform={`rotate(${readableAngle(layoutDirection)} ${notePoint.x} ${notePoint.y})`}
          {...textProps}
          vectorEffect="non-scaling-stroke"
        >
          {`${count} @ ${formatSpacing(spacing)} = ${formatSpacing(runLength)}`}
        </text>
      )}
    </g>
  );
}

function TrussRenderer({ floor = null, trussSystems = [], roofSystem = null, selectedId = null, selectedType = null }) {
  const floorGeometry = buildFloorTrussGeometry(trussSystems);

  return (
    <g className="truss-layout">
      <FloorBackdrop floor={floor} />
      {floorGeometry.systems.map((systemGeometry) => (
        <g key={systemGeometry.trussSystem.id}>
          <ClosureFootprints
            systemGeometry={systemGeometry}
            roofSystem={roofSystem}
            selected={selectedType === 'trussSystem' && selectedId === systemGeometry.trussSystem.id}
          />
          {systemGeometry.instances.map((instanceGeometry) => {
            const isSelectedInstance = selectedType === 'trussInstance' && selectedId === instanceGeometry.instance.id;
            const isSelectedSystem = selectedType === 'trussSystem' && selectedId === systemGeometry.trussSystem.id;

            return (
              <g key={instanceGeometry.instance.id}>
                {(instanceGeometry.purlinRuns || []).map((run) => (
                  <polyline
                    key={run.id}
                    points={run.points.map((point) => `${point.x},${point.y}`).join(' ')}
                    fill="none"
                    stroke={
                      isSelectedInstance || isSelectedSystem
                        ? 'var(--color-selection)'
                        : DRAWING_GRAPHICS.plan.secondaryStroke
                    }
                    strokeWidth={isSelectedInstance || isSelectedSystem ? 1.1 : 0.8}
                    vectorEffect="non-scaling-stroke"
                    opacity={0.95}
                  />
                ))}
                {(instanceGeometry.purlinMarkers || []).map((marker) => (
                  <line
                    key={marker.id}
                    x1={marker.start.x}
                    y1={marker.start.y}
                    x2={marker.end.x}
                    y2={marker.end.y}
                    stroke={
                      isSelectedInstance || isSelectedSystem
                        ? 'var(--color-selection)'
                        : DRAWING_GRAPHICS.plan.secondaryStroke
                    }
                    strokeWidth={0.9}
                    vectorEffect="non-scaling-stroke"
                    opacity={0.9}
                  />
                ))}
                {instanceGeometry.copies.map((copy) => (
                  <line
                    key={copy.id}
                    x1={copy.overallStartPoint.x}
                    y1={copy.overallStartPoint.y}
                    x2={copy.overallEndPoint.x}
                    y2={copy.overallEndPoint.y}
                    stroke={isSelectedInstance ? 'var(--color-selection)' : DRAWING_GRAPHICS.plan.cutStroke}
                    strokeWidth={isSelectedInstance ? 1.8 : 1.15}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
                <line
                  x1={instanceGeometry.layoutLineStartPoint.x}
                  y1={instanceGeometry.layoutLineStartPoint.y}
                  x2={instanceGeometry.layoutLineEndPoint.x}
                  y2={instanceGeometry.layoutLineEndPoint.y}
                  stroke={isSelectedSystem ? 'var(--color-selection)' : DRAWING_GRAPHICS.plan.secondaryStroke}
                  strokeWidth={isSelectedSystem ? 1.4 : 0.8}
                  strokeDasharray="8 4"
                  vectorEffect="non-scaling-stroke"
                />
                <TrussLabels instanceGeometry={instanceGeometry} />
              </g>
            );
          })}
        </g>
      ))}
    </g>
  );
}

export default memo(TrussRenderer);
