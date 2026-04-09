import { buildProjectSectionScene } from '@/sections/scene';
import { getSectionVisibilityMessage } from '@/sections/diagnostics';
import SectionSceneLayer from './SectionSceneLayer';

function EmptyState({ message }) {
  return (
    <g className="truss-section-empty">
      <text
        x={0}
        y={0}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="var(--color-text-secondary)"
        fontSize={180}
        fontFamily="var(--font-blueprint)"
      >
        {message}
      </text>
    </g>
  );
}

function SectionDiagnosticMessage({ scene, message }) {
  if (!scene || !message) return null;

  return (
    <text
      x={(scene.bounds.minX + scene.bounds.maxX) / 2}
      y={-scene.bounds.maxZ - 170}
      textAnchor="middle"
      dominantBaseline="middle"
      fill="var(--color-text-secondary)"
      fontSize={150}
      fontFamily="var(--font-blueprint)"
      style={{ pointerEvents: 'none' }}
    >
      {message}
    </text>
  );
}

export default function TrussSectionRenderer({ project, floor, activeSectionCutId }) {
  const cuts = floor?.sectionCuts || [];
  const sectionCut = (activeSectionCutId && cuts.find((entry) => entry.id === activeSectionCutId)) || cuts[0] || null;

  if (!sectionCut || !floor) {
    return <EmptyState message="Add a section cut on the active floor to view trusses in section." />;
  }

  const scene = buildProjectSectionScene(project, floor.id, sectionCut.id);
  if (!scene) return null;
  const trussMessage = getSectionVisibilityMessage('truss', scene.diagnostics?.truss?.reason);

  return (
    <g className="truss-section-view">
      <SectionSceneLayer scene={scene} />
      <SectionDiagnosticMessage scene={scene} message={trussMessage} />
    </g>
  );
}
