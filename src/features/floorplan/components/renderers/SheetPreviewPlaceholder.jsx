import { useId } from 'react';
import { LOADING_COPY, LOADING_TIMING, useDelayedFlag } from '@/ui/loading';
import styles from './SheetPreviewPlaceholder.module.css';

// Settled states keep their existing words; only the wait uses the kit's copy.
const SETTLED_MESSAGES = {
  empty: LOADING_COPY.sheetPreviewEmpty,
  error: LOADING_COPY.sheetPreviewFailed,
};

/**
 * What a sheet's 3D viewport shows until its image has rendered (§5.6): grid
 * paper and the viewport's frame as a breathing hairline, with words only past
 * 300 ms — most renders finish first and never show any. `bounds` is in the
 * viewport content's own units, like everything else drawn beside it.
 */
export default function SheetPreviewPlaceholder({ bounds, status }) {
  const patternId = useId();
  const loading = status === 'loading';
  const wordsShown = useDelayedFlag(loading, {
    delayMs: LOADING_TIMING.wordsDelayMs,
    minVisibleMs: LOADING_TIMING.minVisibleMs,
  });

  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const minor = Math.max(width, height) / 60;
  const major = minor * 5;
  const inset = Math.min(width, height) * 0.08;
  const words = loading ? (wordsShown ? LOADING_COPY.sheetThumbnail : null) : SETTLED_MESSAGES[status] || null;

  return (
    <g
      className={styles.placeholder}
      data-loading-state={status}
      aria-busy={loading ? 'true' : 'false'}
      pointerEvents="none"
    >
      <defs>
        <pattern
          id={`${patternId}-grid`}
          patternUnits="userSpaceOnUse"
          x={bounds.minX}
          y={bounds.minY}
          width={major}
          height={major}
        >
          <path
            className={styles.gridMinor}
            d={[1, 2, 3, 4].map((step) => `M ${step * minor} 0 V ${major} M 0 ${step * minor} H ${major}`).join(' ')}
          />
          <path className={styles.gridMajor} d={`M 0 0 H ${major} M 0 0 V ${major}`} />
        </pattern>
      </defs>
      <rect className={styles.paper} x={bounds.minX} y={bounds.minY} width={width} height={height} />
      <rect x={bounds.minX} y={bounds.minY} width={width} height={height} fill={`url(#${patternId}-grid)`} />
      <rect
        className={styles.frame}
        x={bounds.minX + inset}
        y={bounds.minY + inset}
        width={Math.max(1, width - inset * 2)}
        height={Math.max(1, height - inset * 2)}
      />
      {words ? (
        <text
          className={styles.words}
          x={bounds.minX + width / 2}
          y={bounds.minY + height / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={Math.min(width, height) * 0.04}
          role={loading ? 'status' : undefined}
        >
          {words}
        </text>
      ) : null}
    </g>
  );
}
