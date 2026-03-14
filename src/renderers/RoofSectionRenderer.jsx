import { buildProjectSectionScene } from '@/sections/scene';
import { getSectionVisibilityMessage, SECTION_VISIBILITY_REASONS } from '@/sections/diagnostics';
import SectionSceneLayer from './SectionSceneLayer';
import { resolveRoofSectionCut } from '@/domain/roofModels';

function EmptyState({ message }) {
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

export default function RoofSectionRenderer({
  project,
  preferredFloorId,
  activeSectionCutId,
  roofHiddenByPhase = false,
}) {
  const { floor, sectionCut } = resolveRoofSectionCut(project, preferredFloorId, activeSectionCutId);

  if (!sectionCut || !floor) {
    return <EmptyState message="Add a section cut on a floor to view the roof section." />;
  }

  const scene = buildProjectSectionScene(project, floor.id, sectionCut.id);
  if (!scene) return null;
  const roofReason = roofHiddenByPhase
    ? SECTION_VISIBILITY_REASONS.HIDDEN_BY_PHASE
    : scene.diagnostics?.roof?.reason;
  const roofMessage = getSectionVisibilityMessage('roof', roofReason);

  return (
    <g className="roof-section-view">
      <SectionSceneLayer scene={scene} />
      <SectionDiagnosticMessage scene={scene} message={roofMessage} />
    </g>
  );
}
