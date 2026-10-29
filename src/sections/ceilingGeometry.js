import { buildCeilingPreviewObjects } from '@/geometry/ceilingGeometry';
import { columnOutline } from '@/geometry/columnGeometry';
import { wallOutline } from '@/geometry/wallGeometry';
import { buildSectionPrism } from './geometry';

export function buildCeilingSectionElements(project, floorId, cut) {
  return (project?.ceilings || [])
    .filter((ceiling) => ceiling.floorId === floorId)
    .flatMap((ceiling) =>
      buildCeilingPreviewObjects(ceiling, project, { fasteners: false }).flatMap((object) => {
        let outline;
        let bottom = object.baseElevation;
        let top;
        if (object.geometry === 'prism') {
          outline = object.outline;
          top = bottom + object.height;
        } else if (object.geometry === 'box') {
          outline = columnOutline({
            x: object.center.x,
            y: object.center.y,
            width: object.size.x,
            depth: object.size.z,
            rotation: (object.rotation * 180) / Math.PI,
          });
          top = bottom + object.size.y;
        } else if (object.geometry === 'segment3d') {
          outline = wallOutline({
            start: { x: object.start.x, y: object.start.z },
            end: { x: object.end.x, y: object.end.z },
            thickness: object.crossSection.width,
          });
          bottom = object.start.y - object.crossSection.height / 2;
          top = bottom + object.crossSection.height;
        } else {
          return [];
        }
        return buildSectionPrism({
          id: `section-ceiling-${object.id}`,
          category: 'ceiling',
          sourceId: ceiling.id,
          cut,
          outline,
          holes: object.holes || [],
          bottom,
          top,
        });
      }),
    );
}
