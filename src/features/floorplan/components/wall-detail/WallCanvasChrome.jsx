import { useEffect, useState } from 'react';
import { buildRulerTicks, computeCanvasFit, wallLocalToSvg, wallPointToFrame } from './wallDetailCanvasMath';
import { SIZE_TAG_FONT_PX, SIZE_TAG_GAP_PX, SIZE_TAG_LINE_STEP } from './wallDetailSelectionReadout';
import styles from './WallDetailEditor.module.css';

/** Frame margin reserved around the fitted drawing — leaves room for the rulers. */
export const CANVAS_FIT_MARGIN = 56;

/**
 * Measure the canvas frame and contain-fit the wall drawing inside it. The
 * returned metrics keep the SVG box aspect-true to the wall so pointer math,
 * rulers, and "Fit wall" all share one source of truth. `remeasureKey` must
 * change whenever the frame element can remount (e.g. workspace view switches)
 * so the observer re-attaches to the new node.
 */
export function useWallCanvasMetrics(frameRef, bounds, remeasureKey = null) {
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const node = frameRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return undefined;
    const measure = () => {
      const rect = node.getBoundingClientRect();
      setFrameSize((current) =>
        Math.abs(current.width - rect.width) < 0.5 && Math.abs(current.height - rect.height) < 0.5
          ? current
          : { width: rect.width, height: rect.height },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [frameRef, remeasureKey]);

  return computeCanvasFit({
    frameWidth: frameSize.width,
    frameHeight: frameSize.height,
    length: bounds?.length || 0,
    height: bounds?.height || 0,
    margin: CANVAS_FIT_MARGIN,
    mirrorU: Boolean(bounds?.mirrorU),
  });
}

/**
 * mm rulers along the top (U, along the wall) and left (V, up from the finished
 * floor) edges of the canvas frame. Pure overlay — never intercepts the pointer.
 */
export function WallCanvasRulers({ metrics, viewport, bounds }) {
  const ready = Boolean(metrics?.ready && bounds);
  const uTicks = ready ? buildRulerTicks({ axis: 'u', sizeMm: bounds.length, metrics, viewport }).ticks : [];
  const vTicks = ready ? buildRulerTicks({ axis: 'v', sizeMm: bounds.height, metrics, viewport }).ticks : [];
  const start = ready ? wallPointToFrame({ u: 0, v: 0 }, metrics, viewport) : null;
  const end = ready ? wallPointToFrame({ u: bounds.length, v: bounds.height }, metrics, viewport) : null;
  return (
    <div className={styles.rulerLayer} data-testid="wall-rulers" aria-hidden="true">
      <svg className={styles.rulerTop}>
        {start && end ? (
          <rect
            className={styles.rulerSpan}
            x={Math.min(start.x, end.x)}
            y={20}
            width={Math.abs(end.x - start.x)}
            height={2}
          />
        ) : null}
        {uTicks.map((tick) => (
          <g key={`u:${tick.value}`}>
            <line
              className={tick.labeled ? styles.rulerTickMajor : styles.rulerTick}
              x1={tick.pos}
              y1={tick.labeled ? 11 : 16}
              x2={tick.pos}
              y2={22}
            />
            {tick.labeled ? (
              <text className={styles.rulerLabel} x={tick.pos + 3} y={9}>
                {tick.value}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
      <svg className={styles.rulerLeft}>
        {start && end ? (
          <rect
            className={styles.rulerSpan}
            x={32}
            y={Math.min(start.y, end.y)}
            width={2}
            height={Math.abs(start.y - end.y)}
          />
        ) : null}
        {vTicks.map((tick) => (
          <g key={`v:${tick.value}`}>
            <line
              className={tick.labeled ? styles.rulerTickMajor : styles.rulerTick}
              x1={tick.labeled ? 23 : 28}
              y1={tick.pos}
              x2={34}
              y2={tick.pos}
            />
            {tick.labeled ? (
              <text className={styles.rulerLabel} x={21} y={tick.pos - 3} textAnchor="end">
                {tick.value}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
      <span className={styles.rulerCorner}>mm</span>
    </div>
  );
}

const MAJOR_GRID_MULTIPLE = { 25: 4, 50: 5, 100: 5 };

/**
 * The drawing grid the snap engine actually uses, plus the floor datum. Lives
 * inside the flipped wall-local group so lines land exactly on snap positions
 * (V is measured up from the floor). Strokes are pre-scaled so they stay about
 * one screen pixel at any zoom.
 */
export function WallCanvasGrid({ bounds, snapStep, unitPx, active }) {
  const major = snapStep * (MAJOR_GRID_MULTIPLE[snapStep] || 5);
  const minorSpacingPx = snapStep / Math.max(1e-6, unitPx);
  const showMinor = minorSpacingPx >= 7;
  return (
    <g className={styles.canvasGrid} data-active={active ? 'true' : 'false'}>
      <defs>
        <pattern id="wall-grid-minor" width={snapStep} height={snapStep} patternUnits="userSpaceOnUse">
          <path
            className={styles.gridMinorLine}
            d={`M ${snapStep} 0 H 0 V ${snapStep}`}
            fill="none"
            strokeWidth={Math.min(snapStep / 6, unitPx)}
          />
        </pattern>
        <pattern id="wall-grid-major" width={major} height={major} patternUnits="userSpaceOnUse">
          <path
            className={styles.gridMajorLine}
            d={`M ${major} 0 H 0 V ${major}`}
            fill="none"
            strokeWidth={Math.min(major / 8, unitPx * 1.3)}
          />
        </pattern>
      </defs>
      {showMinor ? <rect width={bounds.length} height={bounds.height} fill="url(#wall-grid-minor)" /> : null}
      <rect width={bounds.length} height={bounds.height} fill="url(#wall-grid-major)" />
      <line
        className={styles.gridFloorLine}
        x1={0}
        y1={0}
        x2={bounds.length}
        y2={0}
        vectorEffect="non-scaling-stroke"
      />
      <circle className={styles.gridOrigin} cx={0} cy={0} r={unitPx * 4} vectorEffect="non-scaling-stroke" />
    </g>
  );
}

/**
 * Small text chip that follows the pointer during draw and move gestures so the
 * live size or position is readable at the cursor, not in a distant panel.
 * Rendered in un-flipped SVG coordinates; `view` is `{ length, height, mirrorU }`
 * so the chip lands beside the pointer on mirrored face elevations too.
 */
export function CanvasReadoutChip({ point, lines, unitPx, view }) {
  if (!point || !lines?.length) return null;
  const fontSize = unitPx * 11.5;
  const anchor = wallLocalToSvg(point, view);
  const x = anchor.x + unitPx * 16;
  const y = anchor.y - unitPx * 16;
  return (
    <g className={styles.canvasChip} style={{ fontSize }}>
      {lines.map((line, index) => (
        <text key={index} x={x} y={y + index * fontSize * 1.3}>
          {line}
        </text>
      ))}
    </g>
  );
}

/**
 * Standing size tag for the selected piece: what it is, how wide and how tall,
 * and what it is made of — pinned to the piece itself so the answer is on the
 * drawing rather than in a panel. Like the pointer chip it is drawn in
 * un-flipped SVG coordinates, so the text stays upright and readable on a
 * mirrored face elevation. `placement` sits it above the piece, or inside its
 * top edge when there is no headroom left on the wall.
 */
export function CanvasSizeTag({ point, lines, unitPx, view, placement = 'above', leader = true }) {
  if (!point || !lines?.length) return null;
  const fontSize = unitPx * SIZE_TAG_FONT_PX;
  const step = fontSize * SIZE_TAG_LINE_STEP;
  const anchor = wallLocalToSvg(point, view);
  const gap = unitPx * SIZE_TAG_GAP_PX;
  // 'above' stacks the last line nearest the piece; 'below' hangs down from it.
  const firstLineY =
    placement === 'above' ? anchor.y - gap - (lines.length - 1) * step : anchor.y + gap + fontSize * 0.9;
  return (
    <g className={styles.canvasSizeTag} style={{ fontSize }} data-placement={placement} aria-hidden="true">
      {leader ? (
        <line
          className={styles.sizeTagLeader}
          x1={anchor.x}
          y1={anchor.y}
          x2={anchor.x}
          y2={placement === 'above' ? anchor.y - gap * 0.55 : anchor.y + gap * 0.55}
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      {lines.map((line, index) => (
        <text key={index} x={anchor.x} y={firstLineY + index * step}>
          {line}
        </text>
      ))}
    </g>
  );
}
