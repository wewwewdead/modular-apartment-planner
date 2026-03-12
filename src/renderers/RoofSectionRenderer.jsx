import { buildProjectSectionScene } from '@/sections/scene';
import SectionSceneLayer from './SectionSceneLayer';
import { resolveRoofSectionCut } from '@/domain/roofModels';

export default function RoofSectionRenderer({ project, preferredFloorId, activeSectionCutId }) {
  const { floor, sectionCut } = resolveRoofSectionCut(project, preferredFloorId, activeSectionCutId);

  if (!sectionCut || !floor) {
    return (
      <g className="roof-section-empty">
        <text
          x={0}
          y={0}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="var(--color-text-secondary)"
          fontSize={180}
          fontFamily="var(--font-blueprint)"
        >
          Add a section cut on a floor to view the roof section.
        </text>
      </g>
    );
  }

  const scene = buildProjectSectionScene(project, floor.id, sectionCut.id);
  if (!scene) return null;

  return <SectionSceneLayer scene={scene} />;
}
