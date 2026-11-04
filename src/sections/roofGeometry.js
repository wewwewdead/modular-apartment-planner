import { subtractPolygons } from '@/geometry/polygonBoolean';
import { triangulate } from '@/geometry/triangulate';
import { sectionCutPointAtAlong } from '@/geometry/sectionCutGeometry';
import { buildSectionPrism, projectSectionSurface, sectionCutIntervals, sectionPlanPoint } from './geometry';
import { buildRoofEdgeKitLayout } from '@/roof/roofEdgeKit';

function offsetPlan(point, direction, amount) {
  return { x: point.x + direction.x * amount, y: point.y + direction.y * amount };
}

/**
 * Fascia and gutter where the cut crosses an eave: cut rectangles only, in the
 * `roofTrim` category. Barge boards run along the cut's view on a gable and
 * are left to the elevation; downpipes and the soffit are not cut.
 */
function buildRoofTrimSectionRects(roof, geometry, cut) {
  const kit = buildRoofEdgeKitLayout(roof, geometry, {});
  const rects = [];
  for (const fascia of kit.fascias) {
    if (Math.abs(fascia.topEnd.y - fascia.topStart.y) > 1) continue;
    const { run } = fascia;
    const outline = [
      run.start,
      run.end,
      offsetPlan(run.end, run.inward, fascia.thickness),
      offsetPlan(run.start, run.inward, fascia.thickness),
    ];
    rects.push(
      ...buildSectionPrism({
        id: `roof-trim-${fascia.id}`,
        category: 'roofTrim',
        sourceId: roof.id,
        cut,
        outline,
        bottom: fascia.topStart.y - fascia.depth,
        top: fascia.topStart.y,
      }).filter((element) => element.renderMode === 'cut'),
    );
  }
  for (const gutter of kit.gutters) {
    const start = { x: gutter.start.x, y: gutter.start.z };
    const end = { x: gutter.end.x, y: gutter.end.z };
    const across = { x: -gutter.run.inward.x, y: -gutter.run.inward.y };
    const half = gutter.width / 2;
    const outline = [
      offsetPlan(start, across, -half),
      offsetPlan(end, across, -half),
      offsetPlan(end, across, half),
      offsetPlan(start, across, half),
    ];
    rects.push(
      ...buildSectionPrism({
        id: `roof-trim-${gutter.id}`,
        category: 'roofTrim',
        sourceId: roof.id,
        cut,
        outline,
        bottom: gutter.bottom,
        top: gutter.top,
      }).filter((element) => element.renderMode === 'cut'),
    );
  }
  return rects;
}

export function buildRoofSectionSurfaces(roof, geometry, cut) {
  const holes = (roof.roofOpenings || [])
    .map((opening) => opening.boundaryPoints || [])
    .filter((ring) => ring.length >= 3);
  if ((roof.roofType || 'flat') === 'flat') {
    return {
      rectElements: buildSectionPrism({
        id: `roof-slab-${roof.id}`,
        category: 'slab',
        sourceId: roof.id,
        cut,
        outline: roof.boundaryPolygon,
        holes,
        bottom: roof.baseElevation ?? 0,
        top: (roof.baseElevation ?? 0) + (roof.slabThickness ?? 0),
      }),
      polygonElements: [],
    };
  }
  const cuts = [];
  const faces = [];
  for (const plane of geometry.planes || []) {
    const elevationAt = plane.getSurfaceElevation || geometry.getSurfaceElevation;
    const metadata = { category: 'slab', sourceId: roof.id };
    for (const [index, interval] of sectionCutIntervals(cut, plane.outline, holes).entries()) {
      const a = sectionCutPointAtAlong(cut, interval.left);
      const b = sectionCutPointAtAlong(cut, interval.right);
      cuts.push({
        ...metadata,
        id: `roof-plane-${plane.id}-cut-${index}`,
        renderMode: 'cut',
        depth: 0,
        points: [
          { x: interval.left, z: elevationAt(a, 'top') },
          { x: interval.right, z: elevationAt(b, 'top') },
          { x: interval.right, z: elevationAt(b, 'bottom') },
          { x: interval.left, z: elevationAt(a, 'bottom') },
        ],
      });
    }
    for (const [regionIndex, region] of subtractPolygons(plane.outline, holes).entries()) {
      const rings = [region.outline, ...region.holes];
      const { vertices, indices } = triangulate(region.outline, region.holes);
      for (const surface of ['top', 'bottom']) {
        const strokeOutlines = rings.map((ring) =>
          ring.map((p) => ({ x: sectionPlanPoint(cut, p).x, y: -elevationAt(p, surface) })),
        );
        for (let index = 0; index < indices.length; index += 3) {
          const triangle = indices.slice(index, index + 3).map((vertex) => ({
            ...vertices[vertex],
            z: elevationAt(vertices[vertex], surface),
          }));
          const face = projectSectionSurface(cut, triangle, {
            ...metadata,
            id: `roof-plane-${plane.id}-${regionIndex}-${surface}-${index}`,
            strokeOutlines,
          });
          if (face) faces.push(face);
        }
      }
      rings.forEach((ring, ringIndex) =>
        ring.forEach((a, index) => {
          const b = ring[(index + 1) % ring.length];
          const face = projectSectionSurface(
            cut,
            [
              { ...a, z: elevationAt(a, 'top') },
              { ...b, z: elevationAt(b, 'top') },
              { ...b, z: elevationAt(b, 'bottom') },
              { ...a, z: elevationAt(a, 'bottom') },
            ],
            { ...metadata, id: `roof-plane-${plane.id}-${regionIndex}-edge-${ringIndex}-${index}` },
          );
          if (face) faces.push(face);
        }),
      );
    }
  }
  return { rectElements: buildRoofTrimSectionRects(roof, geometry, cut), polygonElements: [...cuts, ...faces] };
}
