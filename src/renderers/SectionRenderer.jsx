import { buildProjectSectionScene } from '@/sections/scene';
import { getSectionVisibilityMessage, SECTION_VISIBILITY_REASONS } from '@/sections/diagnostics';
import SectionSceneLayer from './SectionSceneLayer';

function SectionDiagnosticMessages({ scene, messages = [] }) {
  if (!scene || !messages.length) return null;

  return (
    <g className="section-diagnostics">
      {messages.map((message, index) => (
        <text
          key={`${message}-${index}`}
          x={(scene.bounds.minX + scene.bounds.maxX) / 2}
          y={-scene.bounds.maxZ - 170 - (index * 160)}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="var(--color-text-secondary)"
          fontSize={150}
          fontFamily="var(--font-blueprint)"
          style={{ pointerEvents: 'none' }}
        >
          {message}
        </text>
      ))}
    </g>
  );
}

export default function SectionRenderer({
  project,
  floor,
  activeSectionCutId,
  roofHiddenByPhase = false,
  hasProjectRoof = false,
  railingsHiddenByPhase = false,
  hasProjectRailings = false,
}) {
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

  const roofReason = roofHiddenByPhase
    ? SECTION_VISIBILITY_REASONS.HIDDEN_BY_PHASE
    : scene.diagnostics?.roof?.reason;
  const railingReason = railingsHiddenByPhase
    ? SECTION_VISIBILITY_REASONS.HIDDEN_BY_PHASE
    : scene.diagnostics?.railing?.reason;
  const messages = [
    (hasProjectRoof || roofHiddenByPhase) ? getSectionVisibilityMessage('roof', roofReason) : null,
    (hasProjectRailings || railingsHiddenByPhase) ? getSectionVisibilityMessage('railing', railingReason) : null,
  ].filter(Boolean);

  return (
    <g className="section-view">
      <SectionSceneLayer scene={scene} />
      <SectionDiagnosticMessages scene={scene} messages={messages} />
    </g>
  );
}
