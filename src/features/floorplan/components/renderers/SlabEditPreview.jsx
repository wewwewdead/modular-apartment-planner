import { memo } from 'react';
import { PREVIEW_LABEL_OFFSET } from '@/domain/defaults';

/**
 * How far the dragged slab edge has moved, read out beside the cursor.
 *
 * Pushing a floor plate out is a measured decision — 600 mm of cantilever, not
 * "about that far" — so the number has to be on screen while the pointer is
 * down, the same way the wall tool shows a length as it draws. Signed on
 * purpose: positive is outward (the plate grows), negative is a pull-back.
 */
function SlabEditPreview({ toolState }) {
  const drag = toolState?.slabEdgeDrag;
  if (!drag?.point) return null;

  const offset = Math.round(drag.offset || 0);
  const label = `${offset > 0 ? '+' : ''}${offset} mm`;

  return (
    <g className="slab-edit-preview" style={{ pointerEvents: 'none' }}>
      <text
        x={drag.point.x}
        y={drag.point.y - PREVIEW_LABEL_OFFSET}
        textAnchor="middle"
        fill="var(--color-selection)"
        fontSize={140}
        fontFamily="var(--font-blueprint)"
        paintOrder="stroke"
        stroke="rgba(255, 255, 255, 0.92)"
        strokeWidth={26}
      >
        {label}
      </text>
    </g>
  );
}

export default memo(SlabEditPreview);
