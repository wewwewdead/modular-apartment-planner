import { memo } from 'react';
import { getProjectSectionScene } from '@/sections/sectionSceneCache';
import { getSectionVisibilityMessage } from '@/sections/diagnostics';
import { cuttingSection, LOADING_COPY } from '@/ui/loading';
import DeferredSceneDrawing from './DeferredSceneDrawing';
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

function TrussSectionRenderer({ project, floor, activeSectionCutId }) {
  const cuts = floor?.sectionCuts || [];
  const sectionCut = (activeSectionCutId && cuts.find((entry) => entry.id === activeSectionCutId)) || cuts[0] || null;

  if (!sectionCut || !floor) {
    return <EmptyState message="Add a section cut on the active floor to view trusses in section." />;
  }

  // Built once per project and shared with the canvas's diagnostics; it used
  // to be rebuilt on every render of this component.
  const scene = getProjectSectionScene(project, floor.id, sectionCut.id);
  if (!scene) return null;
  const trussMessage = getSectionVisibilityMessage('truss', scene.diagnostics?.truss?.reason);

  return (
    <g className="truss-section-view">
      <DeferredSceneDrawing
        kind="section"
        scene={scene}
        viewKey={`${floor.id}:${sectionCut.id}`}
        label={cuttingSection(sectionCut.label)}
        detail={LOADING_COPY.cuttingSectionDetail}
      >
        {(drawnScene, drawables) => <SectionSceneLayer scene={drawnScene} drawables={drawables} />}
      </DeferredSceneDrawing>
      <SectionDiagnosticMessage scene={scene} message={trussMessage} />
    </g>
  );
}

export default memo(TrussSectionRenderer);
