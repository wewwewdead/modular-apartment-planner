import { subtractPolygons } from '@/geometry/polygonBoolean';
import { triangulate } from '@/geometry/triangulate';
import { sectionCutPointAtAlong } from '@/geometry/sectionCutGeometry';
import { buildSectionPrism, projectSectionSurface, sectionCutIntervals, sectionPlanPoint } from './geometry';

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
  return { rectElements: [], polygonElements: [...cuts, ...faces] };
}
