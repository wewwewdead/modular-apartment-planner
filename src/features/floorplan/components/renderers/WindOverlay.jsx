import { memo, useMemo } from 'react';
import { windCellColor } from '@/analysis/windVisualization';

export { windRampColor } from '@/analysis/windVisualization';

function useWindImage(study) {
  return useMemo(() => {
    const grid = study?.grid;
    if (!grid || typeof document === 'undefined') return null;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = grid.columns;
      canvas.height = grid.rows;
      const context = canvas.getContext('2d');
      if (!context) return null;
      const image = context.createImageData(grid.columns, grid.rows);
      for (let index = 0; index < grid.columns * grid.rows; index += 1) {
        if (grid.obstacles[index]) continue;
        const color = windCellColor(study, index);
        const offset = index * 4;
        image.data[offset] = color[0];
        image.data[offset + 1] = color[1];
        image.data[offset + 2] = color[2];
        image.data[offset + 3] = grid.unsafe?.[index] ? 245 : 188;
      }
      context.putImageData(image, 0, 0);
      return canvas.toDataURL();
    } catch {
      return null;
    }
  }, [study]);
}

function flowArrows(study) {
  if (study?.mode !== 'direction') return [];
  const grid = study.grid;
  const stride = Math.max(5, Math.ceil(Math.max(grid.columns, grid.rows) / 12));
  const arrows = [];
  for (let row = Math.floor(stride / 2); row < grid.rows; row += stride) {
    for (let column = Math.floor(stride / 2); column < grid.columns; column += stride) {
      const index = row * grid.columns + column;
      if (grid.obstacles[index]) continue;
      const vx = grid.velocityX[index];
      const vy = grid.velocityY[index];
      const magnitude = Math.hypot(vx, vy);
      if (magnitude < 0.05) continue;
      const length = grid.cellSize * 1.8;
      const x = grid.origin.x + (column + 0.5) * grid.cellSize;
      const y = grid.origin.y + (row + 0.5) * grid.cellSize;
      arrows.push({ x, y, dx: (vx / magnitude) * length, dy: (vy / magnitude) * length });
    }
  }
  return arrows;
}

function WindOverlay({ study, stale = false }) {
  const image = useWindImage(study);
  const arrows = useMemo(() => flowArrows(study), [study]);
  if (!study || !image) return null;
  const { grid } = study;
  return (
    <g data-layer="wind-study" data-mode={study.mode} opacity={stale ? 0.42 : 1} style={{ pointerEvents: 'none' }}>
      <defs>
        <marker id="wind-arrowhead" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto">
          <path d="M0,0 L5,2.5 L0,5 Z" fill="rgba(25, 47, 65, 0.75)" />
        </marker>
      </defs>
      <image
        data-type="wind-map"
        href={image}
        x={grid.origin.x}
        y={grid.origin.y}
        width={grid.columns * grid.cellSize}
        height={grid.rows * grid.cellSize}
        preserveAspectRatio="none"
        style={{ imageRendering: 'pixelated' }}
      />
      {arrows.map((arrow, index) => (
        <line
          key={index}
          x1={arrow.x - arrow.dx * 0.5}
          y1={arrow.y - arrow.dy * 0.5}
          x2={arrow.x + arrow.dx * 0.5}
          y2={arrow.y + arrow.dy * 0.5}
          stroke="rgba(25, 47, 65, 0.7)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
          markerEnd="url(#wind-arrowhead)"
        />
      ))}
    </g>
  );
}

export default memo(WindOverlay);
