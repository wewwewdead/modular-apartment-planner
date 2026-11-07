import { useId, useRef } from 'react';
import { LOADING_TIMING, useDelayedFlag, usePresence } from '@/ui/loading';
import { useCompositorTiming } from '@/ui/loading/timing';
import { DRAWING_GRAPHICS } from '@/sheets/standards';
import styles from './SectionPlaceholder.module.css';

/**
 * What the section and elevation views show while their hidden-line pass runs
 * (docs/night-section-freezes.md §4.3.3) — the SVG twin of
 * `SheetPreviewPlaceholder`, drawn inside the plan <svg> in the drawing's own
 * millimetres so it sits exactly where the drawing will.
 *
 * Faint grid paper over the drawing's envelope, the envelope itself as a
 * breathing hairline, the ground line and the title where the finished drawing
 * puts them (so nothing moves when it lands), and words only from 300 ms — a
 * warm re-entry finishes long before and never shows any. The second line
 * joins at 2 s.
 *
 * It is drawn over the drawing, not under it: when the drawing lands the paper
 * fades out over it (the crossfade), and words that made it onto the screen
 * hold their 400 ms first, as `PanePlaceholder` does.
 *
 * `bounds` is `{ minX, maxX, minZ, maxZ }` in drawing millimetres (z up; the
 * drawing's y is -z), `groundLevel` may be null (no ground line). `since` is
 * when the wait began (`loadingClock()`), which the 300 ms and 2 s are timed
 * from.
 */
export default function SectionPlaceholder({
  active,
  bounds,
  groundLevel = null,
  title = null,
  label,
  detail = null,
  since,
}) {
  const patternId = useId();
  const rootRef = useRef(null);
  // The words' reveal is a CSS animation pinned to `since`, so it lands at
  // 300 ms on the compositor's clock even while the visibility pass is busy on
  // the main thread; the flag below only governs how long they then stay.
  useCompositorTiming(rootRef, { since, delayMs: LOADING_TIMING.wordsDelayMs });
  const wordsShown = useDelayedFlag(active, {
    delayMs: LOADING_TIMING.wordsDelayMs,
    minVisibleMs: LOADING_TIMING.minVisibleMs,
    since,
  });
  const detailShown = useDelayedFlag(active, { delayMs: LOADING_TIMING.detailDelayMs, since });
  const { mounted, leaving } = usePresence(active || wordsShown, LOADING_TIMING.exitMs);
  if (!mounted || !bounds) return null;

  const minX = bounds.minX;
  const maxX = Math.max(bounds.maxX, minX + 1);
  const top = -bounds.maxZ;
  const bottom = -Math.min(bounds.minZ, bounds.maxZ - 1);
  const width = maxX - minX;
  const height = bottom - top;
  // The paper runs past the envelope by the same margin the ground line does,
  // so the finished drawing's overhangs land on paper rather than on the plan.
  const margin = 500;
  const paper = { x: minX - margin, y: top - margin, width: width + margin * 2, height: height + margin * 2 };
  const minor = Math.max(paper.width, paper.height) / 60;
  const major = minor * 5;
  const fontSize = Math.min(Math.max(Math.min(width, height) * 0.035, 150), 400);
  const centreX = minX + width / 2;
  const centreY = top + height / 2;

  return (
    <g
      ref={rootRef}
      className={styles.placeholder}
      data-section-placeholder=""
      data-loading-state={active ? 'loading' : 'ready'}
      data-leaving={leaving ? 'true' : 'false'}
      aria-busy={active ? 'true' : 'false'}
      pointerEvents="none"
    >
      <defs>
        <pattern
          id={`${patternId}-grid`}
          patternUnits="userSpaceOnUse"
          x={paper.x}
          y={paper.y}
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
      <rect className={styles.paper} {...paper} />
      <rect {...paper} fill={`url(#${patternId}-grid)`} />
      <rect className={styles.silhouette} x={minX} y={top} width={width} height={height} />
      {Number.isFinite(groundLevel) ? (
        <line
          x1={minX - margin}
          y1={-groundLevel}
          x2={maxX + margin}
          y2={-groundLevel}
          stroke={DRAWING_GRAPHICS.section.groundStroke}
          strokeWidth={0.8}
          strokeDasharray={DRAWING_GRAPHICS.section.groundDash}
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      {title ? (
        <text
          className={styles.title}
          x={centreX}
          y={top - 500}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={DRAWING_GRAPHICS.annotation.textMuted}
          fontSize={220}
        >
          {title}
        </text>
      ) : null}
      {/* One live region for the wait, mounted with its words so assistive
          tech hears them at once; only the visual waits for 300 ms. */}
      <text
        className={styles.words}
        x={centreX}
        y={centreY}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={fontSize}
        role="status"
        aria-live="polite"
        data-words={wordsShown && !leaving ? 'shown' : active ? 'scheduled' : 'hidden'}
      >
        {active || wordsShown ? label : ''}
        {wordsShown && detail && detailShown ? (
          <tspan className={styles.detail} x={centreX} dy={fontSize * 1.5} fontSize={fontSize * 0.62}>
            {detail}
          </tspan>
        ) : null}
      </text>
    </g>
  );
}
