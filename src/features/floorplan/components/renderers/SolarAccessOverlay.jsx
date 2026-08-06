import { memo, useMemo } from 'react';

/**
 * Draws the solar access study on the plan.
 *
 * A plan is a poor medium for a study whose subject is mostly vertical, so this
 * shows the two things a plan can honestly carry:
 *
 *   - **Roof sensors**, which are already a plan grid, drawn as a raster.
 *   - **Facades**, as a coloured band along each footprint edge, sampled at one
 *     chosen height. A facade varies from base to parapet — usually a lot — so
 *     the panel names the height being shown rather than implying the band is
 *     the whole elevation.
 *
 * Sits above the plan, like the daylight overlay and unlike the shadow overlay:
 * these values belong to the building's own surfaces, and rooms are drawn with
 * an opaque fill.
 */

/** Warm ramp from shaded to fully exposed, shared by both metrics. */
const SOLAR_RAMP = [
  { stop: 0, color: [44, 54, 74] },
  { stop: 0.15, color: [72, 88, 116] },
  { stop: 0.35, color: [132, 122, 122] },
  { stop: 0.55, color: [196, 152, 96] },
  { stop: 0.75, color: [232, 190, 90] },
  { stop: 1, color: [255, 238, 168] },
];

export function solarColor(fraction) {
  const clamped = Math.min(1, Math.max(0, fraction));
  for (let index = 1; index < SOLAR_RAMP.length; index += 1) {
    const previous = SOLAR_RAMP[index - 1];
    const current = SOLAR_RAMP[index];
    if (clamped > current.stop) continue;

    const span = current.stop - previous.stop || 1;
    const t = (clamped - previous.stop) / span;
    return [
      Math.round(previous.color[0] + (current.color[0] - previous.color[0]) * t),
      Math.round(previous.color[1] + (current.color[1] - previous.color[1]) * t),
      Math.round(previous.color[2] + (current.color[2] - previous.color[2]) * t),
    ];
  }
  return SOLAR_RAMP[SOLAR_RAMP.length - 1].color;
}

/**
 * Facade sensors nearest a chosen height, one per footprint edge.
 *
 * Picking the nearest rather than averaging the whole elevation is deliberate:
 * an average over a ten-storey facade is a number that describes no floor of
 * it, and the ground floor and the penthouse are exactly the comparison that
 * matters.
 */
function useFacadeBands(study, sliceHeight, metric) {
  return useMemo(() => {
    const sensors = study?.sensors;
    if (!sensors) return [];

    const values = metric === 'irradiation' ? sensors.irradiation : sensors.sunHours;
    const bySurface = new Map();

    for (let index = 0; index < sensors.count; index += 1) {
      // Roof sensors face up; they are drawn as a raster instead.
      if (sensors.normals[index * 3 + 2] > 0.5) continue;

      const surfaceId = sensors.surfaceIds[index];
      const distance = Math.abs(sensors.heights[index] - sliceHeight);
      const existing = bySurface.get(surfaceId);
      if (!existing || distance < existing.distance) {
        bySurface.set(surfaceId, { distance, value: values[index] });
      }
    }

    const surfaces = new Map((study.surfaces || []).map((surface) => [surface.id, surface]));
    const bands = [];
    for (const [surfaceId, entry] of bySurface) {
      const surface = surfaces.get(surfaceId);
      if (!surface?.start || !surface?.end) continue;
      bands.push({ id: surfaceId, start: surface.start, end: surface.end, value: entry.value });
    }
    return bands;
  }, [study, sliceHeight, metric]);
}

/**
 * Roof sensors rasterised per surface.
 *
 * One `<image>` per roof beats one rect per sensor by three orders of magnitude
 * in node count, and a roof grid is regular enough to raster cleanly.
 */
function useRoofImages(study, metric, maximum) {
  return useMemo(() => {
    const sensors = study?.sensors;
    if (!sensors || typeof document === 'undefined' || !(maximum > 0)) return [];

    const values = metric === 'irradiation' ? sensors.irradiation : sensors.sunHours;
    const grouped = new Map();

    for (let index = 0; index < sensors.count; index += 1) {
      if (sensors.normals[index * 3 + 2] <= 0.5) continue;
      const surfaceId = sensors.surfaceIds[index];
      if (!grouped.has(surfaceId)) grouped.set(surfaceId, []);
      grouped.get(surfaceId).push(index);
    }

    const spacing = sensors.spacing || 1000;
    const images = [];

    for (const [surfaceId, indices] of grouped) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const index of indices) {
        const x = sensors.positions[index * 3];
        const y = sensors.positions[index * 3 + 1];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }

      const columns = Math.max(1, Math.round((maxX - minX) / spacing) + 1);
      const rows = Math.max(1, Math.round((maxY - minY) / spacing) + 1);
      if (columns * rows > 400000) continue;

      try {
        const canvas = document.createElement('canvas');
        canvas.width = columns;
        canvas.height = rows;
        const context = canvas.getContext('2d');
        if (!context) continue;

        const image = context.createImageData(columns, rows);
        for (const index of indices) {
          const column = Math.round((sensors.positions[index * 3] - minX) / spacing);
          const row = Math.round((sensors.positions[index * 3 + 1] - minY) / spacing);
          const offset = (row * columns + column) * 4;
          const [red, green, blue] = solarColor(values[index] / maximum);
          image.data[offset] = red;
          image.data[offset + 1] = green;
          image.data[offset + 2] = blue;
          image.data[offset + 3] = 200;
        }
        context.putImageData(image, 0, 0);

        images.push({
          id: surfaceId,
          href: canvas.toDataURL(),
          x: minX - spacing / 2,
          y: minY - spacing / 2,
          width: columns * spacing,
          height: rows * spacing,
        });
      } catch {
        // Canvas is unavailable in some environments; facades still draw.
      }
    }

    return images;
  }, [study, metric, maximum]);
}

function SolarAccessOverlay({ study, metric = 'sunHours', sliceHeight = 1500, stale = false }) {
  // Normalised against the best surface on the building, so the ramp always
  // uses its full range and two options can be compared side by side.
  const maximum = useMemo(() => {
    if (!study) return 0;
    return metric === 'irradiation' ? study.totals.bestIrradiation : Math.max(study.meta.totalDaylightHours, 1);
  }, [study, metric]);

  const bands = useFacadeBands(study, sliceHeight, metric);
  const roofImages = useRoofImages(study, metric, maximum);

  if (!study || !study.sensors?.count) return null;

  return (
    <g
      data-layer="solar-access"
      data-metric={metric}
      data-stale={stale || undefined}
      style={{ pointerEvents: 'none', opacity: stale ? 0.5 : 1 }}
    >
      {roofImages.map((image) => (
        <image
          key={`roof-${image.id}`}
          data-type="solar-roof"
          href={image.href}
          x={image.x}
          y={image.y}
          width={image.width}
          height={image.height}
          preserveAspectRatio="none"
          style={{ imageRendering: 'pixelated' }}
        />
      ))}

      {bands.map((band) => {
        const [red, green, blue] = solarColor(band.value / maximum);
        return (
          <line
            key={`facade-${band.id}`}
            data-type="solar-facade"
            x1={band.start.x}
            y1={band.start.y}
            x2={band.end.x}
            y2={band.end.y}
            stroke={`rgb(${red}, ${green}, ${blue})`}
            strokeWidth="420"
            strokeLinecap="butt"
            opacity="0.92"
          />
        );
      })}
    </g>
  );
}

export default memo(SolarAccessOverlay);
export { SOLAR_RAMP };
