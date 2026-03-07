import { buildSectionScene } from '@/sections/scene';
import SectionSceneLayer from './SectionSceneLayer';

export default function SectionRenderer({ floor }) {
  const scene = buildSectionScene(floor);

  if (!floor?.sectionCut) {
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

  if (!scene) return null;

  return <SectionSceneLayer scene={scene} />;
}
