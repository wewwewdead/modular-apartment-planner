import { buildProjectSectionScene } from '@/sections/scene';
import SectionSceneLayer from './SectionSceneLayer';

export default function SectionRenderer({ project, floor, activeSectionCutId }) {
  const cuts = floor?.sectionCuts || [];
  const sectionCut = (activeSectionCutId && cuts.find(s => s.id === activeSectionCutId)) || cuts[0] || null;

  if (!sectionCut) {
    return (
      <g className="section-empty">
        <text
          x={0}
          y={0}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="var(--color-text-secondary)"
          fontSize={180}
          fontFamily="var(--font-blueprint)"
        >
          Draw a section cut in plan view.
        </text>
      </g>
    );
  }

  const scene = buildProjectSectionScene(project, floor.id, sectionCut.id);
  if (!scene) return null;

  return <SectionSceneLayer scene={scene} />;
}
