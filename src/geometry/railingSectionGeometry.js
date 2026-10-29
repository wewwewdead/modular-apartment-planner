import { getFloorElevation } from '@/domain/floorModels';
import { SECTION_VISIBILITY_REASONS } from '@/sections/diagnostics';
import { buildSectionPrism, buildSlopedSectionPrism, sectionPlanPoint } from '@/sections/geometry';
import { columnOutline } from './columnGeometry';
import { getRailingRenderData, getRailingStairProfile } from './railingGeometry';
import { sectionCutLength } from './sectionCutGeometry';
import { wallOutline } from './wallGeometry';

export function buildRailingSectionElements(floor, cut, { stairContexts = [] } = {}) {
  const rectElements = [];
  const polygonElements = [];
  const reasons = [];
  if (!cut)
    return {
      rectElements,
      polygonElements,
      lineElements: [],
      diagnostics: {
        visible: false,
        elementCount: 0,
        reason: SECTION_VISIBILITY_REASONS.NO_GEOMETRY,
      },
    };
  for (const railing of floor?.railings || []) {
    const data = getRailingRenderData(railing);
    if (!data) continue;
    const own = stairContexts.filter((context) => context.floorId === floor.id);
    const other = stairContexts.filter((context) => context.floorId !== floor.id);
    const candidates = [...own, ...other];
    const profile = getRailingStairProfile(
      railing,
      candidates.map((context) => context.stair),
    );
    const context = candidates.find((candidate) => candidate.stair === profile?.stair);
    const base = context?.baseElevation ?? getFloorElevation(floor);
    const startRise = profile?.startRise || 0;
    const endRise = profile?.endRise || 0;
    const dx = data.end.x - data.start.x;
    const dy = data.end.y - data.start.y;
    const bottomAt = (point) =>
      base +
      startRise +
      ((endRise - startRise) * ((point.x - data.start.x) * dx + (point.y - data.start.y) * dy)) /
        (data.length * data.length);
    const height = Math.max(0, railing.height || 0);
    if (!height) continue;
    const common = { category: 'railing', sourceId: railing.id, cut };
    const before = rectElements.length + polygonElements.length;
    if (railing.type === 'guardrail' || railing.type === 'glass') {
      polygonElements.push(
        ...buildSlopedSectionPrism({
          ...common,
          id: `section-railing-${railing.id}`,
          style: railing.type === 'glass' ? 'railingGlass' : undefined,
          outline: data.outline,
          bottomAt,
          topAt: (point) => bottomAt(point) + height,
        }),
      );
    } else {
      const outline = wallOutline({ start: data.start, end: data.end, thickness: 30 });
      polygonElements.push(
        ...buildSlopedSectionPrism({
          ...common,
          id: `section-railing-${railing.id}-rail`,
          outline,
          bottomAt: (point) => bottomAt(point) + height - 50,
          topAt: (point) => bottomAt(point) + height,
        }),
      );
      const count = Math.max(2, Math.floor(data.length / 300) + 1);
      for (let index = 0; index < count; index += 1) {
        const point = { x: data.start.x + (dx * index) / (count - 1), y: data.start.y + (dy * index) / (count - 1) };
        rectElements.push(
          ...buildSectionPrism({
            ...common,
            id: `section-railing-${railing.id}-post-${index}`,
            outline: columnOutline({ ...point, width: 30, depth: 30 }),
            bottom: bottomAt(point),
            top: bottomAt(point) + height - 50,
          }),
        );
      }
    }
    if (before === rectElements.length + polygonElements.length) {
      const projected = data.outline.map((p) => sectionPlanPoint(cut, p));
      const missesWidth =
        Math.max(...projected.map((p) => p.x)) < 0 || Math.min(...projected.map((p) => p.x)) > sectionCutLength(cut);
      reasons.push(
        missesWidth ? SECTION_VISIBILITY_REASONS.MISSES_CUT : SECTION_VISIBILITY_REASONS.OUTSIDE_DEPTH_OR_DIRECTION,
      );
    }
  }
  const elementCount = rectElements.length + polygonElements.length;
  return {
    rectElements,
    polygonElements,
    lineElements: [],
    diagnostics: {
      visible: elementCount > 0,
      elementCount,
      reason: elementCount
        ? SECTION_VISIBILITY_REASONS.OK
        : reasons.includes(SECTION_VISIBILITY_REASONS.OUTSIDE_DEPTH_OR_DIRECTION)
          ? SECTION_VISIBILITY_REASONS.OUTSIDE_DEPTH_OR_DIRECTION
          : reasons[0] || SECTION_VISIBILITY_REASONS.NO_GEOMETRY,
    },
  };
}
