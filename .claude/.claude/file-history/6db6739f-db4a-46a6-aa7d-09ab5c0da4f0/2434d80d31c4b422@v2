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

const HANDLE_SIZE = 8; // px, will use vectorEffect

function WallSelection({ wall, columns, zoom }) {
  const outline = getWallRenderData(wall, columns || []).outline;
  const points = outline.map(p => `${p.x},${p.y}`).join(' ');
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

export default function SelectionOverlay({ selectedId, selectedType, floor, zoom }) {
  if (!selectedId || !floor) return null;

  if (selectedType === 'slab') {
    const slab = (floor.slabs || []).find(s => s.id === selectedId) || null;
    const renderData = slab ? getSlabRenderData(slab) : null;
    if (!renderData) return null;

    const handleR = HANDLE_SIZE / zoom;
    return (
      <g>
        <polygon
          points={renderData.points}
          fill="var(--color-selection-fill)"
          stroke="var(--color-selection)"
          strokeWidth={2}
          strokeDasharray="6 3"
          vectorEffect="non-scaling-stroke"
        />
        {renderData.outline.map((point, index) => (
          <rect
            key={`${point.x}-${point.y}-${index}`}
            data-handle="slab-vertex"
            data-index={index}
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
    const wall = floor.walls.find(w => w.id === selectedId);
    if (!wall) return null;
    return <WallSelection wall={wall} columns={floor.columns || []} zoom={zoom} />;
  }

  if (selectedType === 'sectionCut') {
    const sectionCut = (floor.sectionCuts || []).find(s => s.id === selectedId) || null;
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
    const door = floor.doors.find(d => d.id === selectedId);
    if (!door) return null;
    const wall = floor.walls.find(w => w.id === door.wallId);
    if (!wall) return null;
    // Highlight parent wall subtly
    const outline = getWallRenderData(wall, floor.columns || []).outline;
    const points = outline.map(p => `${p.x},${p.y}`).join(' ');
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
    const beam = (floor.beams || []).find(b => b.id === selectedId);
    if (!beam) return null;
    const renderData = getBeamRenderData(beam, floor.columns || []);
    if (!renderData) return null;
    const points = renderData.outline.map(p => `${p.x},${p.y}`).join(' ');
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
    const stair = (floor.stairs || []).find(entry => entry.id === selectedId);
    if (!stair) return null;
    const renderData = getStairRenderData(stair);
    if (!renderData) return null;
    const points = renderData.outline.map(p => `${p.x},${p.y}`).join(' ');
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
    const landing = (floor.landings || []).find(l => l.id === selectedId);
    if (!landing) return null;
    const renderData = getLandingRenderData(landing);
    if (!renderData) return null;
    const points = renderData.outline.map(p => `${p.x},${p.y}`).join(' ');
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
    const win = floor.windows.find(w => w.id === selectedId);
    if (!win) return null;
    const wall = floor.walls.find(w => w.id === win.wallId);
    if (!wall) return null;
    const outline = getWallRenderData(wall, floor.columns || []).outline;
    const points = outline.map(p => `${p.x},${p.y}`).join(' ');
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
    const column = (floor.columns || []).find(c => c.id === selectedId);
    if (!column) return null;
    const outline = columnOutline(column);
    const points = outline.map(p => `${p.x},${p.y}`).join(' ');
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
    const fixture = (floor.fixtures || []).find(f => f.id === selectedId);
    if (!fixture) return null;
    const outline = fixtureOutline(fixture);
    const points = outline.map(p => `${p.x},${p.y}`).join(' ');
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
    const railing = (floor.railings || []).find(r => r.id === selectedId);
    if (!railing) return null;
    const renderData = getRailingRenderData(railing);
    if (!renderData) return null;
    const points = renderData.outline.map(p => `${p.x},${p.y}`).join(' ');
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
    const room = floor.rooms.find(r => r.id === selectedId);
    if (!room?.points?.length) return null;
    const points = room.points.map(p => `${p.x},${p.y}`).join(' ');
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
