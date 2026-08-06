import { memo, useMemo } from 'react';

/**
 * Draws the daylight study on the plan.
 *
 * Two things to read, and they answer different questions:
 *   - **Average mode** tints each room by its daylight factor and labels it,
 *     so a floor plate reads at a glance as bright, adequate or dark.
 *   - **Grid mode** paints the Monte Carlo map, which shows where in the room
 *     the light actually is — the thing an average cannot tell you and the
 *     reason a deep room with a big window still fails at the back.
 *
 * Sits below the plan so walls and rooms stay legible on top, and never takes
 * pointer events: a daylight factor is something you read, not something you
 * select.
 */

/**
 * Ramp from unusably dark to generously lit, in daylight factor percent.
 *
 * The stops are the recognised bands, not an arbitrary gradient: under 1% a
 * room reads as gloomy and needs the lights on all day, 1-2% is the range
 * dwellings are judged in, 2-5% is comfortably daylit, and above 5% the concern
 * inverts and becomes overheating and glare.
 */
const DAYLIGHT_RAMP = [
  { stop: 0, color: [38, 44, 62] },
  { stop: 0.5, color: [66, 78, 104] },
  { stop: 1, color: [108, 122, 140] },
  { stop: 2, color: [176, 196, 168] },
  { stop: 3.5, color: [226, 226, 148] },
  { stop: 5, color: [250, 238, 170] },
  { stop: 8, color: [255, 252, 224] },
];

export function daylightColor(percent) {
  const value = Math.max(0, percent || 0);
  for (let index = 1; index < DAYLIGHT_RAMP.length; index += 1) {
    const previous = DAYLIGHT_RAMP[index - 1];
    const current = DAYLIGHT_RAMP[index];
    if (value > current.stop) continue;

    const span = current.stop - previous.stop || 1;
    const t = (value - previous.stop) / span;
    return [
      Math.round(previous.color[0] + (current.color[0] - previous.color[0]) * t),
      Math.round(previous.color[1] + (current.color[1] - previous.color[1]) * t),
      Math.round(previous.color[2] + (current.color[2] - previous.color[2]) * t),
    ];
  }
  return DAYLIGHT_RAMP[DAYLIGHT_RAMP.length - 1].color;
}

function polygonPath(points) {
  if (!points || points.length < 3) return '';
  return `M ${points.map((point) => `${point.x} ${point.y}`).join(' L ')} Z`;
}

/**
 * Rasterise a room's grid to a data URL rather than emitting one rect per cell.
 * A floor of rooms at 0.5 m spacing is tens of thousands of nodes, which stalls
 * the canvas on every pan; one `<image>` per room costs one node and scales
 * just as well.
 */
function useGridImages(rooms) {
  return useMemo(() => {
    if (typeof document === 'undefined') return new Map();

    const images = new Map();
    for (const room of rooms) {
      const grid = room.grid;
      if (!grid) continue;

      try {
        const canvas = document.createElement('canvas');
        canvas.width = grid.columns;
        canvas.height = grid.rows;
        const context = canvas.getContext('2d');
        if (!context) continue;

        const image = context.createImageData(grid.columns, grid.rows);
        for (let index = 0; index < grid.values.length; index += 1) {
          const offset = index * 4;
          if (!grid.mask[index]) {
            // Outside the task area: transparent, so the excluded border strip
            // reads as "not assessed" rather than as "dark".
            image.data[offset + 3] = 0;
            continue;
          }
          const [red, green, blue] = daylightColor(grid.values[index]);
          image.data[offset] = red;
          image.data[offset + 1] = green;
          image.data[offset + 2] = blue;
          // Translucent on purpose: the map sits over the plan, and a wash you
          // cannot read the walls through hides the thing being assessed.
          image.data[offset + 3] = 165;
        }
        context.putImageData(image, 0, 0);
        images.set(room.id, canvas.toDataURL());
      } catch {
        // Canvas is unavailable in some environments; the rest still renders.
      }
    }
    return images;
  }, [rooms]);
}

function DaylightOverlay({ study, showLabels = true, stale = false }) {
  const rooms = study?.rooms || [];
  const gridImages = useGridImages(study?.hasGrids ? rooms : []);

  if (!study || !rooms.length) return null;

  return (
    <g
      data-layer="daylight-study"
      data-mode={study.mode}
      data-stale={stale || undefined}
      style={{ pointerEvents: 'none', opacity: stale ? 0.55 : 1 }}
    >
      {rooms.map((room) => {
        const grid = room.grid;
        const image = gridImages.get(room.id);
        const [red, green, blue] = daylightColor(room.averageDaylightFactor);

        return (
          <g key={room.id} data-room={room.id}>
            {image && grid ? (
              <image
                data-type="daylight-grid"
                href={image}
                x={grid.origin.x}
                y={grid.origin.y}
                width={grid.columns * grid.cellSize}
                height={grid.rows * grid.cellSize}
                preserveAspectRatio="none"
                style={{ imageRendering: 'pixelated' }}
              />
            ) : (
              <path
                data-type="daylight-room"
                d={polygonPath(room.polygon)}
                fill={`rgba(${red}, ${green}, ${blue}, 0.42)`}
              />
            )}

            {/* A room that misses its recommended level is outlined, because a
                colour alone is hard to judge against a target you cannot see. */}
            {room.meetsTarget === false && (
              <path
                data-type="daylight-shortfall"
                d={polygonPath(room.polygon)}
                fill="none"
                stroke="rgba(196, 88, 72, 0.85)"
                strokeWidth="1.5"
                strokeDasharray="10 6"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </g>
        );
      })}

      {showLabels &&
        rooms.map((room) => (
          <text
            key={`${room.id}-label`}
            data-type="daylight-label"
            x={room.centroid.x}
            y={room.centroid.y}
            textAnchor="middle"
            style={{
              fontSize: 340,
              fontWeight: 600,
              fill: room.averageDaylightFactor >= 2 ? '#2b3242' : '#f2f4f8',
              paintOrder: 'stroke',
              stroke: room.averageDaylightFactor >= 2 ? 'rgba(255,255,255,0.65)' : 'rgba(24,28,38,0.6)',
              strokeWidth: 90,
            }}
          >
            {room.averageDaylightFactor.toFixed(1)}%
          </text>
        ))}
    </g>
  );
}

export default memo(DaylightOverlay);
export { DAYLIGHT_RAMP };
