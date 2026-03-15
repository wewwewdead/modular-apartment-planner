import { SKETCH_GRID_MINOR, SKETCH_GRID_MAJOR, DEFAULT_CANVAS_WIDTH, DEFAULT_CANVAS_HEIGHT } from '../domain/defaults';

export default function GridRenderer() {
  return (
    <>
      <defs>
        <pattern
          id="sketch-grid-minor"
          width={SKETCH_GRID_MINOR}
          height={SKETCH_GRID_MINOR}
          patternUnits="userSpaceOnUse"
        >
          <path
            d={`M ${SKETCH_GRID_MINOR} 0 L 0 0 0 ${SKETCH_GRID_MINOR}`}
            fill="none"
            stroke="var(--color-grid-minor)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        </pattern>
        <pattern
          id="sketch-grid-major"
          width={SKETCH_GRID_MAJOR}
          height={SKETCH_GRID_MAJOR}
          patternUnits="userSpaceOnUse"
        >
          <rect
            width={SKETCH_GRID_MAJOR}
            height={SKETCH_GRID_MAJOR}
            fill="url(#sketch-grid-minor)"
          />
          <path
            d={`M ${SKETCH_GRID_MAJOR} 0 L 0 0 0 ${SKETCH_GRID_MAJOR}`}
            fill="none"
            stroke="var(--color-grid-major)"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        </pattern>
      </defs>
      <rect
        x={-100000}
        y={-100000}
        width={DEFAULT_CANVAS_WIDTH + 200000}
        height={DEFAULT_CANVAS_HEIGHT + 200000}
        fill="url(#sketch-grid-major)"
        style={{ pointerEvents: 'none' }}
      />
    </>
  );
}
