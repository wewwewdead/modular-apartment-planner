import { GRID_MINOR, GRID_MAJOR } from '@/domain/defaults';

export default function GridRenderer() {
  return (
    <defs>
      <pattern
        id="grid-minor"
        width={GRID_MINOR}
        height={GRID_MINOR}
        patternUnits="userSpaceOnUse"
      >
        <path
          d={`M ${GRID_MINOR} 0 L 0 0 0 ${GRID_MINOR}`}
          fill="none"
          stroke="var(--color-grid-minor)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      </pattern>
      <pattern
        id="grid-major"
        width={GRID_MAJOR}
        height={GRID_MAJOR}
        patternUnits="userSpaceOnUse"
      >
        <rect width={GRID_MAJOR} height={GRID_MAJOR} fill="url(#grid-minor)" />
        <path
          d={`M ${GRID_MAJOR} 0 L 0 0 0 ${GRID_MAJOR}`}
          fill="none"
          stroke="var(--color-grid-major)"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      </pattern>
    </defs>
  );
}
