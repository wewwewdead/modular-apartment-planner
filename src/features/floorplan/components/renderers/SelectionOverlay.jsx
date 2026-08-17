import { memo } from 'react';
import { columnOutline } from '@/geometry/columnGeometry';
import { fixtureOutline } from '@/geometry/fixtureGeometry';
import { getBeamRenderData } from '@/geometry/beamGeometry';
import { getLandingRenderData } from '@/geometry/landingGeometry';
import { getStairRenderData } from '@/geometry/stairGeometry';
import { getSlabRenderData } from '@/geometry/slabGeometry';
import { getWallRenderData } from '@/geometry/wallColumnGeometry';
import { getManualAnnotationFigure } from '@/annotations/scene';
import { getSectionCutRenderData } from '@/geometry/sectionCutGeometry';
import { getRailingRenderData } from '@/geometry/railingGeometry';
import { deviceOutlineOnWall } from '@/geometry/wallGeometry';
import { midpoint } from '@/geometry/point';
import { ELECTRICAL_SYMBOL_SIZE } from '@/domain/defaults';

const HANDLE_SIZE = 8; // px, will use vectorEffect

function WallSelection({ wall, columns, zoom }) {
  const outline = getWallRenderData(wall, columns || []).outline;
  const points = outline.map((p) => `${p.x},${p.y}`).join(' ');
  const handleR = HANDLE_SIZE / zoom;

  return (
    <g>
      <polygon
        points={points}
        fill="var(--color-selection-fill)"
        stroke="var(--color-selection)"
        strokeWidth={2}
        strokeDasharray="6 3"
        vectorEffect="non-scaling-stroke"
      />
      {/* Endpoint handles */}
      <rect
        data-handle="start"
        x={wall.start.x - handleR / 2}
        y={wall.start.y - handleR / 2}
        width={handleR}
        height={handleR}
        fill="white"
        stroke="var(--color-selection)"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        style={{ cursor: 'move' }}
      />
      <rect
        data-handle="end"
        x={wall.end.x - handleR / 2}
        y={wall.end.y - handleR / 2}
        width={handleR}
        height={handleR}
        fill="white"
        stroke="var(--color-selection)"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        style={{ cursor: 'move' }}
      />
    </g>
  );
}

function SelectionOverlay({ selectedId, selectedType, selectedOverhangEdge = null, floor, zoom }) {
  if (!selectedId || !floor) return null;

  if (selectedType === 'slab') {
    // With a cantilever run picked, the run IS the selection: the indicator
    // layer draws it solid, and the plate's own tint and handles stand down so
    // what is highlighted is the thing that was clicked, not the whole plate.
    // Escape or a click on the plate body brings the plate visuals back.
    if (selectedOverhangEdge?.slabId === selectedId) return null;

    const slab = (floor.slabs || []).find((s) => s.id === selectedId) || null;
    const renderData = slab ? getSlabRenderData(slab) : null;
    if (!renderData) return null;

    const handleR = HANDLE_SIZE / zoom;
    const outline = renderData.outline;
    return (
      <g>
        {/* Non-interactive, unlike the handles below it. The tint covers the
            whole plate, so as a click target it would swallow everything drawn
            under it — including the overhang indicators that run along this
            plate's own edges, which is how one cantilever of several is picked.
            Nothing is lost by letting clicks through: the select tool hit-tests
            in model space, so a click that lands on the svg instead of on this
            polygon still finds the same plate. */}
        <polygon
          points={renderData.points}
          fill="var(--color-selection-fill)"
          stroke="var(--color-selection)"
          strokeWidth={2}
          strokeDasharray="6 3"
          vectorEffect="non-scaling-stroke"
          style={{ pointerEvents: 'none' }}
        />
        {/* Square per corner moves that corner; round per edge pushes the whole
            edge out along its normal, which is how a floor plate grows into a
            cantilever. Two shapes because they do two different things. */}
        {outline.map((point, index) => {
          const next = outline[(index + 1) % outline.length];
          const mid = midpoint(point, next);
          return (
            <circle
              key={`slab-edge-${index}`}
              data-handle="slab-edge"
              data-index={index}
              data-slab-id={slab.id}
              cx={mid.x}
              cy={mid.y}
              r={handleR / 2}
              fill="var(--color-selection)"
              stroke="white"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
              style={{ cursor: 'move' }}
            />
          );
        })}
        {outline.map((point, index) => (
          <rect
            key={`${point.x}-${point.y}-${index}`}
            data-handle="slab-vertex"
            data-index={index}
            data-slab-id={slab.id}
            x={point.x - handleR / 2}
            y={point.y - handleR / 2}
            width={handleR}
            height={handleR}
            fill="white"
            stroke="var(--color-selection)"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            style={{ cursor: 'move' }}
          />
        ))}
      </g>
    );
  }

  if (selectedType === 'wall') {
    const wall = floor.walls.find((w) => w.id === selectedId);
    if (!wall) return null;
    return <WallSelection wall={wall} columns={floor.columns || []} zoom={zoom} />;
  }

  if (selectedType === 'sectionCut') {
    const sectionCut = (floor.sectionCuts || []).find((s) => s.id === selectedId) || null;
    const renderData = getSectionCutRenderData(sectionCut);
    if (!renderData) return null;
    const handleR = HANDLE_SIZE / zoom;

    return (
      <g>
        <line
          x1={renderData.line.start.x}
          y1={renderData.line.start.y}
          x2={renderData.line.end.x}
          y2={renderData.line.end.y}
          stroke="var(--color-selection)"
          strokeWidth={2}
          strokeDasharray="6 3"
          vectorEffect="non-scaling-stroke"
        />
        <rect
          data-handle="start"
          x={sectionCut.startPoint.x - handleR / 2}
          y={sectionCut.startPoint.y - handleR / 2}
          width={handleR}
          height={handleR}
          fill="white"
          stroke="var(--color-selection)"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          style={{ cursor: 'move' }}
        />
        <rect
          data-handle="end"
          x={sectionCut.endPoint.x - handleR / 2}
          y={sectionCut.endPoint.y - handleR / 2}
          width={handleR}
          height={handleR}
          fill="white"
          stroke="var(--color-selection)"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          style={{ cursor: 'move' }}
        />
      </g>
    );
  }

  if (selectedType === 'annotation') {
    const figure = getManualAnnotationFigure(floor, selectedId);
    if (!figure) return null;
    return (
      <g>
        {figure.extensionLines.map((line, index) => (
          <line
            key={`annotation-ext-${index}`}
            x1={line.start.x}
            y1={line.start.y}
            x2={line.end.x}
            y2={line.end.y}
            stroke="var(--color-selection)"
            strokeWidth={2}
            strokeDasharray="6 3"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <line
          x1={figure.lineStart.x}
          y1={figure.lineStart.y}
          x2={figure.lineEnd.x}
          y2={figure.lineEnd.y}
          stroke="var(--color-selection)"
          strokeWidth={2}
          strokeDasharray="6 3"
          vectorEffect="non-scaling-stroke"
        />
      </g>
    );
  }

  if (selectedType === 'door') {
    const door = floor.doors.find((d) => d.id === selectedId);
    if (!door) return null;
    const wall = floor.walls.find((w) => w.id === door.wallId);
    if (!wall) return null;
    // Highlight parent wall subtly
    const outline = getWallRenderData(wall, floor.columns || []).outline;
    const points = outline.map((p) => `${p.x},${p.y}`).join(' ');
    return (
      <polygon
        points={points}
        fill="none"
        stroke="var(--color-selection)"
        strokeWidth={2}
        strokeDasharray="6 3"
        vectorEffect="non-scaling-stroke"
      />
    );
  }

  if (selectedType === 'beam') {
    const beam = (floor.beams || []).find((b) => b.id === selectedId);
    if (!beam) return null;
    const renderData = getBeamRenderData(beam, floor.columns || []);
    if (!renderData) return null;
    const points = renderData.outline.map((p) => `${p.x},${p.y}`).join(' ');
    return (
      <polygon
        points={points}
        fill="var(--color-selection-fill)"
        stroke="var(--color-selection)"
        strokeWidth={2}
        strokeDasharray="6 3"
        vectorEffect="non-scaling-stroke"
      />
    );
  }

  if (selectedType === 'stair') {
    const stair = (floor.stairs || []).find((entry) => entry.id === selectedId);
    if (!stair) return null;
    const renderData = getStairRenderData(stair);
    if (!renderData) return null;
    const points = renderData.outline.map((p) => `${p.x},${p.y}`).join(' ');
    return (
      <polygon
        points={points}
        fill="var(--color-selection-fill)"
        stroke="var(--color-selection)"
        strokeWidth={2}
        strokeDasharray="6 3"
        vectorEffect="non-scaling-stroke"
      />
    );
  }

  if (selectedType === 'landing') {
    const landing = (floor.landings || []).find((l) => l.id === selectedId);
    if (!landing) return null;
    const renderData = getLandingRenderData(landing);
    if (!renderData) return null;
    const points = renderData.outline.map((p) => `${p.x},${p.y}`).join(' ');
    return (
      <polygon
        points={points}
        fill="var(--color-selection-fill)"
        stroke="var(--color-selection)"
        strokeWidth={2}
        strokeDasharray="6 3"
        vectorEffect="non-scaling-stroke"
      />
    );
  }

  if (selectedType === 'window') {
    const win = floor.windows.find((w) => w.id === selectedId);
    if (!win) return null;
    const wall = floor.walls.find((w) => w.id === win.wallId);
    if (!wall) return null;
    const outline = getWallRenderData(wall, floor.columns || []).outline;
    const points = outline.map((p) => `${p.x},${p.y}`).join(' ');
    return (
      <polygon
        points={points}
        fill="none"
        stroke="var(--color-selection)"
        strokeWidth={2}
        strokeDasharray="6 3"
        vectorEffect="non-scaling-stroke"
      />
    );
  }

  if (selectedType === 'electricalDevice') {
    const device = (floor.electricalDevices || []).find((entry) => entry.id === selectedId);
    if (!device) return null;
    const wall = floor.walls.find((w) => w.id === device.wallId);
    if (!wall) return null;
    // The symbol is a fixed 300mm in model space, which shrinks to nothing at
    // plan zooms — grow the marquee to a constant on-screen size instead.
    const size = Math.max(ELECTRICAL_SYMBOL_SIZE, (HANDLE_SIZE * 3) / zoom);
    const info = deviceOutlineOnWall(wall, device, size);
    const points = [info.p1, info.p2, info.p3, info.p4].map((p) => `${p.x},${p.y}`).join(' ');
    return (
      <polygon
        points={points}
        fill="none"
        stroke="var(--color-selection)"
        strokeWidth={2}
        strokeDasharray="6 3"
        vectorEffect="non-scaling-stroke"
      />
    );
  }

  if (selectedType === 'column') {
    const column = (floor.columns || []).find((c) => c.id === selectedId);
    if (!column) return null;
    const outline = columnOutline(column);
    const points = outline.map((p) => `${p.x},${p.y}`).join(' ');
    const handleR = HANDLE_SIZE / zoom;
    return (
      <g>
        <polygon
          points={points}
          fill="var(--color-selection-fill)"
          stroke="var(--color-selection)"
          strokeWidth={2}
          strokeDasharray="6 3"
          vectorEffect="non-scaling-stroke"
        />
        {outline.map((p, i) => (
          <rect
            key={i}
            x={p.x - handleR / 2}
            y={p.y - handleR / 2}
            width={handleR}
            height={handleR}
            fill="white"
            stroke="var(--color-selection)"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            style={{ cursor: 'move' }}
          />
        ))}
      </g>
    );
  }

  if (selectedType === 'fixture') {
    const fixture = (floor.fixtures || []).find((f) => f.id === selectedId);
    if (!fixture) return null;
    const outline = fixtureOutline(fixture);
    const points = outline.map((p) => `${p.x},${p.y}`).join(' ');
    return (
      <polygon
        points={points}
        fill="var(--color-selection-fill)"
        stroke="var(--color-selection)"
        strokeWidth={2}
        strokeDasharray="6 3"
        vectorEffect="non-scaling-stroke"
      />
    );
  }

  if (selectedType === 'railing') {
    const railing = (floor.railings || []).find((r) => r.id === selectedId);
    if (!railing) return null;
    const renderData = getRailingRenderData(railing);
    if (!renderData) return null;
    const points = renderData.outline.map((p) => `${p.x},${p.y}`).join(' ');
    const handleR = HANDLE_SIZE / zoom;

    return (
      <g>
        <polygon
          points={points}
          fill="var(--color-selection-fill)"
          stroke="var(--color-selection)"
          strokeWidth={2}
          strokeDasharray="6 3"
          vectorEffect="non-scaling-stroke"
        />
        <rect
          data-handle="start"
          x={railing.startPoint.x - handleR / 2}
          y={railing.startPoint.y - handleR / 2}
          width={handleR}
          height={handleR}
          fill="white"
          stroke="var(--color-selection)"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          style={{ cursor: 'move' }}
        />
        <rect
          data-handle="end"
          x={railing.endPoint.x - handleR / 2}
          y={railing.endPoint.y - handleR / 2}
          width={handleR}
          height={handleR}
          fill="white"
          stroke="var(--color-selection)"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          style={{ cursor: 'move' }}
        />
      </g>
    );
  }

  if (selectedType === 'room') {
    const room = floor.rooms.find((r) => r.id === selectedId);
    if (!room?.points?.length) return null;
    const points = room.points.map((p) => `${p.x},${p.y}`).join(' ');
    return (
      <polygon
        points={points}
        fill="none"
        stroke="var(--color-selection)"
        strokeWidth={2}
        strokeDasharray="6 3"
        vectorEffect="non-scaling-stroke"
      />
    );
  }

  return null;
}

export default memo(SelectionOverlay);
